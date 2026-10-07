// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { MarkStore } from '../../ports/mark-store.ts';
import type { CheckLabel, CheckRow } from './check-lines.ts';
import { NOTE_LIMIT, resultAllowed, standingMarks, type MarkResult } from './marks.ts';

/** How many lines a refused mark offers as the ones it could have meant. */
const SUGGESTIONS = 8;

export interface MarkAnswer {
  readonly outcome: 'marked' | 'mark-refused' | 'mark-failed';
  readonly output: string;
}

export interface MarkRequest {
  readonly path: string;
  readonly result: MarkResult;
  readonly note?: string;
  /**
   * `protected-everywhere` GD25: on the computer's page, the id of the project the file is in - the record the mark is
   * written to is that project's own. Absent on a project's page, whose record is the only one.
   */
  readonly project?: string;
}

const LABEL: Readonly<Record<CheckLabel, string>> = {
  rotate: 'ROTATE',
  template: 'CHECK',
  unknown: 'UNKNOWN',
  route: 'REACHED',
  result: 'IN RESULT',
};

const RESULT: Readonly<Record<MarkResult, string>> = {
  rotated: 'rotated',
  'not-secret': 'not a real secret',
  handled: 'handled',
  'not-private': 'not private',
};

/** A note is one line a person typed; `undefined` when it may be recorded. */
export function noteProblem(note: string | undefined): MarkAnswer | undefined {
  const trimmed = note?.trim();
  return trimmed !== undefined && (trimmed.length > NOTE_LIMIT || /[\r\n]/.test(trimmed))
    ? { outcome: 'mark-refused', output: `A note is one line of at most ${NOTE_LIMIT} characters. Nothing was recorded.\n` }
    : undefined;
}

/**
 * Records a mark against the lines of a check (`worth-running-every-day` R31, R35), for `check --mark` and for the
 * served page alike (R52): the same rules, the same words. `lines` name sessions by id, and are the check before marks.
 */
export async function recordMark(
  store: MarkStore,
  lines: readonly CheckRow[],
  request: MarkRequest,
  context: { readonly asked: string; readonly now: number },
): Promise<MarkAnswer> {
  const problem = noteProblem(request.note);
  if (problem !== undefined) return problem;
  const note = request.note?.trim();

  const line = lines.find((row) => row.path === request.path);
  if (line === undefined) {
    const names = lines.slice(0, SUGGESTIONS).map((row) => `  ${LABEL[row.label]}  ${row.path}`);
    return refused(
      `${request.path} is not a line of the check for sessions active since ${context.asked}. Nothing was recorded.\n` +
        (names.length === 0 ? 'The check has no lines in this range.\n' : `Its lines are:\n${names.join('\n')}\n`) +
        (lines.length > SUGGESTIONS ? `  and ${lines.length - SUGGESTIONS} more (agentwhy check --full)\n` : '') +
        'A file reached earlier than that is marked with a wider range: --since 30d\n',
    );
  }
  if (!resultAllowed(line, request.result)) {
    return refused(
      request.result === 'not-secret'
        ? `${request.path} is a ${LABEL[line.label]} line: a value from it was in an agent's context, so it is marked rotated, not "not a real secret". Nothing was recorded.\n`
        : `A key was read from ${request.path}, so it is marked rotated once the key is changed, not "${RESULT[request.result]}". Nothing was recorded.\n`,
    );
  }

  const written = await store.append({
    kind: 'mark',
    path: line.path,
    label: line.label,
    result: request.result,
    at: context.now,
    ...(note === undefined || note === '' ? {} : { note }),
    sessions: line.sessions,
  });
  if (!written) return { outcome: 'mark-failed', output: 'The mark could not be written, so nothing was recorded.\n' };

  return {
    outcome: 'marked',
    output:
      `Marked ${line.path} as ${RESULT[request.result]} on ${timeOf(context.now)}.\n` +
      `It leaves To do until a session active after this reaches the file again. Nothing checks that the key itself changed.\n` +
      `History: agentwhy start --since ${context.asked}    Undo: agentwhy check --unmark ${quoted(line.path)}\n`,
  };
}

/** Undoes a standing mark by appending, never by removing (R34). */
export async function recordUnmark(store: MarkStore, path: string, now: number): Promise<MarkAnswer> {
  const reading = await store.read();
  if (reading.failed) return { outcome: 'mark-failed', output: 'The record of marks could not be read, so nothing was undone.\n' };

  const standing = standingMarks(reading.records);
  const mark = standing.get(path);
  if (mark === undefined) {
    const names = [...standing.keys()].slice(0, SUGGESTIONS).map((marked) => `  ${marked}`);
    return refused(
      `${path} has no standing mark. Nothing was recorded.\n` +
        (names.length === 0 ? 'Nothing is marked in this project.\n' : `Marked now:\n${names.join('\n')}\n`),
    );
  }

  const written = await store.append({ kind: 'unmark', path: mark.path, at: now });
  if (!written) return { outcome: 'mark-failed', output: 'The undoing could not be written, so the mark still stands.\n' };
  return { outcome: 'marked', output: `${mark.path} is back in To do. The mark of ${timeOf(mark.at)} stays in History, shown as undone.\n` };
}

function refused(output: string): MarkAnswer {
  return { outcome: 'mark-refused', output };
}

/** A path as a shell reads it back: in single quotes, with a quote inside closed and reopened. */
function quoted(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

function timeOf(epoch: number): string {
  return new Date(epoch).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
