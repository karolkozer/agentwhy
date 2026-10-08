// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import type { ActionsDigest } from '../../../src/report/check/actions-digest.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';
import type { EntryPoint } from '../../../src/core/entry-point.ts';
import type { ProjectListing } from '../../../src/core/project-catalogue.ts';
import type { SessionListing } from '../../../src/core/session-catalogue.ts';
import type { DirectoryReader } from '../../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { FolderChooser } from '../../../src/ports/folder-chooser.ts';
import type { LocalRequest, LocalResponse } from '../../../src/ports/local-server.ts';
import type { SetupOptions } from '../../../src/setup/project-setup.ts';
import type { MarkRecord } from '../../../src/ports/mark-store.ts';
import type { ReportOptions, ReportResult } from '../../../src/report/report-use-case.ts';
import type { SessionIndex } from '../../../src/report/start/session-index.ts';
import { filesOf, SessionStart, type StartOptions } from '../../../src/report/start/session-start.ts';
import type { TerminalView } from '../../../src/report/start/render/start-words.ts';
import { ESCAPES } from '../../../src/shared/colour.ts';
import { TAGLINE, terminalLogo } from '../../../src/shared/terminal-logo.ts';

const NOW = Date.parse('2026-09-14T12:00:00Z');
const DAY = 86_400_000;
const TALLY = { contentsSeen: 0, filesReached: 2, onlyThroughResult: 1, namedByCall: 1, refusedAttempts: 1, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };

const LISTING: SessionListing = {
  directory: '/stored/project',
  found: true,
  searched: [{ provider: 'claude-code', directory: '/stored/project', found: true }],
  sessions: [
    { id: 'sess-today', path: '/stored/project/sess-today.jsonl', modifiedAt: NOW - DAY / 2, delegations: 4, provider: 'claude-code' },
    { id: 'sess-week', path: '/stored/project/sess-week.jsonl', modifiedAt: NOW - 5 * DAY, delegations: 1, provider: 'claude-code' },
    { id: 'sess-old', path: '/stored/project/sess-old.jsonl', modifiedAt: NOW - 40 * DAY, delegations: 0, provider: 'claude-code' },
  ],
};

const WEEK: StartOptions = { since: { since: NOW - 7 * DAY, asked: '7d' }, out: '/out/run', open: true, share: false };

interface World {
  readonly listing?: SessionListing;
  readonly gitAt?: string;
  /** Folders that are there, as the folder reader answers; every lookup is recorded in `looked`. */
  readonly foldersThere?: readonly string[];
  readonly outcomeFor?: (options: ReportOptions) => ReportResult;
  /** A transcript whose title cannot be read in a way the file system port does not translate. */
  readonly titleThrowsFor?: string;
  /** A session whose first title read finds nothing, as a Codex thread read before Codex named it (§2.9). */
  readonly untitledOnce?: string;
  /** Files the policy is read from, by path. Any other path is not found. */
  readonly policyTexts?: Readonly<Record<string, string>>;
  /** The person's record of marks, as the store would read it. */
  readonly marks?: readonly MarkRecord[];
  /** A server to serve the page from; `refuse` makes it fail to start. */
  readonly server?: 'serve' | 'refuse';
  /** A setup for the served Settings view to write through (R58). Absent means this run cannot write settings. */
  readonly setup?: boolean;
  /** What that setup does to the project's files, so a change can be read back the way R60 asks. */
  readonly onSetup?: (options: SetupOptions) => void;
  /** The terminal this run writes to: absent, the words are written with nothing drawn around them. */
  readonly terminal?: TerminalView;
  /** A page written beside the index, as the composition root writes To fix, This month and Settings. */
  readonly pages?: boolean;
  readonly timeZone?: string;
  /** A path whose write fails, as a full disk or a read-only file would. */
  readonly unwritable?: string;
  /** The conversations a person asked to check although older than a run (F55); absent: no such list at all. */
  readonly checked?: string[];
  /** The version of the agentwhy running (`nothing-updates-by-itself` U2); absent: this run knows none. */
  readonly serving?: string;
  /** The person's home directory (`which-project` V1); absent: the run is not told it. */
  readonly home?: string;
  /** Where each session was held, by id, as its transcript's end says (`which-project` V4). */
  readonly entryPoints?: Readonly<Record<string, EntryPoint>>;
  /** The person's projects, as the catalogue lists them (`which-project` V9). */
  readonly projects?: ProjectListing;
  /** The shell's way to show another project in this tab (`which-project` V14). */
  readonly switchTo?: (folder: string, since: string, from: 'step' | 'window') => Promise<{ readonly url: string } | { readonly failed: string }>;
  /** This run was started for a page that switched to it (V15). */
  readonly handedOver?: (url: string) => void;
  /** The computer's folder window, answering what the test says (V12). */
  readonly folderChooser?: FolderChooser;
  /** The folder the run is started in; absent, `/work/project`. */
  readonly workingDirectory?: string;
  /** Whether Codex is used on this computer (`codex-blocks-too` CK6, amended 2026-10-01); absent: the run is not told. */
  readonly codexOnThisComputer?: boolean;
  /** What the run remembers as this project's running server, and when it forgets it (PF2); absent: nothing is. */
  readonly remembered?: string[];
}

