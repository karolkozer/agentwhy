/** An id owned by multiple files must resolve to none, regardless of traversal order (X3). */
export const AMBIGUOUS = Symbol('held by more than one file');

/** Used by runtime discovery and the reconnaissance probe, so they cannot choose different owners. */
export function sessionOwners(ids: readonly (string | undefined)[]): ReadonlyMap<string, number | typeof AMBIGUOUS> {
  const owners = new Map<string, number | typeof AMBIGUOUS>();
  ids.forEach((id, index) => {
    if (id !== undefined) owners.set(id, owners.has(id) ? AMBIGUOUS : index);
  });
  return owners;
}
