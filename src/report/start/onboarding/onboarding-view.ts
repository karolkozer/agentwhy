// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import type { GlobalDefaultId } from '../../../setup/global-defaults.ts';
import { projectName } from '../app-nav.ts';
import type { IndexEverywhere, IndexProject, IndexProjects, IndexSettings, SessionIndex, SettingsFile } from '../session-index.ts';
import { patternShort } from '../settings/files-tab.ts';
import { settingsView, type RuleRow } from '../settings/settings-view.ts';
import { toFixView, type FixFile } from '../to-fix/to-fix-view.ts';
import type { InForce } from './onboarding-changes.ts';

/**
 * What the onboarding shows, decided from the index (`.ai/specs/2026-09-24-onboarding.md`; plan step 2). No HTML:
 * every screen's state is chosen here, and the page only writes it. What is in force is Settings' own reading of the
 * files (`settingsView`), and what is to fix is To fix's (`toFixView`), so the three pages never disagree.
 */

/** W18: how many files Done names before "+{n} more on your To fix list". */
const DONE_FILES = 3;

/** A switch of step 3: where it starts, and whether the page may move it. */
export interface OnboardingSwitch {
  readonly on: boolean;
  readonly writable: boolean;
}

/** What Done says (W17-W20, W1a). */
export interface OnboardingDone {
  /** The To fix count, the same number the sidebar shows (T1). */
  readonly total: number;
  /** At most three, the keys group first, each group in To fix's order (T4, T8). */
  readonly files: readonly FixFile[];
  /** The files to fix not named above. */
  readonly more: number;
  /** T2: keys to change, only a look, or nothing. */
  readonly state: 'keys' | 'look' | 'none';
  /** Every conversation the run listed. None is W1a: a project with no AI chats yet. */
  readonly conversations: number;
  /** Those whose report was written. */
  readonly checked: number;
  /** A conversation could not be read, or was read with gaps: "We couldn't check every chat" (W19, W34). */
  readonly gaps: boolean;
  /** The run's range as it was asked for, `7d` (To fix D3). */
  readonly asked: string;
}

/**
 * Where the project step starts (`.ai/specs/2026-09-27-which-project.md` V20), from what the run read - never from a
 * guess about the folder. `name` and `place` are the run's own folder's.
 */
export type OnboardingProject =
  /**
   * The common case: this folder has AI chats, counted by where they were held (V4), and how many private files the AI
   * read in them - To fix's count, the design's "Found 9 private files" said as what it is (T1).
   */
  | { readonly kind: 'found'; readonly name: string; readonly place?: string; readonly conversations: number; readonly entryPoints: Readonly<Partial<Record<EntryPoint, number>>>; readonly read: number }
  /** None here, but the project whose folder holds this one has them: `within` is the way from it to here, `src`. */
  | { readonly kind: 'inside'; readonly name: string; readonly place?: string; readonly above: IndexProject; readonly within: string }
  /** None here, and none near (V21). */
  | { readonly kind: 'empty'; readonly name: string; readonly place?: string }
  /** The home directory or a root (V7): no project is shown, and the list is open with nothing chosen. */
  | { readonly kind: 'none'; readonly not: 'home' | 'root'; readonly conversations: number };

/**
 * One row of the computer-wide *Files* step (`.ai/specs/2026-10-05-protected-everywhere.md` G9, GD14), or a rule the
 * computer already holds that is not one of GD14's.
 */
export interface EverywhereRow {
  /** GD14's row, whose human name the page's words hold; absent for a rule of the person's own. */
  readonly id?: GlobalDefaultId;
  /** The path as its chip shows it: `.config/gh`, `.git-credentials`, `AppData/Roaming/gcloud`. */
  readonly path: string;
  /** What is written for it: its place (`2026-10-07-a-file-in-its-place.md` IP6), or a person's own rule as written. */
  readonly pattern: string;
  /** Its path is on this computer. A row whose path is not, and that holds nothing yet, is folded unticked (GD14). */
  readonly present: boolean;
  /** What the computer does with it already. Such a row is drawn as it is, and is not chosen again here. */
  readonly now?: 'block' | 'tell';
  /**
   * IPD1: what holds it is the anchored form an older release wrote (`**\/.ssh/**`), which Claude Code applies only inside
   * the folder it works in (IPB4) - the row is the same row, and Settings offers to bring it along.
   */
  readonly stale?: true;
}