function startIn(world: World = {}, elapsed?: () => number) {
  const ran: ReportOptions[] = [];
  const written: string[] = [];
  const made: string[] = [];
  const opened: string[] = [];
  const rendered: SessionIndex[] = [];
  const titled: string[] = [];
  const digests: ActionsDigest[] = [];
  const printed: string[] = [];
  const appended: MarkRecord[] = [];
  const setupRuns: SetupOptions[] = [];
  const serving: { handle?: (request: LocalRequest) => Promise<LocalResponse>; close?: () => void } = {};
  const redactor = new Redactor('test');

  const looked: string[] = [];
  const directories: DirectoryReader = {
    kindOf: async (path) => {
      looked.push(path);
      if (world.gitAt !== undefined && path === `${world.gitAt}/.git`) return 'directory';
      if (world.foldersThere?.includes(path) === true) return 'directory';
      throw new FileAccessError('not-found', path);
    },
    list: async (path) => {
      throw new FileAccessError('not-found', path);
    },
    modifiedAt: async (path) => {
      throw new FileAccessError('not-found', path);
    },
  };

  const start = new SessionStart({
    catalogue: { list: async () => world.listing ?? LISTING },
    report: {
      run: async (options) => {
        ran.push(options);
        return world.outcomeFor?.(options) ?? { outcome: 'complete', output: `\nHTML report written to ${options.htmlPath}\n`, tally: TALLY, htmlWritten: true };
      },
    },
    files: {
      writeText: async (path) => {
        if (path === world.unwritable) throw new FileAccessError('unreadable', path);
        written.push(path);
      },
      ensureDirectory: async (path) => {
        made.push(path);
      },
    },
    policyFiles: {
      readText: async (path) => {
        if (path.startsWith('/out/run/')) return `<html>${path}</html>`;
        const text = world.policyTexts?.[path];
        if (text === undefined) throw new FileAccessError('not-found', path);
        return text;
      },
      readLines: () => {
        throw new Error('a policy is read whole');
      },
    },
    digest: {
      render: (digest) => {
        digests.push(digest);
        return 'DIGEST\n';
      },
    },
    directories,
    ...(world.codexOnThisComputer === undefined ? {} : { codexOnThisComputer: async () => world.codexOnThisComputer === true }),
    ...(world.checked === undefined
      ? {}
      : {
          checked: {
            read: async () => ({ ids: new Set(world.checked), failed: false }),
            add: async (id: string) => { world.checked?.push(id); return true; },
          },
        }),
    marks: {
      read: async () => ({ records: [...(world.marks ?? []), ...appended], skipped: 0, failed: false }),
      append: async (record) => {
        appended.push(record);
        return true;
      },
    },
    ...(world.setup === true
      ? {
          setup: {
            run: async (options: SetupOptions) => {
              setupRuns.push(options);
              world.onSetup?.(options);
              return { outcome: 'written' as const, output: 'Wrote .claude/settings.local.json.\n' };
            },
          },
        }
      : {}),
    ...(world.server === undefined
      ? {}
      : {
          server: {
            serve: async (handle) => {
              if (world.server === 'refuse') throw new Error('EADDRINUSE');
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
        }),
    browser: {
      open: async (path) => {
        opened.push(path);
        return true;
      },
    },
    renderer: {
      render: (index) => {
        rendered.push(index);
        return '<!doctype html>';
      },
    },
    titles: {
      recognise: async (session) => {
        titled.push(session.id);
        if (session.id === world.titleThrowsFor) throw new Error('EMFILE: too many open files');
        if (session.id === world.untitledOnce && titled.filter((id) => id === session.id).length === 1) return {};
        if (session.id === 'sess-old') return {};
        return { title: redactor.scan(`Fix the ${session.id} build`), ...(world.entryPoints?.[session.id] === undefined ? {} : { entryPoint: world.entryPoints[session.id] }) };
      },
    },
    ...(world.serving === undefined ? {} : { invocation: { find: async () => 'agentwhy', version: async () => world.serving } }),
    workingDirectory: world.workingDirectory ?? '/work/project',
    ...(world.home === undefined ? {} : { home: world.home }),
    ...(world.projects === undefined ? {} : { projects: { list: async () => world.projects as ProjectListing } }),
    ...(world.switchTo === undefined ? {} : { switchTo: world.switchTo }),
    ...(world.handedOver === undefined ? {} : { handedOver: world.handedOver }),
    ...(world.folderChooser === undefined ? {} : { folderChooser: world.folderChooser }),
    temporaryDirectory: '/tmp-dir',
    now: NOW,
    ...(world.terminal === undefined ? {} : { terminal: world.terminal }),
    ...(world.pages === true ? { pages: { 'beside.html': { render: () => '<!doctype html><title>manage</title>' } } } : {}),
    ...(world.timeZone === undefined ? {} : { timeZone: world.timeZone }),
    ...(elapsed === undefined ? {} : { elapsed }),
    ...(world.remembered === undefined ? {} : {
      pageServer: {
        write: async (url: string) => { world.remembered?.push(`write ${url}`); },
        remove: async () => { world.remembered?.push('remove'); },
      },
    }),
  });

  return { start, ran, written, made, opened, rendered, titled, digests, printed, appended, serving, setupRuns, looked };
}

// R2: a page that silently omitted what it had not read would be a report on a report with a hole in it.
test('reports are generated inside the range, and every session is listed either way', async () => {
  const { start, ran, rendered } = startIn();

  const result = await start.run(WEEK);

  assert.equal(result.outcome, 'written');
  assert.deepEqual(ran.map((options) => options.input), ['/stored/project/sess-today.jsonl', '/stored/project/sess-week.jsonl']);
  assert.deepEqual(rendered[0]?.entries.map((entry) => [entry.name, entry.report.kind]), [
    ['sess-today', 'generated'],
    ['sess-week', 'generated'],
    ['sess-old', 'outside-range'],
  ]);
});

// An id alone does not say which session a person meant; the title `sessions` shows does.
test('every session carries its title where one was found, in range or not', async () => {
  const { start, rendered } = startIn();

  await start.run(WEEK);

  assert.deepEqual(rendered[0]?.entries.map((entry) => entry.title), ['Fix the sess-today build', 'Fix the sess-week build', undefined]);
});

// A title is an affordance on a row, not the run: reading one must never cost the reports the run exists for.
test('a title that cannot be read leaves its row with the id, and the run still writes everything', async () => {
  const { start, rendered, written, opened } = startIn({ titleThrowsFor: 'sess-today' });

  const result = await start.run(WEEK);

  assert.equal(result.outcome, 'written');
  assert.deepEqual(rendered[0]?.entries.map((entry) => entry.title), [undefined, 'Fix the sess-week build', undefined]);
  assert.deepEqual(rendered[0]?.entries.map((entry) => entry.name), ['sess-today', 'sess-week', 'sess-old']);
  assert.ok(written.includes('/out/run/index.html'));
  assert.deepEqual(opened, ['/out/run/index.html']);
});

// `a-way-back` R8: this is the one run that writes an index beside its reports, so it is the one that may link to it.
test('every report this run generates is given the way back to the index', async () => {
  const { start, ran } = startIn();

  await start.run(WEEK);

  assert.ok(ran.length > 0, 'reports were generated');
  assert.ok(ran.every((options) => options.withIndexLink === true));
});

// P4: a report is handed the title its row is found by, for "You asked" - and a shared run reads no title to hand.
test('every report is given its session’s title, and a shared one none', async () => {
  const titled = startIn();
  await titled.start.run(WEEK);
  assert.ok(titled.ran.some((options) => options.title === 'Fix the sess-today build'), 'a title read for the row is the report’s');
  assert.ok(titled.ran.every((options) => options.title === undefined || (options.input ?? '').includes((options.title as string).split(' ')[2] ?? '-')), 'each its own');

  const shared = startIn();
  await shared.start.run({ ...WEEK, share: true });
  assert.ok(shared.ran.length > 0 && shared.ran.every((options) => options.title === undefined));
});

test('the index is written beside the reports, and opened', async () => {
  const { start, written, opened } = startIn();

  await start.run(WEEK);

  assert.ok(written.includes('/out/run/index.html'));
  assert.deepEqual(opened, ['/out/run/index.html']);
});

test('--no-open writes everything and opens nothing', async () => {
  const { start, written, opened } = startIn();

  await start.run({ ...WEEK, open: false });

  assert.ok(written.includes('/out/run/index.html'));
  assert.deepEqual(opened, []);
});

/*
 * `2026-10-02-said-where-the-person-is` SW10, SW11: what the agent runs when the person says yes to its report - that
 * session's report opened among every conversation, so its "All conversations" leads back to them, and one line said.
 */
test('a session asked for by its id is the page opened, beside every other, and said in one line', async () => {
  const { start, opened, written, ran } = startIn();

  const result = await start.run({ ...WEEK, serve: false, session: 'sess-week', quiet: true });

  assert.deepEqual(opened, ['/out/run/sess-week.html']);
  assert.ok(written.includes('/out/run/index.html'), 'every conversation is written beside it');
  assert.ok(ran.every((options) => options.withIndexLink === true), 'and every report leads back to them');
  assert.equal(result.output, 'Opened: /out/run/sess-week.html\n');
});

test('a session asked for outside the range is written all the same', async () => {
  const { start, opened, ran } = startIn();

  await start.run({ ...WEEK, serve: false, session: 'sess-old', quiet: true });

  assert.ok(ran.some((options) => options.input === '/stored/project/sess-old.jsonl'));
  assert.deepEqual(opened, ['/out/run/sess-old.html']);
});

test('a session that is not here opens every conversation, and says so rather than passing them off as its report', async () => {
  const { start, opened } = startIn();

  const result = await start.run({ ...WEEK, serve: false, session: 'sess-nowhere', quiet: true });

  assert.deepEqual(opened, ['/out/run/index.html']);
  assert.equal(result.output, 'That conversation was not found here, so all conversations were opened: /out/run/index.html\n');
});

// R5: never the working directory, where a file is one `git add .` away from being committed.
test('with no --out the run writes to a new directory under the temporary location', async () => {
  const { start, made } = startIn();

  const { out: _ignored, ...withoutOut } = WEEK;
  await start.run(withoutOut);

  assert.equal(made.length, 1);
  assert.ok(made[0]?.startsWith('/tmp-dir/agentwhy-start-'), `wrote to ${made[0]}`);
});

test('a directory inside a repository is refused, and nothing at all is written', async () => {
  const { start, written, made, ran } = startIn({ gitAt: '/out' });

  const result = await start.run(WEEK);

  assert.equal(result.outcome, 'refused');
  assert.match(result.output, /Refusing to write inside a repository/);
  assert.deepEqual([...written, ...made, ...ran.map((options) => options.input)], []);
});

// R6: the index names projects, and a project path names a client.
test('the shared view names sessions by position and shows no project and no title', async () => {
  const { start, ran, rendered, titled } = startIn();

  await start.run({ ...WEEK, share: true });

  const index = rendered[0];
  assert.equal(index?.project, undefined);
  assert.deepEqual(index?.entries.map((entry) => entry.name), ['Session 1', 'Session 2', 'Session 3']);
  assert.ok(index?.entries.every((entry) => !('title' in entry)), 'a title is user content');
  assert.deepEqual(titled, [], 'and is not even read');
  assert.deepEqual(ran.map((options) => options.htmlPath), ['/out/run/session-1.html', '/out/run/session-2.html']);
  assert.ok(ran.every((options) => options.share), 'every report in a shared run is shared');
});

test('no sessions is an answer, and writes nothing', async () => {
  const { start, written, made } = startIn({ listing: { directory: '/stored/none', found: false, searched: [{ provider: 'claude-code', directory: '/stored/none', found: false }], sessions: [] } });

  const result = await start.run(WEEK);

  assert.equal(result.outcome, 'no-sessions');
  assert.match(result.output, /agentwhy reads sessions Claude Code and Codex already keep/);
  assert.match(result.output, /agentwhy init/);
  assert.deepEqual([...written, ...made], []);
});

// A session that could not be read is a different answer from one where nothing happened.
test('a session that could not be read is marked failed and not linked', async () => {
  const { start, rendered } = startIn({
    outcomeFor: (options) =>
      (options.input ?? '').includes('sess-week') ? { outcome: 'session-unreadable', output: '' } : { outcome: 'complete', output: '', tally: TALLY, htmlWritten: true },
  });

  await start.run(WEEK);

  assert.equal(rendered[0]?.entries[1]?.report.kind, 'failed');
});

test('the widening command reaches the oldest session the run left out', async () => {
  const { start, rendered } = startIn();

  await start.run(WEEK);

  assert.equal(rendered[0]?.widen, 'agentwhy start --since 40d');
});

// Review finding: a task description can say anything, including the words the old check searched for.
test('a written report is linked whatever its text happens to say', async () => {
  const { start, rendered } = startIn({
    outcomeFor: () => ({ outcome: 'complete', output: 'asked to find why the file could not be written', tally: TALLY, htmlWritten: true }),
  });

  await start.run(WEEK);

  assert.equal(rendered[0]?.entries[0]?.report.kind, 'generated');
});

test('a report whose file did not land is not linked', async () => {
  const { start, rendered } = startIn({ outcomeFor: () => ({ outcome: 'complete', output: '', tally: TALLY, htmlWritten: false }) });

  await start.run(WEEK);

  assert.equal(rendered[0]?.entries[0]?.report.kind, 'failed');
});


// The page is only useful daily if it reads a project under that project's own rules - and one run reads it under one
// set of them, chosen before anything is written.
test('a policy file is read once, and every report the run generates is given that policy', async () => {
  const policy = JSON.stringify({ version: 1, level: 'no-read', protected: ['**/vault/**'] });
  const { start, ran } = startIn({ policyTexts: { 'policy.json': policy } });

  await start.run({ ...WEEK, policyPath: 'policy.json', settingsPath: '.claude/settings.json' });

  assert.equal(ran.length, 2);
  assert.ok(ran.every((options) => options.policy === ran[0]?.policy && !('policyPath' in options) && !('settingsPath' in options)));
  assert.deepEqual(ran[0]?.policy?.origin, { kind: 'file', path: 'policy.json' });
});

test('without either, every report is given the built-in default', async () => {
  const { start, ran } = startIn();

  await start.run(WEEK);

  assert.ok(ran.every((options) => options.policy === DEFAULT_POLICY));
});

// A refused policy file is one refusal, found before the run creates a directory that nothing would ever explain.
test('a refused policy stops the run before any report, directory or index exists', async () => {
  const { start, ran, made, written, opened } = startIn();

  const result = await start.run({ ...WEEK, policyPath: 'policy.json' });

  assert.deepEqual(result, {
    outcome: 'refused',
    output: 'The policy file was refused, so nothing was analysed:\n  - policy.json could not be read\n',
  });
  assert.deepEqual([ran.length, ...made, ...written, ...opened], [0]);
});

// R17: the terminal says whether the range needs attention before it says where the page is.
test('the actions of the generated reports are merged into the digest printed first', async () => {
  const actions = (rotate: string): SessionActions => {
    const redactor = new Redactor('test');
    return {
      policy: redactor.term('BUILT-IN DEFAULT'),
      rotate: [{ path: redactor.path(rotate), template: false }],
      openRoutes: [],
      onlyInResults: [],
      unknown: [],
      refusedAttempts: 1,
      secretShapes: [],
      mentions: 0,
    };
  };
  const { start, digests } = startIn({
    outcomeFor: (options) => ({
      outcome: 'complete',
      output: '',
      tally: TALLY,
      htmlWritten: true,
      actions: actions((options.input ?? '').includes('today') ? 'apps/web/.env' : 'apps/api/.env'),
    }),
  });

  const result = await start.run(WEEK);

  assert.ok(result.output.startsWith('DIGEST\n'));
  assert.equal(digests.length, 1);
  assert.deepEqual(digests[0]?.rotate.map((entry) => entry.path), ['apps/api/.env', 'apps/web/.env']);
  assert.equal(digests[0]?.refusedAttempts, 2);
  assert.equal(digests[0]?.policyKind, 'default');
});

// The page's Check tab is the same answer, with the sessions behind each line kept so a person can open them.
test('the index is given what to do about the sessions it read, with the sessions behind each file', async () => {
  const redactor = new Redactor('test');
  const { start, rendered } = startIn({
    outcomeFor: (options) => ({
      outcome: 'complete',
      output: '',
      tally: TALLY,
      htmlWritten: true,
      actions: {
        policy: redactor.term('BUILT-IN DEFAULT'),
        rotate: [{ path: redactor.path('apps/web/.env'), template: false }],
        openRoutes: (options.input ?? '').includes('week') ? [{ path: redactor.path('apps/web/.env'), did: redactor.term('Read'), occurrences: 1 }] : [],
        onlyInResults: [],
        unknown: [],
        refusedAttempts: 1,
        secretShapes: [],
        mentions: 0,
      },
    }),
  });

  await start.run(WEEK);

  assert.deepEqual(rendered[0]?.check, {
    rows: [{ label: 'rotate', path: 'apps/web/.env', sessions: ['sess-today', 'sess-week'] }],
    refusedAttempts: 2,
    history: [],
    marksUnreadable: false,
  });
});

// Review finding 1: the digest is about what was analysed, not about which pages could be written.
test('a report whose page was not written still counts in the digest, and an unreadable session is counted apart', async () => {
  const redactor = new Redactor('test');
  const { start, digests } = startIn({
    outcomeFor: (options) =>
      (options.input ?? '').includes('today')
        ? {
            outcome: 'complete',
            output: '',
            tally: TALLY,
            htmlWritten: false,
            actions: {
              policy: redactor.term('BUILT-IN DEFAULT'),
              rotate: [{ path: redactor.path('apps/web/.env'), template: false }],
              openRoutes: [],
              onlyInResults: [],
              unknown: [],
              refusedAttempts: 0,
              secretShapes: [],
              mentions: 0,
            },
          }
        : { outcome: 'session-unreadable', output: '' },
  });

  await start.run(WEEK);

  assert.equal(digests[0]?.sessionsRead, 1);
  assert.equal(digests[0]?.sessionsUnreadable, 1);
  assert.deepEqual(digests[0]?.rotate.map((entry) => entry.path), ['apps/web/.env']);
});

// worth-running-every-day R35-R37: the page is given what is still to do and every mark, and a shared page no note.
test('the index is given To do without marked files, a History of every mark, and no note when shared', async () => {
  const redactor = new Redactor('test');
  const marks: MarkRecord[] = [
    // Between the two sessions: sess-week was before it, sess-today after.
    { kind: 'mark', path: 'apps/web/.env', label: 'rotate', result: 'rotated', at: NOW - 2 * DAY, note: 'new keys', sessions: ['sess-week'] },
    { kind: 'mark', path: 'apps/api/.env', label: 'rotate', result: 'rotated', at: NOW - 2 * DAY, sessions: ['sess-week'] },
  ];
  const world = {
    marks,
    outcomeFor: (options: ReportOptions): ReportResult => ({
      outcome: 'complete',
      output: '',
      tally: TALLY,
      htmlWritten: true,
      actions: {
        policy: redactor.term('BUILT-IN DEFAULT'),
        // apps/api/.env only in the older session; apps/web/.env in both.
        rotate: (options.input ?? '').includes('week')
          ? [{ path: redactor.path('apps/web/.env'), template: false }, { path: redactor.path('apps/api/.env'), template: false }]
          : [{ path: redactor.path('apps/web/.env'), template: false }],
        openRoutes: [],
        onlyInResults: [],
        unknown: [],
        refusedAttempts: 0,
        secretShapes: [],
        mentions: 0,
      },
    }),
  };
  const { start, rendered, digests } = startIn(world);

  await start.run(WEEK);

  const check = rendered[0]?.check;
  assert.deepEqual(check?.rows, [{ label: 'rotate', path: 'apps/web/.env', sessions: ['sess-today'], reopened: { result: 'rotated', at: NOW - 2 * DAY } }]);
  assert.deepEqual(check?.history?.map((line) => [line.path, line.status, line.reopened, line.note, line.sessions]), [
    ['apps/web/.env', 'standing', true, 'new keys', ['sess-week']],
    ['apps/api/.env', 'standing', false, undefined, ['sess-week']],
  ]);
  assert.equal(digests[0]?.marks?.done, 1);

  const shared = startIn(world);
  await shared.start.run({ ...WEEK, share: true });
  assert.deepEqual(shared.rendered[0]?.check?.history?.map((line) => [line.note, line.sessions]), [[undefined, ['Session 2']], [undefined, ['Session 2']]]);
});

// worth-running-every-day R50-R54: the page start opens is served, a mark made on it is recorded at once, and start
// says where the page is before it waits.
test('an opened page is served behind a token, and a mark posted to it is recorded and rendered again', async () => {
  const redactor = new Redactor('test');
  const world = {
    server: 'serve' as const,
    outcomeFor: (): ReportResult => ({
      outcome: 'complete',
      output: '',
      tally: TALLY,
      htmlWritten: true,
      actions: {
        policy: redactor.term('BUILT-IN DEFAULT'),
        rotate: [{ path: redactor.path('apps/web/.env'), template: false }],
        openRoutes: [],
        onlyInResults: [],
        unknown: [],
        refusedAttempts: 0,
        secretShapes: [],
        mentions: 0,
      },
    }),
  };
  const { start, opened, printed, appended, serving, written, rendered, ran } = startIn(world);

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(opened, ['http://127.0.0.1:43123/tok/index.html']);
  assert.match(printed[0] ?? '', /^ {2}Serving the page at http:\/\/127\.0\.0\.1:43123\/tok\/index\.html$/m);
  assert.match(printed[0] ?? '', /^ {2}A mark made on it is recorded at once\./m);
  const page = await serving.handle({ method: 'GET', path: '/tok/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  assert.equal(page.body, '<html>/out/run/index.html</html>');

  const answer = await serving.handle({
    method: 'POST',
    path: '/tok/api/mark',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ path: 'apps/web/.env', result: 'rotated', note: 'new keys' }),
  });

  assert.equal(answer.status, 200, answer.body);
  assert.deepEqual(appended, [
    { kind: 'mark', path: 'apps/web/.env', label: 'rotate', result: 'rotated', at: NOW + 60_000, note: 'new keys', sessions: ['sess-today', 'sess-week'] },
  ]);
  // Written by the run, again when the page was read (R75), and again after the mark.
  assert.equal(written.filter((path) => path === '/out/run/index.html').length, 3, 'the index is written again');
  assert.deepEqual(rendered.at(-1)?.check?.rows, [], 'and no longer lists the marked file');
  // R76: a file marked done here is done in the report of every conversation that reached it, not only on this page.
  const redrawn = ran.slice(2).map((options) => [options.input, [...(options.marks ?? [])]]);
  assert.deepEqual(redrawn, [
    ['/stored/project/sess-today.jsonl', [['apps/web/.env', 'rotated']]],
    ['/stored/project/sess-week.jsonl', [['apps/web/.env', 'rotated']]],
  ]);

  serving.close?.();
  const result = await running;
  assert.equal(result.outcome, 'written');
  assert.equal(result.output, 'The page is no longer served.\n');
});

// `2026-10-02-a-page-not-a-file.md` PF2: a served run is this project's running server until it stops, so a later
// `--detach` opens its pages rather than starting another. A shared page, which is never served, is never remembered.
test('a served run is remembered as the project\'s server until it stops', async () => {
  const remembered: string[] = [];
  const { start, serving, printed } = startIn({ server: 'serve', remembered });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(remembered, ['write http://127.0.0.1:43123/tok/']);

  serving.close?.();
  await running;
  assert.deepEqual(remembered, ['write http://127.0.0.1:43123/tok/', 'remove']);

  const shared: string[] = [];
  await startIn({ server: 'serve', remembered: shared }).start.run({ ...WEEK, share: true });
  assert.deepEqual(shared, []);
});

test('a page not opened, a shared page, or one asked not to be served, is only written', async () => {
  for (const options of [{ ...WEEK, open: false }, { ...WEEK, share: true }, { ...WEEK, serve: false }]) {
    const { start, serving, opened } = startIn({ server: 'serve' });
    const result = await start.run(options);
    assert.equal(serving.handle, undefined);
    assert.equal(result.outcome, 'written');
    if (options.open) assert.deepEqual(opened, ['/out/run/index.html']);
  }
});

test('a server that cannot start leaves the page a file, and says so', async () => {
  const { start, opened } = startIn({ server: 'refuse' });

  const result = await start.run(WEEK);

  assert.deepEqual(opened, ['/out/run/index.html']);
  assert.match(result.output, /The page could not be served, so it was opened as a file/);
  // PF4, extended to this run 2026-10-04: a file is where a person's setup stops, so what would serve one is said -
  // as `--detach` has always said it. Measured in the Codex app, where the sandbox is the reason and it can act on it.
  assert.match(result.output, /To open it live, run this command again outside the sandbox, or type npx @agentwhy\/cli in a terminal\./);
});

// ── what the Settings view is built from, and what it can write (the-rules-this-run-read; R57-R60) ─────────────
const LOCAL_SETTINGS = '/work/project/.claude/settings.local.json';
const SHARED_SETTINGS = '/work/project/.claude/settings.json';
const FILES = { path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' };

test('the index carries the hooks the project runs and the patterns its own file protects', async () => {
  const { start, rendered } = startIn({
    policyTexts: {
      [LOCAL_SETTINGS]: JSON.stringify({
        hooks: {
          SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
        },
        permissions: { deny: ['Read(config/*.pem)', 'Edit(config/*.pem)', 'Read(half.key)', 'Bash(cat:*)'] },
      }),
    },
  });

  await start.run(WEEK);

  const settings = rendered[0]?.settings;
  // watch runs with no --settings, so it reads the built-in list and not this file's rules (settings-redesign S4); refuse
  // is not installed, and `init` would point it at this file, which holds rules (R6).
  assert.deepEqual(settings?.hooks, { watch: 'local', refuse: false, reads: { watch: 'default', refuse: 'local' }, ...FILES });
  // A rule denied for one tool and not the other is not one `init` wrote, so `--unprotect` is not offered for it -
  // but it protects a file all the same, and the page that left it out answered "where is my rule?" with silence.
  // A command pattern is not a file at all, and is in neither list.
  assert.deepEqual(settings?.mine, {
    '**/config/*.pem': { file: 'local', rule: 'config/*.pem', whole: true },
    '**/half.key': { file: 'local', rule: 'half.key', whole: false },
  });
});

// `nothing-updates-by-itself` U2: the page is told that the hooks run an older release than the agentwhy writing it.
test('hooks pinned to an older release than this agentwhy are behind, and a page under --share is told nothing', async () => {
  const pinned = (version: string): string => JSON.stringify({
    hooks: {
      SubagentStop: [{ hooks: [{ type: 'command', command: `npx @agentwhy/cli@${version} watch` }] }],
      Stop: [{ hooks: [{ type: 'command', command: `npx @agentwhy/cli@${version} watch` }] }],
    },
  });

  const behind = startIn({ serving: '0.3.0', policyTexts: { [LOCAL_SETTINGS]: pinned('0.2.0') } });
  await behind.start.run(WEEK);
  assert.deepEqual(behind.rendered[0]?.settings?.hooks?.behind, { from: '0.2.0', to: '0.3.0', shared: false });

  const current = startIn({ serving: '0.3.0', policyTexts: { [LOCAL_SETTINGS]: pinned('0.3.0') } });
  await current.start.run(WEEK);
  assert.equal(current.rendered[0]?.settings?.hooks?.behind, undefined);

  const shared = startIn({ serving: '0.3.0', policyTexts: { [LOCAL_SETTINGS]: pinned('0.2.0') } });
  await shared.start.run({ ...WEEK, share: true });
  assert.equal(shared.rendered[0]?.settings?.hooks, undefined);
});

// `hookEntries`: `watch` is two entries, `SubagentStop` and `Stop`, and a file running it on one alone never says
// anything in the conversation and never checks the session's own agent - half a tool, which must read as off.
test('watch running on SubagentStop alone is not read as installed', async () => {
  const { start, rendered } = startIn({
    policyTexts: {
      [LOCAL_SETTINGS]: JSON.stringify({
        hooks: { SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] },
      }),
    },
  });

  await start.run(WEEK);

  const settings = rendered[0]?.settings;
  assert.deepEqual(settings?.hooks, { watch: false, refuse: false, reads: { watch: 'default', refuse: 'default' }, ...FILES });
});

// A settings file written by hand, or by Claude Code's own permission prompt, denies `Read()` and nothing else.
// `init` writes the pair, so it does not offer to change such a rule - and the page dropped it on the floor: not
// the rule, not the file it is in, not even that the project had rules of its own.
test('a rule that denies Read and not Edit is listed, and listed as one this page did not write', async () => {
  const { start, rendered } = startIn({
    policyTexts: { [SHARED_SETTINGS]: JSON.stringify({ permissions: { deny: ['Read(./.env.local)'] } }) },
  });

  await start.run(WEEK);

  const settings = rendered[0]?.settings;
  assert.deepEqual(settings?.mine, { '**/.env.local': { file: 'shared', rule: './.env.local', whole: false } });
  // And it reaches the list the page draws its rows from, which the run's own policy knows nothing about.
  assert.ok(settings?.protected.includes('**/.env.local'), String(settings?.protected));
});

// Both of a project's settings files are `init`'s to write - `--shared` names the committed one - so a rule in
// either is a rule this page can change, and each says which file a change to it would go to.
test('the committed settings file is read too, and every rule says which of the two holds it', async () => {
  const { start, rendered } = startIn({
    policyTexts: {
      [SHARED_SETTINGS]: JSON.stringify({
        hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] },
        permissions: { deny: ['Read(**/.env*)', 'Edit(**/.env*)'] },
      }),
      [LOCAL_SETTINGS]: JSON.stringify({ permissions: { deny: ['Read(.npmrc)', 'Edit(.npmrc)'] } }),
    },
  });

  await start.run(WEEK);

  const settings = rendered[0]?.settings;
  // A hook the committed file runs is a hook this project runs: a switch reading off there would say the project
  // is quieter than it is.
  assert.deepEqual(settings?.hooks, { watch: false, refuse: 'shared', reads: { watch: 'local', refuse: 'default' }, ...FILES });
  assert.deepEqual(settings?.mine, {
    '**/.env*': { file: 'shared', rule: '**/.env*', whole: true },
    '**/.npmrc': { file: 'local', rule: '.npmrc', whole: true },
  });
});

