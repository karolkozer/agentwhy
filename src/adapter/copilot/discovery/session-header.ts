// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError, type AccessFailure } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { ENVELOPE } from '../contract/envelope.ts';
import { HEADER } from '../contract/session.ts';

/** What a session's first line says. Internal source data: its id and path cross redaction before any output. */
export interface CopilotHeader {
  readonly sessionId: string;
  /** The build that wrote the file, as written; absent when not a string. */
  readonly version?: string;
  /** The folder the session ran in; absent when the line does not record one as a string. */
  readonly project?: string;
}

export type HeaderRead =
  | { readonly kind: 'recognised'; readonly header: CopilotHeader }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unavailable'; readonly failure: AccessFailure };

/**
 * The runtime's first line (`what-copilot-wrote` CP1, CP1a): `session.start` from `copilot-agent`, with a `context` and no
 * `vscodeVersion`, and a session id. VS Code's transcript shares the type and the producer and is none of this format's;
 * a line with both keys, or neither, is unknown, never the nearer one.
 */
export function headerOf(line: string): CopilotHeader | undefined {
  const record = parseJsonObject(line);
  if (record === undefined || record[ENVELOPE.type] !== HEADER.type) return undefined;
  const data = record[ENVELOPE.data];
  if (!isJsonObject(data) || data[HEADER.producer] !== HEADER.runtimeProducer) return undefined;
  if (Object.hasOwn(data, HEADER.editorVersion)) return undefined;
  const context = data[HEADER.context];
  if (!isJsonObject(context)) return undefined;
  const sessionId = data[HEADER.sessionId];
  if (typeof sessionId !== 'string' || sessionId === '') return undefined;
  const version = data[HEADER.version];
  const project = context[HEADER.workingDirectory];
  return {
    sessionId,
    ...(typeof version === 'string' ? { version } : {}),
    ...(typeof project === 'string' && project !== '' ? { project } : {}),
  };
}

/** Reads a file's first line alone, and closes it: listing sessions reads nothing past it. */
export async function readHeader(files: FileReader, path: string): Promise<HeaderRead> {
  try {
    for await (const line of files.readLines(path)) {
      const header = headerOf(line);
      return header === undefined ? { kind: 'unknown' } : { kind: 'recognised', header };
    }
    return { kind: 'unknown' };
  } catch (error) {
    if (error instanceof FileAccessError) return { kind: 'unavailable', failure: error.failure };
    throw error;
  }
}
