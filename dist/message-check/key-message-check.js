// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysToTell } from '../core/message/keys-to-tell.js';
import { messageRefusal } from '../adapter/claude-code/hooks/hook-output.js';
import { messageRefusalReason, refusedNote } from './render/message-check-words.js';
/**
 * PK11: whether an app names a new conversation from its first message by a model, so that a refused first message may
 * have reached one all the same (§3a-ter: Codex's desktop app and VS Code panel; the maintainer's screenshot of Claude Code
 * in VS Code). The terminals measured do not (§3a-ter); a script has nobody to name it for. An app not known is said as
 * one that may - the sentence says "may".
 */
export function namesChats(heldIn) {
    return heldIn !== 'terminal' && heldIn !== 'script';
}
/**
 * A key in a person's message, stopped before the AI gets it (`2026-11-01-a-key-in-your-message.md` PK1-PK6): a known
 * format or a URL's password whose value does not read as a sample (PKD2, PKD4), told by line and kind and never by any
 * part of its value (PK3), with what to do instead. agentwhy keeps nothing of it (PK2, PKD1) and rewrites nothing (PKD3).
 * A question it cannot answer - whether `.env` is blocked - leaves that line out; it never lets the message through.
 *
 * PK10: the refusal is remembered for the conversation, and the next message that goes carries a note asking the AI to
 * say it - on its standard output, which both Claude Code and Codex hand the model (§3, §3a). A memory that fails costs
 * that note, never the refusal or the next message.
 */
export class KeyMessageCheck {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async answer(message, lang, heldIn) {
        const { memory } = this.#dependencies;
        const session = message.sessionId;
        const keys = keysToTell(message);
        if (keys.length === 0) {
            if (memory === undefined || session === undefined)
                return '';
            // PK11: after a message that goes, the conversation has its name. Written on every one, so a conversation in use
            // keeps its mark past the store's sweep of files a day old.
            await memory.markWent(session).catch(() => undefined);
            return (await memory.take(session).catch(() => undefined)) ?? '';
        }
        const folder = message.workingDirectory;
        const blocked = folder === undefined ? undefined : await this.#dependencies.envBlocked(folder).catch(() => undefined);
        // PK11: a first message refused, in an app that names a conversation from it, may have reached a model all the same.
        // Without a memory, or a conversation to ask about, it is not known to be first, and nothing is claimed.
        const first = memory !== undefined && session !== undefined && !(await memory.wentBefore(session).catch(() => true));
        const named = first && heldIn !== undefined && namesChats(await heldIn().catch(() => undefined));
        if (memory !== undefined && session !== undefined) {
            await memory.keep(session, refusedNote(keys, message.pastes.length, blocked, named)).catch(() => undefined);
        }
        const words = typeof lang === 'function' ? await lang() : lang;
        return messageRefusal(messageRefusalReason(keys, message.pastes.length, words, blocked, named));
    }
}
