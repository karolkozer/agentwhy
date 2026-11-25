import { FileAccessError } from '../../../ports/file-access-error.js';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { CODE_CELL } from '../contract/deliveries.js';
import { ENVELOPE, LINE_TYPES } from '../contract/envelope.js';
import { STOP } from '../contract/hooks.js';
import { RESPONSE_ITEMS } from '../contract/messages.js';
import { RESPONSE_TURN } from '../contract/turns.js';
import { hookRefusalsIn } from '../events/hook-refusals.js';
/**
 * `Stop` has a session id, a turn id and (outside ephemeral runs) a transcript path. The rollout reader already
 * recognizes agentwhy's own refusal text in a code cell's output; this narrow reader applies that recognizer only to
 * outputs with the Stop input's turn id. It never returns any other transcript content.
 */
export class CodexTurnRefusals {
    #files;
    constructor(files) {
        this.#files = files;
    }
    async find(text) {
        const input = parseJsonObject(text);
        if (input === undefined || input[STOP.fields.event] !== STOP.event || input[STOP.fields.active] === true)
            return [];
        const turnId = input[STOP.fields.turnId];
        const path = input[STOP.fields.transcriptPath];
        if (typeof turnId !== 'string' || turnId === '' || typeof path !== 'string' || path === '')
            return [];
        const found = [];
        try {
            for await (const raw of this.#files.readLines(path)) {
                const line = parseJsonObject(raw);
                if (line?.[ENVELOPE.type] !== LINE_TYPES.responseItem)
                    continue;
                const payload = line[ENVELOPE.payload];
                if (!isJsonObject(payload) || payload[ENVELOPE.payloadType] !== RESPONSE_ITEMS.codeCellOutput)
                    continue;
                const metadata = payload[RESPONSE_TURN.metadata];
                if (!isJsonObject(metadata) || metadata[RESPONSE_TURN.turnId] !== turnId)
                    continue;
                const output = payload[CODE_CELL.output];
                const parts = typeof output === 'string' ? [output] : Array.isArray(output)
                    ? output.flatMap((part) => isJsonObject(part) && part[CODE_CELL.partType] === CODE_CELL.textPart &&
                        typeof part[CODE_CELL.partText] === 'string' ? [part[CODE_CELL.partText]] : [])
                    : [];
                found.push(...hookRefusalsIn(parts.join('\n')));
            }
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return [];
        }
        return found;
    }
}
