// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import { projectName } from '../app-nav.ts';
import type { IndexProject, IndexProjects, IndexSettings, SessionIndex, SettingsFile } from '../session-index.ts';
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

export interface OnboardingView {
  /** W6, W24: the intro plays; else the page starts at the welcome. */
  readonly intro: boolean;
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
  const name = projectName(index.project ?? '');
  const place = index.place === undefined ? {} : { place: index.place };
  if (index.entries.length > 0) return { kind: 'found', name, ...place, conversations: index.entries.length, entryPoints: index.entryPoints ?? {}, read };
  const above = index.projects?.above;
  const holder = above === undefined ? undefined : index.projects?.rows.find((row) => row.id === above.id && row.folder !== 'gone');
  if (above !== undefined && holder !== undefined) return { kind: 'inside', name, ...place, above: holder, within: above.within };
  return { kind: 'empty', name, ...place };
}
