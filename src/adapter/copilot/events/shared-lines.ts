// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from 'node:path';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { ENVELOPE } from '../contract/envelope.ts';
import { EVENTS_FILE, WORKSPACE_FILE } from '../contract/session.ts';
import { parseWorkspace } from '../discovery/workspace-file.ts';

/**
 * The line ids of every other session beside this one that counts a fork (`what-copilot-wrote` CP26, CPB36): a fork
 * opens with its parent's lines, ids and all, and its `workspace.yaml` names no parent, so a parent is known by its own
 * `fork_count`. A line of this file whose id is among them is the parent's record, read in the parent and not here.
 * Known before a line of this file is read as a session, so the order sessions are read in changes nothing.
 */
export async function forkParentLines(directories: DirectoryReader, files: FileReader, folder: string): Promise<ReadonlySet<string>> {
  const root = dirname(folder);
  let entries;
  try {
    entries = await directories.list(root);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return new Set();
  }
  const ids = new Set<string>();
  const own = basename(folder);
  for (const entry of entries) {
    if (entry.kind !== 'directory' || entry.name === own || entry.name.startsWith('.')) continue;
    const sibling = join(root, entry.name);
    const workspace = await textOrUndefined(files, join(sibling, WORKSPACE_FILE));
    if (workspace === undefined || (parseWorkspace(workspace).forkCount ?? 0) < 1) continue;
    await addLineIds(files, join(sibling, EVENTS_FILE), ids);
  }
  return ids;
}

/** This session's own `fork_count`, where its `workspace.yaml` says one: 0 where it says none. */
export async function forkCountOf(files: FileReader, folder: string): Promise<number> {
  const workspace = await textOrUndefined(files, join(folder, WORKSPACE_FILE));
  return workspace === undefined ? 0 : (parseWorkspace(workspace).forkCount ?? 0);
}

async function addLineIds(files: FileReader, path: string, ids: Set<string>): Promise<void> {
  try {
    for await (const line of files.readLines(path)) {
      const id = parseJsonObject(line)?.[ENVELOPE.id];
      if (typeof id === 'string' && id !== '') ids.add(id);
    }
  } catch (error) {
    // A parent that cannot be read shares nothing that can be known: this file's lines stay its own.
    if (!(error instanceof FileAccessError)) throw error;
  }
}
