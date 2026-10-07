// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SessionListing, SessionSummary } from '../../../src/core/session-catalogue.ts';
import type { Policy } from '../../../src/core/policy/policy.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';
import type { MarkRecord } from '../../../src/ports/mark-store.ts';
import type { ProjectSummary } from '../../../src/core/project-catalogue.ts';
import type { ComputerScope } from '../../../src/ports/computer-view.ts';
import type { PlaceChooser } from '../../../src/ports/place-chooser.ts';
import { projectDirectoryName } from '../../../src/adapter/claude-code/contract/projects.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { LocalRequest, LocalResponse } from '../../../src/ports/local-server.ts';
import type { OnboardingReading } from '../../../src/ports/onboarding-store.ts';
import type { SetupOptions } from '../../../src/setup/project-setup.ts';
import type { IndexEverywhere, SessionIndex } from '../../../src/report/start/session-index.ts';
import type { EverywhereChoices } from '../../../src/report/start/onboarding/everywhere.ts';
import { SessionStart, type GeneratedReport, type StartOptions } from '../../../src/report/start/session-start.ts';
import { ReportShelf } from '../../../src/report/start/report-shelf.ts';
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
  /** The computer-wide path (`protected-everywhere` G7-G10); absent: a run built before it existed. */
  readonly everywhere?: boolean;
  /** Another folder's run, as the shell starts one (which-project V14); absent: this run cannot switch. */
  readonly switchTo?: (folder: string, since: string, from: 'step' | 'window') => Promise<{ readonly url: string } | { readonly failed: string }>;
  /** Every project's conversations (`everything-on-this-computer` step 2, G11), and each project's told lists (GD17). */
  readonly every?: readonly SessionSummary[];
  /** What each report read, by its input; absent: nothing private. */
  readonly actionsFor?: (input: string) => SessionActions;
  /** Each project's own record of marks, by folder (GD18). */
  readonly projectMarks?: Readonly<Record<string, readonly MarkRecord[]>>;
  /** The person's projects, as the window lists them (V9), and the folders taken off the list (RM6). */
  readonly projects?: readonly ProjectSummary[];
  readonly removed?: readonly string[];
  /** GD21: the computer's page's choice as kept; absent: the page offers none. */
  readonly view?: { scope: ComputerScope | undefined };
  /** A clock that only moves forward (live-pages L4); absent: none, and every ask is a refresh. */
  readonly elapsed?: () => number;
  /** GD26: the computer's own record, and whether anything of its setup is there; absent: a run built before them. */
  readonly computerRecord?: { here: boolean };
  readonly computerSetUp?: boolean;
  /** The reports of the process, shared by its runs (V14, amended 2026-10-07). */
  readonly shelf?: ReportShelf<GeneratedReport>;
  /** GD32: a setup and told lists for another project, each recording what it was asked to write. */
  readonly elsewhere?: boolean;
  /** a-file-in-its-place IP2: the system's window for places, answering what the test says. */
  readonly placeChooser?: PlaceChooser;
}

