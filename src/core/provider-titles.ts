// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionSummary } from './session-catalogue.ts';
import type { Provider } from './session-format.ts';
import type { SessionRecognition, SessionTitles } from './session-titles.ts';

/** Each session recognised by the titles of the AI that wrote it (`2026-09-27-what-codex-wrote.md` X28, step 5). */
export class ProviderTitles implements SessionTitles {
  readonly #titles: Readonly<Record<Provider, SessionTitles>>;

  constructor(titles: Readonly<Record<Provider, SessionTitles>>) {
    this.#titles = titles;
  }

  recognise(session: SessionSummary): Promise<SessionRecognition> {
    return this.#titles[session.provider].recognise(session);
  }
}
