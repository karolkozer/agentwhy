// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SessionListing } from '../../../src/core/session-catalogue.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { LocalRequest, LocalResponse } from '../../../src/ports/local-server.ts';
import type { OnboardingReading } from '../../../src/ports/onboarding-store.ts';
import type { SetupOptions } from '../../../src/setup/project-setup.ts';
import type { SessionIndex } from '../../../src/report/start/session-index.ts';
import { SessionStart, type StartOptions } from '../../../src/report/start/session-start.ts';
import { NoticeSettings } from '../../../src/report/watch/notice-settings.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 6: `start` writes the onboarding, opens it once, and Finish reaches it.

const NOW = Date.parse('2026-09-24T12:00:00Z');
const DAY = 86_400_000;
const TALLY = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const LISTING: SessionListing = {
  directory: '/stored/project',
  found: true,
  searched: [{ provider: 'claude-code', directory: '/stored/project', found: true }],
  sessions: [{ id: 'sess-today', path: '/stored/project/sess-today.jsonl', modifiedAt: NOW - DAY / 2, delegations: 0, provider: 'claude-code' }],
};
const EMPTY: SessionListing = { directory: '/stored/project', found: false, searched: [{ provider: 'claude-code', directory: '/stored/project', found: false }], sessions: [] };
const WEEK: StartOptions = { since: { since: NOW - 7 * DAY, asked: '7d' }, out: '/out/run', open: true, share: false };
const LOCAL_SETTINGS = '/work/project/.claude/settings.local.json';
const WATCH_INSTALLED = JSON.stringify({
  hooks: {
    SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
  },
});

interface World {
  readonly listing?: SessionListing;
  /** What the record of finished onboardings reads; absent is a person who never finished one. */
  readonly record?: Partial<OnboardingReading>;
  /** The project's own settings file, by path. */
  readonly settingsFiles?: Readonly<Record<string, string>>;
  /** Without the onboarding at all, as a run built before it existed. */
  readonly noOnboarding?: boolean;
  /** The person's home directory (`which-project` V6); `/work/project` makes the run's own folder home. */
  readonly home?: string;
  /** Where the page that switched to this run asked from (`which-project` V16); absent: no page did. */
  readonly arrivedFrom?: 'step' | 'window';
}

