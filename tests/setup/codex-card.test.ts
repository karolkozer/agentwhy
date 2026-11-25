// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import type { ServerTrialOutcome, ServerTrialRun } from '../../src/ports/server-trial.ts';
import { CodexCard } from '../../src/setup/codex-card.ts';
import { CodexMirror } from '../../src/setup/codex-mirror.ts';
import { ProjectSetup, type SetupOptions, type SetupUseCase } from '../../src/setup/project-setup.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `.ai/specs/2026-11-25-the-card-in-codex.md` CCX1-CCX6.
const ON: SetupOptions = { protect: [], remove: false, yes: true, codexCard: true };
const OFF: SetupOptions = { protect: [], remove: true, yes: true, codexCard: false };
const REFUSE: SetupOptions = { hooks: ['refuse'], protect: [], remove: false, yes: true, invoke: 'agentwhy', cardToo: true };
const ANSWERED: ServerTrialOutcome = { kind: 'answered', name: 'agentwhy' };

interface World {
  readonly config?: string;
  readonly computer?: boolean;
  readonly interactive?: boolean;
  readonly answers?: readonly number[];
  readonly trial?: ServerTrialOutcome | null;
  readonly found?: string;
  readonly version?: string;
  readonly beforeAnswer?: (path: string) => Promise<void>;
}

async function world(t: TestContext, { config, computer = true, interactive = false, answers = [], trial = ANSWERED, found = 'npx @agentwhy/cli@1.2.3', version = '1.2.3', beforeAnswer }: World = {}) {
  const home = await writeSession(t, {});
  const root = join(home, 'shop');
  await mkdir(root);
  const path = join(home, '.codex', 'config.toml');
  if (computer) await mkdir(join(home, '.codex'));
  if (config !== undefined) await writeFile(path, config);
  const files = new NodeFileSystem();
  const left = [...answers];
  const asked: string[] = [];
  const tried: ServerTrialRun[] = [];
  const chooser = { choose: async (heading: string) => { asked.push(heading); await beforeAnswer?.(path); return left.shift(); } };
  const invocation = { find: async () => found, version: async () => version };
  const shared = { files, chooser, interactive, home, invocation, codexOnThisComputer: async () => computer, trialFolder: root };
  const inner: SetupUseCase = new CodexMirror({
    ...shared,
    setup: new ProjectSetup({ files, chooser, hookChooser: { chooseMany: async () => undefined }, asker: { ask: async () => undefined }, interactive, workingDirectory: root, home, invocation }),
    workingDirectory: root,
    trial: { run: async () => ({ kind: 'ran', exitCode: 0, stderr: '' }) },
  });
  const card = new CodexCard({ ...shared, setup: inner, ...(trial === null ? {} : { serverTrial: { run: async (run) => { tried.push(run); return trial; } } }) });
  return { card, inner, asked, tried, path, read: () => readFile(path, 'utf8').catch(() => undefined) };
}

test('asked for alone it is one table, tried first, with nothing of Claude Code\'s written', async (t) => {
  const { card, tried, read } = await world(t, { config: 'model = "x"\n' });
  const result = await card.run(ON);
  assert.equal(result.outcome, 'written', result.output);
  assert.match(result.output, /its card's server {3}npx -y @agentwhy\/cli@1\.2\.3 cards[\s\S]*A small program of agentwhy's runs while a Codex conversation is open[\s\S]*the next time it starts/);
  assert.deepEqual(tried.map((one) => one.run), [['npx', '-y', '@agentwhy/cli@1.2.3', 'cards']]);
  assert.match((await read()) ?? '', /^model = "x"\n\n\[mcp_servers\.agentwhy\]\n/);
  assert.equal((await card.run(ON)).outcome, 'unchanged');
  assert.equal((await card.run(OFF)).outcome, 'written');
  assert.equal(await read(), 'model = "x"\n');
  assert.equal((await card.run(OFF)).outcome, 'unchanged');
});

