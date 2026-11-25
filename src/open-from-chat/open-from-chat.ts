// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { OpenRequest } from '../core/message/open-request.ts';
import type { DetachedRun } from '../ports/detached-run.ts';
import { gettingReadyWords, noConversationWords, openedWords, writtenWords } from './render/open-words.ts';

/**
 * The release that first answers the phrase (RO2, RO7, ROD9): a hook pinned to an earlier one does not know it. Set to the
 * version it ships in, before `npm run release`.
 */
export const OPEN_FROM_CHAT_SINCE = '0.10.0';

/** RO6: how long the hook waits for an address. Codex's entry names 30 s, `npx`'s start included (AOD9). */
const WAIT_MS = 15_000;

/** An address of this computer's own, as `start --detach --quiet` prints it. */
const ADDRESS = /\bhttp:\/\/127\.0\.0\.1:\d+\/\S*/;
/** PF4: no server came up, whatever was written instead. */
const UNSERVED = /^agentwhy could not keep running in the background here/;
/** SW10: the conversation asked for is not served. */
const NOT_FOUND = /^That conversation was not found here/m;
/** PF4's pages, written as files: what `quietlySaid` opens its line with. */
const WRITTEN = /^(?:Opened|Written): \S/m;
/** What `start` says of a project with no conversation, or a computer with none (`noSessions`, `nothingSavedHere`). */
const NO_CONVERSATION = /^(?:No sessions are stored |No .+ conversations are saved |(?:You're set up\. )?There are no AI chats )/m;

/** A person's request, and where it is answered. */
export interface OpenAsk {
  readonly request: OpenRequest;
  /** The project's folder, else the home folder, whose page is the computer's own (ROD8). */
  readonly folder: string;
  /** The conversation's key, for `report` (RO4). */
  readonly sessionKey?: string;
  /** AP13: the plugin's copy asked, so its server says where the plugin is updated. */
  readonly plugin: boolean;
}

/** What answers a person who asked for agentwhy's page: what to tell the AI, or nothing. */
export interface ChatOpener {
  answer(ask: OpenAsk): Promise<string>;
}

/**
 * agentwhy's page opened from a chat (`2026-11-24-open-agentwhy-from-the-chat.md` RO4-RO6): `start --detach` run apart from
 * the hook, which opens the browser by itself, and its address handed to the AI to give. Whatever fails says nothing, and
 * the person's message goes on as any other (PK6).
 */
export class OpenFromChat implements ChatOpener {
  readonly #run: DetachedRun;

  constructor(dependencies: { readonly run: DetachedRun }) {
    this.#run = dependencies.run;
  }

  async answer(ask: OpenAsk): Promise<string> {
    const args = [
      'start', '--detach', '--setup-first', '--quiet',
      ...(ask.plugin ? ['--plugin'] : []),
      ...(ask.request === 'report' && ask.sessionKey !== undefined ? ['--session', ask.sessionKey] : []),
    ];
    try {
      const answer = await this.#run.run(args, ask.folder, WAIT_MS);
      if (answer === undefined) return '';
      if (!answer.ended) return gettingReadyWords();
      if (answer.exitCode !== 0) return '';
      const address = ADDRESS.exec(answer.output)?.[0];
      if (address !== undefined) return openedWords(address, NOT_FOUND.test(answer.output));
      if (UNSERVED.test(answer.output) || WRITTEN.test(answer.output)) return writtenWords(answer.output.trim().replace(/\s+/g, ' '));
      return NO_CONVERSATION.test(answer.output) ? noConversationWords() : '';
    } catch {
      return '';
    }
  }
}