function startIn(world: World = {}) {
  const written: string[] = [];
  const opened: string[] = [];
  const rendered: SessionIndex[] = [];
  const printed: string[] = [];
  const recorded: number[] = [];
  const resets: number[] = [];
  const setupRuns: SetupOptions[] = [];
  const serving: { handle?: (request: LocalRequest) => Promise<LocalResponse>; close?: () => void } = {};
  const handed: string[] = [];
  const files = { ...world.settingsFiles };
  const notFound = async (path: string): Promise<never> => {
    throw new FileAccessError('not-found', path);
  };

  const start = new SessionStart({
    catalogue: { list: async () => world.listing ?? LISTING },
    report: { run: async (options) => ({ outcome: 'complete', output: `\nHTML report written to ${options.htmlPath}\n`, tally: TALLY, htmlWritten: true }) },
    files: {
      writeText: async (path) => { written.push(path); },
      ensureDirectory: async () => undefined,
    },
    policyFiles: {
      readText: async (path) => {
        if (path.startsWith('/out/run/')) return `<html>${path}</html>`;
        const text = files[path];
        if (text === undefined) throw new FileAccessError('not-found', path);
        return text;
      },
      readLines: () => { throw new Error('a policy is read whole'); },
    },
    digest: { render: () => 'DIGEST\n' },
    directories: { kindOf: notFound, list: notFound, modifiedAt: notFound },
    marks: { read: async () => ({ records: [], skipped: 0, failed: false }), append: async () => true },
    setup: {
      run: async (options: SetupOptions) => {
        setupRuns.push(options);
        // `init --watch` and `init --protect`, as far as the next read of the file can tell (R60).
        if (options.hooks?.includes('watch') === true && options.remove !== true) files[LOCAL_SETTINGS] = WATCH_INSTALLED;
        if (options.hooks?.includes('refuse') === true && options.protect.length > 0 && options.remove !== true) {
          const now = JSON.parse(files[LOCAL_SETTINGS] ?? '{}') as { hooks?: object; permissions?: { deny?: string[] } };
          files[LOCAL_SETTINGS] = JSON.stringify({
            ...now,
            hooks: { ...now.hooks, PreToolUse: [{ hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] },
            permissions: { deny: [...(now.permissions?.deny ?? []), ...options.protect.flatMap((pattern) => [`Read(${pattern})`, `Edit(${pattern})`])] },
          });
        }
        return { outcome: 'written' as const, output: 'Wrote .claude/settings.local.json.\n' };
      },
    },
    notices: new NoticeSettings({
      files: { readText: notFound, readLines: () => { throw new Error('read whole'); } },
      writer: { writeText: async () => undefined, ensureDirectory: async () => undefined },
      path: '/Users/someone/.agentwhy/notices.json',
      workingDirectory: '/work/project',
    }),
    ...(world.noOnboarding === true
      ? {}
      : {
          onboarding: {
            page: { render: () => '<!doctype html><title>welcome</title>' },
            file: 'onboarding.html',
            store: {
              read: async () => ({ here: false, anywhere: false, failed: false, ...world.record }),
              add: async (at: number) => { recorded.push(at); return true; },
              reset: async (at: number) => { resets.push(at); return true; },
              doneFor: async () => new Set<string>(),
            },
          },
        }),
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
    ...(world.home === undefined ? {} : { home: world.home }),
    ...(world.arrivedFrom === undefined ? {} : { arrivedFrom: world.arrivedFrom, handedOver: (url: string) => { handed.push(url); } }),
    temporaryDirectory: '/tmp-dir',
    now: NOW,
  });
  return { start, written, opened, rendered, printed, recorded, resets, setupRuns, serving, handed };
}

/** Runs `start` until its page is served, and hands back how to stop it. */
async function served(world: World, options: StartOptions = WEEK) {
  const run = startIn(world);
  const running = run.start.run(options);
  while (run.serving.handle === undefined || run.printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  return { ...run, stop: async () => { run.serving.close?.(); return running; } };
}

test('W23: a project nobody set up opens the onboarding in place of the index, and it is written beside the index', async () => {
  const { opened, written, rendered, printed, recorded, stop } = await served({});
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/onboarding.html']);
  assert.ok(written.includes('/out/run/onboarding.html'));
  assert.ok(written.includes('/out/run/index.html'), 'the index is written as always');
  assert.deepEqual(rendered.at(-1)?.onboarding, { intro: true }, 'W24: nobody finished one anywhere, so the intro plays');
  assert.match(printed[0] ?? '', /Serving the page at http:\/\/127\.0\.0\.1:43123\/tok\/onboarding\.html/);
  assert.match(printed[0] ?? '', /Opened the welcome page, to set agentwhy up for project\./);
  assert.deepEqual(recorded, [], 'nothing is recorded until Finish');
  assert.equal((await stop()).outcome, 'written');
});

test('W23, W24: a project whose onboarding was finished opens the index; the page is still served, without its intro', async () => {
  const { opened, written, rendered, stop } = await served({ record: { here: true, anywhere: true } });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.ok(written.includes('/out/run/onboarding.html'), 'W25: Settings can lead back to it');
  assert.deepEqual(rendered.at(-1)?.onboarding, { intro: false });
  await stop();

  const other = await served({ record: { anywhere: true } });
  assert.deepEqual(other.opened, ['http://127.0.0.1:43123/tok/onboarding.html'], 'a second project opens it too');
  assert.deepEqual(other.rendered.at(-1)?.onboarding, { intro: false }, 'N2: and the intro played in the first');
  await other.stop();
});

test('W23: a record that cannot be read is not a first time - the index opens, and nothing is written to the record', async () => {
  const { opened, recorded, stop } = await served({ record: { failed: true } });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.deepEqual(recorded, []);
  await stop();
});

test('N6: a project whose watch hook runs was set up before this page existed - the index opens, and it is recorded once', async () => {
  const { opened, recorded, stop } = await served({ settingsFiles: { [LOCAL_SETTINGS]: WATCH_INSTALLED } });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.deepEqual(recorded, [NOW + 60_000]);
  await stop();

  const unknown = await served({ settingsFiles: { [LOCAL_SETTINGS]: 'not json' } });
  assert.deepEqual(unknown.opened, ['http://127.0.0.1:43123/tok/index.html'], 'what runs is not known: nothing opened');
  assert.deepEqual(unknown.recorded, [], 'and nothing recorded');
  await unknown.stop();
});

test('W1: a page not opened, a shared page, or one asked not to be served never writes or opens the onboarding', async () => {
  for (const options of [{ ...WEEK, open: false }, { ...WEEK, share: true }, { ...WEEK, serve: false }]) {
    const { start, written, opened, rendered } = startIn({});
    await start.run(options);
    assert.ok(!written.includes('/out/run/onboarding.html'), JSON.stringify(options));
    assert.ok(opened.every((path) => !path.endsWith('onboarding.html')));
    assert.equal(rendered.at(-1)?.onboarding, undefined);
  }
  const before = startIn({ noOnboarding: true });
  const running = before.start.run(WEEK);
  while (before.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(before.opened, ['http://127.0.0.1:43123/tok/index.html'], 'a run built without it is the run it always was');
  before.serving.close?.();
  await running;
});

// `the-address-opens-the-welcome` AW1-AW5: the run an AI app is asked for (`--no-open --serve`) hands its address to a
// person, so the address names the page a browser would have shown. The bug this replaces: in no app did the onboarding open.
const ADDRESS: StartOptions = { ...WEEK, open: false, serve: true };

test('AW1, AW3: asked to serve and not to open, a project nobody set up prints the onboarding’s address', async () => {
  const { opened, written, printed, recorded, stop } = await served({}, ADDRESS);
  assert.deepEqual(opened, [], 'nothing is opened');
  assert.ok(written.includes('/out/run/onboarding.html'));
  assert.match(printed[0] ?? '', /Serving the page at http:\/\/127\.0\.0\.1:43123\/tok\/onboarding\.html$/m);
  assert.match(printed[0] ?? '', /That address opens the welcome page, to set agentwhy up for project\./);
  assert.doesNotMatch(printed[0] ?? '', /Opened the welcome page/, 'nobody opened it');
  assert.deepEqual(recorded, [], 'AW4: printing the address records nothing');
  assert.equal((await stop()).outcome, 'written');
});

test('AW1: asked to serve and not to open, a project set up, finished or unread prints the index’s address, as before', async () => {
  const cases: ReadonlyArray<readonly [World, readonly number[]]> = [
    [{ settingsFiles: { [LOCAL_SETTINGS]: WATCH_INSTALLED } }, [NOW + 60_000]],
    [{ record: { here: true, anywhere: true } }, []],
    [{ record: { failed: true } }, []],
  ];
  for (const [world, recordedThen] of cases) {
    const run = await served(world, ADDRESS);
    assert.match(run.printed[0] ?? '', /Serving the page at http:\/\/127\.0\.0\.1:43123\/tok\/index\.html$/m, JSON.stringify(world));
    assert.doesNotMatch(run.printed[0] ?? '', /welcome page/);
    assert.deepEqual(run.recorded, recordedThen, 'AW4, N6: a project set up is recorded once, whichever address is printed');
    await run.stop();
  }
});

test('AW2: asked to serve and not to open, an empty project serves nothing and says what it said before', async () => {
  const run = startIn({ listing: EMPTY });
  const result = await run.start.run(ADDRESS);
  assert.equal(result.outcome, 'no-sessions');
  assert.match(result.output, /or run agentwhy init now/);
  assert.equal(run.serving.handle, undefined, 'no page is served');
  assert.deepEqual([run.opened, run.written, run.recorded], [[], [], []]);
});

test('AW5: asked to serve and not to open, the home directory prints the project step where it has conversations', async () => {
  const { opened, printed, recorded, stop } = await served({ home: '/work/project' }, ADDRESS);
  assert.deepEqual(opened, []);
  assert.match(printed[0] ?? '', /Serving the page at http:\/\/127\.0\.0\.1:43123\/tok\/onboarding\.html$/m);
  assert.deepEqual(recorded, [], 'V7: nothing in home is recorded');
  await stop();

  const empty = startIn({ listing: EMPTY, home: '/work/project' });
  const result = await empty.start.run(ADDRESS);
  assert.equal(result.outcome, 'no-sessions');
  assert.match(result.output, /You started agentwhy in your home folder/, 'and with none, what it said before');
  assert.equal(empty.serving.handle, undefined);
});

test('W15, W22: Finish is served - it installs watch through the setup Settings uses, then keeps the record', async () => {
  const { serving, setupRuns, recorded, written, stop } = await served({});
  const before = written.filter((path) => path === '/out/run/index.html').length;
  const answer = await serving.handle?.({
    method: 'POST',
    path: '/tok/api/onboarding',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true }),
  });
  assert.equal(answer?.status, 200, answer?.body);
  assert.deepEqual(JSON.parse(answer?.body ?? '{}').results.map((result: { change: string; written: boolean }) => [result.change, result.written]), [['watch', true], ['protect', true]]);
  assert.deepEqual(setupRuns.map((options) => [options.hooks, options.target, options.yes, options.protect.length]), [[['watch'], 'local', true, 0], [['refuse'], 'local', true, 6]],
    'KD2: every row starts on Block, so its rules are written with search protection - Settings\u2019 add');
  assert.deepEqual(recorded, [NOW + 60_000]);
  assert.ok(written.filter((path) => path === '/out/run/index.html').length > before, 'every page is read again');
  await stop();
});

test('W1a: a project with no conversations yet opens the onboarding - its reader cannot run init', async () => {
  const { opened, written, printed, stop } = await served({ listing: EMPTY });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/onboarding.html']);
  assert.ok(written.includes('/out/run/onboarding.html'));
  assert.ok(written.includes('/out/run/index.html'), 'the pages it leads to are written, with nothing in them');
  assert.match(printed[0] ?? '', /There are no AI chats in project yet\./, 'the folder by name (which-project V3)');
  assert.doesNotMatch(printed[0] ?? '', /agentwhy init|0 reports/);
  assert.equal((await stop()).outcome, 'written');
});

// R60 in a project with no conversations yet: the pages Done leads to show what Finish wrote, not what was there before.
test('W1a: Finish in an empty project draws every page again from the files as they are now', async () => {
  const { serving, rendered, setupRuns, stop } = await served({ listing: EMPTY });
  assert.equal(rendered.at(-1)?.settings?.hooks?.watch, false);
  assert.deepEqual(rendered.at(-1)?.settings?.mine ?? {}, {});
  const answer = await serving.handle?.({
    method: 'POST',
    path: '/tok/api/onboarding',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true }),
  });
  assert.equal(answer?.status, 200, answer?.body);
  const settings = rendered.at(-1)?.settings;
  assert.equal(settings?.hooks?.watch, 'local', 'the hook Finish installed is on in Settings');
  // block-means-blocked: a row is blocked by its deny rules and `refuse` both, and Settings now sees both.
  assert.equal(settings?.hooks?.refuse, 'local', 'the search protection Finish installed is on in Settings');
  const blocked = setupRuns.find((options) => options.hooks?.includes('refuse') === true)?.protect ?? [];
  assert.ok(blocked.length > 0, 'Finish blocked the rows it started on (KD2)');
  assert.deepEqual(Object.values(settings?.mine ?? {}).map((one) => [one.rule, one.file]).sort(), blocked.map((rule) => [rule, 'local']).sort(),
    'every rule Finish wrote is in Settings, from this project’s file');
  assert.deepEqual(rendered.at(-1)?.entries, [], 'and there is still nothing to list');
  await stop();
});

