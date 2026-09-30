import type { IndexEntry } from '../session-index.ts';

/**
 * What the row says happened, in the order the report's own headline climbs: the contents of a protected file
 * reaching an agent outranks a record with gaps, which outranks a path that only appeared in a result, which outranks
 * a path a call named, which outranks a refusal. One row carries exactly one of them, and it is the
 * same one the report of that session leads with.
 */
export type Status = 'seen' | 'result' | 'named' | 'blocked' | 'unknown' | 'clean' | 'failed' | 'outside';

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
  if (tally.contentsSeen > 0) return 'seen';
  // F17, `2026-09-27-what-codex-wrote.md` X10: a record with gaps cannot say nothing needs doing, so short of a read it is
  // not known - its name seen stays in its report, which leads with the gap too. Found on a Codex record, which always has
  // one: a conversation that listed `.env` was folded under "nothing private to fix". `codex-blocks-too` CK12, decided by
  // the maintainer on 2026-09-30: an attempt agentwhy stopped is a fact in its own words, so where one was stopped and no
  // file was reached nor attempted to no known end, the row says Stopped; the gap stays in the report.
  if (incomplete) return tally.refusedAttempts > 0 && tally.filesReached === 0 && tally.unknownAttempts === 0 ? 'blocked' : 'unknown';
  if (tally.filesReached > 0 && tally.onlyThroughResult === tally.filesReached) return 'result';
  if (tally.filesReached > 0) return 'named';
  if (tally.refusedAttempts > 0) return 'blocked';
  return 'clean';
}

/**
 * The three tones the old index's chart draws a session in, read from the very ladder the row is badged by: the
 * contents reached an agent, only a path was reached, or neither.
 */
export function categoryOf(entry: IndexEntry): 0 | 1 | 2 {
  const status = statusOf(entry);
  if (status === 'seen') return 0;
  return status === 'result' || status === 'named' ? 1 : 2;
}
