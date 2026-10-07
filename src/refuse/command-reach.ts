// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { hasGlob, matchesName, reachOf, type NameGlob, type RecursiveSearch } from '../core/access/search-reach.ts';
import { located, type ShellPlace } from '../core/access/shell-place.ts';
import { protectionOf, type Policy } from '../core/policy/policy.ts';
import type { DirectoryEntry, DirectoryReader, EntryKind } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';

/**
 * How many directory entries one command may cost before the walk gives up. A search is walked breadth first, so a
 * protected file near where it starts - a `.env` at the root - is met in the first listing; this bounds only a search
 * that reaches nothing protected through a very large tree, which a hook on every shell command must not stall on.
 */
const MAX_ENTRIES = 50_000;

/** A protected file a command reaches without naming it, and how. */
export type CommandReach =
  | { readonly kind: 'glob'; readonly word: string; readonly path: string; readonly pattern: string }
  | { readonly kind: 'search'; readonly path: string; readonly pattern: string }
  /** The walk ran out of budget before it could say; the command is not checked (R20). */
  | { readonly kind: 'too-large' };

/**
 * The first protected file a command line would open without naming it: through a word the shell expands (`cat .env*`),
 * or through a recursive search (`grep -rn KEY .`) whose own filters do not leave it out (R21a). Undefined when it
 * reaches none. Paths are shown as the command would print them, relative to where it starts.
 */
export async function protectedFileReached(
  command: string,
  policy: Policy,
  place: ShellPlace,
  directories: DirectoryReader,
): Promise<CommandReach | undefined> {
  const { searches, globs } = reachOf(command);

  for (const word of globs) {
    for (const path of await expand(word, place, directories)) {
      const pattern = protectingPattern(policy, path, place);
      if (pattern !== undefined) return { kind: 'glob', word, path, pattern };
    }
  }

  const budget = { left: MAX_ENTRIES };
  for (const search of searches) {
    const found = await walk(search, policy, place, directories, budget);
    if (found !== undefined) return { kind: 'search', ...found };
  }
  return budget.left < 0 ? { kind: 'too-large' } : undefined;
}

/**
 * The names a shell would put in place of a glob, as it would write them. Only a glob in the last part of the word is
 * expanded; a wildcard in a directory part is left alone, which misses a rarer command rather than guessing at one.
 */
async function expand(word: string, place: ShellPlace, directories: DirectoryReader): Promise<string[]> {
  const slash = word.lastIndexOf('/');
  const directory = word.slice(0, slash + 1);
  const name = word.slice(slash + 1);
  if (hasGlob(directory) || !hasGlob(name)) return [];

  const entries = await listOf(directories, located(directory === '' ? '.' : directory, place));
  return entries.filter((entry) => matchesName(entry.name, name, { period: true })).map((entry) => `${directory}${entry.name}`);
}

async function walk(
  search: RecursiveSearch,
  policy: Policy,
  place: ShellPlace,
  directories: DirectoryReader,
  budget: { left: number },
): Promise<{ path: string; pattern: string } | undefined> {
  const roots = (
    await Promise.all(search.roots.map(async (root) => (hasGlob(root) ? expand(root, place, directories) : [root])))
  ).flat();
  const queue: string[] = [];

  for (const root of roots) {
    const kind = await kindOf(directories, located(root, place));
    // A file named on the command line is read whatever the filters say about names met on the way down.
    if (kind === 'file') {
      const pattern = protectingPattern(policy, root, place);
      if (pattern !== undefined) return { path: root, pattern };
    } else if (kind === 'directory') {
      queue.push(root);
    }
  }

  for (let directory = queue.shift(); directory !== undefined; directory = queue.shift()) {
    const entries = await listOf(directories, located(directory, place));
    budget.left -= entries.length;
    if (budget.left < 0) return undefined;

    const below: string[] = [];
    for (const entry of entries) {
      if (!search.hidden && entry.name.startsWith('.')) continue;
      const path = joined(directory, entry.name);

      if (entry.kind === 'directory') {
        if (!matchesAny(entry.name, search.excludeDirs)) below.push(path);
      } else if (entry.kind === 'file' && isSearched(entry.name, search)) {
        const pattern = protectingPattern(policy, path, place);
        if (pattern !== undefined) return { path, pattern };
      }
    }
    queue.push(...below);
  }
  return undefined;
}

function isSearched(name: string, search: RecursiveSearch): boolean {
  return (search.includes.length === 0 || matchesAny(name, search.includes)) && !matchesAny(name, search.excludes);
}

/** A program matching its own globs has no rule about a leading dot. */
function matchesAny(name: string, globs: readonly NameGlob[]): boolean {
  return globs.some(({ glob, caseless }) => matchesName(name, glob, { period: false, caseless: caseless === true }));
}

/** A path as a search prints it: `.env` below `.`, `apps/web/.env` below `apps`. */
function joined(directory: string, name: string): string {
  if (directory === '.' || directory === './') return name;
  return directory.endsWith('/') ? `${directory}${name}` : `${directory}/${name}`;
}

/** Tried as written first, as a report reads a command; then absolute, for a rule written with the whole path. */
function protectingPattern(policy: Policy, path: string, place: ShellPlace): string | undefined {
  return (protectionOf(policy, path) ?? protectionOf(policy, located(path, place)))?.pattern;
}

/** What cannot be listed is not searched by the command either, so it reaches nothing here. */
async function listOf(directories: DirectoryReader, path: string): Promise<readonly DirectoryEntry[]> {
  try {
    return await directories.list(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return [];
  }
}

async function kindOf(directories: DirectoryReader, path: string): Promise<EntryKind | undefined> {
  try {
    return await directories.kindOf(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return undefined;
  }
}