/** What the computer-wide path reads, as a home with nothing set up holds it. */
const NOTHING_EVERYWHERE: IndexEverywhere = {
  rows: [{ id: 'ssh', kind: 'folder', path: '.ssh', pattern: '**/.ssh/**', present: true }],
  blocked: [],
  told: [],
  codex: false,
};

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
  const everywhere: EverywhereChoices[] = [];
  const reports: { readonly input: string; readonly policy: Policy | undefined; readonly marks: ReadonlyMap<string, string> | undefined; readonly project: string | undefined }[] = [];
  const appended: string[] = [];
  const kept = new Map<string, MarkRecord[]>();
  const computerLines: [string, number][] = [];
  const setupElsewhere: [string, SetupOptions][] = [];
  const toldElsewhere: [string, string, readonly string[], readonly string[]][] = [];
  const titled: string[] = [];
  const read: string[] = [];
  const everyListed: number[] = [];
  const files = { ...world.settingsFiles };
  const notFound = async (path: string): Promise<never> => {
    throw new FileAccessError('not-found', path);
  };

  const start = new SessionStart({
    catalogue: { list: async () => world.listing ?? LISTING },
    report: {
      run: async (options) => {
        reports.push({ input: options.input ?? '', policy: options.policy, marks: options.marks, project: options.project });
        const actions = world.actionsFor?.(options.input ?? '');
        return { outcome: 'complete', output: `\nHTML report written to ${options.htmlPath}\n`, tally: TALLY, htmlWritten: true, ...(actions === undefined ? {} : { actions }) };
      },
    },
    files: {
      writeText: async (path) => { written.push(path); },
      ensureDirectory: async () => undefined,
    },
    policyFiles: {
      readText: async (path) => {
        read.push(path);
        if (path.startsWith('/out/run/')) return `<html>${path}</html>`;
        const text = files[path];
        if (text === undefined) throw new FileAccessError('not-found', path);
        return text;
      },
      readLines: () => { throw new Error('a policy is read whole'); },
    },
    digest: { render: () => 'DIGEST\n' },
    directories: { kindOf: notFound, list: notFound, modifiedAt: notFound },
    marks: { read: async () => ({ records: [], skipped: 0, failed: false }), append: async () => { appended.push('this run\u2019s'); return true; } },
    ...(world.elapsed === undefined ? {} : { elapsed: world.elapsed }),
    ...(world.shelf === undefined ? {} : { shelf: world.shelf }),
    ...(world.computerRecord === undefined
      ? {}
      : {
          computerOnboarding: {
            read: async () => ({ here: world.computerRecord?.here === true, anywhere: true, failed: false }),
            add: async (at: number) => { computerLines.push(['done', at]); if (world.computerRecord) world.computerRecord.here = true; return true; },
            reset: async (at: number) => { computerLines.push(['reset', at]); if (world.computerRecord) world.computerRecord.here = false; return true; },
            doneFor: async () => new Set<string>(),
          },
        }),
    ...(world.elsewhere !== true
      ? {}
      : {
          setupIn: (folder: string) => ({ run: async (options: SetupOptions) => { setupElsewhere.push([folder, options]); return { outcome: 'written' as const, output: 'Wrote .claude/settings.local.json.\n' }; } }),
          tellListsIn: (folder: string) => ({ change: async (file: string, add: readonly string[], remove: readonly string[]) => { toldElsewhere.push([folder, file, add, remove]); return true; } }),
        }),
    ...(world.placeChooser === undefined ? {} : { placeChooser: world.placeChooser }),
    ...(world.projects === undefined ? {} : { projects: { list: async () => ({ projects: world.projects ?? [], unreadable: 0 }) } }),
    ...(world.removed === undefined
      ? {}
      : { removedProjects: { removedFrom: async (ids: readonly string[]) => new Set(ids.filter((id) => (world.removed ?? []).map(projectDirectoryName).includes(id))), remove: async () => true } }),
    ...(world.view === undefined
      ? {}
      : { computerView: { read: async () => world.view?.scope, write: async (scope: ComputerScope) => { if (world.view !== undefined) world.view.scope = scope; return true; } } }),
    ...(world.projectMarks === undefined
      ? {}
      : {
          marksIn: (folder: string) => ({
            read: async () => ({ records: [...(world.projectMarks?.[folder] ?? []), ...(kept.get(folder) ?? [])], skipped: 0, failed: false }),
            append: async (record: MarkRecord) => { appended.push(folder); kept.set(folder, [...(kept.get(folder) ?? []), record]); return true; },
          }),
        }),
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
    ...(world.everywhere === true
      ? {
          everywhere: {
            now: async () => NOTHING_EVERYWHERE,
            setUp: async () => world.computerSetUp === true,
            protect: async (choices: EverywhereChoices) => {
              everywhere.push(choices);
              return { outcome: 'finished' as const, results: [{ change: 'block' as const, written: true }] };
            },
          },
        }
      : {}),
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
    titles: { recognise: async (session) => { titled.push(session.id); return { title: new Redactor('test').scan(`Fix the ${session.id} build`) }; } },
    ...(world.every === undefined
      ? {}
      : {
          everyProject: { list: async () => { everyListed.push(1); return { sessions: world.every ?? [], unreadable: 0 }; } },
          tellIn: (folder: string) => ({ pathsFor: () => ({ local: `/agentwhy${folder}.json`, shared: `${folder}/.claude/agentwhy.json`, computer: '/agentwhy/computer.json' }) }),
        }),
    workingDirectory: '/work/project',
    ...(world.home === undefined ? {} : { home: world.home }),
    ...(world.arrivedFrom === undefined ? {} : { arrivedFrom: world.arrivedFrom, handedOver: (url: string) => { handed.push(url); } }),
    ...(world.switchTo === undefined ? {} : { switchTo: world.switchTo }),
    temporaryDirectory: '/tmp-dir',
    now: NOW,
  });
  return { start, written, opened, rendered, printed, recorded, resets, setupRuns, serving, handed, everywhere, reports, titled, read, everyListed, appended, computerLines, setupElsewhere, toldElsewhere };
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
  // G7a: and that this project is set up, so the page Settings leads back to is the setup seen again.
  assert.deepEqual(rendered.at(-1)?.onboarding, { intro: false, setUp: true });
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

