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
}

function detachedIn(world: World) {
  const opened: string[] = [];
  const started: (readonly string[])[] = [];
  const asFiles: StartOptions[] = [];
  let reads = 0;
  let asked = 0;
  let now = NOW;
  const detached = new DetachedStart({
    servers: {
      read: async () => world.records[Math.min(reads++, world.records.length - 1)],
      write: async () => undefined,
      remove: async () => undefined,
    },
    probe: { answers: async (url) => world.answering.includes(url) },
    background: {
      start: async (args) => (started.push(args), world.pid),
      running: () => world.endsAfter === undefined || ++asked <= world.endsAfter,
    },
    browser: { open: async (url) => (opened.push(url), true) },
    project: '-work-project',
    files: { run: async (options) => (asFiles.push(options), { outcome: 'written', output: 'Opened: /tmp/run/sess-1.html\n' }) },
    sleep: async (ms) => { now += ms; },
    clock: () => now,
  });
  return { detached, opened, started, asFiles, waited: () => now - NOW, reads: () => reads };
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