test('W1a: once set up, an empty project says so with no command; asked not to open a page, it keeps R28', async () => {
  const done = startIn({ listing: EMPTY, record: { here: true, anywhere: true } });
  const result = await done.start.run(WEEK);
  assert.equal(result.outcome, 'no-sessions');
  assert.equal(result.output, 'You\'re set up. There are no AI chats in project yet. Work with your AI here, then run agentwhy again.\n');
  assert.deepEqual([done.written, done.opened], [[], []]);

  for (const options of [{ ...WEEK, open: false }, { ...WEEK, serve: false }, { ...WEEK, share: true }]) {
    const flagged = await startIn({ listing: EMPTY }).start.run(options);
    assert.equal(flagged.outcome, 'no-sessions');
    assert.match(flagged.output, /or run agentwhy init now/, JSON.stringify(options));
  }
});

// W25a: an uninstall that went through resets this project's onboarding, so the next run offers the setup again.
test('W25a: Uninstall, once written, resets the onboarding\u2019s record; a refused one does not', async () => {
  const { serving, resets, stop } = await served({ record: { here: true, anywhere: true }, settingsFiles: { [LOCAL_SETTINGS]: WATCH_INSTALLED } });
  const post = (body: object) => serving.handle?.({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal((await post({ change: 'uninstall', rules: {} }))?.status, 400, 'a body naming no file is refused');
  assert.deepEqual(resets, []);
  const answer = await post({ change: 'uninstall', rules: { local: [] } });
  assert.equal(answer?.status, 200, answer?.body);
  assert.deepEqual(resets, [NOW + 60_000]);
  await stop();
});

// which-project V7: in the home directory the onboarding opens at its project step, whatever the record says - and nothing
// there is set up or recorded. The bug this replaces: it reached Finish only to be refused, and wrote a `done` line for home.
test('V7: in the home directory the onboarding opens to pick a project; Finish is not served, and nothing is recorded', async () => {
  const { opened, rendered, recorded, setupRuns, serving, stop } = await served({ listing: EMPTY, home: '/work/project' });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/onboarding.html']);
  assert.equal(rendered.at(-1)?.notAProject, 'home');
  assert.deepEqual(rendered.at(-1)?.onboarding, { intro: true }, 'someone who never finished one meets the welcome first');
  const finish = await serving.handle?.({
    method: 'POST',
    path: '/tok/api/onboarding',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true }),
  });
  assert.notEqual(finish?.status, 200, 'nothing can be set up for home');
  assert.deepEqual([recorded, setupRuns], [[], []]);
  await stop();

  const before = await served({ listing: EMPTY, home: '/work/project', record: { anywhere: true } });
  assert.deepEqual(before.rendered.at(-1)?.onboarding, { intro: false, atProject: true }, 'someone who has been through it goes straight to the step');
  await before.stop();
  const unread = await served({ listing: EMPTY, home: '/work/project', record: { failed: true } });
  assert.deepEqual(unread.rendered.at(-1)?.onboarding, { intro: false, atProject: true }, 'a record that cannot be read is not a first time');
  await unread.stop();
});