// protected-everywhere G7-G10, GD12: the computer-wide path is read into the page and written through its own route
// wherever the onboarding is served - the home directory included - and finishing it is no project's setup.
test('G7, GD12: the computer-wide path is served with the onboarding, and finishing it records no project as set up', async () => {
  const { serving, rendered, recorded, everywhere, written, stop } = await served({ everywhere: true });
  assert.deepEqual(rendered.at(-1)?.everywhere, NOTHING_EVERYWHERE);
  const before = written.filter((path) => path === '/out/run/index.html').length;
  const answer = await serving.handle?.({
    method: 'POST',
    path: '/tok/api/everywhere',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ block: ['**/.ssh/**'], tell: [] }),
  });
  assert.equal(answer?.status, 200, answer?.body);
  assert.deepEqual(everywhere, [{ block: ['**/.ssh/**'], tell: [] }]);
  assert.deepEqual(recorded, [], 'GD12: no onboarding record is written for it');
  assert.ok(written.filter((path) => path === '/out/run/index.html').length > before, 'every page is read again');
  await stop();

  const home = await served({ everywhere: true, home: '/work/project' }, { ...WEEK, open: false, serve: true });
  assert.deepEqual(home.rendered.at(-1)?.everywhere, NOTHING_EVERYWHERE, 'in the home directory too, where no project is set up');
  await home.stop();
});

/*
 * `protected-everywhere` GD23: the computer's own `watch` runs in every folder, one nobody set up included, so it is
 * quiet about a quiet turn unless the person says otherwise - and the computer's page starts that row off, or it would
 * offer a line nobody is given. A project's page starts it on, as it always has.
 */
test('GD23: the computer\u2019s page starts the quiet-turn row off, and a project\u2019s starts it on', async () => {
  const home = await served({ everywhere: true, home: '/work/project' }, { ...WEEK, open: false, serve: true });
  const computer = home.rendered.at(-1);
  assert.equal(computer?.scope, 'computer');
  assert.deepEqual(
    [computer?.settings?.notices?.clean, computer?.settings?.notices?.from.clean],
    ['off', 'default'],
    'nobody chose, so the computer keeps quiet about a quiet turn',
  );
  await home.stop();

  const here = await served({ everywhere: true });
  const project = here.rendered.at(-1);
  assert.equal(project?.scope, undefined);
  assert.equal(project?.settings?.notices?.clean, 'once', "a project's own run says it once, as it always has");
  await here.stop();
});

// `everything-on-this-computer.md` step 1, GD16: the home folder's run is the computer's - its pages are no project's,
// and it serves no project's write.
test('GD16: the home folder\u2019s run is the computer\u2019s: its index is scoped to it, and api/settings is not served', async () => {
  const home = await served({ everywhere: true, home: '/work/project' }, { ...WEEK, open: false, serve: true });
  const index = home.rendered.at(-1);
  assert.equal(index?.scope, 'computer');
  assert.deepEqual([index?.project, index?.place, index?.notAProject], [undefined, undefined, undefined], 'no project, and not "no project"');
  const settings = await home.serving.handle?.({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ change: 'hooks', hooks: ['watch'], on: true }),
  });
  assert.equal(settings?.status, 404, 'a project\u2019s write has no route here');
  await home.stop();

  // Without the computer-wide path the home folder is what it was: no project, the project step.
  const plain = await served({ home: '/work/project' }, { ...WEEK, open: false, serve: true });
  assert.equal(plain.rendered.at(-1)?.scope, undefined);
  assert.equal(plain.rendered.at(-1)?.notAProject, 'home');
  await plain.stop();
});

test('G7: no computer-wide path where the onboarding is not served, nor on a shared page', async () => {
  const without = await served({ everywhere: true, noOnboarding: true });
  assert.equal(without.rendered.at(-1)?.everywhere, undefined);
  const refused = await without.serving.handle?.({
    method: 'POST',
    path: '/tok/api/everywhere',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ block: ['**/.ssh/**'], tell: [] }),
  });
  assert.equal(refused?.status, 404);
  await without.stop();

  const shared = startIn({ everywhere: true });
  await shared.start.run({ ...WEEK, share: true });
  assert.equal(shared.rendered.at(-1)?.everywhere, undefined);
  assert.deepEqual(shared.everywhere, []);
});

