// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SettingsFile } from '../session-index.ts';

/**
 * What Finish writes (`.ai/specs/2026-09-24-onboarding.md` W14, W15, W12a), from what the person chose and what is in
 * force. One list, read by both the confirmation and the server, so the window never lists anything but what is
 * written. It never gives a change that takes protection away (W16) - Tell me is a choice F57 offers, confirmed there.
 */

/** One row of Private files as it is in force (F57): its key, its mode, and whether Settings could switch it. */
export interface InForceRow {
  /** The group's name, or the row's first pattern: what the page and the server both find the row by. */
  readonly key: string;
  readonly mode: 'block' | 'tell';
  /** Watched at all: a built-in group the hooks' file does not hold is listed and watches nothing. */
  readonly watched: boolean;
  /**
   * Watched, and every pattern of it denied by a settings file (`block-means-blocked` K1a). A `block` row without is
   * written at Finish (KD2): a group not watched since Uninstall, or one the hooks read from the built-in list alone.
   */
  readonly ruled: boolean;
  /** Settings offers this row's switch (`switchTo`): a rule written by hand, or a list not read, is not switched. */
  readonly switchable: boolean;
  /** Its patterns: what Tell me puts on the told list for a row not watched, which has no rule to take out (KD2). */
  readonly patterns: readonly string[];
}

/** What is in force for the project, read from the files as Settings reads them (W10). */
export interface InForce {
  /** The file the `watch` hook runs from, or `false`. */
  readonly watch: SettingsFile | false;
  /** The file `refuse` runs from, or `false`: search protection (F38). */
  readonly refuse: SettingsFile | false;
  /** Row 2: a refused attempt is said (level `refused`). */
  readonly stopped: boolean;
  /** Row 3: the clean line is said (`clean` other than `off`). */
  readonly fine: boolean;
  /** The patterns already private, blocked or told, so a name added again is not a change. */
  readonly protected: readonly string[];
  /** Private files, row by row (F57). */
  readonly rows: readonly InForceRow[];
  /** The project's settings could be read, so the hooks can be written (R62). */
  readonly canWrite: boolean;
  /** A name can be added: the hooks read the built-in list or a project file, not a policy. */
  readonly canAdd: boolean;
  /** Both told lists could be read, so a file can be put on one (F57). */
  readonly canTell: boolean;
  /** The preferences file can be written (R26a). */
  readonly noticesWritable: boolean;
}

/** What the person chose, as the page sends it: the added names already written as patterns (F36). */
export interface OnboardingChoices {
  /** Step 1: `local` for Just me, `shared` for Everyone on this project. */
  readonly scope: SettingsFile;
  /** Step 3, row 1. */
  readonly watch: boolean;
  /** Step 2: the names added and left on Block, as `**\/<name>` and `**\/<name>/**`. */
  readonly protect: readonly string[];
  /** Step 2: the names added and switched to Tell me (W12a). */
  readonly tell: readonly string[];
  /** Step 2: each row's mode, by key, as the page left it; a row not named keeps its mode (W12a). */
  readonly modes: Readonly<Record<string, 'block' | 'tell'>>;
  /** Step 3, rows 2 and 3. */
  readonly stopped: boolean;
  readonly fine: boolean;
}

export type OnboardingChange =
  /** W15.1: install `watch` in the file step 1 chose; `from` where it runs from the other one now, and moves (R4g). */
  | { readonly change: 'watch'; readonly where: SettingsFile; readonly from?: SettingsFile }
  /**
   * W15.2: the names left on Block, and the rows left on Block whose rules no file holds (KD2), by key - Settings' add,
   * which installs `refuse` with the rules (F38).
   */
  | { readonly change: 'protect'; readonly patterns: readonly string[]; readonly rows: readonly string[] }
  /** W12a: search protection, where a row stays on Block and nothing else installs `refuse` (Block searches too). */
  | { readonly change: 'search'; readonly where: SettingsFile }
  /** W12a: a row switched to the other mode, as Settings' switch writes it - its patterns read at Finish, by key. */
  | { readonly change: 'mode'; readonly key: string; readonly to: 'block' | 'tell' }
  /** W12a: the names added and the rows not watched (KD2) switched to Tell me, onto the told list alone. */
  | { readonly change: 'tell'; readonly patterns: readonly string[] }
  /** W15.3: only the notice fields that change, for this project. */
  | { readonly change: 'notices'; readonly on?: 'refused' | 'value'; readonly clean?: 'once' | 'off' };

/** W15's order: the hook, the names, search protection, the switches, what is said. Nothing that cannot be written. */
export function onboardingChanges(choices: OnboardingChoices, inForce: InForce): OnboardingChange[] {
  const changes: OnboardingChange[] = [];

  if (choices.watch && inForce.canWrite && inForce.watch !== choices.scope) {
    changes.push({ change: 'watch', where: choices.scope, ...(inForce.watch === false ? {} : { from: inForce.watch }) });
  }

  const known = new Set(inForce.protected);
  const fresh = (names: readonly string[]): string[] =>
    [...new Set(names.map((pattern) => pattern.trim()))].filter((pattern) => pattern !== '' && !known.has(pattern));
  // KD2: a row not watched starts on Block and has nothing to switch; Tell me puts its patterns on the told list, as an
  // added name's are.
  const toldRows = inForce.rows.filter((row) => !row.watched && row.mode === 'block' && choices.modes[row.key] === 'tell').flatMap((row) => row.patterns);
  const told = inForce.canTell ? [...new Set([...fresh(choices.tell), ...toldRows])] : [];
  const blocked = fresh(choices.protect).filter((pattern) => !told.includes(pattern));
  // KD2: Block is what the row says once Finish is done, so a row left on it gets the rules no file holds yet. A row
  // switched back to Block from Tell me is the switch's to write.
  const unruled = inForce.rows.filter((row) => row.mode === 'block' && !row.ruled && (choices.modes[row.key] ?? 'block') === 'block').map((row) => row.key);
  if ((blocked.length > 0 || unruled.length > 0) && inForce.canAdd) changes.push({ change: 'protect', patterns: blocked, rows: unruled });

  const switched = inForce.rows.flatMap((row): OnboardingChange[] => {
    const to = choices.modes[row.key];
    return to !== undefined && to !== row.mode && row.switchable && inForce.canTell ? [{ change: 'mode', key: row.key, to }] : [];
  });
  // F38 as amended: Block keeps a file from searches too. An add and a switch back to Block install `refuse` themselves.
  const staysBlocked = inForce.rows.some((row) => row.watched && (choices.modes[row.key] ?? row.mode) === 'block');
  const installsRefuse = changes.some((change) => change.change === 'protect') || switched.some((change) => change.change === 'mode' && change.to === 'block');
  if (inForce.refuse === false && inForce.canWrite && staysBlocked && !installsRefuse) changes.push({ change: 'search', where: choices.scope });
  changes.push(...switched);
  if (told.length > 0) changes.push({ change: 'tell', patterns: told });

  // Rows 2 and 3 say nothing without the hook, and the page does not let them move while row 1 is off (W13).
  if (choices.watch && inForce.noticesWritable) {
    const on = choices.stopped === inForce.stopped ? undefined : choices.stopped ? 'refused' : 'value';
    const clean = choices.fine === inForce.fine ? undefined : choices.fine ? 'once' : 'off';
    if (on !== undefined || clean !== undefined) {
      changes.push({ change: 'notices', ...(on === undefined ? {} : { on }), ...(clean === undefined ? {} : { clean }) });
    }
  }

  return changes;
}
