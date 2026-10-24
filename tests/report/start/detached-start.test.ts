// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { PageServerRecord } from '../../../src/ports/page-server.ts';
import { DetachedStart } from '../../../src/report/start/detached-start.ts';
import type { StartOptions } from '../../../src/report/start/session-start.ts';

// `2026-10-02-a-page-not-a-file.md` PF3-PF5: the pages served from the background, from a command that returns at once.
const NOW = Date.parse('2026-10-02T12:00:00Z');
const OPTIONS: StartOptions = { since: { since: NOW - 7 * 86_400_000, asked: '7d' }, open: true, share: false, session: 'sess-1', quiet: true };
const RUNNING: PageServerRecord = { url: 'http://127.0.0.1:43123/tok/', pid: 4242, startedAt: NOW - 60_000 };
const STARTED: PageServerRecord = { url: 'http://127.0.0.1:43999/new/', pid: 5151, startedAt: NOW };

interface World {
  /** The record as it is read, one after another; the last stays. */
  readonly records: readonly (PageServerRecord | undefined)[];
  /** The pages that answer. */
  readonly answering: readonly string[];
  /** The pid a background start gives, or none. */
  readonly pid?: number;
  /** How many times the process started is asked about before it has ended; never, where absent. */
  readonly endsAfter?: number;
  /** W23 for this project, where the run can name the onboarding at all; absent, it is not wired (an older run). */
  readonly welcome?: boolean;
  /** PF7: this agentwhy's own version; `null` wires a run that knows none, absent wires no version at all. */
  readonly own?: string | null;
}

function detachedIn(world: World) {
  const opened: string[] = [];
  const started: (readonly string[])[] = [];
  const asFiles: StartOptions[] = [];
  let reads = 0;
  let asked = 0;
  let decided = 0;
  let now = NOW;
  const detached = new DetachedStart({
    servers: {
      read: async () => world.records[Math.min(reads++, world.records.length - 1)],
      write: async () => undefined,
      remove: async () => undefined,
    },
    // As `NodePageProbe` answers: the door (AP19) answers with a 302, which counts only where the caller says it does.
    probe: { answers: async (url, redirect) => world.answering.includes(url) && (!/\/open(\/|$)/.test(url) || redirect === 'counts') },
    background: {
      start: async (args) => (started.push(args), world.pid),
      running: () => world.endsAfter === undefined || ++asked <= world.endsAfter,
    },
    browser: { open: async (url) => (opened.push(url), true) },
    project: '-work-project',
    files: { run: async (options) => (asFiles.push(options), { outcome: 'written', output: 'Opened: /tmp/run/sess-1.html\n' }) },
    sleep: async (ms) => { now += ms; },
    clock: () => now,
    ...(world.own === undefined ? {} : { version: async () => world.own ?? undefined }),
    ...(world.welcome === undefined
      ? {}
      : { welcome: { file: 'onboarding.html', project: 'work project', opens: async () => (decided++, world.welcome === true) } }),
  });
  return { detached, opened, started, asFiles, waited: () => now - NOW, reads: () => reads, decided: () => decided };
}

