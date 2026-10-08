// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { continuesOwnThread, type SessionHeader } from './session-header.ts';
import { AMBIGUOUS, ownerIds, sessionOwners } from './session-owners.ts';

export type RootRelation =
  | { readonly kind: 'resolved'; readonly root: number }
  | { readonly kind: 'unresolved'; readonly reason: 'duplicate-id' | 'missing-parent' | 'invalid-identity' | 'cycle' };

/**
 * X3/X5: only unique first-line ids join. Roots are indices into the caller's input, never inferred new agents. XD10: a
 * file that continues its own thread owns no id and joins the file the thread began in, as a child joins its parent;
 * with that file gone it stands unresolved, as a child whose parent is missing does.
 */
export function sessionRoots(headers: readonly SessionHeader[]): readonly RootRelation[] {
  const owners = sessionOwners(ownerIds(headers));
  const resolved = new Map<number, RootRelation>();
  return headers.map((_, start) => {
    const chain = new Set<number>();
    let index = start;
    let relation: RootRelation;
    while (true) {
      const cached = resolved.get(index);
      if (cached !== undefined) { relation = cached; break; }
      if (chain.has(index)) { relation = { kind: 'unresolved', reason: 'cycle' }; break; }
      chain.add(index);
      const header = headers[index];
      if (header === undefined || header.id === '' || header.parent.kind === 'unknown') {
        relation = { kind: 'unresolved', reason: 'invalid-identity' }; break;
      }
      if (owners.get(header.id) === AMBIGUOUS) { relation = { kind: 'unresolved', reason: 'duplicate-id' }; break; }
      if (continuesOwnThread(header)) {
        const base = owners.get(header.id);
        // A shared id was answered above; what is left is the thread's first file, or none.
        if (typeof base !== 'number') { relation = { kind: 'unresolved', reason: 'missing-parent' }; break; }
        index = base;
        continue;
      }
      if (header.parent.kind === 'root') { relation = { kind: 'resolved', root: index }; break; }
      const owner = owners.get(header.parent.id);
      if (owner === undefined) { relation = { kind: 'unresolved', reason: 'missing-parent' }; break; }
      if (owner === AMBIGUOUS) { relation = { kind: 'unresolved', reason: 'duplicate-id' }; break; }
      index = owner;
    }
    for (const member of chain) resolved.set(member, relation);
    return relation;
  });
}
