// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { locateSession } from '../../core/locate-session.js';
import { isConversationAnswer } from '../../report/answers/answer-kinds.js';
import { CHAT_WORD_LIST, isChatView } from '../../report/render/chat/chat-choice.js';
import { PROVIDER_NAMES } from '../../core/session-format.js';
import { LANGS, translator } from '../../report/render/report-copy.js';
import { EXIT_CODE } from '../exit-codes.js';
import { EXIT_CODE_BY_OUTCOME } from './report-cli-command.js';
export const WHY_USAGE = `Usage: agentwhy why --session <id> [--plugin] [${CHAT_WORD_LIST.join('|')}]
       agentwhy why --plugin [${CHAT_WORD_LIST.join('|')}]

What agentwhy saw in one conversation, as Markdown for an AI to show in the chat: its look in the words of agentwhy's
page, the private files and what happened to each, each helper with the task it was given, what to do, and what could
not be checked. Read from the same report the page draws, so the two say the same. Writes nothing.

  --session <id>      the conversation, by its id - looked for in this folder's project, then in every Claude
                      Code project on this computer, and read with the rules of the project it is kept under
  --plugin            run by the plugin's skill: always exit 0, and say in the answer what went wrong, since
                      Claude Code drops a skill whose line fails without a word to anyone. With no --session,
                      the conversation Claude Code says the command runs in
  steps               every step each AI took, as Step by step says it
  folders             the files by the folder they are in
  table               a table of the files and what happened to each
  diagram             who brought in whom, and the private files each reached
  card                a short block to share: no path, no project, no task's words
  summary             in one sentence, with what to do
  files               the private files and what happened to each
  helpers             each helper, its task and the private files it met
  todo                what to do, file by file
  --json              the same as data, for a card to draw: every answer about the conversation at once
  --lang <en|pl|de>   the language it is said in, where it is not the one chosen for agentwhy
  --without-call <id> leave out the call that asks, which has no result yet: agentwhy's own card server names its own
  -h, --help          this text

Nothing else is taken after the command: one word of the list, or none.

Exit code 0 when the answer was printed; 1 when the session could not be found or read; 2 for bad arguments or a
refused policy.
`;
/**
 * `agentwhy why` (`2026-11-20-ask-your-ai-why.md` AY1-AY7): one conversation's report, said in the chat. Read-only, and
 * the word after it is checked against the closed list before anything is read - a `!` line hands its arguments to a
 * shell as typed (AYB3), so nothing the person types is ever let through to one.
 */
