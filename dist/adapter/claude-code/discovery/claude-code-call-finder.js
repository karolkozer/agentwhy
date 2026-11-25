import { FileAccessError } from '../../../ports/file-access-error.js';
import { LAYOUT } from '../contract/layout.js';
const CALL_ID = /^[A-Za-z0-9_-]{8,128}$/;
/** A call is at the end of its record; what one AI did beside it in the same turn can follow. */
const TAIL_BYTES = 256 * 1024;
const RECORDS_SEEN = 6;
/** Claude Code writes the record a moment after it goes on: a tenth of a second, measured. */
const TRIES = 10;
const WAIT_MS = 150;
/**
 * Which conversation a call is in (`.ai/specs/2026-11-24-talking-about-agentwhy.md` CVB22). A server started by Claude Code is told
 * once, when it starts, and goes on after `/clear` in a conversation of another id: so the record that holds the call's own id is
 * the one. Nothing else of a record is looked at and nothing of it is kept; an id it holds nowhere is no answer, never a guess.
 */
export class ClaudeCodeCallFinder {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async conversationOf(callId, workingDirectory) {
        if (!CALL_ID.test(callId))
            return undefined;
        for (let attempt = 0; attempt < TRIES; attempt += 1) {
            if (attempt > 0)
                await this.#dependencies.sleep(WAIT_MS);
            const { sessions } = await this.#dependencies.catalogue.list(workingDirectory);
            const recent = [...sessions].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, RECORDS_SEEN);
            for (const session of recent) {
                if ((await this.#tail(session.path + LAYOUT.transcriptSuffix)).includes(callId))
                    return session.id;
            }
        }
        return undefined;
    }
    async #tail(path) {
        try {
            return await this.#dependencies.transcripts.readTail(path, TAIL_BYTES);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return '';
        }
    }
}
