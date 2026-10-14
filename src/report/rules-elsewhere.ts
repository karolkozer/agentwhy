// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { refuseProjectAbove, refuseRulesOf, type ProjectWalk, type RefuseProject } from '../adapter/claude-code/settings/refuse-project.ts';
import { placesNamedIn } from '../core/access/places-named.ts';
import { located } from '../core/access/shell-place.ts';
import { leftAlone } from '../core/guarded-places.ts';
import { heldInProject, type ProjectRules } from '../core/policy/another-project.ts';
import type { SessionModel } from '../core/session-model.ts';
import type { FileReader } from '../ports/file-reader.ts';
import { choosePolicy } from './choose-policy.ts';
import { tellListPaths, type TellListPaths } from './private-files/tell-lists.ts';

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW6: how many places one line is walked up from. A line names a handful;
 * one that names more is walked from its first ones, and nothing is guessed about the rest.
 */
export const MOST_PLACES_OF_A_LINE = 64;

/** RW7: the same for a whole conversation, whose calls name many places but few folders - the walks share their answers. */
export const MOST_PLACES_OF_A_CONVERSATION = 4096;

/**
 * RW2: the set-up projects the places lie in - for each, the nearest folder at or above it, short of the home folder,
 * whose Claude Code settings run `refuse` (AO5) - other than `own`, the project whose rules are already the policy's.
 * A folder `leftAlone` names (V10b, RW10) is walked past unread, and so is one `mayHold` says cannot hold `.claude/` (WF1).
 */
export async function projectsHolding(
  files: FileReader,
  home: string,
  places: readonly string[],
  own: string | undefined,
  options: { readonly most: number } & ProjectWalk,
): Promise<readonly RefuseProject[]> {
  const seen = options.seen ?? new Map<string, RefuseProject | null>();
  const found = new Map<string, RefuseProject>();
  const ownFolder = own === undefined ? undefined : trimmed(own);
  const walk: ProjectWalk = {
    seen,
    ...(options.leftAlone === undefined ? {} : { leftAlone: options.leftAlone }),
    ...(options.mayHold === undefined ? {} : { mayHold: options.mayHold }),
  };
  for (const place of places.slice(0, options.most)) {
    const project = await refuseProjectAbove(files, place, home, walk);
    if (project !== undefined && trimmed(project.project) !== ownFolder) found.set(trimmed(project.project), project);
  }
  return [...found.values()];
}

/** What other projects' rules a line or a report was read with. */
export interface RulesElsewhere {
  /** Each project's rules, held to its folder (RW3). */
  readonly projects: readonly ProjectRules[];
  /** RW9: each project read, by its folder, with what was read there as one comparable value. */
  readonly read: readonly ProjectRead[];
  /** RW6: a project whose rules could not be read - said where nothing else refused, never guessed at. */
  readonly unreadable: boolean;
  /**
   * RW8: what a page says of each project's files - the patterns its deny rules block (M3: a rule Claude Code applies,
   * never the built-in list or a policy file) and the ones its told lists hold, as held to its folder.
   */
  readonly shown: readonly ProjectShown[];
}

export interface ProjectShown {
  readonly folder: string;
  readonly blocked: readonly string[];
  readonly told: readonly string[];
}

export interface ProjectRead {
  readonly folder: string;
  readonly key: string;
}

/**
 * RW2, RW7, RW10: the projects a conversation's calls reached into - each command's words where it ran, each file a tool
 * was handed - other than `own`, the folder whose rules are already read, with their rules. A folder macOS guards, other
 * than the one `workingDirectory` lies in, is not looked into (V10b). The report's reading, and since
 * `2026-10-12-a-read-outside-the-project.md` RX4 `watch`'s: the line said "a file you let it read" of a file the report
 * called blocked, read by neither from the same rules (RXB2). `listing` is what the conversations of one listing share:
 * the walks they made, so a folder is walked once a listing and not once a conversation (DC6), and whether a folder can
 * hold `.claude/` at all, from listings kept as long (WF2).
 */
