// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { RefusalSource } from '../core/event.ts';

/**
 * Of the attempts that were refused, those no rule refused, by who did (`specs/2026-10-01-who-stopped-it.md` WS3): the
 * reviewer - Claude Code's auto mode - or the person, at a prompt. Kept beside the total and absent where a rule
 * refused every one, so a count read without it means what it always meant.
 */
export interface RefusedByOthers {
  readonly reviewer: number;
  readonly person: number;
}

/** Counted from what refused each attempt. An attempt with no source on record is a rule's: only a rule leaves none. */
export function refusedByOthers(refused: readonly { readonly refusedBy?: RefusalSource }[]): RefusedByOthers | undefined {
  return others(
    refused.filter((attempt) => attempt.refusedBy === 'reviewer').length,
    refused.filter((attempt) => attempt.refusedBy === 'person').length,
  );
}

/** The same, over several counts: attempts add up, so their sources do. */
export function sumRefusedByOthers(counts: readonly (RefusedByOthers | undefined)[]): RefusedByOthers | undefined {
  return others(
    counts.reduce((sum, count) => sum + (count?.reviewer ?? 0), 0),
    counts.reduce((sum, count) => sum + (count?.person ?? 0), 0),
  );
}

/** How many of a total a rule refused: what "Your rules held" may count (WS4). */
export function refusedByRule(total: number, byOthers: RefusedByOthers | undefined): number {
  return Math.max(0, total - (byOthers?.reviewer ?? 0) - (byOthers?.person ?? 0));
}

function others(reviewer: number, person: number): RefusedByOthers | undefined {
  return reviewer === 0 && person === 0 ? undefined : { reviewer, person };
}
