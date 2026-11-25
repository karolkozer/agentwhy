// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { WhyCliCommand } from '../../../src/cli/commands/why-cli-command.ts';
import { EXIT_CODE } from '../../../src/cli/exit-codes.ts';
import type { SessionCatalogue, SessionListing } from '../../../src/core/session-catalogue.ts';
import type { ChatChoice } from '../../../src/report/render/chat/chat-choice.ts';
import type { ReportOptions, ReportUseCase } from '../../../src/report/report-use-case.ts';

const SESSION = '0f0e0d0c-0000-4000-8000-000000000001';
const PATH = '/Users/someone/.claude/projects/-Users-someone-work-the-app/' + SESSION + '.jsonl';

/** A `why` whose catalogue and report record what they were asked, so a refused word can be shown to read nothing. */
function whyCommand(thisConversation?: string) {
  const listed: string[] = [];
  const runs: { readonly choice: ChatChoice; readonly options: ReportOptions }[] = [];
  const catalogue: SessionCatalogue = {
    list: async (workingDirectory) => {
      listed.push(workingDirectory);
      const listing: SessionListing = {
        directory: '/Users/someone/.claude/projects/-Users-someone-work-the-app', found: true, searched: [],
        sessions: [{ id: SESSION, path: PATH, modifiedAt: 0, delegations: 0, provider: 'claude-code' }],
      };
      return listing;
    },
  } as SessionCatalogue;
  const reportFor = (choice: ChatChoice): ReportUseCase => ({
    run: async (options) => {
      runs.push({ choice, options });
      return { outcome: 'complete', output: 'ANSWER\n' };
    },
  });
  const command = new WhyCliCommand({
    catalogue, reportFor, workingDirectory: '/Users/someone/work/the-app', lang: async () => 'pl',
    ...(thisConversation === undefined ? {} : { thisConversation }),
  });
  return { command, listed, runs };
}

// AY5, AYD7, after AYB3: what a person types after the command is checked against the closed list before anything is
// read - a `!` line hands its arguments to a shell as typed, so nothing else may pass.
test('a word off the list, two words, or a word with anything joined to it reads nothing', async () => {
  const { command, listed, runs } = whyCommand();
  for (const args of [['--session', SESSION, 'everything'], ['--session', SESSION, 'steps', 'table'], ['--session', SESSION, 'steps; echo INJECTED'], ['--session', SESSION, '$(echo x)']]) {
    const result = await command.execute(args);
    assert.equal(result.kind, 'usage-error', args.join(' '));
  }
  assert.deepEqual(listed, [], 'no catalogue was read');
  assert.deepEqual(runs, [], 'no report was read');
});

test('a conversation is named by its id, and an id of no conversation here says so with exit 1', async () => {
  const { command } = whyCommand();
  assert.equal((await command.execute([])).kind, 'usage-error');
  const unknown = await command.execute(['--session', 'not-a-session']);
  assert.equal(unknown.kind, 'completed');
  assert.equal((unknown as { exitCode: number }).exitCode, EXIT_CODE.mainTranscriptMissing);
  assert.match((unknown as { output: string }).output, /^No conversation of this project has the id not-a-session/);
});

test('the answer is the report of that conversation, read whole and drawn with the choice made', async () => {
  const { command, runs } = whyCommand();
  const result = await command.execute(['--session', SESSION, 'diagram']);
  assert.deepEqual(result, { kind: 'completed', output: 'ANSWER\n', exitCode: EXIT_CODE.ok });
  assert.deepEqual(runs[0]?.choice, { view: 'diagram', lang: 'pl' });
  assert.equal(runs[0]?.options.input, PATH);
  assert.equal(runs[0]?.options.open, false, 'nothing is opened');
  assert.equal(runs[0]?.options.share, false);

  await command.execute(['--session', SESSION]);
  assert.deepEqual(runs[1]?.choice, { lang: 'pl' }, 'no word, the default answer');
});

// AYB11: run by the skill, a failure exits 0 and says itself what happened - a failing line would drop the skill unsaid.
test('under --plugin, a conversation not found still exits 0, and says so', async () => {
  const { command } = whyCommand();
  const result = await command.execute(['--session', 'not-a-session', '--plugin']);
  assert.equal((result as { exitCode: number }).exitCode, EXIT_CODE.ok);
  // Measured 2026-11-21: the skill's first message comes before Claude Code has written the conversation down.
  assert.match((result as { output: string }).output, /^agentwhy nie ma jeszcze zapisu tej rozmowy: /, 'said in the person\'s language');
});