export async function rulesOfConversation(
  files: FileReader, home: string, model: SessionModel, own: string | undefined, workingDirectory: string,
  listing: Pick<ProjectWalk, 'seen' | 'mayHold'> = {},
): Promise<RulesElsewhere> {
  const root = model.projectRoot.kind === 'known' ? model.projectRoot.path : undefined;
  const places = new Set<string>();
  for (const event of model.events) {
    const from = event.workingDirectory ?? root;
    const place = from === undefined ? undefined : { workingDirectory: from, home };
    const commands = new Set(event.commands);
    if (place !== undefined) for (const command of event.commands) for (const one of placesNamedIn(command, place)) places.add(one);
    for (const target of event.targets) {
      if (commands.has(target)) continue;
      const whole = place === undefined ? target : located(target, place);
      if (isAbsolute(whole)) places.add(whole);
    }
  }
  const projects = await projectsHolding(files, home, [...places], own, {
    most: MOST_PLACES_OF_A_CONVERSATION,
    leftAlone: (folder) => leftAlone(folder, workingDirectory, home),
    ...(listing.seen === undefined ? {} : { seen: listing.seen }),
    ...(listing.mayHold === undefined ? {} : { mayHold: listing.mayHold }),
  });
  return rulesOfProjects(files, home, projects);
}

/**
 * RW3: each project's rules as its own `refuse` reads them - the rules its command names (AO6), the built-in list where it
 * names none, and its two told lists - held to its folder. The computer's rules and its told list are every policy's
 * already, and left out: read here as well, a file only the computer tracks was said to be tracked by the project
 * (found on the maintainer's data, 2026-10-12, as "Track · LearningPython2").
 */
export async function rulesOfProjects(files: FileReader, home: string, projects: readonly RefuseProject[]): Promise<RulesElsewhere> {
  const held: ProjectRules[] = [];
  const read: ProjectRead[] = [];
  const shown: ProjectShown[] = [];
  let unreadable = false;
  for (const project of projects) {
    const folder = trimmed(project.project);
    const chosen = await choosePolicy(refuseRulesOf(project), files, projectListsOnly(tellListPaths(home, folder)), home);
    if ('errors' in chosen) {
      unreadable = true;
      read.push({ folder, key: UNREADABLE });
      continue;
    }
    const rules = heldInProject(chosen.policy, folder);
    held.push(rules);
    read.push({ folder, key: keyOf(rules) });
    const denied = chosen.policy.origin.kind === 'settings';
    shown.push({
      folder,
      blocked: denied ? rules.protected.filter((entry) => entry.mode !== 'tell').map((entry) => entry.pattern) : [],
      told: rules.protected.filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern),
    });
  }
  return { projects: held, read, unreadable, shown };
}

/**
 * RW9: what each folder holds now, as `rulesOfProjects` keyed it - so a report kept since can be told apart from one that
 * would be drawn differently. A folder that no longer runs `refuse` holds nothing.
 */
export async function rulesNow(files: FileReader, home: string, folders: readonly string[]): Promise<readonly ProjectRead[]> {
  const read: ProjectRead[] = [];
  for (const folder of folders) {
    const found = await refuseProjectAbove(files, folder, home);
    if (found === undefined || trimmed(found.project) !== trimmed(folder)) {
      read.push({ folder: trimmed(folder), key: NONE });
      continue;
    }
    const [one] = (await rulesOfProjects(files, home, [found])).read;
    read.push(one ?? { folder: trimmed(folder), key: NONE });
  }
  return read;
}

/**
 * A project's two told lists without the computer's: the computer's list is read again in its place as the project's own
 * local one, which adds nothing - `tellPatterns` keeps one of each.
 */
function projectListsOnly(paths: TellListPaths): TellListPaths {
  return { pathsFor: (settingsPath) => { const lists = paths.pathsFor(settingsPath); return { ...lists, computer: lists.local }; } };
}

const UNREADABLE = 'unreadable';
const NONE = 'none';

function keyOf(rules: ProjectRules): string {
  return JSON.stringify([rules.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']), rules.allowed]);
}

function trimmed(folder: string): string {
  return folder.length > 1 ? folder.replace(/\/+$/, '') : folder;
}