// codex-blocks-too CK6, amended 2026-10-01: a project with no Codex conversation and no hook file of Codex's, on a
// computer where Codex is used, is one that uses Codex - so Settings says whether Codex is blocked there too.
test('Settings speaks of Codex in a project without a Codex conversation where Codex is used on this computer', async () => {
  const refusing = { [LOCAL_SETTINGS]: JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } }) };
  const here = startIn({ policyTexts: refusing, codexOnThisComputer: true });
  await here.start.run(WEEK);
  assert.equal(here.rendered[0]?.settings?.hooks?.codex, 'off');

  for (const computer of [false, undefined]) {
    const none = startIn({ policyTexts: refusing, ...(computer === undefined ? {} : { codexOnThisComputer: computer }) });
    await none.start.run(WEEK);
    assert.equal(none.rendered[0]?.settings?.hooks?.codex, undefined, String(computer));
  }
});

// The bug this join had from the start: a rule is written `Read(./.env*)` and the policy lists what it protects
// as the anchored pattern, so keying the one by the other matched nothing and every row lost its controls. The
// rows come from the policy's list, and `--unprotect` takes the rule's own spelling, so the index holds both.
test('a rule written the way a settings file writes one is joined to the pattern the policy lists', async () => {
  const rules = JSON.stringify({
    permissions: { deny: ['Read(./.env*)', 'Edit(./.env*)', 'Read(./tests/real/**)', 'Edit(./tests/real/**)'] },
  });
  const { start, rendered } = startIn({ policyTexts: { [LOCAL_SETTINGS]: rules, [SHARED_SETTINGS]: rules } });

  // Read under the project's own rules, which is what `--settings` gives a run in a project that keeps them there.
  await start.run({ ...WEEK, settingsPath: SHARED_SETTINGS });

  const settings = rendered[0]?.settings;
  assert.deepEqual(settings?.mine, {
    '**/.env*': { file: 'local', rule: './.env*', whole: true },
    '**/tests/real/**': { file: 'local', rule: './tests/real/**', whole: true },
  });
  // The join is the whole point: every pattern the run read is one of the project's own rules, so every row of
  // the list carries its controls. Keyed by the rule's own spelling instead, not one of them did.
  for (const pattern of settings?.protected ?? []) {
    assert.ok(settings?.mine?.[pattern], `${pattern} is a rule this page can change`);
  }
});

