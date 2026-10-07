// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Gap } from '../core/completeness.ts';

/**
 * Why a conversation's record is not whole, counted as a person is told it on its row (the maintainer, 2026-10-07: a
 * row that said only "Couldn't check fully" left them asking why). Each count is of the gaps of that kind (one gap a
 * thing missing, `completeness.ts`); `format` is where the record's only gaps are the AI's own - what its format never
 * writes down, or was never measured to - and nothing of this conversation's.
 */
export interface GapReasons {
  /** Commands that ran with no record of which files they opened (a question the record does not answer: access). */
  readonly unread?: number;
  /**
   * Results, or texts, not known to be whole: cut where Codex says so, or with nothing to show they are not (a cap was
   * measured on one build only). Not "cut short": 0 of 72 Codex files held Codex's notice of a cut (2026-10-07).
   */
  readonly unsure?: number;
  /** Calls with no result, or a result saved to a file that is not there. */
  readonly noResult?: number;
  /** Parts of the record that could not be read, or are not there. */
  readonly damaged?: number;
  /** What could not be tied to the step it belongs to. */
  readonly unlinked?: number;
  readonly format?: true;
}

/** The reasons of a record's gaps; `undefined` where it has none. */
export function gapReasons(gaps: readonly Gap[]): GapReasons | undefined {
  if (gaps.length === 0) return undefined;
  const count = (test: (gap: Gap) => boolean): number => gaps.filter(test).length;
  const reasons: Record<string, number> = {
    unread: count((gap) => gap.kind === 'capability-absent' && gap.question === 'access'),
    unsure: count((gap) => gap.kind === 'result-incomplete'),
    noResult: count((gap) => gap.kind === 'result-missing' || gap.kind === 'spilled-result-missing'),
    damaged: count((gap) => gap.kind === 'record-damaged' || gap.kind === 'source-missing' || gap.kind === 'outcome-unrecognised'),
    unlinked: count((gap) => gap.kind === 'relation-unresolved'),
  };
  const own = Object.fromEntries(Object.entries(reasons).filter(([, n]) => n > 0));
  return Object.keys(own).length > 0 ? own : { format: true };
}
