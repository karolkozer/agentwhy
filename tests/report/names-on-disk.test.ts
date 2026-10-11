// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { posix } from 'node:path';
import { mainSource } from '../../src/core/evidence.ts';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import type { DirectoryEntry, DirectoryReader, EntryKind } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { buildReport, writtenNamesOf, type WrittenName } from '../../src/report/build-report.ts';
import { NamesOnDisk } from '../../src/report/names-on-disk.ts';
import type { ReportModel } from '../../src/report/report-model.ts';
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import type { ReportOptions } from '../../src/report/report-use-case.ts';
import { SessionReport } from '../../src/report/session-report.ts';

// `2026-10-11-a-name-that-is-no-file.md` NX2-NX4. Codex asks after instruction files in every folder above the project -
// `for p in /AGENTS.md /Users/someone/Projects/AGENTS.md …`, `rg --files -g AGENTS.md` - and each name was a row *Name only* (NXB2).

const ROOT = '/Users/someone/Projects/course';

/** A directory tree held in memory: a path to its kind, and what was asked of it. */
function tree(paths: Readonly<Record<string, EntryKind>>, unreadable: readonly string[] = []): DirectoryReader & { readonly asked: string[] } {
  const asked: string[] = [];
  const kindOf = async (path: string): Promise<EntryKind> => {
    asked.push(path);
    if (unreadable.includes(path)) throw new FileAccessError('unreadable', path);
    const kind = paths[path];
    if (kind === undefined) throw new FileAccessError('not-found', path);
    return kind;
  };
  const list = async (path: string): Promise<readonly DirectoryEntry[]> => {
    if (paths[path] !== 'directory') throw new FileAccessError('not-found', path);
    return Object.entries(paths)
      .filter(([each]) => posix.dirname(each) === path && each !== path)
      .map(([each, kind]) => ({ name: posix.basename(each), kind }));
  };
  return { asked, kindOf, list, modifiedAt: async () => 0 };
}

const PROJECT: Readonly<Record<string, EntryKind>> = {
  [ROOT]: 'directory',
  [`${ROOT}/docs`]: 'directory',
  [`${ROOT}/docs/detection.md`]: 'file',
  [`${ROOT}/docs/oldarchive`]: 'directory',
  [`${ROOT}/docs/oldarchive/x.md`]: 'file',
  [`${ROOT}/dist`]: 'directory',
  [`${ROOT}/dist/cli.js`]: 'file',
  [`${ROOT}/node_modules`]: 'directory',
  [`${ROOT}/node_modules/left-pad.js`]: 'file',
  '/Users/someone/AGENTS.md': 'file',
};

const known = { kind: 'known', path: ROOT } as const;
const name = (key: string, places: readonly string[], relative?: string): WrittenName => ({ key, places, ...(relative === undefined ? {} : { relative }) });

test('NX2: a name on no disk at any of its places is absent, and one on disk at any is not', async () => {
  const disk = new NamesOnDisk({ directories: tree(PROJECT) });
  const absent = await disk.absent([
    name('missing', ['/AGENTS.md']),
    name('there', ['/Users/someone/AGENTS.md']),
    name('either', ['/nowhere/a.md', `${ROOT}/docs/detection.md`]),
  ], known);
  assert.deepEqual([...absent], ['missing']);
});

// NXB3: 153 of the first 1264 names left out were files in a folder the line had moved to - `grep -n detection.md …` after
// a `cd`, placed at the project's root. A relative name is looked for anywhere in the project, build output included.
test('NX2: a relative name is looked for anywhere in the project before it is called absent', async () => {
  const disk = new NamesOnDisk({ directories: tree(PROJECT) });
  const absent = await disk.absent([
    name('elsewhere', [`${ROOT}/detection.md`], 'detection.md'),
    name('built', [`${ROOT}/cli.js`], 'cli.js'),
    name('a part of a folder', [`${ROOT}/archive/x.md`], 'archive/x.md'),
    name('a package', [`${ROOT}/left-pad.js`], 'left-pad.js'),
    name('nowhere', [`${ROOT}/AGENTS.md`], 'AGENTS.md'),
  ], known);
  assert.deepEqual([...absent].sort(), ['a package', 'a part of a folder', 'nowhere'],
    'a file under node_modules is not indexed, and `docs/oldarchive/x.md` is no `archive/x.md`');
});