// The name the page gives a conversation: its id for Claude Code, `codex-…` and `copilot-…` for the others (`sessionKey`).
test('a Codex conversation is found by the name the page gives it', async () => {
  const runs: string[] = [];
  const catalogue = {
    list: async () => ({ directory: '/Users/someone/.codex/sessions', found: true, searched: [], sessions: [{ id: SESSION, path: '/Users/someone/.codex/sessions/r.jsonl', modifiedAt: 0, delegations: 0, provider: 'codex' as const }] }),
  } as unknown as SessionCatalogue;
  const command = new WhyCliCommand({
    catalogue, workingDirectory: '/Users/someone/work/the-app', lang: async () => 'en',
    reportFor: () => ({ run: async (options) => { runs.push(options.input ?? ''); return { outcome: 'complete', output: 'ANSWER\n' }; } }),
  });
  assert.equal(((await command.execute(['--session', 'codex-' + SESSION])) as { exitCode: number }).exitCode, EXIT_CODE.ok);
  assert.deepEqual(runs, ['/Users/someone/.codex/sessions/r.jsonl']);
});

// AYB11 and the review of 2026-11-21: under --plugin nothing exits otherwise, whatever goes wrong - a line that fails drops
// the skill and nobody is told.
test('under --plugin a mistyped call, an unfilled id and a failure each answer in one line, with exit 0', async () => {
  const { command } = whyCommand();
  const mistyped = await command.execute(['--session', SESSION, '--plugin', '--everything']);
  assert.equal(mistyped.kind, 'completed');
  assert.equal((mistyped as { exitCode: number }).exitCode, EXIT_CODE.ok);
  const unfilled = await command.execute(['--session', '', '--plugin']);
  assert.match((unfilled as { output: string }).output, /^agentwhy nie wie, która to rozmowa/);
  assert.equal((unfilled as { exitCode: number }).exitCode, EXIT_CODE.ok);

  const failing = new WhyCliCommand({
    catalogue: { list: async () => { throw new Error('the store moved'); } } as unknown as SessionCatalogue,
    reportFor: () => ({ run: async () => ({ outcome: 'complete', output: '' }) }), workingDirectory: '/Users/someone/work/the-app', lang: async () => 'en',
  });
  const failed = await failing.execute(['--session', SESSION, '--plugin']);
  assert.deepEqual(failed, { kind: 'completed', output: 'agentwhy ran into a problem and couldn’t answer. /agentwhy:report opens its page.\n', exitCode: EXIT_CODE.ok });
});

// TK2 (the review of 2026-11-21): a record that could not be read is said so, never drawn as one with nothing private in it.
test('a conversation whose record could not be read says so, with the report\'s exit code - or 0 under --plugin', async () => {
  const unreadable = new WhyCliCommand({
    catalogue: { list: async () => ({ directory: '/x', found: true, searched: [], sessions: [{ id: SESSION, path: PATH, modifiedAt: 0, delegations: 0, provider: 'claude-code' as const }] }) } as unknown as SessionCatalogue,
    reportFor: () => ({ run: async () => ({ outcome: 'session-unreadable', output: '**agentwhy** · this conversation: **Nothing private**\n' }) }),
    workingDirectory: '/Users/someone/work/the-app', lang: async () => 'en',
  });
  const result = await unreadable.execute(['--session', SESSION]);
  assert.match((result as { output: string }).output, /^agentwhy couldn’t read this conversation’s record/);
  assert.doesNotMatch((result as { output: string }).output, /Nothing private/);
  assert.equal((result as { exitCode: number }).exitCode, EXIT_CODE.mainTranscriptMissing);
  assert.equal(((await unreadable.execute(['--session', SESSION, '--plugin'])) as { exitCode: number }).exitCode, EXIT_CODE.ok);
});

// AYO9, AYB13 (measured 2026-11-22): the skill's pre-approval cannot name this conversation, so the AI's command names
// none, and `why --plugin` answers for the conversation the AI that ran it is in - read from the environment Claude Code
// gives every command its AI runs. Typed by a person, a conversation is still named.
test('run by the skill with no conversation named, the answer is the one the AI running it is in', async () => {
  const { command, runs } = whyCommand(SESSION);
  const result = await command.execute(['--plugin', 'table']);
  assert.deepEqual(result, { kind: 'completed', output: 'ANSWER\n', exitCode: EXIT_CODE.ok });
  assert.equal(runs[0]?.options.input, PATH);
  assert.deepEqual(runs[0]?.choice, { view: 'table', lang: 'pl' });
  // The `!` line's id, where Claude Code could not fill it, is the same conversation.
  await command.execute(['--session', '', '--plugin']);
  assert.equal(runs[1]?.options.input, PATH);

  assert.equal((await command.execute(['table'])).kind, 'usage-error', 'a person names the conversation');
  const unknown = whyCommand();
  assert.match(((await unknown.command.execute(['--plugin', 'table'])) as { output: string }).output, /^agentwhy nie wie, która to rozmowa/);
  assert.deepEqual(unknown.runs, [], 'with no conversation known, nothing is read');
});