test('a server that is not agentwhy\'s, says something first, or never answers is not written', async (t) => {
  for (const [trial, why] of [
    [{ kind: 'answered', name: 'other' }, /answered as other/], [{ kind: 'other' }, /something else before its answer/],
    [{ kind: 'timed-out' }, /did not answer in 30 seconds/], [{ kind: 'not-started', reason: 'spawn npx ENOENT' }, /did not start \(spawn npx ENOENT\)/], [null, /could not try/],
  ] as const) {
    const { card, read } = await world(t, { config: '', trial });
    const result = await card.run(ON);
    assert.equal(result.outcome, 'refused');
    assert.match(result.output, why);
    assert.equal(await read(), '');
  }
});

test('a table of the person\'s, and one in another form, stay as they are', async (t) => {
  for (const config of ['[mcp_servers.agentwhy]\ncommand = "node"\nargs = ["/x/cli.js", "cards"]\n', '[mcp_servers]\nagentwhy = { command = "x" }\n']) {
    const { card, tried, read } = await world(t, { config });
    for (const options of [ON, OFF, { ...REFUSE }, { protect: [], remove: false, yes: true, update: true }, { protect: [], remove: true, yes: true, codex: true, hooks: [] }] satisfies SetupOptions[]) await card.run(options);
    assert.ok((await read())?.includes(config), 'its own lines are all there');
    assert.deepEqual(tried, []);
  }
  const { card } = await world(t, { config: '[mcp_servers.agentwhy]\ncommand = "node"\n' });
  assert.match((await card.run(ON)).output, /added by you, so agentwhy left it as it is/);
  assert.match((await card.run(OFF)).output, /added by you, so it stays/);
});

test('a Codex set up for the first time gets the card with its check; one set up before does not', async (t) => {
  const first = await world(t);
  const result = await first.card.run(REFUSE);
  assert.equal(result.outcome, 'written', result.output);
  assert.match((await first.read()) ?? '', /\[mcp_servers\.agentwhy\]\n[^\n]*\ncommand = "agentwhy"\nargs = \["cards"\]/);
  assert.match(result.output, /agentwhy's check is in ~\/\.codex\/hooks\.json[\s\S]*agentwhy's card is in ~\/\.codex\/config\.toml/);

  const before = await world(t);
  await before.inner.run({ ...REFUSE, cardToo: false });
  await before.card.run(REFUSE);
  assert.doesNotMatch((await before.read()) ?? '', /mcp_servers/);

  const unnamed = await world(t);
  await unnamed.card.run({ ...REFUSE, cardToo: false });
  assert.doesNotMatch((await unnamed.read()) ?? '', /mcp_servers/, 'a yes that did not name it writes none');
});

test('a card that could not be tried leaves the check written, and says so', async (t) => {
  const { card, read } = await world(t, { trial: { kind: 'timed-out' } });
  const result = await card.run(REFUSE);
  assert.equal(result.outcome, 'written');
  assert.match(result.output, /its card was not set up/);
  assert.match((await read()) ?? '', /trusted_hash/);
  assert.doesNotMatch((await read()) ?? '', /mcp_servers/);
});

test('out of Codex is the card out too; a project\'s own remove keeps it', async (t) => {
  const { card, read } = await world(t);
  await card.run(REFUSE);
  await card.run({ protect: [], remove: true, yes: true, hooks: ['refuse'] });
  assert.match((await read()) ?? '', /mcp_servers\.agentwhy/);
  const gone = await card.run({ protect: [], remove: true, yes: true, codex: true, hooks: [] });
  assert.equal(gone.outcome, 'written', gone.output);
  assert.doesNotMatch((await read()) ?? '', /agentwhy/);
});

test('an update re-pins it, and adds none where there is none', async (t) => {
  const { card, read } = await world(t, { config: '[mcp_servers.agentwhy]\ncommand = "npx"\nargs = ["-y", "@agentwhy/cli@1.0.0", "cards"]\nstartup_timeout_sec = 30\n' });
  await card.run({ protect: [], remove: false, yes: true, update: true });
  assert.match((await read()) ?? '', /@agentwhy\/cli@1\.2\.3/);
  const none = await world(t, { config: 'a = 1\n' });
  await none.card.run({ protect: [], remove: false, yes: true, update: true });
  assert.equal(await none.read(), 'a = 1\n');
});