// Where both files deny the same pattern, a change has to name one of them, and the local file is the one `init`
// writes without being told otherwise.
test('a pattern both files deny is named by the file a change to it would write', async () => {
  const both = JSON.stringify({ permissions: { deny: ['Read(.npmrc)', 'Edit(.npmrc)'] } });
  const { start, rendered } = startIn({ policyTexts: { [SHARED_SETTINGS]: both, [LOCAL_SETTINGS]: both } });

  await start.run(WEEK);

  assert.deepEqual(rendered[0]?.settings?.mine, { '**/.npmrc': { file: 'local', rule: '.npmrc', whole: true } });
});

test('a file that is absent leaves both switches off; one that is not JSON leaves the view without controls', async () => {
  const { start: fresh, rendered: withoutFile } = startIn({});
  await fresh.run(WEEK);
  assert.deepEqual(withoutFile[0]?.settings?.hooks, { watch: false, refuse: false, reads: { watch: 'default', refuse: 'default' }, ...FILES });
  assert.deepEqual(withoutFile[0]?.settings?.mine, {});

  const { start: broken, rendered: withBadFile } = startIn({ policyTexts: { [LOCAL_SETTINGS]: '{ not json' } });
  await broken.run(WEEK);
  // The rules are still stated; what is dropped is the part a control would be drawn from.
  assert.equal(withBadFile[0]?.settings?.hooks, undefined, 'a switch is never drawn from a guess');
  assert.equal(withBadFile[0]?.settings?.mine, undefined);
  assert.equal(withBadFile[0]?.settings?.level, 'no-read');

  // The committed file is the project's and the local one is this page's own. A project whose committed file
  // cannot be parsed still has a local file that can: its rules keep their controls, and the unreadable file's
  // carry none - which is what every rule this page did not write already does.
  const { start: half, rendered: withBadShared } = startIn({
    policyTexts: {
      [SHARED_SETTINGS]: '{ not json',
      [LOCAL_SETTINGS]: JSON.stringify({ permissions: { deny: ['Read(.npmrc)', 'Edit(.npmrc)'] } }),
    },
  });
  await half.run(WEEK);
  assert.deepEqual(withBadShared[0]?.settings?.hooks, { watch: false, refuse: false, reads: { watch: 'local', refuse: 'local' }, ...FILES });
  assert.deepEqual(withBadShared[0]?.settings?.mine, { '**/.npmrc': { file: 'local', rule: '.npmrc', whole: true } });
});

