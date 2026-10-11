// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { relative } from 'node:path';
import { bracesOf, foundVariables, hasGlob, matchesName, reachOf, type FoundIn, type NameGlob, type RecursiveSearch } from '../core/access/search-reach.ts';
import { located, placeBefore, type ShellPlace } from '../core/access/shell-place.ts';
import { simpleCommandsIn } from '../core/access/command-line.ts';
import { protectedOperandsInCommand } from '../core/access/protected-access.ts';
import { holds, protectionOf, type Policy } from '../core/policy/policy.ts';
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
  budget: { left: number } = { left: MAX_ENTRIES },
): Promise<CommandReach | undefined> {
  const { searches, globs } = reachOf(command);

  // FN17 as amended 2026-10-11 (FNB42): a glob expands where the line is when its command runs - `cd <lesson> && for f in
  // *; …` lists the lesson, and was refused for the blocked `note.md` of the folder the hook started in. Each is read as
  // written from where the line starts, as a search's place is (FN17), and said as the line wrote it.
  const line = globs.length > 0 ? simpleCommandsIn(command) : [];
  for (const word of globs) {
    const at = line.findIndex((simple) => simple.args.includes(word));
    const here = at <= 0 ? place : placeBefore(line, at, place);
    const written = here.workingDirectory === place.workingDirectory ? word : relativeTo(place, located(word, here));
    for (const one of bracesOf(written)) {
      // FNB25: a word whose fixed part already lies in a blocked folder reaches nothing but that folder's files.
      const inside = folderHolding(policy, one, place);
      if (inside !== undefined) return { kind: 'glob', word, ...inside };
      // A brace list's word with no wildcard left is a name the line wrote, read as one.
      const named = hasGlob(one) ? undefined : protectingPattern(policy, one, place);
      if (named !== undefined) return { kind: 'glob', word, path: one, pattern: named };
      for (const path of await expand(one, place, directories, budget)) {
        const pattern = protectingPattern(policy, path, place);
        if (pattern !== undefined) return { kind: 'glob', word, path, pattern };
      }
    }
  }
  if (budget.left < 0) return { kind: 'too-large' };

  // A search runs where the line is when it runs: `cd docs && grep -r KEY .` reads `docs` (FN17).
  const parsed = searches.some((search) => search.at !== undefined) ? simpleCommandsIn(command) : [];
  for (const search of searches) {
    const here = search.at === undefined ? place : placeBefore(parsed, search.at, place);
    const found = await walk(search, policy, here, directories, budget);
    // Said from where the line starts, so the agent and the person read which file it is: `docs/x`, not `./x`.
    if (found !== undefined) return { kind: 'search', ...found, path: here === place ? found.path : relativeTo(place, located(found.path, here)) };
  }
  return budget.left < 0 ? { kind: 'too-large' } : undefined;
}

/** `2026-10-11-a-folder-found-while-it-runs.md` FW3: the places asked about, folders first. */
const MOST_PLACES = 200;

/** FW3: folders no one keeps a protected file of their own in, and which would spend the walk's whole allowance. */
const NOT_ENTERED = new Set(['.git', 'node_modules']);

/** A protected file a line reaches through a folder it finds while it runs, said as the search that finds it (FW1). */
export type FoundReach =
  | { readonly kind: 'found'; readonly word: string; readonly path: string; readonly pattern: string }
  | { readonly kind: 'too-large' };

/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW1-FW3: a line that reads a folder it only finds while it runs -
 * `d=$(find . -type d -name lessons | head -1); cat "$d"/*` - read as each protected file under where it runs and each
 * folder holding one, written in for the variable, and asked what a written path is asked (R21a): a search, a glob, a
 * `find` and its loop, and a printing program's operand that is there. FWB1: such lines read a blocked folder unrefused.
 */
