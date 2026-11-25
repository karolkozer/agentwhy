// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../src/core/delegation.ts';
import type { RefusalSource, ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { wanted, type FileCount } from '../../src/report/file-counts.ts';
import { RUN_FILES_KEPT, RUN_STEPS_KEPT } from '../../src/report/runs.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV16: how many times each private file was read, stopped or only seen.

let record = 0;
let sequence = 0;
function call(path: string, extra: Partial<ToolEvent> = {}, agentId = 'main'): ToolEvent {
  record += 1;
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete',
    result: { stage: 'model', completeness: 'complete', content: 'KEY=1', evidence }, ...extra,
  };
}

function stopped(path: string, refusedBy?: RefusalSource): ToolEvent {
  const made = call(path, { outcome: 'blocked' });
  return { ...made, result: { ...(made.result as NonNullable<ToolEvent['result']>), content: 'no', ...(refusedBy === undefined ? {} : { refusedBy }) } };
}

function listed(names: readonly string[]): ToolEvent {
  const made = call('', { toolName: 'Bash', targets: [], commands: ['ls -a'], resultShape: 'listing' });
  return { ...made, result: { ...(made.result as NonNullable<ToolEvent['result']>), content: names.join('\n') } };
}

function counts(events: ToolEvent[], helpers: string[] = [], policy: Policy = DEFAULT_POLICY, delegations: Delegation[] = []): readonly FileCount[] {
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations, events, completeness: 'complete', messages: [], gaps: [],
  };
  return buildReport(model, policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } }).fileCounts ?? [];
}
const of = (rows: readonly FileCount[], path: string): FileCount => {
  const row = rows.find((one) => (one.path as string) === path);
  assert.ok(row, `no row for ${path}`);
  return row;
};

test('a call counts once for a file, under the strongest thing it did', () => {
  const row = of(counts([call('.env'), call('.env'), listed(['.env', 'README.md'])]), '.env');
  assert.deepEqual([row.read, row.named, row.unknown, row.stopped], [2, 1, 0, 0]);
  assert.equal(wanted(row), 2);
});

test('an everyday file has no row, and no private file gives none', () => {
  assert.deepEqual(counts([call('src/a.ts'), listed(['src/a.ts'])]), []);
});

test('a stop is counted by who did it, a stop of no source a rule\'s', () => {
  const row = of(counts([stopped('.env'), stopped('.env', 'rule'), stopped('.env', 'reviewer'), stopped('.env', 'person')]), '.env');
  assert.equal(row.stopped, 4);
  assert.deepEqual(row.stoppedBy, { rule: 2, reviewer: 1, person: 1 });
  assert.equal(wanted(row), 4);
});

test('past the files a step keeps, every one is counted', () => {
  const names = Array.from({ length: RUN_FILES_KEPT + 6 }, (_, i) => `secrets/${i}/.env`);
  assert.equal(counts([listed(names)]).filter((row) => row.named === 1).length, names.length);
});

test('past the steps a page lists, every call is counted', () => {
  const row = of(counts(Array.from({ length: RUN_STEPS_KEPT + 5 }, () => call('.env'))), '.env');
  assert.equal(row.read, RUN_STEPS_KEPT + 5);
});

test("a helper's calls count, and are said to be a helper's", () => {
  const row = of(counts([call('.env'), call('.env', {}, 'helper'), call('.env', {}, 'helper')], ['helper']), '.env');
  assert.deepEqual([row.read, row.helpers, row.agents], [3, 2, 2]);
});

test('a file the person tracks is a tracked row', () => {
  const policy: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/prices.md', mode: 'tell' } as Policy['protected'][number]] };
  const rows = counts([call('notes/prices.md'), call('.env')], [], policy);
  assert.equal(of(rows, 'notes/prices.md').tracked, true);
  assert.equal(of(rows, '.env').tracked, false);
});

test('a call of no known end is not known, and is wanted', () => {
  const row = of(counts([call('.env', { outcome: 'unknown' })]), '.env');
  assert.deepEqual([row.read, row.unknown], [0, 1]);
  assert.equal(wanted(row), 1);
});

test('most wanted first, then by name', () => {
  const rows = counts([call('b/.env'), call('a/.env'), call('a/.env'), listed(['c/.env'])]);
  assert.deepEqual(rows.map((row) => row.path as string), ['a/.env', 'b/.env', 'c/.env']);
});

test('the sum of a row is the number of calls that met it', () => {
  const row = of(counts([call('.env'), stopped('.env'), call('.env', { outcome: 'unknown' }), listed(['.env'])]), '.env');
  assert.equal(row.read + row.changed + row.opened + row.named + row.unknown + row.stopped, 4);
});

// Measured 2026-11-24: counted first, two real pages numbered their hidden names the other way round.
test('counting renames nothing the rest of the report hides', () => {
  const folder = (letter: string) => `${letter}k9Xq7Zp2Lm4Vt8Rw3Yb6Nc1Hs5Jd0Fg${letter}`;
  const events = [call(`${folder('A')}/.env`, {}, 'helper'), call(`${folder('B')}/.env`)];
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }, { id: 'helper', depth: 1 }],
    delegations: [], events, completeness: 'complete', messages: [], gaps: [],
  };
  const { fileCounts: rows, ...rest } = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const named = JSON.stringify(rest);
  for (const row of rows ?? []) assert.ok(named.includes(JSON.stringify(row.path)), `the report names ${row.path as string} as the count does`);
});