/** The computer-wide path (G7-G10): its rows, whether it can write, and whether Codex is named (GD13). */
export interface OnboardingEverywhere {
  /** Rows that hold something or are here first, then the person's own rules, then those folded. */
  readonly rows: readonly EverywhereRow[];
  /** The rules and the told list could be read, so a change can be made from what they hold. */
  readonly writable: boolean;
  /** Codex is used on this computer, so its check is turned on with a block and the page may say so (G17). */
  readonly codex: boolean;
  /** GD23 with GD26: alerts in every project are not on yet, and can be - offered on the step, ticked. */
  readonly offerAlerts: boolean;
  /** a-file-in-its-place IP2: what the step's Add offers - the system's window, both kinds or one at a time, or a typed place. */
  readonly places: 'both' | 'separate' | 'typed';
  /**
   * G7a: the computer holds something of its setup - a block, a tracked file, or alerts in every project. The widened
   * reading N6 gives a project, not the record `#computerSetUp` keeps, which a project's run never reads (GD26).
   */
  readonly setUp: boolean;
}

export interface OnboardingView {
  /** W6, W24: the intro plays; else the page starts at the welcome. */
  readonly intro: boolean;
  /** G7a: this project is set up, so the page is the setup seen again (W25, W25a) and says so. */
  readonly setUp: boolean;
  /** which-project V7: the page opens at the project step, past the welcome. */
  readonly atProject: boolean;
  /** V20: where the project step starts. */
  readonly project: OnboardingProject;
  /** The person's projects, where the run listed them (V11): what **Pick a different project** opens. */
  readonly projects?: IndexProjects;
  /** W11: step 1 starts where the hook runs, else at Just me. */
  readonly who: SettingsFile;
  /** W12, W12a: Settings' rows with their mode and switch (F57), whether a name can be added, and whether told. */
  readonly files: { readonly rows: readonly RuleRow[]; readonly canAdd: boolean; readonly canTell: boolean };
  /** W13. */
  readonly messages: { readonly alerts: OnboardingSwitch; readonly stopped: OnboardingSwitch; readonly fine: OnboardingSwitch };
  /** What Finish compares the choices with (W14, W15). */
  readonly inForce: InForce;
  readonly done: OnboardingDone;
  /** The computer-wide path, where this run can offer it (G7). */
  readonly everywhere?: OnboardingEverywhere;
}

/**
 * What Finish compares the choices with, from the settings as the files hold them: read when the page is drawn, and
 * read again by the server at Finish (W15), so a choice made in another tab since is never written over.
 */
export function inForceOf(settings: IndexSettings): InForce {
  const view = settingsView(settings);
  return {
    watch: settings.hooks?.watch ?? false,
    refuse: settings.hooks?.refuse ?? false,
    stopped: view.stopped.on,
    fine: view.fine.on,
    protected: settings.protected,
    rows: view.rows.map((row) => ({
      key: rowKey(row),
      mode: row.mode,
      watched: row.watched,
      ruled: row.watched && row.patterns.every((pattern) => deniedIn(settings, pattern)),
      switchable: row.switchTo !== undefined,
      patterns: row.patterns,
    })),
    canWrite: view.canWrite,
    canAdd: view.canAdd,
    canTell: view.canTell,
    noticesWritable: view.noticesWritable,
  };
}

/**
 * A pattern either settings file denies - Claude Code applies both (R4d) - or one whose rules could not be read, where
 * nothing is claimed and nothing written (K2).
 */
export function deniedIn(settings: IndexSettings, pattern: string): boolean {
  return settings.held === undefined || settings.held.local.includes(pattern) || settings.held.shared.includes(pattern);
}

/** What the page and the server find a row of Private files by: the group's name, or its first pattern (W12a). */
export function rowKey(row: RuleRow): string {
  return row.name ?? row.patterns[0] ?? '';
}

