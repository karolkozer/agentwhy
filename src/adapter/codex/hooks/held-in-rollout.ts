// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ENVELOPE } from '../contract/envelope.ts';
import { SESSION } from '../contract/session.ts';
import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { entryPointOf } from '../discovery/held-in.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { EntryPoint } from '../../../core/entry-point.ts';

/**
 * Where a hook's conversation is held, from the first line of the rollout its input names (`where-it-was-held` WH6) -
 * read only for a refused message that is a conversation's first (`2026-11-01-a-key-in-your-message.md` PK11). Its first
 * line alone is read, however long the rollout. Nothing readable is nothing said.
 */
export async function heldInRollout(files: FileReader, hookInput: string): Promise<EntryPoint | undefined> {
  const path = parseJsonObject(hookInput)?.[PRE_TOOL_USE.fields.transcriptPath];
  if (typeof path !== 'string' || path === '') return undefined;
  const first = await firstLine(files, path);
  const line = first === undefined ? undefined : parseJsonObject(first);
  if (line?.type !== SESSION.metadataType) return undefined;
  const payload = line[ENVELOPE.payload];
  return isJsonObject(payload) ? entryPointOf(payload[SESSION.source], payload[SESSION.originator]) : undefined;
}

async function firstLine(files: FileReader, path: string): Promise<string | undefined> {
  try {
    for await (const line of files.readLines(path)) return line;
    return undefined;
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return undefined;
  }
}