export class WhyCliCommand {
    name = 'why';
    usage = WHY_USAGE;
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    /**
     * AYB11, measured 2026-11-21: a `!` line that exits with anything but 0 drops the whole skill, and nobody is told. So under
     * `--plugin` nothing exits otherwise - a word off the list, an id the skill could not fill, a failure anywhere: each is
     * said in one line, for the AI to tell the person (the review of 2026-11-21).
     */
    async execute(args) {
        if (!args.includes('--plugin'))
            return this.#answer(args, false);
        try {
            const result = await this.#answer(args, true);
            return result.kind === 'usage-error' ? { kind: 'completed', output: `agentwhy why: ${result.message}\n`, exitCode: EXIT_CODE.ok } : result;
        }
        catch {
            const lang = await this.#dependencies.lang(this.#dependencies.workingDirectory).catch(() => 'en');
            return { kind: 'completed', output: translator(lang)('ch.failed') + '\n', exitCode: EXIT_CODE.ok };
        }
    }
    async #answer(args, plugin) {
        let values;
        let positionals;
        try {
            ({ values, positionals } = parseArgs({
                args: [...args],
                options: {
                    session: { type: 'string' },
                    plugin: { type: 'boolean', default: false },
                    json: { type: 'boolean', default: false },
                    'without-call': { type: 'string' },
                    lang: { type: 'string' },
                    help: { type: 'boolean', short: 'h', default: false },
                },
                strict: true,
                allowPositionals: true,
            }));
        }
        catch (error) {
            return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
        }
        if (values.help)
            return { kind: 'help', usage: this.usage };
        const usageError = (message) => ({ kind: 'usage-error', message, usage: this.usage });
        if (positionals.length > 1)
            return usageError(`why takes one word after it at most: ${CHAT_WORD_LIST.join(', ')}`);
        const word = positionals[0];
        const answer = word !== undefined && !isChatView(word) && isConversationAnswer(word) ? word : undefined;
        if (word !== undefined && answer === undefined && !isChatView(word))
            return usageError(`why takes one of: ${CHAT_WORD_LIST.join(', ')}`);
        // A view is Markdown and nothing else; what a card draws is an answer.
        if (values.json && word !== undefined && answer === undefined)
            return usageError('--json goes with an answer, not with a view');
        const spoken = values.lang === undefined ? undefined : LANGS.find((one) => one === values.lang);
        if (values.lang !== undefined && spoken === undefined)
            return usageError(`--lang takes one of: ${LANGS.join(', ')}`);
        const { catalogue, elsewhere, reportFor, workingDirectory, thisConversation, done: doneIn } = this.#dependencies;
        const lang = async (folder) => spoken ?? this.#dependencies.lang(folder);
        const named = values.session === undefined || values.session === '' ? undefined : values.session;
        // Run by the skill, a conversation not named - a view's command, or an id the `!` line could not fill - is the one
        // the AI is in, where Claude Code says it; where nothing does, said as such, not as a mistake in how it was typed.
        const session = named ?? (plugin ? thisConversation : undefined);
        if (session === undefined && plugin) {
            return { kind: 'completed', output: translator(await lang(workingDirectory))('ch.noSession') + '\n', exitCode: EXIT_CODE.ok };
        }
        if (session === undefined)
            return usageError('--session names the conversation by its id');
        const exit = (code) => (plugin ? EXIT_CODE.ok : code);
        // By the name the page gives it (`sessionKey`): the id for Claude Code, as the skill passes it; `codex-…`, `copilot-…`
        // for the others - in the working folder, else wherever the agent keeps it (AYD10).
        const { located, listing } = await locateSession(session, workingDirectory, { catalogue, ...(elsewhere === undefined ? {} : { elsewhere }) });
        if (located === undefined) {
            // Run by the skill, the id is the conversation it runs in: kept nowhere yet is Claude Code not having written it down
            // yet - the first message of a conversation - and the person is told that, in their language (measured 2026-11-21).
            // Where it was looked for, and no further: beyond the working folder, Claude Code's projects alone - the ones its
            // listing could read (the review of 2026-11-22).
            const where = elsewhere === undefined ? 'of this project' : 'of this project, or of any Claude Code project agentwhy could read on this computer,';
            return {
                kind: 'completed',
                output: plugin
                    ? translator(await lang(workingDirectory))('ch.notYet', { ai: PROVIDER_NAMES[session.startsWith('codex-') ? 'codex' : session.startsWith('copilot-') ? 'copilot' : 'claude-code'] }) + '\n'
                    : `No conversation ${where} has the id ${session}, so there is nothing to say about it.\nLooked in ${listing.directory}${elsewhere === undefined ? '' : ' first'}\n`,
                exitCode: exit(EXIT_CODE.mainTranscriptMissing),
            };
        }
        // Read from the folder of the project it is kept under: that project's rules and language, as its row on the page.
        // Found by its record's name alone, it names no folder: its rules come from the folder its own record holds its
        // project in (AYD12), and its language is chosen as this folder's, then the computer's.
        const folder = located.folder ?? workingDirectory;
        const chosen = await lang(folder);
        // The answers alone read the marks: a view says what happened, which a mark does not undo.
        const done = doneIn !== undefined && (answer !== undefined || values.json) && located.folder !== undefined
            ? await doneIn(located.folder, located.summary.modifiedAt).catch(() => new Set())
            : undefined;
        const result = await reportFor({
            ...(done === undefined || done.size === 0 ? {} : { done }),
            ...(answer !== undefined ? { answer } : word === undefined || !isChatView(word) ? {} : { view: word }),
            ...(values.json ? { json: true } : {}),
            lang: chosen,
        }, folder).run({
            ...(located.folder === undefined ? { rulesFromRecord: true } : {}),
            ...(values['without-call'] === undefined ? {} : { withoutCall: values['without-call'] }),
            input: located.summary.path,
            open: false,
            ascii: false,
            full: false,
            colour: false,
            share: false,
            width: 100,
        });
        // TK2: a record that could not be read says so - its model holds no event, so drawn it would read "Nothing private".
        const output = result.outcome === 'session-unreadable' ? translator(chosen)('ch.unreadable') + '\n' : result.output;
        return { kind: 'completed', output, exitCode: exit(EXIT_CODE_BY_OUTCOME[result.outcome]) };
    }
}
