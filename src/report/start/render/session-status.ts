// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { IndexEntry } from '../session-index.ts';

/**
 * What the row says happened, in the order the report's own headline climbs: the contents of a protected file
 * reaching an agent outranks a record with gaps, which outranks a path that only appeared in a result, which outranks
 * a path a call named, which outranks a refusal. One row carries exactly one of them, and it is the
 * same one the report of that session leads with.
 */
export type Status = 'seen' | 'opened' | 'result' | 'named' | 'blocked' | 'unknown' | 'clean' | 'failed' | 'outside';

/**
 * What happened in one session. This is `html-report-renderer.ts`'s own headline ladder, read from the tally that
 * report counted, so the row and the report it opens say the same thing. A session with no report of its own
 * says which of the two reasons that is.
 * It lives in a module of its own because three views of this page colour a session by it - the row's badge, the
 * calendar's tile and the chart's bar - and while the calendar kept a ladder of its own the two drifted apart: a
 * session badged "saw file contents" in ember was drawn on the calendar in the brass of a name only reached.
 */
export function statusOf(entry: IndexEntry): Status {
  if (entry.report.kind === 'failed') return 'failed';
  if (entry.report.kind === 'outside-range') return 'outside';
  const { tally, incomplete } = entry.report;
  // A value traced out of the file, or the file's text handed to an agent (`filesRead`, 2026-10-07): both are a read,
  // and the row said "Only saw a name" over the second - a CSV row an AI printed and answered from is ordinary words,
  // which §5.2 never traces, so nothing marked the file read at this rung.
  if (tally.contentsSeen > 0 || (tally.filesRead ?? 0) > 0) return 'seen';
  // `codex-blocks-too` CK12, amended 2026-10-05 by the maintainer: an attempt agentwhy stopped is a fact in its own
  // words, and outranks a name seen - the agent found the file, was stopped from opening it, and the rule held. Never
  // where an attempt has no known end: then what happened to it is not known.
  if (tally.refusedAttempts > 0 && tally.unknownAttempts === 0) return 'blocked';
  // F17, X10: an attempt with no known end, on a record with gaps, leaves what the agent saw not known, whatever names
  // it saw beside it - and so does a file's text a process printed that no agent is shown to have received (X14).
  if (incomplete && (tally.unknownAttempts > 0 || (tally.printedUnseen ?? 0) > 0)) return 'unknown';
  // 2026-10-07: a file a program opened and printed nothing of is more than a name seen and less than a read - said
  // before both, since a name seen is the weaker fact about any other file of the same conversation.
  if ((tally.filesOpened ?? 0) > 0) return 'opened';
  // A gap does not unmake what the record did establish: a name seen is said, as the report's headline says it
  // (amended 2026-10-05 - every Codex record has a gap, and each reach of theirs short of a read was hidden behind it).
  if (tally.filesReached > 0 && tally.onlyThroughResult === tally.filesReached) return 'result';
  if (tally.filesReached > 0) return 'named';
  // F17: short of a reach, a record with gaps cannot say nothing needs doing.
  if (incomplete) return 'unknown';
  return 'clean';
}

/**
 * The three tones the old index's chart draws a session in, read from the very ladder the row is badged by: the
 * contents reached an agent, only a path was reached, or neither.
 */
export function categoryOf(entry: IndexEntry): 0 | 1 | 2 {
  const status = statusOf(entry);
  if (status === 'seen') return 0;
  // A file opened without being read was reached, so it belongs with the other reaches, never with "neither" (2026-10-07).
  return status === 'result' || status === 'named' || status === 'opened' ? 1 : 2;
}