test('a server already running for the project is used, and nothing else is started', async () => {
  const { detached, opened, started } = detachedIn({
    records: [RUNNING],
    answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`],
  });

  const result = await detached.run(OPTIONS);

  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/sess-1.html']);
  assert.deepEqual(started, []);
  assert.equal(result.output, 'Opened: http://127.0.0.1:43123/tok/sess-1.html\n');
});

test('a record whose server no longer answers is passed over: one is started in the background and waited for', async () => {
  const { detached, opened, started } = detachedIn({
    records: [RUNNING, undefined, STARTED],
    answering: [`${STARTED.url}index.html`, `${STARTED.url}sess-1.html`],
    pid: STARTED.pid,
  });

  const result = await detached.run(OPTIONS);

  assert.deepEqual(started, [['start', '--serve', '--no-open', '--since', '7d', '--session', 'sess-1']]);
  assert.deepEqual(opened, ['http://127.0.0.1:43999/new/sess-1.html']);
  assert.equal(result.output, 'Opened: http://127.0.0.1:43999/new/sess-1.html\n');
});

test('a server that never comes up - a sandbox - leaves the pages as files, and says what would serve them', async () => {
  for (const pid of [STARTED.pid, undefined]) {
    const { detached, opened, asFiles } = detachedIn({ records: [undefined], answering: [], ...(pid === undefined ? {} : { pid }) });

    const result = await detached.run(OPTIONS);

    assert.deepEqual(opened, [], 'nothing opened by this run; the file run opens its own');
    assert.deepEqual(asFiles.map((options) => options.serve), [false]);
    assert.match(result.output, /^agentwhy could not keep running in the background here, so the pages were written as files\. To open them live, run this command again outside the sandbox, or type npx @agentwhy\/cli in a terminal\.\nOpened: \/tmp\/run\/sess-1\.html\n$/);
  }
});

// Found by review: 10 s was shorter than a first build of a project with many conversations.
test('a server still starting is waited for while its process runs', async () => {
  const records: (PageServerRecord | undefined)[] = [undefined, ...Array<undefined>(80), STARTED];
  const { detached, opened, waited } = detachedIn({ records, answering: [`${STARTED.url}index.html`], pid: STARTED.pid });

  await detached.run(OPTIONS);

  assert.deepEqual(opened, [`${STARTED.url}index.html`]);
  assert.ok(waited() > 10_000, `waited ${waited()} ms`);
});

// A sandbox or a refused port ends the process: nothing will serve, so nothing is waited for.
test('a process that ended is not waited for: the pages are files at once', async () => {
  const { detached, asFiles, waited, reads } = detachedIn({ records: [undefined], answering: [], pid: STARTED.pid, endsAfter: 2 });

  await detached.run(OPTIONS);

  assert.deepEqual(asFiles.map((options) => options.serve), [false]);
  assert.equal(waited(), 500);
  assert.equal(reads(), 4, 'the record read once before the start, and once a check while it ran');
});

test('a conversation the server does not serve opens every conversation, and says so', async () => {
  const { detached, opened } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`] });

  const result = await detached.run(OPTIONS);

  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.equal(result.output, 'That conversation was not found here, so all conversations were opened: http://127.0.0.1:43123/tok/index.html\n');
});

// Found by review: only the opened line said it. Served or typed at a terminal, the index address alone reads as
// the conversation's own report.
test('a conversation the server does not serve is said where nothing was opened, quiet or not', async () => {
  const { detached } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`] });
  const notOpened = await detached.run({ ...OPTIONS, open: false });
  assert.equal(notOpened.output, 'That conversation was not found here, so all conversations are served.\n' +
    'Serving: http://127.0.0.1:43123/tok/index.html\n');

  const { detached: again } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`] });
  const typed = await again.run({ ...OPTIONS, quiet: false });
  assert.equal(typed.output, 'That conversation was not found here, so all conversations are served.\n' +
    'agentwhy was already running for this project: http://127.0.0.1:43123/tok/index.html\n' +
    'It stops by itself 30 minutes after its last page is closed.\n');
});

test('typed at a terminal, it says where the page is and that it stops by itself', async () => {
  const { detached } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`] });

  const { session: _session, ...everyConversation } = OPTIONS;
  const result = await detached.run({ ...everyConversation, quiet: false });

  assert.equal(result.output, 'agentwhy was already running for this project: http://127.0.0.1:43123/tok/index.html\n' +
    'It stops by itself 30 minutes after its last page is closed.\n');
});

// `2026-10-01-the-address-opens-the-welcome.md` AW1, extended to `--detach` on 2026-10-04 after the maintainer found
// that every AI app reaching for a link - Codex, the Claude desktop app, Claude Code at a terminal - was sent to
// Conversations in a project nobody had set up, so the onboarding never opened anywhere but a person's own terminal.
const { session: _asked, ...EVERY_CONVERSATION } = OPTIONS;

test('in a project nobody set up, the address names the welcome, on a server started now or already running', async () => {
  for (const world of [
    { records: [undefined, STARTED], answering: [`${STARTED.url}index.html`], pid: STARTED.pid, base: STARTED.url },
    { records: [RUNNING], answering: [`${RUNNING.url}index.html`], base: RUNNING.url },
  ]) {
    const { base, ...records } = world;
    const { detached, opened } = detachedIn({ ...records, welcome: true });

    const result = await detached.run({ ...EVERY_CONVERSATION, quiet: false });

    assert.deepEqual(opened, [`${base}onboarding.html`]);
    assert.match(result.output, new RegExp(`: ${base}onboarding\\.html\\n`));
    assert.match(result.output, /\nOpened the welcome page, to set agentwhy up for work project\.\n/);
  }
});

// The decision is the project's now, not the record's: a server started before the person ran `init` would otherwise
// go on sending them to a setup they have already done.
test('a reused server is not taken at its word: W23 is asked again for this run', async () => {
  const { detached, opened, decided } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`], welcome: false });

  const result = await detached.run({ ...EVERY_CONVERSATION, quiet: false });

  assert.equal(decided(), 1);
  assert.deepEqual(opened, [`${RUNNING.url}index.html`]);
  assert.equal(result.output, 'agentwhy was already running for this project: http://127.0.0.1:43123/tok/index.html\n' +
    'It stops by itself 30 minutes after its last page is closed.\n');
});

