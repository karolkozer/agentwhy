import { FileAccessError } from '../../../ports/file-access-error.js';
import { LAYOUT } from '../contract/layout.js';
import { SESSION_TITLE } from '../contract/session-title.js';
import { recognitionIn } from './transcript-tail.js';
/**
 * Reads what a person recognises a session by from the end of its transcript, in one read: the title Claude Code gave
 * it, handed over only once it has passed the redactor, and which way into Claude Code it was held
 * (`.ai/specs/2026-09-27-which-project.md` V4). Nothing else in the transcript is looked at, and nothing but the tail's
 * answer is kept. A session the desktop app held has no `ai-title`: its title is the app's own, read the same way a
 * Codex thread's name is (CD2) - so a row with no title can be asked again at the cost of a look at the app's folder,
 * never another read of an unchanged transcript (CD5).
 */
export class ClaudeCodeSessionTitles {
    #dependencies;
    /** By the session's path: what its tail said when it was last this old. */
    #known = new Map();
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async recognise(session) {
        const { redactor, desktop } = this.#dependencies;
        const kept = this.#known.get(session.path);
        let fromTail;
        if (kept !== undefined && kept.modifiedAt === session.modifiedAt) {
            fromTail = kept.recognition;
        }
        else {
            const tail = await this.#tail(session.path + LAYOUT.transcriptSuffix);
            // A transcript that is missing or unreadable is recognised by nothing, and nothing is kept: the next ask tries it.
            if (tail === undefined)
                return {};
            fromTail = recognitionIn(tail, redactor);
            this.#known.set(session.path, { modifiedAt: session.modifiedAt, recognition: fromTail });
        }
        if (fromTail.title !== undefined || desktop === undefined)
            return fromTail;
        const named = await desktop.titleOf(session.id);
        if (named === undefined)
            return fromTail;
        return { ...fromTail, title: redactor.scan(named) };
    }
    async #tail(path) {
        try {
            return await this.#dependencies.transcripts.readTail(path, SESSION_TITLE.tailBytes);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return undefined;
        }
    }
}
