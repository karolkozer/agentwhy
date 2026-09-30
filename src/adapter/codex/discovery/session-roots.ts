import type { SessionHeader } from './session-header.ts';
import { AMBIGUOUS, sessionOwners } from './session-owners.ts';

export type RootRelation =
  | { readonly kind: 'resolved'; readonly root: number }
  | { readonly kind: 'unresolved'; readonly reason: 'duplicate-id' | 'missing-parent' | 'invalid-identity' | 'cycle' };

/** X3/X5: only unique first-line ids join. Roots are indices into the caller's input, never inferred new agents. */
export function sessionRoots(headers: readonly SessionHeader[]): readonly RootRelation[] {
  const owners = sessionOwners(headers.map((header) => header.id === '' ? undefined : header.id));
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