// SW10: the person said yes to that report. A setup nobody asked for never takes its place.
test('a conversation asked for wins over the welcome, and is not even asked about', async () => {
  const { detached, opened, decided } = detachedIn({
    records: [RUNNING],
    answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`],
    welcome: true,
  });

  const result = await detached.run(OPTIONS);

  assert.equal(decided(), 0);
  assert.deepEqual(opened, [`${RUNNING.url}sess-1.html`]);
  assert.equal(result.output, 'Opened: http://127.0.0.1:43123/tok/sess-1.html\n');
});

// AW3: an address nobody opened is not said to have been opened. SW11: `--quiet` says where the page is, and no more.
test('the welcome address is said as served where no browser opened it, and plainly under --quiet', async () => {
  const { detached, opened } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`], welcome: true });
  const served = await detached.run({ ...EVERY_CONVERSATION, open: false, quiet: false });
  assert.deepEqual(opened, []);
  assert.equal(served.output, 'agentwhy was already running for this project: http://127.0.0.1:43123/tok/onboarding.html\n' +
    'That address opens the welcome page, to set agentwhy up for work project.\n' +
    'It stops by itself 30 minutes after its last page is closed.\n');

  const { detached: quietly } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`], welcome: true });
  const quiet = await quietly.run({ ...EVERY_CONVERSATION, open: false });
  assert.equal(quiet.output, 'Serving: http://127.0.0.1:43123/tok/onboarding.html\n');
});

// `2026-10-15-agentwhy-as-a-plugin.md` AP19, AP7: the address handed over for the setup is the door, and `--setup-first`
// puts the setup before the conversation named. A server an older agentwhy started has no door, and gets the page.
const NO_SESSION: StartOptions = { since: OPTIONS.since, open: true, share: false, quiet: true };

test('AP19: the setup to open, on a server with the door - the door is handed over, not the onboarding\'s page', async () => {
  const { detached, opened } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`, `${RUNNING.url}open`], welcome: true });

  const result = await detached.run(NO_SESSION);

  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/open']);
  assert.match(result.output, /http:\/\/127\.0\.0\.1:43123\/tok\/open\n/);
});

test('AP19: a server an older agentwhy started answers no door - the onboarding\'s page is handed over, as before', async () => {
  const { detached, opened } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`], welcome: true });

  await detached.run(NO_SESSION);

  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/onboarding.html']);
});

test('AP7: --setup-first puts the setup before the conversation named, and gives way to it once the project is set up', async () => {
  const answering = [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`, `${RUNNING.url}open/sess-1`];

  const setup = detachedIn({ records: [RUNNING], answering, welcome: true });
  const first = await setup.detached.run({ ...OPTIONS, setupFirst: true });
  assert.deepEqual(setup.opened, ['http://127.0.0.1:43123/tok/open/sess-1'], 'the door, which leads to the conversation once the setup is done');
  assert.doesNotMatch(first.output, /not found/);

  const setUp = detachedIn({ records: [RUNNING], answering, welcome: false });
  await setUp.detached.run({ ...OPTIONS, setupFirst: true });
  assert.deepEqual(setUp.opened, ['http://127.0.0.1:43123/tok/sess-1.html'], 'set up: the conversation itself');

  const offered = detachedIn({ records: [RUNNING], answering, welcome: true });
  await offered.detached.run(OPTIONS);
  assert.deepEqual(offered.opened, ['http://127.0.0.1:43123/tok/sess-1.html'], 'without it, SW10 as before: the report the person said yes to');
});