test('a shared page carries no hook state and nothing of its own to protect', async () => {
  const { start, rendered } = startIn({
    policyTexts: { [LOCAL_SETTINGS]: JSON.stringify({ permissions: { deny: ['Read(.npmrc)', 'Edit(.npmrc)'] } }) },
  });

  await start.run({ ...WEEK, share: true });

  assert.equal(rendered[0]?.settings?.hooks, undefined);
  assert.equal(rendered[0]?.settings?.mine, undefined);
  assert.match(String(rendered[0]?.settings?.protected), /npmrc/, 'the rules themselves stay: they are what the view is for');
});

// R58: the page's confirm step is the consent, and the change runs through the same setup a terminal runs.
test('a settings change posted to the served page runs the setup and renders the index again', async () => {
  const { start, serving, written, setupRuns, printed } = startIn({ server: 'serve', setup: true });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));

  const answer = await serving.handle({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ change: 'protect', pattern: 'config/*.pem' }),
  });

  assert.equal(answer.status, 200, answer.body);
  // F38 (2026-09-24): a file added is kept from searches too, so `refuse` goes with it and every other hook stays.
  assert.deepEqual(setupRuns, [{
    hooks: ['refuse'],
    keep: true,
    protect: ['config/*.pem'],
    remove: false,
    yes: true,
    target: 'local',
  }]);
  assert.equal(written.filter((path) => path === '/out/run/index.html').length, 2, 'the index is written again from the file');

  serving.close?.();
  await running;
});

// R75: a listing that finds nothing after the run began (a directory moved, a disk gone) keeps the conversations listed,
// and a write still draws the pages again, so Settings shows what the file holds (R60).
test('a write after the listing finds nothing keeps the conversations and still renders the pages again', async () => {
  let listing = LISTING;
  const texts: Record<string, string> = {};
  const { start, serving, written, rendered, printed } = startIn({
    server: 'serve',
    setup: true,
    get listing() { return listing; },
    policyTexts: texts,
    // What `init` does with the change: the rule goes into the file this page writes.
    onSetup: (options) => {
      texts[LOCAL_SETTINGS] = JSON.stringify({
        permissions: { deny: options.protect.flatMap((pattern) => [`Read(${pattern})`, `Edit(${pattern})`]) },
      });
    },
  });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const listed = rendered.at(-1)?.entries.map((entry) => entry.name);
  assert.ok((listed ?? []).length > 0);
  listing = { ...LISTING, found: false, sessions: [] };

  const answer = await serving.handle({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ change: 'protect', pattern: 'config/*.pem' }),
  });

  assert.equal(answer.status, 200, answer.body);
  assert.equal(written.filter((path) => path === '/out/run/index.html').length, 2, 'the index is written again from the file');
  assert.deepEqual(rendered.at(-1)?.entries.map((entry) => entry.name), listed, 'with the conversations it listed');
  const after = rendered.at(-1)?.settings;
  assert.ok(after?.protected.includes('**/config/*.pem'), `Settings holds what the file now holds: ${String(after?.protected)}`);
  assert.deepEqual(after?.mine?.['**/config/*.pem'], { file: 'local', rule: 'config/*.pem', whole: true });

  serving.close?.();
  await running;
});

// The built-in list written into the project: one run, every pattern behind its own flag, and no hook named, so
// nothing else about the project is touched.
test('the built-in list is written into the project in one run, with search protection and no other hook', async () => {
  const { start, serving, setupRuns, printed } = startIn({ server: 'serve', setup: true });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));

  const answer = await serving.handle({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ change: 'adopt', patterns: ['**/.env*', '**/.npmrc'], where: 'shared' }),
  });

  assert.equal(answer.status, 200, answer.body);
  // F38 (2026-09-24): a file added is kept from searches too, so `refuse` goes with it and every other hook stays.
  assert.deepEqual(setupRuns, [{
    hooks: ['refuse'],
    keep: true,
    protect: ['**/.env*', '**/.npmrc'],
    remove: false,
    yes: true,
    target: 'shared',
  }]);

  serving.close?.();
  await running;
});

// R60: the page is read again from the file, which has to mean the rules too. The view kept the list the policy
// was resolved into before the server started, so a pattern written into the file appeared nowhere: the write
// landed, the page reloaded, and the list came back exactly as it was - which reads as an add that did nothing.
test('a pattern protected through the page is in the list the page comes back with', async () => {
  const texts: Record<string, string> = {};
  const { start, serving, rendered, printed } = startIn({
    server: 'serve',
    setup: true,
    policyTexts: texts,
    // What `init` does with the change: the rule goes into the file this page writes.
    onSetup: (options) => {
      texts[LOCAL_SETTINGS] = JSON.stringify({
        permissions: { deny: options.protect.flatMap((pattern) => [`Read(${pattern})`, `Edit(${pattern})`]) },
      });
    },
  });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const before = rendered.length;

  await serving.handle({
    method: 'POST',
    path: '/tok/api/settings',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ change: 'protect', pattern: 'config/*.pem' }),
  });

  const after = rendered[rendered.length - 1]?.settings;
  assert.ok(rendered.length > before, 'the index is rendered again');
  assert.ok(after?.protected.includes('**/config/*.pem'), `the list holds it: ${String(after?.protected)}`);
  // And it is the page's own to take out again, named by the file that now holds it.
  assert.deepEqual(after?.mine?.['**/config/*.pem'], { file: 'local', rule: 'config/*.pem', whole: true });

  serving.close?.();
  await running;
});

// The terminal is read by a person: the wordmark says which tool answered, and one heading separates what the range
// needs from where the page is. Piped output keeps the words and loses the drawing - nobody reads block letters in a log.
test('a terminal is given the wordmark above the answer, and a pipe is given the words alone', async () => {
  const { start } = startIn({ terminal: { colour: false, decorated: true } });
  const { start: piped } = startIn();

  const drawn = (await start.run(WEEK)).output;
  const plain = (await piped.run(WEEK)).output;

  assert.deepEqual(drawn.split('\n').slice(0, 2), terminalLogo([TAGLINE, 'project · 3 sessions listed · since 7d'], { colour: false, ascii: false }));
  assert.ok(drawn.endsWith(plain), 'and above exactly what a pipe is given');
  assert.doesNotMatch(plain, /█/, 'a pipe is given no block letters');
});

// worth-running-every-day R17, amended: the counts come first, and one heading stands above where the page is.
test('what the range needs and where the page is are two blocks, not six lines in a row', async () => {
  const { start } = startIn();

  const lines = (await start.run(WEEK)).output.split('\n');

  assert.deepEqual(lines.slice(0, 3), ['DIGEST', '', '▍The page']);
  assert.deepEqual(lines.slice(3, 5), ['  2 reports and an index written.', '  Index: /out/run/index.html']);
  assert.equal(lines.at(-1), '', 'and the output ends in one newline');
});

// findings-worth-reading R14, R15: colour is decided in the shell, and taking it off gives back the same words.
test('colour over the answer changes nothing but the escapes', async () => {
  const { start: coloured } = startIn({ terminal: { colour: true, decorated: true } });
  const { start: plain } = startIn({ terminal: { colour: false, decorated: true } });

  const painted = (await coloured.run(WEEK)).output;
  const said = (await plain.run(WEEK)).output;

  assert.notEqual(painted, said, 'it is coloured');
  assert.equal(painted.replace(ESCAPES, ''), said);
});