export async function protectedFileFound(
  command: string,
  policy: Policy,
  place: ShellPlace,
  directories: DirectoryReader,
): Promise<FoundReach | undefined> {
  const variables = foundVariables(command);
  if (variables.length === 0) return undefined;
  const budget = { left: MAX_ENTRIES };
  const found = variables.flatMap((variable) => variable.from);
  const places: string[] = [];
  for (const from of found) {
    const more = await protectedPlaces(from, command, policy, place, directories, budget);
    if (more === undefined) return { kind: 'too-large' };
    places.push(...more.filter((one) => !places.includes(one)));
  }
  const word = `$${variables[0]?.name ?? ''}`;
  const names = variables.map((variable) => variable.name);
  for (const at of places.slice(0, MOST_PLACES)) {
    const written = withVariables(command, names, at);
    const reach = await protectedFileReached(written, policy, place, directories, budget);
    if (reach?.kind === 'too-large') return reach;
    if (reach !== undefined) return { kind: 'found', word, path: reach.path, pattern: reach.pattern };
    // FW2: a printing program's operand the variable gave, placed after the line's `cd`s, where it is a file there:
    // `cat "$d"`, `head "$d"/notes.md`. A folder handed to `cat` prints nothing of what is in it; only a walk reads one.
    for (const [path, pattern] of protectedOperandsInCommand(written, policy, place)) {
      if (!path.includes(at)) continue;
      if ((await kindOf(directories, located(path, place))) === 'file') return { kind: 'found', word, path: relativeTo(place, located(path, place)), pattern };
    }
  }
  return places.length > MOST_PLACES ? { kind: 'too-large' } : undefined;
}

/**
 * FW1, FW3: every protected file under the folders a found variable's program looked in and every folder holding one,
 * those folders among them, as the line would write them - folders first, the nearest first. `undefined` past the walk's
 * allowance.
 */
async function protectedPlaces(
  { offset, roots, depth, hidden, relative }: FoundIn, command: string, policy: Policy, place: ShellPlace, directories: DirectoryReader,
  budget: { left: number },
): Promise<string[] | undefined> {
  // Its program runs where the line is when it is filled: `cd lessons/01 && for f in $(find . -type f)` looks in the lesson.
  const before = simpleCommandsIn(command.slice(0, offset));
  const here = placeBefore(before, before.length, place);
  const folders = new Set<string>();
  const files = new Set<string>();
  for (const root of roots) {
    // What the program can print is within `depth` of its folder: the files there, and the folders holding one deeper -
    // written as it prints them, from its folder where it prints names from there (`ls docs`).
    const within = (path: string): boolean => depth === undefined || below(root, path) <= depth;
    const printed = (path: string): string => (relative && root !== '.' && root !== './' ? path.slice(root.replace(/\/+$/, '').length + 1) : path);
    const queue = [root];
    for (let directory = queue.shift(); directory !== undefined; directory = queue.shift()) {
      const entries = await listOf(directories, located(directory, here));
      budget.left -= entries.length;
      if (budget.left < 0) return undefined;
      for (const entry of entries) {
        if (!hidden && entry.name.startsWith('.')) continue;
        const path = joined(directory, entry.name);
        if (entry.kind === 'directory' && !NOT_ENTERED.has(entry.name)) queue.push(path);
        // Asked as the hook asks any path: as the line writes it from where it starts.
        if (entry.kind !== 'file' || protectingPattern(policy, relativeTo(place, located(path, here)), place) === undefined) continue;
        if (within(path)) files.add(printed(path));
        const parts = path.split('/');
        for (let at = 1; at < parts.length; at += 1) {
          const folder = parts.slice(0, at).join('/');
          if (folder !== '' && folder !== '.' && within(folder) && below(root, folder) > 0) folders.add(printed(folder));
        }
      }
    }
  }
  return [...[...folders].sort((a, b) => a.split('/').length - b.split('/').length), ...files];
}

/** How many folders below `root` a path the walk wrote lies: `docs` is 1 below `.`, `lib/a/b` 2 below `lib`. */
function below(root: string, path: string): number {
  const from = root === '.' || root === './' ? path : path.slice(root.replace(/\/+$/, '').length + 1);
  return from.split('/').filter((part) => part !== '' && part !== '.').length;
}

/**
 * FW1: the line with a place written in for each found variable, quoted as where it stands: inside double quotes with
 * what they treat specially escaped, outside them as one word.
 */