test('AP7: --setup-first with a conversation this server does not serve still opens the setup, and says nothing of it missing', async () => {
  const { detached, opened } = detachedIn({ records: [RUNNING], answering: [`${RUNNING.url}index.html`, `${RUNNING.url}open/sess-1`], welcome: true });

  const result = await detached.run({ ...OPTIONS, setupFirst: true, open: false });

  assert.deepEqual(opened, []);
  assert.equal(result.output, 'Serving: http://127.0.0.1:43123/tok/open/sess-1\n');
});

// `2026-10-15-agentwhy-as-a-plugin.md` AP13: the server the plugin starts is the plugin's, and its pages say so.
test('AP13: a server started for the plugin is started with --plugin', async () => {
  const { detached, started } = detachedIn({
    records: [undefined, STARTED],
    answering: [`${STARTED.url}index.html`, `${STARTED.url}sess-1.html`],
    pid: STARTED.pid,
  });
  await detached.run({ ...OPTIONS, plugin: true });
  assert.deepEqual(started, [['start', '--serve', '--no-open', '--since', '7d', '--session', 'sess-1', '--plugin']]);
});

// `2026-10-02-a-page-not-a-file.md` PF7, PFD5: only a server of this agentwhy is handed over. Measured 2026-10-24 (PFB2):
// after an update, `/agentwhy:report` handed over a 0.4.2 server's pages to a 0.4.3 plugin.
test('PF7: a running server of this version is reused, and nothing is started', async () => {
  const { detached, opened, started } = detachedIn({
    records: [{ ...RUNNING, version: '0.4.3' }],
    answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`],
    own: '0.4.3',
  });
  await detached.run(OPTIONS);
  assert.deepEqual([started, opened], [[], ['http://127.0.0.1:43123/tok/sess-1.html']]);
});

test('PF7: a running server of another version, or of none, is passed over: one of this version is started and handed over', async () => {
  for (const older of [{ ...RUNNING, version: '0.4.2' }, RUNNING]) {
    const { detached, opened, started } = detachedIn({
      // Read first, the older record; then the started server's own, by its pid (PF3).
      records: [older, older, { ...STARTED, version: '0.4.3' }],
      answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`, `${STARTED.url}index.html`, `${STARTED.url}sess-1.html`],
      pid: STARTED.pid,
      own: '0.4.3',
    });
    const result = await detached.run(OPTIONS);
    assert.deepEqual(started, [['start', '--serve', '--no-open', '--since', '7d', '--session', 'sess-1']], JSON.stringify(older));
    assert.deepEqual(opened, ['http://127.0.0.1:43999/new/sess-1.html'], 'the older server, though it answers, is not handed over');
    assert.equal(result.output, 'Opened: http://127.0.0.1:43999/new/sess-1.html\n');
  }
});

test('PF7: a run that knows no version of its own reuses the running server, as before', async () => {
  for (const own of [null, undefined]) {
    const { detached, started } = detachedIn({
      records: [{ ...RUNNING, version: '0.4.2' }],
      answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`],
      ...(own === undefined ? {} : { own }),
    });
    await detached.run(OPTIONS);
    assert.deepEqual(started, [], String(own));
  }
});

// PF7 as amended after the review of 2026-10-24: a newer release is handed over too, so a hook pinned to an earlier one
// never starts an older server beside it; an older release, or a version that is no release, is passed over.
test('PF7: a running server of a newer release is reused; of an older one, or of another build, a server is started', async () => {
  const reused = async (theirs: string, own: string): Promise<boolean> => {
    const { detached, started } = detachedIn({
      records: [{ ...RUNNING, version: theirs }, { ...RUNNING, version: theirs }, { ...STARTED, version: own }],
      answering: [`${RUNNING.url}index.html`, `${RUNNING.url}sess-1.html`, `${STARTED.url}index.html`, `${STARTED.url}sess-1.html`],
      pid: STARTED.pid,
      own,
    });
    await detached.run(OPTIONS);
    return started.length === 0;
  };
  assert.equal(await reused('0.5.0', '0.4.3'), true, 'a newer release');
  assert.equal(await reused('0.4.10', '0.4.3'), true, 'compared as numbers, not as text');
  assert.equal(await reused('0.4.2', '0.4.3'), false, 'an older release');
  assert.equal(await reused('0.0.0-dev', '0.4.3'), false, 'a build that is no release, against a release');
  assert.equal(await reused('0.5.0', '0.0.0-dev'), false, 'a release, against a build that is no release');
});