// The Conversations index leads to views it does not draw yet; the page that draws them is written and served beside
// it, from the same model, so a link from one to the other never lands on a file that is not there.
test('a page written beside the index is written with it, served with it, and the index carries the time zone', async () => {
  const { start, serving, written, rendered, printed } = startIn({ server: 'serve', pages: true, timeZone: 'Europe/Warsaw' });

  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));

  assert.ok(written.includes('/out/run/index.html'));
  assert.ok(written.includes('/out/run/beside.html'), 'the page beside the index is written');
  assert.equal(rendered[0]?.timeZone, 'Europe/Warsaw');
  const page = await serving.handle({ method: 'GET', path: '/tok/beside.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  assert.equal(page.status, 200);
  assert.equal(page.body, '<html>/out/run/beside.html</html>');

  serving.close?.();
  await running;
});

test('with no page beside it and no time zone, only the index is written, and it says nothing of a zone', async () => {
  const { start, written, rendered } = startIn();
  await start.run(WEEK);
  assert.ok(!written.some((path) => path.endsWith('/beside.html')));
  assert.equal(rendered[0]?.timeZone, undefined);
});

// M5, R35: each report is given the marks that still hold for its own session - made after it was last active - and
// whether it will be served (P43). A shared run gives neither.
test('each report is given the marks that hold for its session, and whether it will be served', async () => {
  const mark = (path: string, at: number): MarkRecord => ({ kind: 'mark', path, label: 'rotate', result: 'rotated', at, sessions: [] });
  const marks = [mark('apps/web/.env', NOW - DAY), mark('data/customers.csv', NOW - 10 * DAY), { kind: 'unmark' as const, path: 'data/customers.csv', at: NOW - 9 * DAY }];

  const { start, ran, serving, printed } = startIn({ marks, server: 'serve' });
  const running = start.run({ ...WEEK, open: false, serve: true });
  const byInput = async () => {
    while (ran.length < 2) await new Promise((resolve) => setImmediate(resolve));
    return new Map(ran.map((options) => [options.input, options]));
  };
  const options = await byInput();
  // Marked a day ago: after sess-week was last active (5 days ago), before sess-today (half a day ago) - which may have
  // reached the file again. An undone mark holds for nobody.
  assert.deepEqual([...(options.get('/stored/project/sess-week.jsonl')?.marks ?? [])], [['apps/web/.env', 'rotated']]);
  assert.deepEqual([...(options.get('/stored/project/sess-today.jsonl')?.marks ?? [])], []);
  assert.equal(options.get('/stored/project/sess-today.jsonl')?.served, true);
  while (serving.close === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  serving.close();
  await running;

  const { start: alone, ran: aloneRan } = startIn({ marks });
  await alone.run({ ...WEEK, open: false });
  assert.ok(aloneRan.every((each) => each.served === false), 'no server, nothing served');

  const { start: shared, ran: sharedRan } = startIn({ marks, server: 'serve' });
  await shared.run({ ...WEEK, share: true });
  assert.ok(sharedRan.every((each) => each.served === false && each.marks?.size === 0), 'a shared page carries no marks and is never served');
});

// R75, asked for 2026-09-24: a person kept the page open while working, and a conversation begun since was not on it
// until `start` was run again. A page read now shows the conversations as they are now: a new one is read and served,
// one that grew is read again, and one that did not change is not read at all.
test('a page read later lists the conversations begun since, and reads again only what changed', async () => {
  const world: { listing: SessionListing; server: 'serve' } = { listing: LISTING, server: 'serve' };
  const { start, serving, printed, ran, rendered } = startIn(world);
  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const get = (path: string) => (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path, headers: { host: '127.0.0.1:43123' }, body: '' });
  const before = ran.length;

  world.listing = {
    ...LISTING,
    sessions: [
      { id: 'sess-new', path: '/stored/project/sess-new.jsonl', modifiedAt: NOW + 30_000, delegations: 0, provider: 'claude-code' },
      { id: 'sess-today', path: '/stored/project/sess-today.jsonl', modifiedAt: NOW + 20_000, delegations: 4, provider: 'claude-code' },
      ...LISTING.sessions.slice(1),
    ],
  };
  assert.equal((await get('/tok/index.html')).status, 200);

  assert.deepEqual(ran.slice(before).map((options) => options.input), ['/stored/project/sess-new.jsonl', '/stored/project/sess-today.jsonl'], 'sess-week did not change');
  assert.deepEqual(rendered.at(-1)?.entries.map((entry) => entry.name), ['sess-new', 'sess-today', 'sess-week', 'sess-old']);
  assert.equal((await get('/tok/sess-new.html')).status, 200, 'and its report is served');
  assert.equal(ran.length, before + 2, 'a page read with nothing changed reads nothing again');

  serving.close?.();
  await running;
});

// R75, F57: a file switched to Tell me or back to Block in Settings changes what every report says about it, so a page
// read after the rules changed is drawn from reports read under the rules as they are now.
test('a page read after the rules changed reads every report again, under the new rules', async () => {
  const texts: Record<string, string> = { '/work/project/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)', 'Edit(**/.env*)'] } }) };
  const { start, serving, printed, ran } = startIn({ server: 'serve', policyTexts: texts });
  const running = start.run({ ...WEEK, settingsPath: '/work/project/.claude/settings.json' });
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const get = () => (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path: '/tok/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  const before = ran.length;

  await get();
  assert.equal(ran.length, before, 'the same rules read nothing again');

  texts['/work/project/.claude/settings.json'] = JSON.stringify({ permissions: { deny: ['Read(**/.npmrc)', 'Edit(**/.npmrc)'] } });
  await get();
  const again = ran.slice(before);
  assert.equal(again.length, 2, 'both reports in range are read again');
  assert.ok(again.every((options) => options.policy?.protected.some((entry) => entry.pattern === '**/.npmrc')));

  serving.close?.();
  await running;
});

// live-pages L1-L3: a page asks whether its file is still the version it was sent. The same answer while nothing
// changed; a new one once something did; and the page carries the version it was sent at.
test('a served page carries its version, and the version changes only when what it shows does', async () => {
  const world: { listing: SessionListing; server: 'serve' } = { listing: LISTING, server: 'serve' };
  const { start, serving, printed } = startIn(world);
  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const get = (path: string) => (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path, headers: { host: '127.0.0.1:43123' }, body: '' });
  const versionOf = async (file: string) => JSON.parse((await get('/tok/api/version/' + file)).body) as { version: string; conversations?: number };

  const first = await versionOf('index.html');
  assert.equal(first.conversations, 3);
  assert.deepEqual(await versionOf('index.html'), first, 'nothing changed, nothing new');
  const report = await versionOf('sess-today.html');
  assert.equal((await get('/tok/sess-week.html')).body, '<html>/out/run/sess-week.html</html>', 'the harness page has no <html > to stamp');

  world.listing = { ...LISTING, sessions: [{ id: 'sess-new', path: '/stored/project/sess-new.jsonl', modifiedAt: NOW + 30_000, delegations: 0, provider: 'claude-code' }, ...LISTING.sessions] };
  assert.equal((await versionOf('index.html')).conversations, 4);
  assert.deepEqual(await versionOf('sess-today.html'), report, 'a report nothing touched keeps its version');
  assert.equal((await get('/tok/api/version/nowhere.html')).status, 404);
  assert.equal((await (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path: '/tok/api/version/index.html', headers: { host: 'evil.test' }, body: '' })).status, 403);

  serving.close?.();
  await running;
});