test('NX4: a place that cannot be looked at, or a project no longer there, keeps its names; each place is looked at once', async () => {
  const directories = tree(PROJECT, ['/Volumes/share/AGENTS.md']);
  const absent = await new NamesOnDisk({ directories }).absent([
    name('unreadable', ['/Volumes/share/AGENTS.md']),
    name('twice', ['/AGENTS.md']),
    name('twice again', ['/AGENTS.md']),
  ], known);
  assert.deepEqual([...absent].sort(), ['twice', 'twice again']);
  assert.equal(directories.asked.filter((path) => path === '/AGENTS.md').length, 1);

  const gone = await new NamesOnDisk({ directories: tree(PROJECT) }).absent(
    [name('in a removed worktree', ['/Users/someone/Projects/course-old/x.md'], 'x.md')],
    { kind: 'known', path: '/Users/someone/Projects/course-old' },
  );
  assert.deepEqual([...gone], [], 'an index that could not be built keeps every relative name');
  const unknown = await new NamesOnDisk({ directories: tree(PROJECT) }).absent([name('no project', [`${ROOT}/x.md`], 'x.md')], { kind: 'absent' });
  assert.deepEqual([...unknown], []);

  // A project too large to index in a run keeps every relative name it could not find.
  const large: Record<string, EntryKind> = { [ROOT]: 'directory' };
  for (let at = 0; at <= 50_000; at += 1) large[`${ROOT}/f${at}.txt`] = 'file';
  const kept = await new NamesOnDisk({ directories: tree(large) }).absent([name('in a large project', [`${ROOT}/x.md`], 'x.md')], known);
  assert.deepEqual([...kept], []);
});

const evidence = (record: number) => ({ source: mainSource(), record });
function call(id: string, command: string, overrides: Partial<ToolEvent> = {}): ToolEvent {
  return {
    id, agentId: 'main', sequence: evidence.length, toolName: 'Bash', input: { command }, targets: [], commands: [command], resultShape: 'listing',
    toolKnown: true, outcome: 'succeeded', workingDirectory: ROOT, evidence: evidence(1), completeness: 'complete', ...overrides,
  };
}
function sessionOf(events: readonly ToolEvent[]): SessionModel {
  return {
    provider: 'codex', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 'main',
    projectRoot: known, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events, messages: [], gaps: [],
    completeness: 'complete',
  } as unknown as SessionModel;
}
const asking = call('ask', 'for p in /AGENTS.md /Users/someone/Projects/AGENTS.md; do if [ -f "$p" ]; then cat "$p"; fi; done', { outcome: 'unknown' });
const listing = call('list', 'ls docs/detection.md docs/old.md', { result: { content: 'docs/detection.md\n', stage: 'model', completeness: 'complete', evidence: evidence(2) } });
const stopped = call('stop', 'cat docs/gone.md', { outcome: 'blocked' });
const TRACKED: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/secret-plan.md', mode: 'tell' }] };
const privateName = call('priv', 'ls secret-plan.md');

function reportOf(events: readonly ToolEvent[], absent?: ReadonlySet<string>): ReportModel {
  const model = sessionOf(events);
  return buildReport(model, TRACKED, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot, ...(absent === undefined ? {} : { absent }) });
}
const rows = (report: ReportModel) => report.everydayFiles.map((file) => `${String(file.path)} ${file.how}`).sort();

