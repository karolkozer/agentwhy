// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { THREAD_NAMES } from '../contract/session.ts';

/**
 * The one conversation a Codex session belongs to (`codex-says-it-too` CXB5, CX8). Measured 2026-10-02: the Codex apps
 * give one visible conversation a new session id as it goes on - four of five conversations of that day's test project
 * held two ids each - so anything said "once a conversation" and keyed by the session id was said again, and a line
 * already said in one app came again in the other. The only record joining them is Codex's own thread index: rows of
 * `{id, thread_name, updated_at}`, one thread's sessions sharing its name. The conversation's key is the thread's
 * earliest session id - an id, never the name, so nothing a person typed reaches a file name built from this.
 *
 * Where the index has no row for the session (an `exec` run, a build that keeps no index) or cannot be read, the
 * session id stands, as before. Two conversations Codex happened to title alike are grouped as one - the cost is a
 * once-line not repeated across the twins, never a finding lost.
 */
export async function codexConversationOf(files: FileReader, indexPath: string, sessionId: string): Promise<string> {
  const name = new Map<string, string>();
  const firstSeen = new Map<string, string>();
  try {
    for await (const raw of files.readLines(indexPath)) {
      const row = parseJsonObject(raw);
      if (!isJsonObject(row)) continue;
      const id = row[THREAD_NAMES.id];
      const threadName = row[THREAD_NAMES.name];
      const at = row[THREAD_NAMES.updatedAt];
      if (typeof id !== 'string' || id === '' || typeof threadName !== 'string') continue;
      // A later line renames the thread: the name an id has is its last line's (as the titles reader reads it).
      name.set(id, threadName);
      if (!firstSeen.has(id) && typeof at === 'string') firstSeen.set(id, at);
    }
  } catch (error) {
    if (error instanceof FileAccessError) return sessionId;
    throw error;
  }

  const thread = name.get(sessionId);
  if (thread === undefined) return sessionId;
  let earliest = sessionId;
  for (const [id, current] of name) {
    if (current !== thread) continue;
    const order = (one: string) => `${firstSeen.get(one) ?? ''}\u0000${one}`;
    if (order(id) < order(earliest)) earliest = id;
  }
  return earliest;
}
