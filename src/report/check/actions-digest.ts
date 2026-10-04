// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { PolicyOrigin } from '../../core/policy/policy.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import { byString } from '../../shared/compare.ts';
import type { SessionActions } from './session-actions.ts';
import type { MarkResult } from '../../ports/mark-store.ts';
import { sumRefusedByOthers, type RefusedByOthers } from '../refusals.ts';

export interface DigestPath {
  readonly path: Redacted;
  /** In how many of the sessions read it appeared. */
  readonly sessions: number;
  /** For a file to rotate: it is named as a template, so the advice is to check it, not to rotate it (R12c). */
  readonly template?: true;
}

export interface DigestRoute extends DigestPath {
  readonly did: Redacted;
  readonly pattern?: Redacted;
  readonly occurrences: number;
}

export interface DigestShape {
  readonly name: Redacted;
  readonly count: number;
}

/** The actions of many sessions as one answer (`specs/2026-09-16-worth-running-every-day.md` R11-R15, R17). */
export interface ActionsDigest {
  /** The range as it was asked for. */
  readonly asked: string;
  readonly sessionsRead: number;
  /** Sessions inside the range that could not be read: counted, never dropped (R15). */
  readonly sessionsUnreadable: number;
  /** Which advice an open route gets depends on where the rules came from (R13). */
  readonly policyKind: PolicyOrigin['kind'];
  /** How the reports named the policy; absent when no session was read. */
  readonly policy?: Redacted;
  readonly rotate: readonly DigestPath[];
  readonly openRoutes: readonly DigestRoute[];
  readonly onlyInResults: readonly DigestPath[];
  /** Protected paths whose call has no known outcome. Something to check, never something to call clear (R15). */
  readonly unknown: readonly DigestPath[];
  readonly refusedAttempts: number;
  /** Of those, the ones no rule refused, over all the sessions read (WS3, WS4). Absent where a rule refused every one. */
  readonly refusedByOthers?: RefusedByOthers;
  readonly secretShapes: readonly DigestShape[];
  /** Protected paths named in what a call of an unknown tool carried, over all the sessions read (R12b). */
  readonly mentions: number;
  /** What the person's marks did to this range (R35). Absent where no mark was read. */
  readonly marks?: DigestMarks;
}

export interface DigestMarks {
  /** Files a standing mark took out of this range. */
  readonly done: number;
  /** Marked files a session active after the mark reached again. */
  readonly reopened: readonly { readonly path: string; readonly result: MarkResult; readonly at: number }[];
  /** The record of marks exists and could not be read. */
  readonly unreadable: boolean;
}

export interface DigestContext {
  readonly asked: string;
  readonly sessionsUnreadable: number;
  readonly policyKind: PolicyOrigin['kind'];
  readonly marks?: DigestMarks;
}

/** Merges per-session actions by path and route. Most sessions first, then by name, so the order is stable. */
export function digestOf(actions: readonly SessionActions[], context: DigestContext): ActionsDigest {
  const rotate = new PathCounts<Redacted>();
  const templates = new Set<Redacted>();
  const onlyInResults = new PathCounts<Redacted>();
  const unknown = new PathCounts<Redacted>();
  const routes = new Map<string, { route: DigestRoute; sessions: number; occurrences: number }>();
  const shapes = new Map<Redacted, number>();

  for (const session of actions) {
    for (const file of session.rotate) {
      rotate.add(file.path);
      if (file.template) templates.add(file.path);
    }
    for (const path of new Set(session.onlyInResults)) onlyInResults.add(path);
    for (const path of new Set(session.unknown)) unknown.add(path);
    for (const route of session.openRoutes) {
      const key = `${route.path}\u0000${route.did}`;
      const known = routes.get(key);
      routes.set(key, {
        route: { path: route.path, did: route.did, ...(route.pattern === undefined ? {} : { pattern: route.pattern }), sessions: 0, occurrences: 0 },
        sessions: (known?.sessions ?? 0) + 1,
        occurrences: (known?.occurrences ?? 0) + route.occurrences,
      });
    }
    for (const name of session.secretShapes) shapes.set(name, (shapes.get(name) ?? 0) + 1);
  }

  const first = actions[0];
  const byOthers = sumRefusedByOthers(actions.map((session) => session.refusedByOthers));
  return {
    asked: context.asked,
    sessionsRead: actions.length,
    sessionsUnreadable: context.sessionsUnreadable,
    policyKind: context.policyKind,
    ...(first === undefined ? {} : { policy: first.policy }),
    rotate: rotate.sorted().map((entry) => (templates.has(entry.path) ? { ...entry, template: true as const } : entry)),
    openRoutes: [...routes.values()]
      .map(({ route, sessions, occurrences }) => ({ ...route, sessions, occurrences }))
      .sort((a, b) => b.sessions - a.sessions || b.occurrences - a.occurrences || byString(a.path, b.path) || byString(a.did, b.did)),
    onlyInResults: onlyInResults.sorted(),
    unknown: unknown.sorted(),
    refusedAttempts: actions.reduce((sum, session) => sum + session.refusedAttempts, 0),
    ...(byOthers === undefined ? {} : { refusedByOthers: byOthers }),
    secretShapes: [...shapes].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byString(a.name, b.name)),
    mentions: actions.reduce((sum, session) => sum + session.mentions, 0),
    ...(context.marks === undefined ? {} : { marks: context.marks }),
  };
}

/**
 * Whether anything in the digest asks a person to act. Refusals alone do not: they are the rules holding. An unknown
 * outcome does: it is a question the transcript could not answer.
 */
export function needsAction(digest: ActionsDigest): boolean {
  return (
    digest.rotate.length > 0 ||
    digest.openRoutes.length > 0 ||
    digest.onlyInResults.length > 0 ||
    digest.unknown.length > 0 ||
    digest.secretShapes.length > 0
  );
}

/** How many sessions each path appeared in, most first. */
class PathCounts<T extends string> {
  readonly #counts = new Map<T, number>();

  add(key: T): void {
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
  }

  sorted(): { readonly path: T; readonly sessions: number }[] {
    return [...this.#counts]
      .map(([path, sessions]) => ({ path, sessions }))
      .sort((a, b) => b.sessions - a.sessions || byString(a.path, b.path));
  }
}