/** `undefined` where there is nothing to set up from: a shared page, or one with no settings behind it (W1). */
export function onboardingView(index: SessionIndex): OnboardingView | undefined {
  if (index.shared || index.settings === undefined) return undefined;
  const settings = settingsView(index.settings);
  const fix = toFixView(index);
  const files = [...fix.keys, ...fix.look].slice(0, DONE_FILES);
  const generated = index.entries.filter((entry) => entry.report.kind === 'generated');

  return {
    intro: index.onboarding?.intro === true,
    setUp: index.onboarding?.setUp === true,
    atProject: index.onboarding?.atProject === true,
    project: projectOf(index, fix.total),
    ...(index.projects === undefined ? {} : { projects: index.projects }),
    // F56: one answer for who it is all for; where the files hold both, or nothing yet, Just me.
    who: settings.scope === 'shared' ? 'shared' : 'local',
    files: { rows: settings.rows, canAdd: settings.canAdd, canTell: settings.canTell },
    messages: {
      // Row 1 starts on where it can be written: it is what `init` ticks by default (R4a), and this is the setup `init`
      // was. Where it cannot, it shows what the file holds, and nothing moves it.
      alerts: { on: settings.alerts.on || settings.canWrite, writable: settings.canWrite },
      // Rows 2 and 3 start from what is in force, the product's defaults where nothing was chosen (N4).
      stopped: { on: settings.stopped.on, writable: settings.noticesWritable },
      fine: { on: settings.fine.on, writable: settings.noticesWritable },
    },
    inForce: inForceOf(index.settings),
    ...(index.everywhere === undefined ? {} : { everywhere: everywhereOf(index.everywhere) }),
    done: {
      total: fix.total,
      files,
      more: fix.total - files.length,
      state: fix.state,
      conversations: index.entries.length,
      checked: generated.length,
      gaps: index.entries.some((entry) => entry.report.kind === 'failed' || (entry.report.kind === 'generated' && entry.report.incomplete)),
      asked: index.asked,
    },
  };
}

/** V20's starting state: a folder that is no project, one with chats, one inside a project with chats, or neither. */
function projectOf(index: SessionIndex, read: number): OnboardingProject {
  if (index.notAProject !== undefined) return { kind: 'none', not: index.notAProject, conversations: index.entries.length };
  // `everything-on-this-computer.md` GD16: the computer's page is the home folder's run - no project, as there.
  if (index.scope === 'computer') return { kind: 'none', not: 'home', conversations: index.entries.length };
  const name = projectName(index.project ?? '');
  const place = index.place === undefined ? {} : { place: index.place };
  if (index.entries.length > 0) return { kind: 'found', name, ...place, conversations: index.entries.length, entryPoints: index.entryPoints ?? {}, read };
  const above = index.projects?.above;
  const holder = above === undefined ? undefined : index.projects?.rows.find((row) => row.id === above.id && row.folder !== 'gone');
  if (above !== undefined && holder !== undefined) return { kind: 'inside', name, ...place, above: holder, within: above.within };
  return { kind: 'empty', name, ...place };
}

/**
 * GD14's rows as this computer holds them, and every other rule it holds. A rule both lists name is shown blocked: G15
 * answers a computer-wide block before any Track, its own included.
 */
export function everywhereOf(everywhere: IndexEverywhere): OnboardingEverywhere {
  const blocked = everywhere.blocked === 'unreadable' ? [] : everywhere.blocked;
  const told = everywhere.told === 'unreadable' ? [] : everywhere.told;
  const now = (pattern: string): 'block' | 'tell' | undefined => (blocked.includes(pattern) ? 'block' : told.includes(pattern) ? 'tell' : undefined);
  const named = everywhere.rows.map(({ id, path, pattern, legacy, present }): EverywhereRow => {
    const held = now(pattern);
    // IPD1: a row an older release wrote anchored is still this row - held, and known to be in the old form.
    const before = held === undefined && legacy !== undefined ? now(legacy) : undefined;
    return { id, path, pattern, present, ...(held === undefined ? {} : { now: held }), ...(before === undefined ? {} : { now: before, stale: true as const }) };
  });
  const offered = new Set(everywhere.rows.flatMap((row) => [row.pattern, ...(row.legacy === undefined ? [] : [row.legacy])]));
  const own = [...new Set([...blocked, ...told])].filter((pattern) => !offered.has(pattern))
    .map((pattern): EverywhereRow => ({ path: patternShort(pattern), pattern, present: true, now: now(pattern) ?? 'block' }));
  const shown = (row: EverywhereRow): boolean => row.present || row.now !== undefined;
  const rows = [...named.filter(shown), ...own, ...named.filter((row) => !shown(row))];
  return {
    rows,
    writable: everywhere.blocked !== 'unreadable' && everywhere.told !== 'unreadable',
    codex: everywhere.codex,
    offerAlerts: everywhere.alerts === false,
    places: everywhere.places ?? 'typed',
    // G7a: the same reading `Everywhere#setUp` makes of the computer, from what this page already holds - so the fork
    // says *Set up* without a record read, which GD26 keeps to the home folder's run.
    setUp: rows.some((row) => row.now !== undefined) || everywhere.alerts === true,
  };
}
