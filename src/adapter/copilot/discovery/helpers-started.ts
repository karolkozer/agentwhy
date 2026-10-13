// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname } from 'node:path';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { ENVELOPE, RECORD_TYPES } from '../contract/envelope.ts';
import { forkParentLines } from '../events/shared-lines.ts';

/**
 * How many agents a session started (`what-copilot-wrote` CP11): its `subagent.started` records, less those a fork copied
 * from its parent (CP26), as the reader counts them. Copilot keeps no index of them, so the file is read - a line is
 * parsed only where it names the record type. A file that cannot be read started none that can be counted.
 */
export async function helpersStarted(directories: DirectoryReader, files: FileReader, events: string): Promise<number> {
  const parents = await forkParentLines(directories, files, dirname(events));
  const mark = `"${RECORD_TYPES.subagentStarted}"`;
  let started = 0;
  try {
    for await (const line of files.readLines(events)) {
      if (!line.includes(mark)) continue;
      const record = parseJsonObject(line);
      const id = record?.[ENVELOPE.id];
      if (record?.[ENVELOPE.type] === RECORD_TYPES.subagentStarted && !(typeof id === 'string' && parents.has(id))) started += 1;
    }
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
  }
  return started;
}
