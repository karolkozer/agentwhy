// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { Recognition } from '../../../core/session-format.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { EVENTS_FILE } from '../contract/session.ts';
import { readHeader } from './session-header.ts';

/**
 * Whether an input is a Copilot session (`what-copilot-wrote` CP1, CP1a): a file whose first line is the runtime's, a
 * session's folder whose `events.jsonl` is, or a folder holding such a session's folder - `~/.copilot/session-state`, as
 * Codex's folder of rollouts is its own (X2). Only first lines are read, a folder's only until the first one recognised.
 * A VS Code transcript is not recognised.
 */
export async function recogniseCopilot(directories: DirectoryReader, files: FileReader, input: string): Promise<Recognition> {
  let kind;
  try {
    kind = await directories.kindOf(input);
  } catch (error) {
    if (error instanceof FileAccessError) return 'unavailable';
    throw error;
  }
  const read = await readHeader(files, kind === 'directory' ? join(input, EVENTS_FILE) : input);
  if (read.kind === 'recognised') return 'recognised';
  // A folder with no events file is no session's own, and may hold sessions; a file the port could not read is unavailable.
  if (read.kind === 'unavailable' && kind === 'directory' && read.failure === 'not-found') return (await holdsSession(directories, files, input)) ? 'recognised' : 'unknown';
  return read.kind === 'unavailable' ? 'unavailable' : 'unknown';
}

/** Whether a folder holds a session's folder, read until the first: the store, or any folder a person gathered them in. */
async function holdsSession(directories: DirectoryReader, files: FileReader, folder: string): Promise<boolean> {
  let entries;
  try {
    entries = await directories.list(folder);
  } catch (error) {
    if (error instanceof FileAccessError) return false;
    throw error;
  }
  for (const entry of entries) {
    if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue;
    if ((await readHeader(files, join(folder, entry.name, EVENTS_FILE))).kind === 'recognised') return true;
  }
  return false;
}
