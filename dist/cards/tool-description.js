// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ANSWER_SCOPES, ANSWERS } from '../report/answers/answer-kinds.js';
import { LANGS } from '../report/render/report-copy.js';
/** What the AI may ask: every answer, and the report, which opens agentwhy's page. */
export const ASKABLE = [...ANSWERS, 'report'];
/**
 * When the AI reaches for agentwhy and what it does with the answer (`2026-11-24-talking-about-agentwhy.md` CV2, CV3, CV5). Words for
 * the model alone: a person never sees them. Where no card is drawn the AI's words are all the person has.
 */
export const toolDescription = (drawn) => [
    `agentwhy\'s own record of what AIs did with private files on this computer${drawn ? ', shown to the person as a card in this chat' : ''}.`,
    'Call it when the person names agentwhy; asks whether everything is okay or something leaked; asks about private files, keys or',
    'passwords, what was stopped, blocked or tracked, which files their AI opened or how often; asks which conversations, chats or',
    'sessions with an AI they had, here or on this computer (the list, the last ones, the bad ones); or goes on from an answer of',
    'agentwhy. Not for other questions about your work. Use it instead of agentwhy\'s commands in a shell: the answer is the same' + (drawn ? ', and' : '.'),
    ...(drawn ? ['the person sees a card.'] : []),
    'Where sessions may mean this app\'s own list, say in one sentence that you can show that too.',
    'about: okay (over all conversations), conversations (the list of sessions), attention (to act on), tracked, stopped, often (how many',
    'times each file was wanted), summary, steps, files, helpers, todo (this conversation), report (opens the detailed page: only when the',
    'person asks to open or see it). where: computer only when the person asks about their whole computer. conversation: the #name of one',
    'a list gave you, when the person asks about that one. lang: the language the person writes in, en where it is none of these.',
    drawn
        ? 'The person sees the card: add one or two short sentences in their language and never retell, list or draw a table of it. Say only'
        : 'In this app no card is drawn and the person sees nothing of the answer: give them its words in their language - a list of conversations as a table of when, conversation, where and what happened, without the #names. Say only',
    'what the text says; where it does not say, say that agentwhy\'s record does not say. Never call anything safe, clean or secure, and',
    'never say who stopped something. Do not open, read or search any file to answer. With report, open the address with your in-app',
    'browser or preview tool if you have one, else give it as a link.',
].join(' ');
export const TOOL_INPUT = {
    type: 'object',
    properties: {
        about: { type: 'string', enum: [...ASKABLE] },
        where: { type: 'string', enum: [...ANSWER_SCOPES] },
        lang: { type: 'string', enum: [...LANGS] },
        conversation: { type: 'string', pattern: '^#?[A-Za-z0-9-]{4,64}$' },
    },
    required: ['about', 'lang'],
    additionalProperties: false,
};
