// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CardMessages } from '../../cards/mcp-messages.js';
import { EXIT_CODE } from '../exit-codes.js';
export const CARDS_USAGE = `Usage: agentwhy cards

Run by an AI's app, as the agentwhy plugin's own server: it shows agentwhy's answers as a card in the chat, and answers
nothing else. It speaks on its standard input and output alone - no port, no network - and ends when the app ends it.
It writes nothing but the page an answer may start. At a terminal there is nothing for it to do.
`;
/** `agentwhy cards` (`2026-11-24-talking-about-agentwhy.md` CVD12): the plugin's server for its card, until its input ends. */
export class CardsCliCommand {
    name = 'cards';
    usage = CARDS_USAGE;
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async execute(args) {
        const { stream, answers, version, inputIsTerminal } = this.#dependencies;
        if (args.length > 0 || inputIsTerminal)
            return { kind: 'help', usage: this.usage };
        const messages = new CardMessages(answers, (await version().catch(() => undefined)) ?? 'dev');
        const pending = new Set();
        for await (const line of stream.lines()) {
            // One question may take seconds to read: what is asked meanwhile - another answer, a ping - is answered beside it.
            const done = messages.answer(line, (message) => stream.write(JSON.stringify(message)))
                .then((answer) => { if (answer !== undefined)
                stream.write(JSON.stringify(answer)); }, () => undefined)
                .finally(() => pending.delete(done));
            pending.add(done);
        }
        await Promise.all(pending);
        return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
    }
}