test('NX2: the names only a call wrote, with their places; never a printed one, a stopped call\'s or a private file\'s', () => {
  const folder = call('dir', 'ls ../docs/archive/ notes.md', { workingDirectory: `${ROOT}/src` });
  const homes = call('home', 'ls ~/notes/todo.md');
  const names = writtenNamesOf(sessionOf([asking, listing, stopped, privateName, folder, homes]), TRACKED, '/Users/someone');
  assert.deepEqual(names.map(({ key, places, relative }) => [key.split('\u0000'), places, relative]), [
    [['ask', '/AGENTS.md'], ['/AGENTS.md'], undefined],
    [['ask', '/Users/someone/Projects/AGENTS.md'], ['/Users/someone/Projects/AGENTS.md'], undefined],
    [['list', 'docs/old.md'], [`${ROOT}/docs/old.md`], 'docs/old.md'],
    // From the call's folder and the project's; looked for anywhere as `docs/archive`, the folder `docs/archive/` names.
    [['dir', '../docs/archive/'], [`${ROOT}/docs/archive`, '/Users/someone/Projects/docs/archive'], 'docs/archive'],
    [['dir', 'notes.md'], [`${ROOT}/src/notes.md`, `${ROOT}/notes.md`], 'notes.md'],
    [['home', '~/notes/todo.md'], ['/Users/someone/notes/todo.md'], undefined],
  ]);
});

test('NX2, NX3: a name of no file is no row and no step; what the record proves stays', () => {
  const events = [asking, listing, stopped, privateName];
  const before = reportOf(events);
  assert.deepEqual(rows(before), ['/AGENTS.md named', '/Users/someone/Projects/AGENTS.md named', 'docs/detection.md named', 'docs/gone.md stopped', 'docs/old.md named']);

  const absent = new Set(writtenNamesOf(sessionOf(events), TRACKED).map((each) => each.key));
  const after = reportOf(events, absent);
  assert.deepEqual(rows(after), ['docs/detection.md named', 'docs/gone.md stopped'], 'the listing printed one; the other call was stopped');
  assert.ok(after.findings.some((finding) => String(finding.path) === 'secret-plan.md'), 'a private name keeps its row (P32a)');
  assert.ok(!(after.fileSteps ?? []).some((step) => String(step.path).includes('AGENTS.md') || String(step.path) === 'docs/old.md'), 'and no step');
  assert.ok((before.fileSteps ?? []).some((step) => String(step.path) === '/AGENTS.md'));
});

test('NX2: a report asks which names are on disk before it is built', async () => {
  const model = sessionOf([asking, listing]);
  const asked: WrittenName[][] = [];
  const useCase = new SessionReport({
    home: '/Users/someone',
    reader: { read: async () => ({ kind: 'read', model }) },
    files: {
      readText: async (path: string) => { throw new FileAccessError('not-found', path); },
      readLines: () => { throw new FileAccessError('not-found', 'lines'); },
      writeText: async () => undefined,
      ensureDirectory: async () => undefined,
    },
    names: { absent: async (names: readonly WrittenName[]) => (asked.push([...names]), new Set(names.map((each) => each.key))) },
    createRedactor: (projectRoot: SessionModel['projectRoot']) => new Redactor('test', projectRoot),
    createRenderer: (options: ReportOptions) => new TextReportRenderer(options.width),
    htmlRenderer: { render: () => '<!doctype html>' },
    catalogue: { list: async () => ({ directory: '/stored/project', found: false, searched: [], sessions: [] }) },
    workingDirectory: ROOT,
    browser: { open: async () => true },
    temporaryDirectory: '/tmp',
    now: 0,
  } as unknown as ConstructorParameters<typeof SessionReport>[0]);
  const result = await useCase.run({ format: 'text', width: 100, share: false, open: false, input: '/x.jsonl', policy: DEFAULT_POLICY } as unknown as ReportOptions);
  assert.deepEqual(asked.map((names) => names.map((each) => each.key.split('\u0000')[1])), [['/AGENTS.md', '/Users/someone/Projects/AGENTS.md', 'docs/old.md']]);
  assert.equal(result.reached, 1, 'the one file a listing printed');
});
