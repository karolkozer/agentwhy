// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SessionListing, SessionSummary } from '../../../src/core/session-catalogue.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { LocalRequest, LocalResponse } from '../../../src/ports/local-server.ts';
import type { SessionIndex } from '../../../src/report/start/session-index.ts';
import { SessionStart, type StartOptions } from '../../../src/report/start/session-start.ts';

// `.ai/specs/2026-10-14-the-page-first.md` PR1-PR8: the maintainer's switch to This computer read 613 conversations before
// it served a page, and he closed it, taking it for stuck. A served run serves once it has listed, and reads after.

const NOW = Date.parse('2026-10-14T12:00:00Z');
const DAY = 86_400_000;
const TALLY = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const SERVED: StartOptions = { since: { since: NOW - 7 * DAY, asked: '7d' }, out: '/out/run', open: false, serve: true, share: false };

/** Listed oldest first, so the order the reading takes - newest first (PRD3) - is not the listing's. */
function conversation(id: string, hoursAgo: number): SessionSummary {
  return { id, path: `/stored/project/${id}.jsonl`, modifiedAt: NOW - hoursAgo * 3_600_000, delegations: 0, provider: 'claude-code' };
}
const OLD = conversation('old', 48);
const MIDDLE = conversation('middle', 24);
const NEW = conversation('new', 1);
const LONG_AGO = conversation('long-ago', 30 * 24);

interface World {
  readonly sessions?: readonly SessionSummary[];
  /** Each report answers at once; absent, each waits until the test lets it. */
  readonly immediate?: boolean;
  /** Another folder's run, as the shell starts one (V14). */
  readonly switchTo?: (folder: string) => Promise<{ readonly url: string } | { readonly failed: string }>;
}

