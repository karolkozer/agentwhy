// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../core/redaction/redacted.ts';
import type { Mark, MarkLine, MarkResult, MarkStatus } from './marks.ts';
import { NAMES_PER_FILE } from '../report-model.ts';
import type { FileRead, SessionActions } from './session-actions.ts';
import { refusedByRule } from '../refusals.ts';

/**
 * What the brief `check` calls a file, strongest first: a value seen beats a template read, which beats an unknown
 * outcome, which beats a route nothing refused, which beats a path that only appeared in a result.
 */
export type CheckLabel = 'rotate' | 'template' | 'unknown' | 'route' | 'result';

const ORDER: readonly CheckLabel[] = ['rotate', 'template', 'unknown', 'route', 'result'];

/**
 * The labels that ask a person to do something: a key to change, a template to confirm, an outcome nobody recorded.
 * The other two say where a path went and ask for nothing. Every page that counts what is left to do counts these.
 */
export const TO_DO_LABELS: readonly CheckLabel[] = ['rotate', 'template', 'unknown'];

/**
 * The project a row's file is in, on the computer's page (`.ai/specs/2026-10-05-protected-everywhere.md` GD18): the id the
 * projects window lists it under (V17), its folder's name, and where it is as a person reads it.
 */
export interface RowProject {
  readonly id: string;
  readonly name: string;
  readonly place?: string;
  /** GD20: why it is on the computer's page where that is its kind - no project at all, or a project not set up. */
  readonly kind?: 'none' | 'not-set-up';
}

/** GD20, GD22: what a listed folder is to the computer's page. */
export type ProjectKind = 'set-up' | 'not-set-up' | 'none' | 'removed';

/** One file, under the strongest thing known about it, and every session in which anything was known about it. */
export interface CheckRow {
  readonly label: CheckLabel;
  readonly path: Redacted;
  /** Index entry names, in the order the index lists them. */
  readonly sessions: readonly string[];
  /** A session read a key from it (`RotateFile.keyed`): it is closed as rotated, never as handled or not private. */
  readonly keyed?: true;
  /** The file was marked done, and a session active after the mark reached it again (R35). */
  readonly reopened?: { readonly result: MarkResult; readonly at: number };
  /** What the sessions read from it, merged: every key format and line any of them saw, names only (`RotateFile.read`). */
  readonly read?: FileRead;
  /** GD18: on the computer's page, the project it is in - the same path in two projects is two rows. */
  readonly project?: RowProject;
}

/** One mark, as the History tab lists it (R36). */
export interface HistoryLine {
  readonly path: string;
  readonly label: string;
  readonly result: MarkResult;
  readonly at: number;
  /** Absent where none was typed, and always on a shared page (R37). */
  readonly note?: string;
  /** Entry names of the sessions behind the line when it was marked, where this run still lists them. */
  readonly sessions: readonly string[];
  readonly status: MarkStatus;
  readonly endedAt?: number;
  /** Standing, and back in To do because a later session reached the file. */
  readonly reopened: boolean;
  /** GD18: on the computer's page, the project whose record holds it. */
  readonly project?: RowProject;
}

/** The Check tab of the index: `agentwhy check` over the same sessions, with the sessions behind each line kept. */
export interface IndexCheck {
  /** What is still to do: files a standing mark covers are not here, unless something reached them again. */
  readonly rows: readonly CheckRow[];
  /**
   * Attempts a rule refused - what "Your protection worked" may count (`who-stopped-it` WS6, amended 2026-10-01). What
   * auto mode or the person stopped is left out: no rule of theirs did it.
   */
  readonly refusedAttempts: number;
  readonly history?: readonly HistoryLine[];
  /** The record of marks exists and could not be read, so nothing was hidden because of it. */
  readonly marksUnreadable?: boolean;
}

export interface NamedActions {
  readonly name: string;
  readonly actions: SessionActions;
}