function withVariables(command: string, variables: readonly string[], at: string): string {
  const names = new Set(variables);
  let out = '';
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] as string;
    if (quote !== "'" && char === '\\') {
      out += char + (command[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (char === "'" && quote !== '"') quote = quote === "'" ? undefined : "'";
    else if (char === '"' && quote !== "'") quote = quote === '"' ? undefined : '"';
    if (char === '$' && quote !== "'") {
      const match = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/.exec(command.slice(index));
      const name = match?.[1] ?? match?.[2];
      if (match !== null && name !== undefined && names.has(name)) {
        out += quote === '"' ? at.replace(/["\\$`]/g, '\\$&') : /^[\w./-]+$/.test(at) ? at : `'${at.replace(/'/g, "'\\''")}'`;
        index += match[0].length - 1;
        continue;
      }
    }
    out += char;
  }
  return out;
}

/**
 * The names a shell would put in place of a glob, as it would write them - each part of the path in turn, a wildcard in a
 * directory part too (`lessons/*` + `/teoria.md`), walking only directories through it. Found by FNB25: only the last part
 * was expanded, and `cat blocked/*` + `/teoria.md` read a blocked folder's files. A word with no glob is no expansion.
 */
async function expand(word: string, place: ShellPlace, directories: DirectoryReader, budget: { left: number } = { left: MAX_ENTRIES }): Promise<string[]> {
  if (!hasGlob(word)) return [];
  const parts = word.split('/');
  let paths = [''];
  let expanded = false;
  for (const [at, part] of parts.entries()) {
    const last = at === parts.length - 1;
    // Before the first wildcard a part is taken as written; after it, a part names what is there or nothing - the shell
    // writes only names that exist, so `lessons/*` + `/01_a/x` is not a lesson where `01_a` is missing.
    if (!hasGlob(part) && (!expanded || part === '')) {
      paths = paths.map((path) => path + part + (last ? '' : '/'));
      continue;
    }
    expanded = true;
    const next: string[] = [];
    for (const path of paths) {
      const entries = await listOf(directories, located(path === '' ? '.' : path, place));
      budget.left -= entries.length;
      if (budget.left < 0) return next;
      for (const entry of entries) {
        if (hasGlob(part) ? !matchesName(entry.name, part, { period: true }) : entry.name !== part) continue;
        if (last) next.push(path + entry.name);
        else if (entry.kind === 'directory') next.push(path + entry.name + '/');
      }
    }
    paths = next;
  }
  return paths;
}

/**
 * FNB25: where a glob's fixed part - every part before its first wildcard - is a folder a folder's rule holds, each name
 * it becomes is inside that folder, so the word reaches the folder whatever is in it. Read before anything is listed.
 */
function folderHolding(policy: Policy, word: string, place: ShellPlace): { readonly path: string; readonly pattern: string } | undefined {
  const parts = word.split('/');
  const wild = parts.findIndex((part) => hasGlob(part));
  if (wild <= 0) return undefined;
  const fixed = parts.slice(0, wild).join('/');
  if (fixed === '' || fixed === '.' || fixed === '..') return undefined;
  const forms = [fixed, located(fixed, place)];
  // FN14: a folder held at the project's root is that folder alone, as `protectionOf` reads it.
  const entry = policy.protected.find((one) => one.pattern.endsWith('/**') && forms.some((form) => holds(one, form.replace(/\/+$/, '') + '/a')));
  return entry === undefined ? undefined : { path: fixed, pattern: entry.pattern };
}

async function walk(
  search: RecursiveSearch,
  policy: Policy,
  place: ShellPlace,
  directories: DirectoryReader,
  budget: { left: number },
): Promise<{ path: string; pattern: string } | undefined> {
  const roots = (
    await Promise.all(search.roots.map(async (root) => (hasGlob(root) ? expand(root, place, directories, budget) : [root])))
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
        // FN17: `ls docs` lists what is directly in `docs`, and a loop over it opens nothing deeper.
        if (search.shallow !== true && !matchesAny(entry.name, search.excludeDirs)) below.push(path);
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

/** A path as the line would write it from where it starts: relative inside that folder, whole outside it. */
function relativeTo(place: ShellPlace, path: string): string {
  const inside = relative(place.workingDirectory, path);
  return inside === '' || inside.startsWith('..') ? path : inside;
}