test('nothing is written without a yes, and the folder is never created', async (t) => {
  const quiet = await world(t, { config: '' });
  assert.equal((await quiet.card.run({ ...ON, yes: false })).outcome, 'not-confirmed');
  const no = await world(t, { config: '', interactive: true, answers: [1] });
  assert.equal((await no.card.run({ ...ON, yes: false })).outcome, 'declined');
  assert.match(no.asked[0] ?? '', /its card's server/);
  for (const one of [quiet, no]) assert.equal(await one.read(), '');
  const none = await world(t, { computer: false });
  assert.match((await none.card.run(ON)).output, /no ~\/\.codex folder/);
  await assert.rejects(stat(join(none.path, '..')));
});

test('what another program wrote meanwhile is kept', async (t) => {
  const { card, read } = await world(t, { config: 'a = 1\n', interactive: true, answers: [0], beforeAnswer: (path) => writeFile(path, 'a = 1\nb = 2\n') });
  assert.equal((await card.run({ ...ON, yes: false })).outcome, 'written');
  assert.match((await read()) ?? '', /^a = 1\nb = 2\n\n\[mcp_servers\.agentwhy\]/);
});

test('turned off in Codex it stays off until it is asked for again', async (t) => {
  const { card, read, path } = await world(t, { config: '' });
  await card.run(ON);
  await writeFile(path, `${await read()}enabled = false\n`);
  await card.run({ protect: [], remove: false, yes: true, update: true });
  assert.match((await read()) ?? '', /enabled = false/);
  assert.equal((await card.run(ON)).outcome, 'written');
  assert.doesNotMatch((await read()) ?? '', /enabled/);
});

test('a file that cannot be written is said, and no plain words no card', { skip: process.getuid?.() === 0 }, async (t) => {
  const { card, path } = await world(t, { config: 'a = 1\n' });
  await chmod(join(path, '..'), 0o500);
  const result = await card.run(ON);
  await chmod(join(path, '..'), 0o700);
  assert.equal(result.outcome, 'unwritable');
  const odd = await world(t, { config: '' });
  assert.match((await odd.card.run({ ...ON, invoke: 'node ./cli.js' })).output, /only to run agentwhy in plain words/);
});

// The review of 2026-11-25.
test('nothing is started without a yes, and a plan that asks for one names the card', async (t) => {
  const quiet = await world(t, { config: '' });
  assert.equal((await quiet.card.run({ ...ON, yes: false })).outcome, 'not-confirmed');
  assert.deepEqual(quiet.tried, []);
  const first = await world(t);
  await first.inner.run({ ...REFUSE, cardToo: false });
  await first.inner.run({ protect: [], remove: true, yes: true, codex: true, hooks: [] });
  const plan = await first.card.run({ protect: [], remove: false, yes: false, codex: true, cardToo: true, invoke: 'agentwhy' });
  if (plan.outcome === 'not-confirmed') assert.match(plan.output, /its card's server/);
});

test('a card that could not be taken out is the answer of a removal', { skip: process.getuid?.() === 0 }, async (t) => {
  const { card, path } = await world(t, { config: '' });
  await card.run(ON);
  await chmod(join(path, '..'), 0o500);
  const result = await card.run({ protect: [], remove: true, yes: true, codex: true, hooks: [] });
  await chmod(join(path, '..'), 0o700);
  assert.equal(result.outcome, 'unwritable', result.output);
});

test('turned on again is named in the plan', async (t) => {
  const { card, read, path } = await world(t, { config: '' });
  await card.run(ON);
  await writeFile(path, `${await read()}"enabled" = false\n`);
  const result = await card.run(ON);
  assert.match(result.output, /turned on again/);
  assert.doesNotMatch((await read()) ?? '', /enabled/);
});
