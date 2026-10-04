// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { READER, SESSION } from '../contract/session.ts';

/** Who is reading a Codex conversation, as its rollout's first line says (`2026-10-02-codex-says-it-too.md` CX4). */
export interface CodexReader {
  /** A person: the agent may be asked to say something (R14). */
  readonly attended: boolean;
  /** A person, outside the terminal app: the first quiet turn is said by the agent too (SW8). */
  readonly quietSaidByAgent: boolean;
  /**
   * The desktop app folds the turn's answer behind its "Worked for ..." row when a Stop block arrives (CXB5's display
   * note): a request shown there asks the answer back, or the person is left with a one-line confirmation of nothing.
   */
  readonly foldsTurn: boolean;
}

const NOBODY: CodexReader = { attended: false, quietSaidByAgent: false, foldsTurn: false };

/**
 * Read from the rollout's first line, the one line it is read for. A rollout that cannot be read, or a first line that
 * is not Codex's, is nobody reading: the agent is then never asked to speak, and the line is said all the same.
 */
export async function codexReaderOf(files: FileReader, rollout: string | undefined): Promise<CodexReader> {
  if (rollout === undefined) return NOBODY;
  const lines = files.readLines(rollout)[Symbol.asyncIterator]();
  try {
    const first = await lines.next();
    const line = first.done === true ? undefined : parseJsonObject(first.value);
    if (line?.[SESSION.lineType] !== SESSION.metadataType) return NOBODY;
    const payload = line[SESSION.payload];
    if (!isJsonObject(payload) || payload[SESSION.source] !== READER.personSource) return NOBODY;
    const originator = payload[SESSION.originator];
    return {
      attended: true,
      quietSaidByAgent: originator !== READER.terminalOriginator,
      foldsTurn: typeof originator === 'string' && (READER.desktopOriginators as readonly string[]).includes(originator),
    };
  } catch (error) {
    if (error instanceof FileAccessError) return NOBODY;
    throw error;
  } finally {
    await lines.return?.();
  }
}
