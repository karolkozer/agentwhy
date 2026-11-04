// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysToTell, type MessageToCheck } from '../core/message/keys-to-tell.ts';
import { messageRefusal } from '../adapter/claude-code/hooks/hook-output.ts';
import type { NoticeLang } from '../report/watch/notice-choices.ts';
import type { EntryPoint } from '../core/entry-point.ts';
import { messageRefusalReason, refusedNote } from './render/message-check-words.ts';

/** What a `UserPromptSubmit` hook answers: nothing, or the refusal Claude Code and Codex both read (PK5). */
export interface MessageCheck {
  /**
   * `lang`: the person's language, or how to read it - asked only of a message that is refused. `heldIn`: the app the
   * conversation is held in, asked only of a refused first message (PK11).
   */
  answer(message: MessageToCheck, lang: NoticeLang | (() => Promise<NoticeLang>), heldIn?: () => Promise<EntryPoint | undefined>): Promise<string>;
}

/**
 * PK11: whether an app names a new conversation from its first message by a model, so that a refused first message may
 * have reached one all the same (§3a-ter: Codex's desktop app and VS Code panel; the maintainer's screenshot of Claude Code
 * in VS Code). The terminals measured do not (§3a-ter); a script has nobody to name it for. An app not known is said as
 * one that may - the sentence says "may".
 */
export function namesChats(heldIn: EntryPoint | undefined): boolean {
  return heldIn !== 'terminal' && heldIn !== 'script';
}

/**
 * PK10: a refusal kept for the conversation it was made in, until its next message - kinds, lines and names, never a key.
 * One at a time: a second refusal before a clean message replaces the first.
 */
export interface RefusalMemory {
  keep(sessionId: string, note: string): Promise<void>;
  /** The note kept for this conversation, forgotten as it is handed over. */
  take(sessionId: string): Promise<string | undefined>;
  /** PK11: whether a message of this conversation has gone already - after one, the app has named it. */
  wentBefore(sessionId: string): Promise<boolean>;
  markWent(sessionId: string): Promise<void>;
}

export interface KeyMessageCheckDependencies {
  /**
   * PK4: whether `.env` is closed to the AI where the message was written - what `refuse` answers for `cat .env` there,
   * the rules of the project found above the folder and the computer's. Asked only of a message that is stopped.
   */
  readonly envBlocked: (workingDirectory: string) => Promise<boolean>;
  /** Absent: a refusal is said under the message alone, and the AI is never asked to say it. */
  readonly memory?: RefusalMemory;
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
export class KeyMessageCheck implements MessageCheck {
  readonly #dependencies: KeyMessageCheckDependencies;

  constructor(dependencies: KeyMessageCheckDependencies) {
    this.#dependencies = dependencies;
  }

  async answer(message: MessageToCheck, lang: NoticeLang | (() => Promise<NoticeLang>), heldIn?: () => Promise<EntryPoint | undefined>): Promise<string> {
    const { memory } = this.#dependencies;
    const session = message.sessionId;
    const keys = keysToTell(message);
    if (keys.length === 0) {
      if (memory === undefined || session === undefined) return '';
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