// `everything-on-this-computer.md` step 4, GD15: the computer's view is reached as a project is - by a switch - and its
// run is served with no conversation of its own, opening on its own view rather than the setup.
test('step 4: a project\u2019s page switches to the computer\u2019s view, which is the home folder\u2019s run', async () => {
  const asked: string[][] = [];
  const switchTo = async (folder: string, since: string, from: 'step' | 'window') => { asked.push([folder, since, from]); return { url: 'http://127.0.0.1:50000/tok-computer/index.html' }; };
  const post = (handle: ((request: LocalRequest) => Promise<LocalResponse>) | undefined) => handle?.({
    method: 'POST',
    path: '/tok/api/switch-project',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ id: ':computer', from: 'window' }),
  });

  const project = await served({ everywhere: true, home: '/work', switchTo });
  const moved = await post(project.serving.handle);
  assert.equal(moved?.status, 200, moved?.body);
  assert.deepEqual(JSON.parse(moved?.body ?? '{}'), { ok: true, url: 'http://127.0.0.1:50000/tok-computer/index.html' });
  assert.deepEqual(asked, [['/work', '7d', 'window']], 'the home folder, whose run is the computer\u2019s');
  moved?.after?.();
  await project.stop();

  const computer = await served({ everywhere: true, home: '/work/project', switchTo }, { ...WEEK, open: false, serve: true });
  assert.equal((await post(computer.serving.handle))?.status, 422, 'the computer\u2019s page does not switch to itself');
  await computer.stop();

  const without = await served({ home: '/work', switchTo });
  assert.equal((await post(without.serving.handle))?.status, 422, 'and a run with no computer-wide path offers none');
  await without.stop();
});

test('GD16: the computer\u2019s run is served with no conversation of its own, and opens its view, not the setup', async () => {
  const { opened, rendered, stop } = await served({ everywhere: true, home: '/work/project', listing: EMPTY });
  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html'], 'the computer\u2019s Conversations, not the onboarding');
  assert.equal(rendered.at(-1)?.scope, 'computer');
  assert.equal((await stop()).outcome, 'written');
});


// `everything-on-this-computer.md` step 2: the computer's page lists every project's conversations, each row naming its
// project, each read under its own project's told lists and the computer's (GD17), and a title read only for a
// conversation that is read (G12). A project's own run lists its own folder, as before.
const TOLD = (pattern: string): string => JSON.stringify({ version: 1, tell: [pattern] });
const GUARDED = '/work/guarded';
const EVERY: readonly SessionSummary[] = [
  { id: 'app-1', path: '/stored/app/app-1.jsonl', modifiedAt: NOW - DAY / 2, delegations: 0, provider: 'claude-code', project: { folder: '/work/app', looked: true } },
  { id: 'blog-1', path: '/stored/blog/blog-1', modifiedAt: NOW - DAY, delegations: 0, provider: 'codex', project: { folder: '/work/blog', looked: true } },
  { id: 'kept-1', path: '/stored/guarded/kept-1.jsonl', modifiedAt: NOW - 2 * DAY, delegations: 0, provider: 'claude-code', project: { folder: GUARDED, looked: false } },
  { id: 'app-old', path: '/stored/app/app-old.jsonl', modifiedAt: NOW - 30 * DAY, delegations: 0, provider: 'claude-code', project: { folder: '/work/app', looked: true } },
];

test('step 2: the computer\u2019s page lists every project\u2019s conversations, each read under its own project\u2019s told lists', async () => {
  const run = await served({
    everywhere: true,
    home: '/work/project',
    every: EVERY,
    settingsFiles: {
      '/work/app/.claude/agentwhy.json': TOLD('**/app.secret'),
      '/work/blog/.claude/agentwhy.json': TOLD('**/blog.secret'),
      [`${GUARDED}/.claude/agentwhy.json`]: TOLD('**/guarded.secret'),
      '/agentwhy/computer.json': TOLD('**/Contracts/**'),
    },
  }, { ...WEEK, open: false, serve: true });
  const index = run.rendered.at(-1);
  assert.deepEqual(index?.entries.map((entry) => [entry.name, entry.project?.name, entry.report.kind]), [
    ['app-1', 'app', 'generated'],
    ['codex-blog-1', 'blog', 'generated'],
    ['kept-1', 'guarded', 'generated'],
    ['app-old', 'app', 'outside-range'],
  ]);
  const told = (input: string): readonly string[] => (run.reports.find((one) => one.input === input)?.policy?.protected ?? [])
    .filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern).sort();
  assert.deepEqual(told('/stored/app/app-1.jsonl'), ['**/Contracts/**', '**/app.secret']);
  assert.deepEqual(told('/stored/blog/blog-1'), ['**/Contracts/**', '**/blog.secret']);
  // V10b: a folder the system guards is not looked into - its own list is not read, the computer's is.
  assert.deepEqual(told('/stored/guarded/kept-1.jsonl'), ['**/Contracts/**']);
  assert.ok(!run.read.some((path) => path.startsWith(`${GUARDED}/`)), 'nothing inside the guarded folder is read');
  // G12: a title is read only for a conversation that is read.
  assert.deepEqual(run.titled.sort(), ['app-1', 'blog-1', 'kept-1']);
  assert.ok(run.everyListed.length > 0);
  await run.stop();
});

