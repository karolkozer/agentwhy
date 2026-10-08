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
  /**
   * Commands that ran whose end the record does not establish, so what they reached is unconfirmed (the question the
   * record does not answer: access). Not the same as not knowing which files were named - those are read from the
   * command line and listed - which is why the row says what a command *reached*, never what it *opened*.
   */
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

/**
 * Whether a gap is a trait of the AI's format rather than something missing from this conversation: a capability record
 * names the source whose format never writes the answer down, or was never measured to, and is true of every
 * conversation that source holds. `capabilityGaps` is their only producer and always names the source; a gap this
 * conversation left - a call whose end its record does not establish, say - names none.
 *
 * Found 2026-10-08: without the distinction a Codex conversation whose every command was established still said "1
 * command ran…", counting the format's own `access` record as if a command of its own were unaccounted for.
 */
function isFormatTrait(gap: Gap): boolean {
  return (gap.kind === 'capability-absent' || gap.kind === 'capability-unmeasured') && gap.source !== undefined;
}

/** The reasons of a record's gaps; `undefined` where it has none. */
export function gapReasons(gaps: readonly Gap[]): GapReasons | undefined {
  if (gaps.length === 0) return undefined;
  const ownGaps = gaps.filter((gap) => !isFormatTrait(gap));
  const count = (test: (gap: Gap) => boolean): number => ownGaps.filter(test).length;
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
