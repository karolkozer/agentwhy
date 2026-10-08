// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { continuesOwnThread, type SessionHeader } from './session-header.ts';

/** An id owned by multiple files must resolve to none, regardless of traversal order (X3). */
export const AMBIGUOUS = Symbol('held by more than one file');

/**
 * The id each header owns, for `sessionOwners`: none for an empty id, and none for a file that continues its own thread
 * (XD10), whose id is the thread's and belongs to the file the thread began in. Used by discovery and the probe alike.
 */
export function ownerIds(headers: readonly SessionHeader[]): (string | undefined)[] {
  return headers.map((header) => (header.id === '' || continuesOwnThread(header) ? undefined : header.id));
}

/** Used by runtime discovery and the reconnaissance probe, so they cannot choose different owners. */
export function sessionOwners(ids: readonly (string | undefined)[]): ReadonlyMap<string, number | typeof AMBIGUOUS> {
  const owners = new Map<string, number | typeof AMBIGUOUS>();
  ids.forEach((id, index) => {
    if (id !== undefined) owners.set(id, owners.has(id) ? AMBIGUOUS : index);
  });
  return owners;
}
