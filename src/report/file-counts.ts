// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ProtectedAccess } from '../core/access/protected-access.ts';
import type { RefusalSource } from '../core/event.ts';
import type { Policy } from '../core/policy/policy.ts';
import type { Redacted } from '../core/redaction/redacted.ts';
import type { Redactor } from '../core/redaction/redactor.ts';
import type { SessionModel } from '../core/session-model.ts';
import type { ReachPlace } from './reaches.ts';
import { filesOfCall, toldPatterns } from './runs.ts';

/**
 * How many times the AIs of one conversation met one private or tracked file (`2026-11-24-talking-about-agentwhy.md` CV16). Each
 * number is calls the record holds: a loop that reads a file ten times in one command is one.
 */
export interface FileCount {
  readonly path: Redacted;
  /** Every pattern that holds it only asks to be told (F57). */
  readonly tracked: boolean;
  /** Its text reached an AI. */
  readonly read: number;
  readonly changed: number;
  /** Opened, and none of its text came back. */
  readonly opened: number;
  /** Only its name was seen. */
  readonly named: number;
  /** The record does not say how the call ended. */
  readonly unknown: number;
  readonly stopped: number;
  /** Of `stopped`, by who did it: a stop of no source on record is a rule's (`refusedByOthers`). */
  readonly stoppedBy: Readonly<Partial<Record<RefusalSource, number>>>;
  /** Of all of them, a helper's. */
  readonly helpers: number;
  /** Distinct AIs, yours among them. */
  readonly agents: number;
}

/** How many times an AI wanted the file itself: never a name only seen. */
export const wanted = (count: FileCount): number => count.read + count.changed + count.opened + count.unknown + count.stopped;

/** Most wanted first, then most named, then by name. */
export const byWanted = (one: FileCount, other: FileCount): number =>
  wanted(other) - wanted(one) || other.named - one.named || ((one.path as string) < (other.path as string) ? -1 : 1);

/**
 * Counted from every call of the record: a step keeps `RUN_FILES_KEPT` files and a page `RUN_STEPS_KEPT` steps, so a count made
 * from those is short (CVB14). What a call did to a file is `filesOfCall`'s answer, the steps' own.
 */
export function fileCounts(
  model: SessionModel, accesses: readonly ProtectedAccess[], policy: Policy, redactor: Redactor, where: ReachPlace = {},
): readonly FileCount[] {
  const told = toldPatterns(policy);
  const byEvent = new Map<string, ProtectedAccess[]>();
  for (const access of accesses) byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access]);
  const handedOver = new Set(model.delegations.map((delegation) => delegation.id as string));
  const rows = new Map<string, Counting>();
  for (const event of model.events) {
    const met = byEvent.get(event.id);
    if (met === undefined || handedOver.has(event.id)) continue;
    for (const file of filesOfCall(event, met, policy, redactor, where, told)) {
      if (file.private === 0) continue;
      const row = rows.get(file.path) ?? counting(file.path);
      rows.set(file.path, row);
      row[file.how] += 1;
      row.held += file.private;
      row.told += file.tracked;
      row.who.add(event.agentId);
      if (event.agentId !== model.sessionId) row.helpers += 1;
      if (file.how === 'stopped') {
        const by = event.result?.refusedBy ?? 'rule';
        row.stoppedBy[by] = (row.stoppedBy[by] ?? 0) + 1;
      }
    }
  }
  return [...rows.values()].map(({ held, told: tracked, who, ...row }): FileCount => ({ ...row, tracked: held === tracked, agents: who.size })).sort(byWanted);
}

interface Counting {
  path: Redacted;
  read: number;
  changed: number;
  opened: number;
  named: number;
  unknown: number;
  stopped: number;
  stoppedBy: Partial<Record<RefusalSource, number>>;
  helpers: number;
  held: number;
  told: number;
  who: Set<string>;
}

const counting = (path: Redacted): Counting => ({
  path, read: 0, changed: 0, opened: 0, named: 0, unknown: 0, stopped: 0, stoppedBy: {}, helpers: 0, held: 0, told: 0, who: new Set(),
});