test('step 2: a project\u2019s own run lists its own folder, and reads every listed title, as before', async () => {
  const old = { id: 'sess-old', path: '/stored/project/sess-old.jsonl', modifiedAt: NOW - 30 * DAY, delegations: 0, provider: 'claude-code' as const };
  const run = await served({ everywhere: true, home: '/work', every: EVERY, listing: { ...LISTING, sessions: [...LISTING.sessions, old] } });
  assert.deepEqual(run.rendered.at(-1)?.entries.map((entry) => [entry.name, entry.project]), [['sess-today', undefined], ['sess-old', undefined]]);
  assert.deepEqual(run.titled.sort(), ['sess-old', 'sess-today']);
  assert.deepEqual(run.everyListed, [], 'every project is listed only for the computer\u2019s page');
  await run.stop();
});

// `everything-on-this-computer.md` step 2, GD18, with GD25: the same .env in two projects is two files on the computer's
// To fix, each with its own project's mark - read from that project's own record, and written there from this page.
test('GD18, GD25: one .env in two projects is two files, each marked in its own project\u2019s record, from this page too', async () => {
  const env = (): SessionActions => {
    const redactor = new Redactor('test');
    return { policy: redactor.term('BUILT-IN DEFAULT'), rotate: [{ path: redactor.path('.env'), template: false }], openRoutes: [], onlyInResults: [], unknown: [], refusedAttempts: 0, secretShapes: [], mentions: 0 };
  };
  const done: MarkRecord = { kind: 'mark', path: '.env', label: 'ROTATE', result: 'rotated', at: NOW, sessions: ['app-1'] };
  const run = await served({
    everywhere: true,
    home: '/work/project',
    every: EVERY.slice(0, 2),
    actionsFor: env,
    projectMarks: { '/work/app': [done] },
  }, { ...WEEK, open: false, serve: true });

  const check = run.rendered.at(-1)?.check;
  assert.deepEqual(check?.rows.map((row) => [row.path, row.project?.name, row.sessions]), [['.env', 'blog', ['codex-blog-1']]], 'app\u2019s .env was marked done there');
  assert.deepEqual(check?.history?.map((line) => [line.path, line.project?.name, line.status]), [['.env', 'app', 'standing']]);
  assert.equal(run.reports.find((one) => one.input === '/stored/app/app-1.jsonl')?.marks?.get('.env'), 'rotated', 'app\u2019s report is drawn with app\u2019s mark');
  assert.equal(run.reports.find((one) => one.input === '/stored/blog/blog-1')?.marks?.get('.env'), undefined, 'and blog\u2019s is not');

  assert.deepEqual(run.reports.map((one) => one.project).sort(), ['-work-app', '-work-blog'], 'each report knows its project, by id');

  const post = (route: string, body: object) => run.serving.handle?.({
    method: 'POST',
    path: '/tok/' + route,
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const nameless = await post('api/mark', { path: '.env', result: 'rotated' });
  assert.equal(nameless?.status, 422);
  assert.match(nameless?.body ?? '', /could not tell which project/);
  assert.equal((await post('api/mark', { path: '.env', result: 'rotated', project: '-work-elsewhere' }))?.status, 422, 'a project this page does not list');
  assert.deepEqual(run.appended, [], 'nothing written for either');

  const marked = await post('api/mark', { path: '.env', result: 'rotated', project: '-work-blog' });
  assert.equal(marked?.status, 200, marked?.body);
  assert.equal((await post('api/unmark', { path: '.env', project: '-work-blog' }))?.status, 200);
  assert.deepEqual(run.appended, ['/work/blog', '/work/blog'], 'blog\u2019s own record, the one blog\u2019s view reads');
  await run.stop();
});

// `protected-everywhere` GD32, from the maintainer ("chyba A"): a row's Block or Track on the computer's page is written
// where its file's project keeps it - a project's own settings and told lists, set up or not, as its own page writes
// them; a file of no project in the computer's rules. Nothing else is written from here, and nothing into this run's own.
test('GD32: a row\u2019s Block or Track is written into its own project, or the computer\u2019s rules for no project', async () => {
  const at = (hours: number): number => NOW - hours * 3_600_000;
  const session = (id: string, folder: string, hours: number): SessionSummary =>
    ({ id, path: `/stored/${id}.jsonl`, modifiedAt: at(hours), delegations: 0, provider: 'claude-code', project: { folder, looked: true } });
  const summary = (path: string): ProjectSummary => ({ id: projectDirectoryName(path), path, folder: 'there', conversations: 1, newest: { modifiedAt: at(1) } });
  const run = await served({
    everywhere: true,
    elsewhere: true,
    home: '/work/project',
    every: [session('app-1', '/work/app', 1), session('blog-1', '/work/blog', 2), session('scratch-1', '/tmp-dir/scratch', 3), session('old-1', '/work/old', 4)],
    projectMarks: {},
    projects: ['/work/app', '/work/blog', '/tmp-dir/scratch', '/work/old'].map(summary),
    removed: ['/work/old'],
    settingsFiles: { '/work/app/.claude/settings.local.json': WATCH_INSTALLED },
    view: { scope: undefined },
  }, { ...WEEK, open: false, serve: true });
  const post = (body: object) => run.serving.handle?.({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const blocked = await post({ change: 'protect', pattern: '.env', project: projectDirectoryName('/work/app') });
  assert.equal(blocked?.status, 200, blocked?.body);
  assert.deepEqual(run.setupElsewhere.map(([folder, options]) => [folder, options.protect]), [['/work/app', ['.env']]], 'into app\u2019s own settings, set up');

  const tracked = await post({ change: 'mode', to: 'tell', patterns: ['.env'], rules: [], where: 'local', project: projectDirectoryName('/work/blog') });
  assert.equal(tracked?.status, 200, tracked?.body);
  assert.deepEqual(run.toldElsewhere, [['/work/blog', 'local', ['.env'], []]], 'blog\u2019s own told list, though blog is not set up');

  const computer = await post({ change: 'protect', pattern: '.env.local', project: projectDirectoryName('/tmp-dir/scratch') });
  assert.equal(computer?.status, 200, computer?.body);
  assert.deepEqual(run.everywhere, [{ block: ['.env.local'], tell: [] }], 'a file of no project: the computer\u2019s rules');

  const nameless = await post({ change: 'protect', pattern: '.env' });
  assert.equal(nameless?.status, 422);
  assert.match(nameless?.body ?? '', /could not tell which project/);
  assert.equal((await post({ change: 'protect', pattern: '.env', project: projectDirectoryName('/work/elsewhere') }))?.status, 422, 'a project this page does not list');
  assert.match((await post({ change: 'protect', pattern: '.env', project: projectDirectoryName('/work/old') }))?.body ?? '', /taken off the list/);
  assert.match((await post({ change: 'update', project: projectDirectoryName('/work/app') }))?.body ?? '', /nothing else/, 'the page offers nothing else');
  assert.equal((await post({ change: 'protect', pattern: '.env', project: 7 }))?.status, 400, 'a project is its id');
  assert.equal(run.setupElsewhere.length, 1, 'nothing more written');
  assert.deepEqual(run.setupRuns, [], 'and nothing into this run\u2019s own folder, the home folder');
  await run.stop();
});

// `2026-10-07-a-file-in-its-place.md` IP1, IP2: on the computer's page the system's own window names the places a rule
// is for, and each is answered as its rule is written - under the home `~/…`, elsewhere `//…`, a folder with everything in
// it. The home itself is no place to keep from an AI. A project's page has no such window: its rules name names.
test('IP2: the computer\u2019s window answers places as their rules are written, and only on the computer\u2019s page', async () => {
  const asked: string[] = [];
  const placeChooser: PlaceChooser = {
    kinds: 'both',
    choose: async (prompt, kind, startIn) => {
      asked.push([prompt, kind, startIn].join('|'));
      return { chosen: [
        { path: '/work/project/docs/contract.pdf', folder: false }, { path: '/work/project/scans', folder: true },
        { path: '/Volumes/share/ledger.csv', folder: false }, { path: '/work/project', folder: true },
      ] };
    },
  };
  const post = (handle: ((request: LocalRequest) => Promise<LocalResponse>) | undefined, lang: string) => handle?.({
    method: 'POST', path: '/tok/api/choose-places',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ lang, kind: 'both' }),
  });
  const run = await served({ everywhere: true, home: '/work/project', every: EVERY.slice(0, 1), placeChooser }, { ...WEEK, open: false, serve: true });
  assert.equal(run.rendered.at(-1)?.everywhere?.places, 'both', 'the page is told what the window can choose');
  const answer = await post(run.serving.handle, 'pl');
  assert.equal(answer?.status, 200, answer?.body);
  assert.deepEqual(JSON.parse(answer?.body ?? '{}').places, [
    { name: '~/docs/contract.pdf', kind: 'file', pattern: '~/docs/contract.pdf' },
    { name: '~/scans', kind: 'folder', pattern: '~/scans/**' },
    { name: '/Volumes/share/ledger.csv', kind: 'file', pattern: '//Volumes/share/ledger.csv' },
  ]);
  assert.deepEqual(asked, ['Wybierz pliki i foldery do ukrycia przed AI|both|/work/project'], 'headed in the page\u2019s language, opened at home');
  await run.stop();

  const project = await served({ everywhere: true, placeChooser }, { ...WEEK, open: false, serve: true });
  assert.equal((await post(project.serving.handle, 'en'))?.status, 404, 'a project\u2019s page has no window for places');
  await project.stop();
});

// `everything-on-this-computer.md` step 6, GD20-GD22: the computer's page shows what no set-up project's view does - a
// project not set up, no project at all, and of a set-up project only the files outside its folder - or every project's,
// as the person chose on its pages; a project taken off the list is in neither. Both from the one set of reports.
test('GD20-GD22, GD27: outside projects, then projects - one set of reports, a removed project in neither', async () => {
  const read = (path: string): SessionActions => {
    const redactor = new Redactor('test');
    return { policy: redactor.term('BUILT-IN DEFAULT'), rotate: [{ path: redactor.path(path), template: false }], openRoutes: [], onlyInResults: [], unknown: [], refusedAttempts: 0, secretShapes: [], mentions: 0 };
  };
  const at = (hours: number): number => NOW - hours * 3_600_000;
  const session = (id: string, folder: string, hours: number): SessionSummary =>
    ({ id, path: `/stored/${id}.jsonl`, modifiedAt: at(hours), delegations: 0, provider: 'claude-code', project: { folder, looked: true } });
  const files: Record<string, string> = { '/stored/app-1.jsonl': '.env', '/stored/app-2.jsonl': '~/.aws/credentials', '/stored/blog-1.jsonl': '.env', '/stored/scratch-1.jsonl': '.env.local', '/stored/old-1.jsonl': '.env' };
  const summary = (path: string): ProjectSummary => ({ id: projectDirectoryName(path), path, folder: 'there', conversations: 1, newest: { modifiedAt: at(1) } });
  const view: { scope: ComputerScope | undefined } = { scope: undefined };
  const run = await served({
    everywhere: true,
    home: '/work/project',
    every: [session('app-1', '/work/app', 1), session('app-2', '/work/app', 2), session('blog-1', '/work/blog', 3), session('scratch-1', '/tmp-dir/scratch', 4), session('old-1', '/work/old', 5)],
    actionsFor: (input) => read(files[input] ?? ''),
    projectMarks: {},
    projects: ['/work/app', '/work/blog', '/tmp-dir/scratch', '/work/old'].map(summary),
    removed: ['/work/old'],
    settingsFiles: { '/work/app/.claude/settings.local.json': WATCH_INSTALLED },
    view,
  }, { ...WEEK, open: false, serve: true });

  const outside = run.rendered.at(-1);
  assert.deepEqual(outside?.computerView, { shown: 'outside' }, 'outside projects first, before anything was chosen');
  // GD28: each conversation in one of the two, whole - app's, set up, is in neither part of Outside projects, its file
  // outside its folder included: there it was drawn fixed, its own files in no list (found by the maintainer).
  assert.deepEqual(outside?.entries.map((entry) => [entry.name, entry.project?.kind]), [['blog-1', 'not-set-up'], ['scratch-1', 'none']]);
  assert.deepEqual(outside?.check?.rows.map((row) => [row.path, row.project?.name]).sort(), [['.env', 'blog'], ['.env.local', 'scratch']]);

  const moved = await run.serving.handle?.({
    method: 'POST', path: '/tok/api/view',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ scope: 'projects' }),
  });
  assert.equal(moved?.status, 200, moved?.body);
  assert.equal(view.scope, 'projects', 'kept');
  const all = run.rendered.at(-1);
  assert.deepEqual(all?.computerView, { shown: 'projects' });
  assert.deepEqual(all?.entries.map((entry) => entry.name), ['app-1', 'app-2'], 'the set-up projects\u2019 own, whole - not outside\u2019s, nor the one taken off the list');
  assert.deepEqual(all?.check?.rows.map((row) => [row.path, row.project?.name]).sort(), [['.env', 'app'], ['~/.aws/credentials', 'app']]);
  assert.equal(run.reports.length, 5, 'the reports were written once, for both');
  await run.stop();
});

