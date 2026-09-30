import { resolve } from 'node:path';
import type { Recognition } from '../../../core/session-format.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { LAYOUT } from '../contract/layout.ts';
import { classifyLineType } from '../contract/line-types.ts';
import { RECOGNITION } from '../contract/recognition.ts';

/** How many damaged lines before the first that parses recognition passes over, so a file of noise is not read whole. */
const DAMAGED_LINES_SKIPPED = 8;

/**
 * Whether an input is a Claude Code session, by its main transcript's first non-blank line that parses (`recognition.ts`).
 * The input is named as `ClaudeCodeSessionDiscovery` names it - a session directory or its `.jsonl` - and nothing past
 * that line is read. A line that does not parse says how a write failed, not which format wrote it, and diagnosing it is
 * `doctor`'s job, so up to `DAMAGED_LINES_SKIPPED` of them are passed over; a file of nothing else stays unknown. A
 * transcript that is not there is `unavailable`, which `doctor` still reports on as Claude Code's.
 */
export async function recogniseClaudeCode(files: FileReader, input: string): Promise<Recognition> {
  const target = resolve(input);
  const transcript = target.endsWith(LAYOUT.transcriptSuffix) ? target : target + LAYOUT.transcriptSuffix;
  let damaged = 0;
  try {
    for await (const text of files.readLines(transcript)) {
      if (text.trim() === '') continue;
      const line = parseJsonObject(text);
      if (line === undefined) {
        damaged += 1;
        if (damaged > DAMAGED_LINES_SKIPPED) return 'unknown';
        continue;
      }
      return isClaudeLine(line) ? 'recognised' : 'unknown';
    }
    return 'unknown';
  } catch (error) {
    if (error instanceof FileAccessError) return 'unavailable';
    throw error;
  }
}

function isClaudeLine(line: JsonObject): boolean {
  const type = line[RECOGNITION.lineType];
  if (typeof type !== 'string') return false;
  return typeof line[RECOGNITION.sessionId] === 'string' || classifyLineType(type) !== 'unknown';
}