// AYO7, AYD10 (measured 2026-11-22): after the AI moves into a sub-folder, the skill's line runs there. The conversation is
// found where it is kept, and read from its project's folder - that project's rules and language, as its row on the page.
test('a conversation kept under the project above the working folder is answered from that project', async () => {
  const runs: { readonly input?: string; readonly folder: string; readonly rulesFromRecord?: boolean }[] = [];
  const langs: string[] = [];
  const empty: SessionCatalogue = { list: async (folder) => ({ directory: '/x' + folder, found: false, searched: [], sessions: [] }) };
  const command = new WhyCliCommand({
    catalogue: empty,
    elsewhere: {
      catalogue: { list: async (folder) => ({ directory: '/y', found: true, searched: [], sessions: folder === '/Users/someone/work/the-app' ? [{ id: SESSION, path: PATH, modifiedAt: 0, delegations: 0, provider: 'claude-code' as const }] : [] }) },
      finder: { find: async () => undefined },
    },
    reportFor: (_choice, folder) => ({ run: async (options) => { runs.push({ ...(options.input === undefined ? {} : { input: options.input }), folder, ...(options.rulesFromRecord === undefined ? {} : { rulesFromRecord: options.rulesFromRecord }) }); return { outcome: 'complete', output: 'ANSWER\n' }; } }),
    workingDirectory: '/Users/someone/work/the-app/packages/web',
    lang: async (folder) => { langs.push(folder); return 'en'; },
    thisConversation: SESSION,
  });
  const result = await command.execute(['--plugin']);
  assert.deepEqual(result, { kind: 'completed', output: 'ANSWER\n', exitCode: EXIT_CODE.ok });
  assert.deepEqual(runs, [{ input: PATH, folder: '/Users/someone/work/the-app' }], 'read from its project\'s folder');
  assert.deepEqual(langs, ['/Users/someone/work/the-app'], 'in the language chosen there');

  // Kept nowhere, "not written yet" is now what was found, and a person is told where it was looked for - no more (the
  // review of 2026-11-22: Codex's and Copilot's other folders, and a store agentwhy cannot read, are not looked in).
  const typed = await command.execute(['--session', 'not-a-session']);
  assert.match((typed as { output: string }).output, /^No conversation of this project, or of any Claude Code project agentwhy could read on this computer, has the id not-a-session/);
});

// AYD12: past the folders above, a conversation found by its record's name names no folder - its report reads its rules
// from the folder its own record holds its project in, and its language is this folder's choice.
test('a conversation found by its record\'s name alone is read with the rules its record names', async () => {
  const runs: { readonly folder: string; readonly rulesFromRecord?: boolean }[] = [];
  const empty: SessionCatalogue = { list: async () => ({ directory: '/x', found: false, searched: [], sessions: [] }) };
  const command = new WhyCliCommand({
    catalogue: empty,
    elsewhere: { catalogue: empty, finder: { find: async (key) => (key === SESSION ? { id: SESSION, path: PATH, modifiedAt: 0, delegations: 0, provider: 'claude-code' as const } : undefined) } },
    reportFor: (_choice, folder) => ({ run: async (options) => { runs.push({ folder, ...(options.rulesFromRecord === undefined ? {} : { rulesFromRecord: options.rulesFromRecord }) }); return { outcome: 'complete', output: 'ANSWER\n' }; } }),
    workingDirectory: '/private/tmp/scratch',
    lang: async () => 'en',
    thisConversation: SESSION,
  });
  assert.deepEqual(await command.execute(['--plugin']), { kind: 'completed', output: 'ANSWER\n', exitCode: EXIT_CODE.ok });
  assert.deepEqual(runs, [{ folder: '/private/tmp/scratch', rulesFromRecord: true }]);
});

// `specs/2026-11-24-talking-about-agentwhy.md` CV1, CV11.
test('an answer is asked for by its word, and as data with --json', async () => {
  const { command, runs } = whyCommand();
  await command.execute(['--session', SESSION, 'todo']);
  await command.execute(['--session', SESSION, 'summary', '--json']);
  await command.execute(['--session', SESSION, 'steps']);
  assert.deepEqual(runs.map((run) => run.choice), [{ answer: 'todo', lang: 'pl' }, { answer: 'summary', json: true, lang: 'pl' }, { view: 'steps', lang: 'pl' }]);
});

test('--json without an answer is the whole answer about the conversation, and with a view is refused before anything is read', async () => {
  const { command, runs, listed } = whyCommand();
  assert.equal((await command.execute(['--session', SESSION, 'table', '--json'])).kind, 'usage-error');
  assert.deepEqual(listed, []);
  await command.execute(['--session', SESSION, '--json']);
  assert.deepEqual(runs.map((run) => run.choice), [{ json: true, lang: 'pl' }]);
});