// live-pages L3, amended 2026-10-06 - the maintainer's switch "wolno działa strasznie": every open page asks every 2 s, and
// every ask listed every project and drew every page. An ask is answered from a refresh at most 3 s old; a write is not;
// and a switch draws the pages again from what the run holds, listing nothing.
test('an ask is answered from a fresh refresh, a write still refreshes, and a switch lists nothing', async () => {
  let now = 0;
  const run = await served({ everywhere: true, home: '/work/project', every: EVERY.slice(0, 2), view: { scope: undefined }, elapsed: () => now }, { ...WEEK, open: false, serve: true });
  const handle = run.serving.handle as NonNullable<typeof run.serving.handle>;
  const ask = () => handle({ method: 'GET', path: '/tok/api/version/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  const post = (route: string, body: object) => handle({
    method: 'POST', path: '/tok/' + route,
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const listed = run.everyListed.length;

  now = 1_000; await ask(); await ask();
  assert.equal(run.everyListed.length, listed, 'the pages were drawn a second ago: the ask is answered from them');
  now = 4_000; await ask();
  assert.equal(run.everyListed.length, listed + 1, 'three seconds on: listed again, once');
  now = 4_500; await ask();
  assert.equal(run.everyListed.length, listed + 1);

  assert.equal((await post('api/view', { scope: 'projects' })).status, 200);
  assert.equal(run.everyListed.length, listed + 1, 'a switch lists nothing');
  assert.equal(run.rendered.at(-1)?.computerView?.shown, 'projects', 'and the pages are drawn with it');

  assert.equal((await post('api/everywhere', { block: ['**/.aws/**'], tell: [] })).status, 200);
  assert.equal(run.everyListed.length, listed + 2, 'a write refreshes at once, however fresh the pages are');
  await run.stop();
});

// GD26, after the maintainer: "zrobiłem uninstall, włączyłem tę komendę jeszcze raz i nie miałem onboardingu". The home
// folder's run opens the onboarding until the computer was set up - its own record, written by a finished write of the
// computer's and taken back by its Uninstall; a computer set up before the record existed is recorded silently.
test('GD26: the home folder opens the onboarding until the computer is set up, and again after its Uninstall', async () => {
  const view: { scope: ComputerScope | undefined } = { scope: 'projects' };
  const fresh = await served({ everywhere: true, home: '/work/project', computerRecord: { here: false }, view });
  assert.deepEqual(fresh.opened, ['http://127.0.0.1:43123/tok/onboarding.html'], 'nothing set up: the setup');
  assert.equal(fresh.rendered.at(-1)?.scope, 'computer', 'served as the computer\u2019s, for when it is done');
  const post = (body: object) => fresh.serving.handle?.({
    method: 'POST', path: '/tok/api/everywhere',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await post({ finish: true }))?.status, 200);
  assert.deepEqual(fresh.computerLines.map(([kind]) => kind), ['done'], 'finished, even with nothing new');
  assert.equal(view.scope, 'outside', 'and the computer\u2019s page opens on its default (GD21, amended 2026-10-07)');
  view.scope = 'projects';
  assert.equal((await post({ block: [], tell: ['**/.kube/**'] }))?.status, 200);
  assert.equal(view.scope, 'projects', 'a row of Settings changes no choice of what to show');
  assert.equal((await post({ uninstall: true }))?.status, 200);
  assert.deepEqual(fresh.computerLines.map(([kind]) => kind), ['done', 'done', 'reset'], 'Uninstall takes it back');
  assert.equal(view.scope, 'outside', 'and starts the page again at its default');
  await fresh.stop();

  const done = await served({ everywhere: true, home: '/work/project', computerRecord: { here: true } });
  assert.deepEqual(done.opened, ['http://127.0.0.1:43123/tok/index.html'], 'set up: the computer\u2019s view');
  await done.stop();

  const before = await served({ everywhere: true, home: '/work/project', computerRecord: { here: false }, computerSetUp: true });
  assert.deepEqual(before.opened, ['http://127.0.0.1:43123/tok/index.html'], 'set up before the record: its view');
  assert.deepEqual(before.computerLines.map(([kind]) => kind), ['done'], 'and recorded, silently');
  await before.stop();

  const project = await served({ everywhere: true, home: '/work', computerRecord: { here: false } });
  assert.deepEqual(project.computerLines, [], 'a project\u2019s run reads no computer record');
  await project.stop();
});

// which-project V14, amended 2026-10-07 - the maintainer: "przełączanie projektów jest bardzo wolne". A switch is a new run
// of the same process, and it read every conversation again; one drawn from exactly the same is copied now.
test('a run copies a report another run of the process drew from exactly the same, and reads a changed one', async () => {
  const shelf = new ReportShelf<GeneratedReport>();
  const first = await served({ shelf });
  assert.equal(first.reports.length, 1, 'the first run reads it');
  await first.stop();

  const again = await served({ shelf });
  assert.equal(again.reports.length, 0, 'the next one copies it');
  assert.ok(again.written.includes('/out/run/sess-today.html'), 'its page written all the same');
  assert.equal(again.rendered.at(-1)?.entries[0]?.report.kind, 'generated');
  await again.stop();

  const grown = await served({ shelf, listing: { ...LISTING, sessions: [{ ...LISTING.sessions[0]!, modifiedAt: NOW - DAY / 3 }] } });
  assert.equal(grown.reports.length, 1, 'a conversation that changed is read again');
  await grown.stop();

  const shared = startIn({ shelf });
  await shared.start.run({ ...WEEK, share: true });
  assert.equal(shared.reports.length, 1, 'a shared page reads its own, and keeps none');
});