function world(spec: World = {}) {
  const listing: SessionListing = {
    directory: '/stored/project',
    found: true,
    searched: [{ provider: 'claude-code', directory: '/stored/project', found: true }],
    sessions: spec.sessions ?? [OLD, MIDDLE, NEW],
  };
  const started: string[] = [];
  const gates = new Map<string, () => void>();
  const rendered: SessionIndex[] = [];
  const printed: string[] = [];
  const opened: string[] = [];
  let listed = 0;
  let timeUp: () => void = () => undefined;
  const serving: { handle?: (request: LocalRequest) => Promise<LocalResponse>; close?: () => void } = {};
  const notFound = async (path: string): Promise<never> => {
    throw new FileAccessError('not-found', path);
  };
  const start = new SessionStart({
    catalogue: { list: async () => { listed += 1; return listing; } },
    report: {
      run: async (options) => {
        const id = (options.input ?? '').replace(/^.*\//, '').replace(/\.jsonl$/, '');
        started.push(id);
        if (spec.immediate !== true) await new Promise<void>((resolve) => gates.set(id, resolve));
        return { outcome: 'complete', output: '', tally: TALLY, htmlWritten: true };
      },
    },
    files: { writeText: async () => undefined, ensureDirectory: async () => undefined },
    policyFiles: {
      readText: async (path) => {
        if (path.startsWith('/out/run/')) return `<html>${path}</html>`;
        throw new FileAccessError('not-found', path);
      },
      readLines: () => { throw new Error('a policy is read whole'); },
    },
    digest: { render: () => 'DIGEST\n' },
    directories: { kindOf: notFound, list: notFound, modifiedAt: notFound },
    marks: { read: async () => ({ records: [], skipped: 0, failed: false }), append: async () => true },
    // FIRST_WAIT_MS, as the test says it passed.
    sleep: () => new Promise<void>((resolve) => { timeUp = resolve; }),
    server: {
      serve: async (handle) => {
        let stop: () => void = () => undefined;
        const closed = new Promise<void>((resolve) => { stop = resolve; });
        serving.handle = handle;
        serving.close = stop;
        return { origin: 'http://127.0.0.1:43123', closed, close: stop };
      },
    },
    printer: { write: (text: string) => { printed.push(text); } },
    token: () => 'tok',
    clock: () => NOW + 60_000,
    browser: { open: async (path) => { opened.push(path); return true; } },
    renderer: { render: (index) => { rendered.push(index); return '<!doctype html>'; } },
    titles: { recognise: async (session) => ({ title: new Redactor('test').scan(`Fix the ${session.id} build`) }) },
    workingDirectory: '/work/project',
    home: '/Users/someone',
    ...(spec.switchTo === undefined
      ? {}
      : {
          switchTo: (folder: string) => spec.switchTo?.(folder) ?? Promise.resolve({ failed: 'none' }),
          everywhere: {
            now: async () => ({ rows: [], blocked: [], told: [], codex: false }),
            setUp: async () => false,
            protect: async () => ({ outcome: 'finished' as const, results: [] }),
          },
        }),
    temporaryDirectory: '/tmp-dir',
    now: NOW,
  });
  const post = (route: string, body: object): Promise<LocalResponse> => (serving.handle as NonNullable<typeof serving.handle>)({
    method: 'POST', path: '/tok/' + route,
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return {
    start, started, rendered, printed, opened, serving, post,
    listed: () => listed,
    timeUp: () => timeUp(),
    release: (id: string) => gates.get(id)?.(),
    kinds: (index: SessionIndex | undefined) => Object.fromEntries((index?.entries ?? []).map((entry) => [entry.name, entry.report.kind])),
  };
}

/** Lets every promise and I/O callback the run has scheduled go on, until `done` says so. */
async function until(done: () => boolean): Promise<void> {
  for (let turns = 0; turns < 2_000; turns += 1) {
    if (done()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('it never happened');
}

test('PR1, PR3, PRD3: a served run serves before it has read, newest first, and writes each conversation as it is read', async () => {
  const run = world();
  const running = run.start.run(SERVED);
  await until(() => run.started.length === 1);
  assert.deepEqual(run.started, ['new'], 'the newest is read first, whatever the listing’s order');
  run.timeUp();
  await until(() => run.serving.handle !== undefined);

  const first = run.rendered.at(-1);
  assert.deepEqual(run.kinds(first), { old: 'checking', middle: 'checking', new: 'checking' }, 'every row being checked');
  assert.deepEqual(first?.reading, { read: 0, of: 3, why: 'reading' }, 'and how far the reading is (PR2)');
  assert.deepEqual(run.printed, [], 'the summary waits for the reading (PRO3)');

  run.release('new');
  await until(() => run.started.length === 2);
  assert.deepEqual(run.kinds(run.rendered.at(-1)), { old: 'checking', middle: 'checking', new: 'generated' }, 'a row read is written at once');
  assert.deepEqual(run.rendered.at(-1)?.reading, { read: 1, of: 3, why: 'reading' });
  assert.deepEqual(run.started, ['new', 'middle']);

  run.release('middle');
  await until(() => run.started.length === 3);
  run.release('old');
  await until(() => run.rendered.at(-1)?.reading === undefined && run.printed.length === 1);
  assert.deepEqual(run.kinds(run.rendered.at(-1)), { old: 'generated', middle: 'generated', new: 'generated' }, 'the last write has every row, and no line');
  run.serving.close?.();
  assert.equal((await running).outcome, 'written');
});

test('PRD1: a reading done before the wait is up serves the page whole, never as being checked', async () => {
  const run = world({ immediate: true });
  const running = run.start.run(SERVED);
  await until(() => run.serving.handle !== undefined);
  assert.deepEqual(run.kinds(run.rendered.at(-1)), { old: 'generated', middle: 'generated', new: 'generated' });
  assert.equal(run.rendered.some((index) => index.reading !== undefined || index.entries.some((entry) => entry.report.kind === 'checking')), false,
    'no page was ever drawn with a row being checked');
  assert.equal(run.printed.length, 1, 'and the summary is said as it always was');
  run.serving.close?.();
  await running;
});

test('PR5: a page’s own check during the reading is answered at once, and lists nothing', async () => {
  const run = world();
  const running = run.start.run(SERVED);
  await until(() => run.started.length === 1);
  run.timeUp();
  await until(() => run.serving.handle !== undefined);
  const listed = run.listed();
  const handle = run.serving.handle as NonNullable<typeof run.serving.handle>;

  const asked = await handle({ method: 'GET', path: '/tok/api/version/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  assert.equal(asked.status, 200, 'answered while the newest conversation is still being read');
  const page = await handle({ method: 'GET', path: '/tok/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  assert.equal(page.status, 200, 'and so is the page itself');
  assert.equal(run.listed(), listed, 'nothing was listed again');
  assert.deepEqual(run.started, ['new'], 'and the reading went on as it was');

  run.release('new');
  await until(() => run.started.length === 2);
  run.release('middle');
  await until(() => run.started.length === 3);
  run.release('old');
  await until(() => run.printed.length === 1);
  run.serving.close?.();
  await running;
});

test('PR1, F55: a write stops the reading, and the listing after it keeps what was read and reads what was asked first', async () => {
  const run = world({ sessions: [LONG_AGO, OLD, MIDDLE, NEW] });
  const running = run.start.run(SERVED);
  await until(() => run.started.length === 1);
  run.timeUp();
  await until(() => run.serving.handle !== undefined);
  assert.equal(run.kinds(run.rendered.at(-1))['long-ago'], 'outside-range');

  // F55: the person asks for the one left out. The reading stops once the conversation it is in is read.
  const included = run.post('api/include', { name: 'long-ago' });
  run.release('new');
  await until(() => run.started.length === 2);
  assert.deepEqual(run.started, ['new', 'long-ago'], 'the one asked for is read next, before the rest');
  run.release('long-ago');
  assert.equal((await included).status, 200, 'and the page is answered once it is read, the rest left to the reading');
  await until(() => run.started.length === 3);
  assert.deepEqual(run.started, ['new', 'long-ago', 'middle'], 'the one read before the write is not read again');

  run.release('middle');
  await until(() => run.started.length === 4);
  run.release('old');
  await until(() => run.rendered.at(-1)?.reading === undefined && run.printed.length === 1);
  assert.deepEqual(run.kinds(run.rendered.at(-1)), { 'long-ago': 'generated', old: 'generated', middle: 'generated', new: 'generated' });
  run.serving.close?.();
  await running;
});

test('PR8: a switch away stops the reading before the next run starts, and the run’s end stops it too', async () => {
  let startedAtSwitch = -1;
  const run = world({
    switchTo: async () => {
      startedAtSwitch = run.started.length;
      return { url: 'http://127.0.0.1:43123/other/index.html' };
    },
  });
  const running = run.start.run(SERVED);
  await until(() => run.started.length === 1);
  run.timeUp();
  await until(() => run.serving.handle !== undefined);

  const switched = run.post('api/switch-project', { id: ':computer' });
  run.release('new');
  assert.equal((await switched).status, 200);
  assert.equal(startedAtSwitch, 1, 'the conversation being read was finished, and no other begun, before the next run started');
  for (let turn = 0; turn < 50; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(run.started, ['new'], 'and none after');
  run.serving.close?.();
  assert.equal((await running).output, '', 'a run a page moved away from ends quietly (V14)');
});

test('SW10: a run asked to open one conversation waits for that one, read first, and opens its report', async () => {
  const run = world();
  const running = run.start.run({ ...SERVED, open: true, session: 'old' });
  await until(() => run.started.length === 1);
  assert.deepEqual(run.started, ['old'], 'the conversation asked for is read before every other');
  run.timeUp();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.serving.handle, undefined, 'the wait is up, and the run still waits for it');
  run.release('old');
  await until(() => run.opened.length === 1);
  assert.deepEqual(run.opened, ['http://127.0.0.1:43123/tok/old.html'], 'its report, not the index');
  await until(() => run.started.length === 2);
  run.release('new');
  await until(() => run.started.length === 3);
  run.release('middle');
  await until(() => run.printed.length === 1);
  run.serving.close?.();
  await running;
});
