// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CardMessages, type CardAnswers } from '../../cards/mcp-messages.ts';
import type { LineStream } from '../../ports/line-stream.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

export const CARDS_USAGE = `Usage: agentwhy cards

Run by an AI's app, as the agentwhy plugin's own server: it shows agentwhy's answers as a card in the chat, and answers
nothing else. It speaks on its standard input and output alone - no port, no network - and ends when the app ends it.
It writes nothing but the page an answer may start. At a terminal there is nothing for it to do.
`;

export interface CardsCommandDependencies {
  readonly stream: LineStream;
  readonly answers: CardAnswers;
  readonly version: () => Promise<string | undefined>;
  readonly inputIsTerminal: boolean;
}

/** `agentwhy cards` (`2026-11-24-talking-about-agentwhy.md` CVD12): the plugin's server for its card, until its input ends. */
export class CardsCliCommand implements CliCommand {
  readonly name = 'cards';
  readonly usage = CARDS_USAGE;
  readonly #dependencies: CardsCommandDependencies;

  constructor(dependencies: CardsCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    const { stream, answers, version, inputIsTerminal } = this.#dependencies;
    if (args.length > 0 || inputIsTerminal) return { kind: 'help', usage: this.usage };
    const messages = new CardMessages(answers, (await version().catch(() => undefined)) ?? 'dev');
    const pending = new Set<Promise<void>>();
    for await (const line of stream.lines()) {
      // One question may take seconds to read: what is asked meanwhile - another answer, a ping - is answered beside it.
      const done: Promise<void> = messages.answer(line, (message) => stream.write(JSON.stringify(message)))
        .then((answer) => { if (answer !== undefined) stream.write(JSON.stringify(answer)); }, () => undefined)
        .finally(() => pending.delete(done));
      pending.add(done);
    }
    await Promise.all(pending);
    return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
  }
}
