import type { FileReader } from '../../../ports/file-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { TextInput } from '../../../ports/text-input.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { CODE_CELL } from '../contract/deliveries.ts';
import { ENVELOPE, LINE_TYPES } from '../contract/envelope.ts';
import { STOP } from '../contract/hooks.ts';
import { RESPONSE_ITEMS } from '../contract/messages.ts';
import { RESPONSE_TURN } from '../contract/turns.ts';
import { hookRefusalsIn, type HookRefusal } from '../events/hook-refusals.ts';

/** The agentwhy refusals in the turn Codex is about to finish. Nothing from a different turn is used. */
export interface CodexStopRefusals {
  find(): Promise<readonly HookRefusal[]>;
}

/**
 * `Stop` has a session id, a turn id and (outside ephemeral runs) a transcript path. The rollout reader already
 * recognizes agentwhy's own refusal text in a code cell's output; this narrow reader applies that recognizer only to
 * outputs with the Stop input's turn id. It never returns any other transcript content.
 */
export class CodexTurnRefusals implements CodexStopRefusals {
  readonly #input: TextInput;
  readonly #files: FileReader;

  constructor(input: TextInput, files: FileReader) {
    this.#input = input;
    this.#files = files;
  }

  async find(): Promise<readonly HookRefusal[]> {
    const text = await this.#input.readAll(1024 * 1024);
    const input = text === undefined ? undefined : parseJsonObject(text);
    if (input === undefined || input[STOP.fields.event] !== STOP.event || input[STOP.fields.active] === true) return [];
    const turnId = input[STOP.fields.turnId];
    const path = input[STOP.fields.transcriptPath];
    if (typeof turnId !== 'string' || turnId === '' || typeof path !== 'string' || path === '') return [];

    const found: HookRefusal[] = [];
    try {
      for await (const raw of this.#files.readLines(path)) {
        const line = parseJsonObject(raw);
        if (line?.[ENVELOPE.type] !== LINE_TYPES.responseItem) continue;
        const payload = line[ENVELOPE.payload];
        if (!isJsonObject(payload) || payload[ENVELOPE.payloadType] !== RESPONSE_ITEMS.codeCellOutput) continue;
        const metadata = payload[RESPONSE_TURN.metadata];
        if (!isJsonObject(metadata) || metadata[RESPONSE_TURN.turnId] !== turnId) continue;
        const output = payload[CODE_CELL.output];
        const parts = typeof output === 'string' ? [output] : Array.isArray(output)
          ? output.flatMap((part: unknown) => isJsonObject(part) && part[CODE_CELL.partType] === CODE_CELL.textPart &&
            typeof part[CODE_CELL.partText] === 'string' ? [part[CODE_CELL.partText] as string] : [])
          : [];
        found.push(...hookRefusalsIn(parts.join('\n')));
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return [];
    }
    return found;
  }
}
