// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionSummary } from '../../../core/session-catalogue.ts';
import type { SessionRecognition, SessionTitles } from '../../../core/session-titles.ts';
import { oneLine } from '../../../shared/printable.ts';
import type { VsCodeChatDiscovery } from './vs-code-chats.ts';

export interface VsCodeChatTitlesDependencies {
  readonly discovery: VsCodeChatDiscovery;
  /** Only the free-text door: a title is whatever VS Code wrote from what the person typed. */
  readonly redactor: Pick<Redactor, 'scan'>;
}

/**
 * What a person recognises a Copilot chat in VS Code by (`what-vs-code-copilot-wrote` VC5, VCD2): its `customTitle`, past
 * the redactor; that it was held in a code editor - the record is VS Code's own, so the place is known, not guessed; and
 * its last request's time (`when-it-was-last-active` LA1).
 */
export class VsCodeChatTitles implements SessionTitles {
  readonly #dependencies: VsCodeChatTitlesDependencies;

  constructor(dependencies: VsCodeChatTitlesDependencies) {
    this.#dependencies = dependencies;
  }

  async recognise(session: SessionSummary): Promise<SessionRecognition> {
    const read = await this.#dependencies.discovery.read(session.path);
    const chat = read.kind === 'chat' ? read.chat : undefined;
    // Scan the whole title before it is made one line: a value cut in two might no longer be recognised.
    const title = chat?.title === undefined ? '' : oneLine(this.#dependencies.redactor.scan(chat.title));
    return {
      ...(title === '' ? {} : { title: this.#dependencies.redactor.scan(title) }),
      entryPoint: 'editor',
      ...(chat?.lastActive === undefined ? {} : { lastActive: chat.lastActive }),
    };
  }
}