test('V7: in the home directory with conversations, and where watch runs, it opens there too, and records nothing', async () => {
  const { opened, recorded, stop } = await served({ home: '/work/project', settingsFiles: { [LOCAL_SETTINGS]: WATCH_INSTALLED }, record: { here: true, anywhere: true } });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/onboarding.html'], 'whatever the record says: no project is being shown');
  assert.deepEqual(recorded, [], 'a watch hook in home records no project as set up');
  await stop();
});

test('V7: asked not to open a page, the home directory is said where to go, as before', async () => {
  const home = startIn({ listing: EMPTY, home: '/work/project' });
  const result = await home.start.run({ ...WEEK, open: false });
  assert.equal(result.outcome, 'no-sessions');
  assert.equal(result.output, 'You started agentwhy in your home folder, which isn\'t a project. Open your project\'s folder in your code editor\'s terminal, and run agentwhy there.\n');
  assert.deepEqual([home.opened, home.written, home.recorded, home.setupRuns], [[], [], [], []]);
});

/** A run a page switched to, until it hands its address over; and how to stop it. */
async function handedOver(world: World) {
  const run = startIn(world);
  const running = run.start.run(WEEK);
  while (run.handed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  return { ...run, stop: async () => { run.serving.close?.(); return running; } };
}

// which-project V16: the page a switched-to run opens is decided by where the page asked from.
test('V16: from the project step, the chosen project\'s onboarding opens at Who - set up before or not, with chats or none', async () => {
  for (const world of [{}, { record: { here: true, anywhere: true } }, { listing: EMPTY, record: { here: true, anywhere: true } }] satisfies World[]) {
    const run = await handedOver({ ...world, arrivedFrom: 'step' });
    assert.deepEqual([run.handed, run.opened], [['http://127.0.0.1:43123/tok/onboarding.html#who'], []], JSON.stringify(world));
    await run.stop();
  }
});

test('V16: from the window, W23 decides - a project nobody set up opens at Who, one set up at its conversations', async () => {
  const fresh = await handedOver({ arrivedFrom: 'window' });
  assert.deepEqual(fresh.handed, ['http://127.0.0.1:43123/tok/onboarding.html#who']);
  await fresh.stop();
  const set = await handedOver({ arrivedFrom: 'window', record: { here: true, anywhere: true } });
  assert.deepEqual(set.handed, ['http://127.0.0.1:43123/tok/index.html']);
  await set.stop();
});

// N6 widened (which-project V10, the maintainer 2026-09-28): a project that blocks files was set up, and is not offered it again.
test('a project whose settings block files opens its index, not the onboarding, and is recorded as set up', async () => {
  const { opened, recorded, stop } = await served({ settingsFiles: { '/work/project/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./.env*)'] } }) } });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.equal(recorded.length, 1);
  await stop();
});