export interface MarksForCheck {
  readonly standing: ReadonlyMap<string, Mark>;
  readonly lines: readonly MarkLine[];
  readonly unreadable: boolean;
  /** The entry name this run gives a session id, or `undefined` where the session is not listed. */
  readonly nameOf: (sessionId: string) => string | undefined;
  /** A note is free text: kept on a page for this machine, left out of a shared one (R37). */
  readonly keepNotes: boolean;
}

/**
 * `sessions` are expected with marked files already taken out (`actionsAfterMarks`), so a line here is still to do;
 * `marks` then says which of them had been marked, and lists the history.
 */
export function checkWithMarks(sessions: readonly NamedActions[], marks: MarksForCheck): IndexCheck {
  const base = checkOf(sessions);
  const rows = base.rows.map((row) => {
    const mark = marks.standing.get(row.path);
    return mark === undefined ? row : { ...row, reopened: { result: mark.result, at: mark.at } };
  });
  const open = new Set(rows.map((row) => row.path as string));
  const history = marks.lines.map(({ mark, status, endedAt }) => ({
    path: mark.path,
    label: mark.label,
    result: mark.result,
    at: mark.at,
    ...(marks.keepNotes && mark.note !== undefined && mark.note !== '' ? { note: mark.note } : {}),
    sessions: mark.sessions.flatMap((id) => {
      const name = marks.nameOf(id);
      return name === undefined ? [] : [name];
    }),
    status,
    ...(endedAt === undefined ? {} : { endedAt }),
    reopened: status === 'standing' && open.has(mark.path),
  }));
  return { rows, refusedAttempts: base.refusedAttempts, history, marksUnreadable: marks.unreadable };
}

export function checkOf(sessions: readonly NamedActions[]): IndexCheck {
  const found = new Map<Redacted, { rank: number; sessions: string[]; keyed: boolean; read?: FileRead }>();
  const note = (path: Redacted, label: CheckLabel, name: string, keyed = false, read?: FileRead): void => {
    const rank = ORDER.indexOf(label);
    const row = found.get(path);
    if (row === undefined) {
      found.set(path, { rank, sessions: [name], keyed, ...(read === undefined ? {} : { read }) });
      return;
    }
    row.rank = Math.min(row.rank, rank);
    // One session that read a key from it is enough: the key is what has to be changed.
    row.keyed ||= keyed;
    if (read !== undefined) row.read = row.read === undefined ? read : mergeReads(row.read, read);
    if (!row.sessions.includes(name)) row.sessions.push(name);
  };

  for (const { name, actions } of sessions) {
    for (const file of actions.rotate) note(file.path, file.template ? 'template' : 'rotate', name, file.keyed === true, file.read);
    for (const path of actions.unknown) note(path, 'unknown', name);
    for (const route of actions.openRoutes) note(route.path, 'route', name);
    for (const path of actions.onlyInResults) note(path, 'result', name);
  }

  const rows = [...found.entries()]
    .map(([path, row]) => ({ label: ORDER[row.rank] ?? 'result', path, sessions: row.sessions, rank: row.rank, keyed: row.keyed, read: row.read }))
    .sort((a, b) => a.rank - b.rank || b.sessions.length - a.sessions.length || a.path.localeCompare(b.path))
    .map(({ label, path, sessions: names, keyed, read }): CheckRow => ({
      label,
      path,
      sessions: names,
      ...(keyed ? { keyed: true as const } : {}),
      ...(read === undefined ? {} : { read }),
    }));

  return { rows, refusedAttempts: sessions.reduce((sum, { actions }) => sum + refusedByRule(actions.refusedAttempts, actions.refusedByOthers), 0) };
}

/** Two sessions' reads of one file: every key format and line either saw, in the order first seen. */
function mergeReads(a: FileRead, b: FileRead): FileRead {
  const keyed = new Map([...a.keyed, ...b.keyed].map((line) => [line.name + '\u0000' + line.key, line]));
  return {
    keys: [...new Set([...a.keys, ...b.keys])],
    names: [...new Set([...a.names, ...b.names])].slice(0, NAMES_PER_FILE),
    keyed: [...keyed.values()].slice(0, NAMES_PER_FILE),
    ...(a.mixed === true || b.mixed === true ? { mixed: true as const } : {}),
  };
}
