// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * What the AI is told when a person asked for agentwhy's page (`2026-11-24-open-agentwhy-from-the-chat.md` RO5, RO6): one
 * English paragraph on the hook's standard output, which Claude Code and Codex both hand the model (PK10, PFB3, ROB1).
 * It asks for one sentence in the person's language, and for nothing to be opened or run.
 */
const WHO = 'agentwhy, the local tool this user runs,';
const NOTHING_ELSE = 'Do not open, read or summarise any file, and run nothing.';

/** `elsewhere`: the conversation's report was asked for and is not served there, so all conversations were opened (SW10). */
export const openedWords = (address: string, elsewhere: boolean): string =>
  `${WHO} opened its page at ${address} for them. Give the user that address as a link, in one sentence in their language. ` +
  `${elsewhere ? 'This conversation was not found there yet, so it opened all conversations: say that too. ' : ''}${NOTHING_ELSE}`;

export const gettingReadyWords = (): string =>
  `${WHO} is getting its page ready and will open it in their browser by itself. Tell the user so, in one sentence in their language. ${NOTHING_ELSE}`;

/** `said`: what `start` printed - where the files are, and what would serve them instead (PF4). */
export const writtenWords = (said: string): string =>
  `${WHO} could not serve its page from here. It says: ${said} Tell the user that, in one or two sentences in their language. ${NOTHING_ELSE}`;

export const noConversationWords = (): string =>
  `${WHO} has no conversation of this project yet, so there is no page to open. Tell the user it opens once their AI has worked here: after this reply they can ask again. ` +
  `One sentence, in their language. ${NOTHING_ELSE}`;
