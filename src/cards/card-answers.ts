// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CliCommand } from '../cli/cli-command.ts';
import type { ServerAnswers } from '../report/answers/server-answers.ts';
import type { ConversationAnswer } from '../report/answers/answer-model.ts';
import { cardPage } from '../report/render/card/card-page.ts';
import type { Lang } from '../report/render/report-copy.ts';
import type { CardAnswers } from './mcp-messages.ts';

export interface CardAnswerSources {
  readonly lang: () => Promise<Lang>;
  /** `agentwhy why`: the one reader of a conversation, with its rules and its ways to find one. */
  readonly why: Pick<CliCommand, 'execute'>;
  readonly server: Pick<ServerAnswers, 'ask' | 'peek' | 'address' | 'open'>;
  readonly self: (callId: string | undefined) => Promise<string | undefined>;
  /** Whether the working folder is the person's home, which is no project (CV15). */
  readonly atHome: boolean;
  readonly now: () => number;
}

/** What the card's server asks, answered by the commands a person can run themselves: the same readers, the same words. */
export function cardAnswers({ lang, why, server, self, atHome, now }: CardAnswerSources): CardAnswers {
  const outputOf = async (command: Pick<CliCommand, 'execute'>, args: readonly string[]): Promise<string> => {
    const result = await command.execute(args);
    return result.kind === 'completed' ? result.output.trim() : '';
  };
  return {
    lang,
    here: atHome ? 'computer' : 'project',
    self,
    conversation: async (key, callId, lang) => {
      const output = await outputOf(why, ['--plugin', ...(key === undefined ? [] : ['--session', key]), ...(callId === undefined ? [] : ['--without-call', callId]), '--lang', lang, '--json']);
      return output.startsWith('{') ? (JSON.parse(output) as ConversationAnswer) : output;
    },
    list: (scope, asked) => server.ask(scope, asked),
    peek: (scope) => server.peek(scope),
    address: (scope) => server.address(scope),
    open: (scope, key) => server.open(scope, key),
    card: cardPage,
    now,
  };
}