// L4, LD2: a conversation the agent is still writing is read again at most every 5 s, however often a page asks.
test('a growing conversation is read again at most every five seconds', async () => {
  let now = 0;
  const world: { listing: SessionListing; server: 'serve' } = { listing: LISTING, server: 'serve' };
  const withClock = startIn(world, () => now);
  const running = withClock.start.run(WEEK);
  while (withClock.serving.handle === undefined || withClock.printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const get = () => (withClock.serving.handle as NonNullable<typeof withClock.serving.handle>)({ method: 'GET', path: '/tok/api/version/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  const before = withClock.ran.length;
  const grow = (by: number) => { world.listing = { ...LISTING, sessions: [{ ...LISTING.sessions[0]!, modifiedAt: NOW + by }, ...LISTING.sessions.slice(1)] }; };

  grow(1_000); now = 1_000; await get();
  assert.equal(withClock.ran.length, before, 'written a second ago: it waits');
  grow(2_000); now = 6_000; await get();
  assert.equal(withClock.ran.length, before + 1, 'five seconds on: read again, once');
  grow(3_000); now = 7_000; await get();
  assert.equal(withClock.ran.length, before + 1);

  withClock.serving.close?.();
  await running;
});

// Found by review (2026-09-23): a page beside the index that could not be written was reported as the index itself,
// which was already on disk.
test('a page beside the index that cannot be written is the one the run names', async () => {
  const { start } = startIn({ pages: true, unwritable: '/out/run/beside.html' });

  const result = await start.run(WEEK);

  assert.equal(result.outcome, 'unwritable');
  assert.match(result.output, /could not be written: \/out\/run\/beside\.html/);
});

// F55 (`for-people-who-build-with-ai.md`, 2026-09-24): a bare `agentwhy` reads 7 days, and a row older than that could
// not be opened. Served, the page asks for that one conversation; the server writes its report the way the run writes
// every report, serves it, and reads the page again.
test('a conversation older than the run is checked on request, served, and counted from then on', async () => {
  const { start, serving, written, rendered, ran, printed } = startIn({ server: 'serve' });
  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rendered[0]?.entries.find((entry) => entry.name === 'sess-old')?.report.kind, 'outside-range');
  const post = (name: unknown) => (serving.handle as NonNullable<typeof serving.handle>)({
    method: 'POST',
    path: '/tok/api/include',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  const answer = await post('sess-old');

  assert.equal(answer.status, 200, answer.body);
  const asked = ran.find((options) => options.input === '/stored/project/sess-old.jsonl');
  assert.equal(asked?.htmlPath, '/out/run/sess-old.html', 'written by the same report the run uses, beside the others');
  assert.equal(asked?.served, true);
  assert.equal(rendered.at(-1)?.entries.find((entry) => entry.name === 'sess-old')?.report.kind, 'generated', 'the page is read again');
  const page = await (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path: '/tok/sess-old.html', headers: { host: '127.0.0.1:43123' }, body: '' });
  assert.equal(page.status, 200, 'and served');

  assert.equal((await post('sess-week')).status, 422, 'a conversation the run covered is not asked for');
  assert.equal((await post('sess-nowhere')).status, 422);
  assert.equal((await post('')).status, 400);

  serving.close?.();
  await running;
});

// F55: "Check it" is pressed once. The conversation is remembered, and every later run reads it as in range.
test('a conversation checked on request is remembered, and the next run reads it without asking', async () => {
  const remembered: string[] = [];
  const first = startIn({ server: 'serve', checked: remembered });
  const running = first.start.run(WEEK);
  while (first.serving.handle === undefined || first.printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const answer = await (first.serving.handle as NonNullable<typeof first.serving.handle>)({
    method: 'POST',
    path: '/tok/api/include',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'sess-old' }),
  });
  assert.equal(answer.status, 200, answer.body);
  assert.deepEqual(remembered, ['sess-old']);
  first.serving.close?.();
  await running;

  const next = startIn({ checked: remembered });
  await next.start.run(WEEK);
  assert.ok(next.ran.some((options) => options.input === '/stored/project/sess-old.jsonl'), 'read with the run, not asked for again');
  assert.equal(next.rendered[0]?.entries.find((entry) => entry.name === 'sess-old')?.report.kind, 'generated');
  assert.ok(!next.rendered[0]?.entries.some((entry) => entry.report.kind === 'outside-range'), 'nothing is left out');
});

// which-project V1, V3: the folder the run was for, on the page and at the terminal - and not under --share.
test('the index says where the project is, as a person reads it, and a shared page and its terminal say nothing', async () => {
  const told = startIn({ home: '/work', terminal: { colour: false, decorated: true } });
  const drawn = (await told.start.run(WEEK)).output;
  assert.equal(told.rendered[0]?.place, '~/project');
  assert.equal(told.rendered[0]?.project, '/work/project');
  assert.match(drawn, /project · 3 sessions listed · since 7d/);

  const untold = startIn();
  await untold.start.run(WEEK);
  assert.equal(untold.rendered[0]?.place, undefined, 'no home, no place: the name alone');

  const shared = startIn({ home: '/work', terminal: { colour: false, decorated: true } });
  const sharedOutput = (await shared.start.run({ ...WEEK, share: true })).output;
  assert.equal(shared.rendered[0]?.place, undefined);
  assert.equal(shared.rendered[0]?.project, undefined);
  assert.match(sharedOutput, /3 sessions listed · since 7d/);
  assert.doesNotMatch(sharedOutput, /project · 3 sessions/, 'a shared run names no folder, even at the terminal');
});

// which-project V4: where the listed conversations were held, counted from the reads that find their titles.
test('the index counts where the listed conversations were held, and a shared one reads none', async () => {
  const told = startIn({ entryPoints: { 'sess-today': 'editor', 'sess-week': 'terminal', 'sess-old': 'editor' } });
  await told.start.run(WEEK);
  assert.deepEqual(told.rendered[0]?.entryPoints, { editor: 1, terminal: 1 }, 'a session whose end says nothing is not counted');

  const shared = startIn({ entryPoints: { 'sess-today': 'editor' } });
  await shared.start.run({ ...WEEK, share: true });
  assert.equal(shared.rendered[0]?.entryPoints, undefined);
});

// which-project V9-V11: the list is read for a served page, which draws the window, and never for a shared one.
test('a served page carries the person\'s projects, and a shared page or a file does not', async () => {
  const listing: ProjectListing = {
    projects: [
      { id: '-work-project', path: '/work/project', folder: 'there', conversations: 3, newest: { modifiedAt: NOW } },
      { id: '-work-blog', path: '/work/blog', folder: 'gone', conversations: 1, newest: { modifiedAt: NOW - DAY } },
    ],
    unreadable: 1,
  };
  const served = startIn({ server: 'serve', home: '/work', projects: listing });
  const running = served.start.run(WEEK);
  while (served.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(served.rendered[0]?.projects?.rows.map((row) => [row.place, row.current, row.folder]), [['~/project', true, 'there'], ['~/blog', false, 'gone']]);
  assert.equal(served.rendered[0]?.projects?.unreadable, 1);
  served.serving.close?.();
  await running;

  for (const options of [{ ...WEEK, share: true }, { ...WEEK, open: false }]) {
    const unserved = startIn({ server: 'serve', home: '/work', projects: listing });
    await unserved.start.run(options);
    assert.equal(unserved.rendered[0]?.projects, undefined, JSON.stringify(options));
  }
});

// which-project V14, V17, V18: a page switches by the id this run listed a project under, and the run it leaves ends quietly.
test('a switch shows a listed project in its own run, and this run ends without a word once the page has moved', async () => {
  const listing: ProjectListing = {
    projects: [
      { id: '-work-project', path: '/work/project', folder: 'there', conversations: 3, newest: { modifiedAt: NOW } },
      { id: '-work-blog', path: '/work/blog', folder: 'there', conversations: 1, newest: { modifiedAt: NOW - DAY } },
      { id: '-work-gone', path: '/work/gone', folder: 'gone', conversations: 1, newest: { modifiedAt: NOW - DAY } },
    ],
    unreadable: 0,
  };
  const asked: string[][] = [];
  const run = startIn({
    server: 'serve',
    home: '/work',
    projects: listing,
    switchTo: async (folder, since, from) => {
      asked.push([folder, since, from]);
      return { url: 'http://127.0.0.1:50000/tok2/index.html' };
    },
  });
  const running = run.start.run(WEEK);
  while (run.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.rendered[0]?.projects?.switchable, true);
  const post = (id: string, from?: string) => (run.serving.handle as (request: LocalRequest) => Promise<LocalResponse>)({
    method: 'POST',
    path: '/tok/api/switch-project',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ id, ...(from === undefined ? {} : { from }) }),
  });

  for (const refused of ['-work-gone', '-work-project', '-work-other', '/work/blog']) assert.equal((await post(refused)).status, 422, refused);
  assert.deepEqual(asked, [], 'nothing is started for a folder that is gone, the project shown, or an id not listed');

  await post('-work-blog', 'anywhere');
  const moved = await post('-work-blog', 'step');
  assert.deepEqual(JSON.parse(moved.body), { ok: true, url: 'http://127.0.0.1:50000/tok2/index.html' });
  assert.deepEqual(asked, [['/work/blog', '7d', 'window'], ['/work/blog', '7d', 'step']],
    'the folder, with the range the page was drawn with, and where it asked from (V16): the step, or else the window');
  moved.after?.();
  assert.deepEqual(await running, { outcome: 'written', output: '' });
});

test('a run a page switched to opens no browser, hands its address over, and says which project it shows', async () => {
  const handed: string[] = [];
  const run = startIn({ server: 'serve', home: '/work', terminal: { colour: false, decorated: false }, handedOver: (url) => handed.push(url) });
  const running = run.start.run(WEEK);
  while (handed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(run.opened, [], 'the page that asked is the one that shows it');
  assert.deepEqual(handed, ['http://127.0.0.1:43123/tok/index.html']);
  assert.match(run.printed.join(''), /Now showing project \(~\/project\)\./);
  run.serving.close?.();
  await running;
});

// which-project V10b: a folder the system guards was not looked into while listing; picking it is when it is looked at.
test('a project not looked at is looked at when it is picked, and refused only if it is gone by then', async () => {
  const listing: ProjectListing = {
    projects: [
      { id: '-work-project', path: '/work/project', folder: 'there', conversations: 3, newest: { modifiedAt: NOW } },
      { id: '-docs-blog', path: '/work/Documents/blog', folder: 'not-looked', conversations: 1, newest: { modifiedAt: NOW - DAY } },
      { id: '-docs-old', path: '/work/Documents/old', folder: 'not-looked', conversations: 1, newest: { modifiedAt: NOW - DAY } },
    ],
    unreadable: 0,
  };
  const asked: string[] = [];
  const run = startIn({
    server: 'serve',
    home: '/work',
    projects: listing,
    foldersThere: ['/work/Documents/blog'],
    switchTo: async (folder) => {
      asked.push(folder);
      return { url: 'http://127.0.0.1:50000/tok2/index.html' };
    },
  });
  const running = run.start.run(WEEK);
  while (run.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(run.rendered[0]?.projects?.rows.map((row) => [row.id, row.folder]), [
    ['-work-project', 'there'],
    ['-docs-blog', 'not-looked'],
    ['-docs-old', 'not-looked'],
  ], 'listed, and so choosable');
  assert.deepEqual(run.rendered[0]?.projects?.rows.filter((row) => row.folder === 'not-looked').map((row) => row.setUp), [undefined, undefined], 'with nothing said of their status');
  assert.ok(!run.looked.some((path) => path.startsWith('/work/Documents')), 'and nothing under them was looked at while listing');

  const post = (id: string) => (run.serving.handle as (request: LocalRequest) => Promise<LocalResponse>)({
    method: 'POST',
    path: '/tok/api/switch-project',
    headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const gone = await post('-docs-old');
  assert.equal(gone.status, 422);
  assert.match(JSON.parse(gone.body).message, /This folder isn’t there anymore\./);
  assert.deepEqual(asked, []);

  const moved = await post('-docs-blog');
  assert.deepEqual(JSON.parse(moved.body), { ok: true, url: 'http://127.0.0.1:50000/tok2/index.html' });
  assert.deepEqual(asked, ['/work/Documents/blog']);
  moved.after?.();
  await running;
});

// V10b: a folder the ChatGPT app made for a chat with no project is counted with the temporary folders, not listed.
test('a chat folder of the ChatGPT app is hidden with the temporary folders', async () => {
  const listing: ProjectListing = {
    projects: [
      { id: '-work-project', path: '/work/project', folder: 'there', conversations: 3, newest: { modifiedAt: NOW } },
      { id: '-chat', path: '/work/Documents/Codex/2026-10-01/run-the-checks', folder: 'not-looked', conversations: 1, newest: { modifiedAt: NOW } },
      { id: '-notes', path: '/work/Documents/Codex/notes', folder: 'not-looked', conversations: 1, newest: { modifiedAt: NOW } },
    ],
    unreadable: 0,
  };
  const run = startIn({ server: 'serve', home: '/work', projects: listing });
  const running = run.start.run(WEEK);
  while (run.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(run.rendered[0]?.projects?.rows.map((row) => row.id), ['-work-project', '-notes'], 'a folder not named by a day is a project');
  assert.equal(run.rendered[0]?.projects?.temporary, 1);
  run.serving.close?.();
  await running;
});

// which-project V20: a folder with no conversations of its own, inside a listed project, is told which one holds it.
test('the project whose folder holds this run\'s is named, with the way from it to here', async () => {
  const projects: ProjectListing = {
    projects: [
      { id: '-work-blog', path: '/work/blog', folder: 'there', conversations: 2, newest: { modifiedAt: NOW } },
      { id: '-work-blog-src-lib', path: '/work/blog/src/lib', folder: 'gone', conversations: 1, newest: { modifiedAt: NOW } },
    ],
    unreadable: 0,
  };
  const below = async (workingDirectory: string) => {
    const run = startIn({ server: 'serve', home: '/work', projects, workingDirectory });
    const running = run.start.run(WEEK);
    while (run.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
    run.serving.close?.();
    await running;
    return run.rendered[0]?.projects?.above;
  };
  assert.deepEqual(await below('/work/blog/src/lib/deep'), { id: '-work-blog', within: join('src', 'lib', 'deep') }, 'a folder that is gone holds nothing');
  assert.equal(await below('/work/blog'), undefined, 'the project itself is not above itself');
  assert.equal(await below('/work/shop'), undefined);
});

// which-project V12: the computer's folder window, opened by the server; what it answers decides what the page is told.
test('a folder chosen in the computer\'s window is shown, offered beside its nearest project, or refused', async () => {
  const listing: ProjectListing = {
    projects: [
      { id: '-work-project', path: '/work/project', folder: 'there', conversations: 3, newest: { modifiedAt: NOW } },
      { id: '-work-blog', path: '/work/blog', folder: 'there', conversations: 1, newest: { modifiedAt: NOW - DAY } },
    ],
    unreadable: 0,
  };
  const answers: Awaited<ReturnType<FolderChooser['choose']>>[] = [
    { cancelled: true },
    { chosen: '/work' },
    { chosen: '/work/project' },
    { chosen: '/work/project/src' },
    { chosen: '/work/blog/src' },
    { chosen: '/work/blog' },
  ];
  const prompts: string[] = [];
  const starts: (string | undefined)[] = [];
  const switched: string[] = [];
  const run = startIn({
    server: 'serve',
    home: '/work',
    projects: listing,
    folderChooser: { available: true, choose: async (prompt, startIn) => { prompts.push(prompt); starts.push(startIn); return answers.shift() ?? { cancelled: true }; } },
    switchTo: async (folder) => { switched.push(folder); return { url: `http://127.0.0.1:50000/${switched.length}/` }; },
  });
  const running = run.start.run(WEEK);
  while (run.serving.handle === undefined) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.rendered[0]?.projects?.choosable, true);
  const handle = run.serving.handle as (request: LocalRequest) => Promise<LocalResponse>;
  const ask = async (route: string, body: object) => {
    const answer = await handle({ method: 'POST', path: `/tok/${route}`, headers: { host: '127.0.0.1:43123', origin: 'http://127.0.0.1:43123', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: answer.status, body: JSON.parse(answer.body) as Record<string, unknown>, after: answer.after };
  };

  assert.equal((await ask('api/choose-folder', { lang: 'pl' })).body.kind, 'cancelled');
  assert.equal(prompts[0], 'Wybierz folder swojego projektu', 'the window is headed in the page\'s language');
  assert.equal(starts[0], '/work', 'VB1: it starts in the folder the project lies in - on this disk, where its neighbours are');
  assert.deepEqual((await ask('api/choose-folder', {})).body, { ok: true, kind: 'refused', not: 'home' });
  assert.deepEqual((await ask('api/choose-folder', {})).body, { ok: true, kind: 'here' }, 'the project shown already');
  assert.deepEqual((await ask('api/choose-folder', {})).body,
    { ok: true, kind: 'near', above: true, chosen: { id: 'folder-1', name: 'src', place: '~/project/src' }, projects: [{ id: '-work-project', name: 'project', place: '~/project', here: true }] },
    'a folder inside the project shown offers it, marked: the onboarding\'s step goes on in the page');

  const near = await ask('api/choose-folder', {});
  assert.deepEqual(near.body, { ok: true, kind: 'near', above: true, chosen: { id: 'folder-2', name: 'src', place: '~/blog/src' }, projects: [{ id: '-work-blog', name: 'blog', place: '~/blog' }] });
  assert.deepEqual(switched, [], 'nothing is shown before the person picks one');
  const anyway = await ask('api/switch-project', { id: 'folder-2' });
  assert.deepEqual([anyway.status, switched], [200, ['/work/blog/src']], 'the folder itself, by the id the server gave it');

  const itself = await ask('api/choose-folder', {});
  assert.deepEqual(itself.body, { ok: true, kind: 'switched', url: 'http://127.0.0.1:50000/2/', name: 'blog' }, 'with the name the page says it is switching to');
  assert.deepEqual(switched, ['/work/blog/src', '/work/blog']);
  itself.after?.();
  await running;
});

// `what-codex-wrote` X28a, §2.9, and `claude-desktop-conversations` CD5: both desktop apps name a conversation in a
// file of their own, seconds after it starts. Found by the maintainer: a row drawn in those seconds kept no title once
// its transcript stopped changing. A row with no title asks again when the page is read again; the adapter keeps an
// unchanged transcript's tail, so asking again is a look at the app's names, not another transcript read.
test('a Codex row read before Codex named it gets its title when the page is read again, its rollout unchanged', async () => {
  const codex = { id: 'thread-a', path: '/Users/someone/.codex/sessions/rollout-thread-a.jsonl', modifiedAt: NOW - 60_000, delegations: 0, provider: 'codex' as const };
  const world = { listing: { ...LISTING, sessions: [codex, ...LISTING.sessions] }, server: 'serve' as const, untitledOnce: 'thread-a' };
  const { start, serving, printed, rendered, titled } = startIn(world);
  const running = start.run(WEEK);
  while (serving.handle === undefined || printed.length === 0) await new Promise((resolve) => setImmediate(resolve));
  const get = () => (serving.handle as NonNullable<typeof serving.handle>)({ method: 'GET', path: '/tok/index.html', headers: { host: '127.0.0.1:43123' }, body: '' });

  assert.equal(rendered.at(-1)?.entries.find((entry) => entry.name === 'codex-thread-a')?.title, undefined, 'not named yet');
  await get();
  assert.equal(String(rendered.at(-1)?.entries.find((entry) => entry.name === 'codex-thread-a')?.title), 'Fix the thread-a build');
  assert.equal(titled.filter((id) => id === 'sess-old').length, 2, 'an untitled Claude Code row asks again too (CD5) - the desktop app may have named it since');

  serving.close?.();
  await running;
});

// F57a, found 2026-10-05: a Codex helper searched a tracked file for a name it does not hold, and then printed its first
// rows through `head`. The search left an attempt of unknown outcome, the read a told file - and read in that order, the
// unknown one named the file, so a row of a file the person chose Track for asked them to fix it.
test('a tracked file the record shows was read stays told, whatever else was tried on it', () => {
  const redactor = new Redactor('test');
  const path = redactor.path('customers.csv');
  const other = redactor.path('notes.txt');
  const base: SessionActions = {
    policy: redactor.term('BUILT-IN DEFAULT'), rotate: [], openRoutes: [], onlyInResults: [], unknown: [path, other],
    refusedAttempts: 0, secretShapes: [], mentions: 0,
  };

  assert.deepEqual(filesOf({ ...base, told: [path] }), [{ path, kind: 'told' }, { path: other, kind: 'unknown' }],
    'read is stronger than tried, and an attempt at another file keeps its own kind');
  assert.deepEqual(filesOf(base), [{ path, kind: 'unknown' }, { path: other, kind: 'unknown' }], 'tried and never read stays unknown');
});
