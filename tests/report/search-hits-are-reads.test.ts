// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { actionsOf } from '../../src/report/check/session-actions.ts';
import { filesRead } from '../../src/report/flow-reads.ts';
import { fileStory } from '../../src/report/render/report-page/file-story.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../src/report/render/report-page/to-do.ts';
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import type { FlowReached } from '../../src/report/report-model.ts';

// `.ai/specs/2026-09-25-search-hits-are-reads.md`: a search's hit line is a line of the file it names. The row below is
// invented - the shape of the maintainer's find of 2026-09-24, none of its data - and the key is assembled at run time.
const ROW = '5,Ada,Lovelace,ada@example.test,+48 500 000 000,Poznan,PL';
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');
const WITH_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };
const TOLD_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };

let sequence = 0;
function shell(command: string, output: string, extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName: 'Bash', input: {}, targets: [], commands: [command],
    resultShape: 'listing', toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: output, evidence },
    ...extra,
  };
}

function session(events: ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [], events, completeness: 'complete', messages: [], gaps: [],
  };
}

const report = (events: ToolEvent[], policy: Policy = WITH_CSV) =>
  buildReport(session(events), policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
const reached = (model: ReturnType<typeof report>): FlowReached[] =>
  model.flows.flatMap((flow) => flow.steps).filter((step): step is FlowReached => step.kind === 'reached');
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// H1, H5, H7, H8, H11: the maintainer's case - a search for a name printed a customer's row. A recursive search writes
// what it found as `./customers.csv`; since 2026-10-07 a path is recorded as the file is named, so one file is one row
// however the line that reached it wrote it (`protected-access.ts`, `sameFile`).
test('a row a search printed makes the file read, counted, and to see to - and nothing of the row is kept', () => {
  const model = report([shell('grep -rniI -e "Ada" .', `./customers.csv:6:${ROW}\n./src/app.ts:3:// Ada`)]);
  const [step] = reached(model);

  assert.deepEqual(step?.lines, [{ path: 'customers.csv', count: 1 }]);
  assert.equal(step?.carriedValue, false, 'no value was traced: the line itself is what was read');
  assert.deepEqual(step === undefined ? [] : filesRead(step), ['customers.csv']);
  assert.equal(model.stories[0]?.lines, 1);
  assert.deepEqual(model.privateFiles.map((file) => [file.path, file.keys, file.names, file.mixed]), [['customers.csv', [], [], undefined]], 'a row names no key');

  assert.deepEqual(actionsOf(model).rotate.map((file) => file.path), ['customers.csv'], 'H7: on the list, as data');
  assert.deepEqual(toDoItems(model).map((item) => [item.path, item.kind]), [['customers.csv', 'data']]);
  const [entry] = fileStory(model, 'customers.csv').entries;
  assert.deepEqual([entry?.kind, entry?.lines, entry?.inResult], ['read', 1, true]);

  const page = english(new ReportPageRenderer().render({ report: model, withIndexLink: false }));
  assert.match(page, /No command asked for this file\. <code>Bash \(grep\)<\/code> printed 1 line of it\./);
  assert.match(new TextReportRenderer(100).render(model), /in a result · 1 line printed +reached/);
  for (const text of ['Lovelace', 'ada@example.test', '500 000', 'Poznan']) {
    assert.ok(!JSON.stringify(model).includes(text), `the model holds no "${text}"`);
    assert.ok(!page.includes(text), `the page holds no "${text}"`);
  }
});

// H2, H3 (HD3), H6: lines are credited to their own file, context lines count, and a key line is read as one.
test('a key line and the lines around it are that file’s alone, read for names and never for values', () => {
  const output = [
    './.env-1-# payments',
    `./.env:2:STRIPE_SECRET_KEY=${STRIPE}`,
    './.env-3-SUPABASE_URL=https://project.example.test',
    '--',
    `./customers.csv:6:${ROW}`,
  ].join('\n');
  const model = report([shell('grep -rn -C1 -e STRIPE -e Ada .', output)]);

  assert.deepEqual(reached(model)[0]?.lines, [{ path: '.env', count: 3 }, { path: 'customers.csv', count: 1 }]);
  const env = model.privateFiles.find((file) => file.path === '.env');
  assert.deepEqual(env?.names, ['STRIPE_SECRET_KEY', 'SUPABASE_URL']);
  assert.deepEqual(env?.keyed.map((line) => [line.name, line.key]), [['STRIPE_SECRET_KEY', 'stripe-key']]);
  assert.equal(env?.mixed, undefined, 'a hit says whose it is, so nothing is mixed');
  assert.deepEqual(model.privateFiles.find((file) => file.path === 'customers.csv')?.names, [], 'the other file gets none of .env’s names');
  assert.ok(!JSON.stringify(model).includes(STRIPE));
  assert.ok(!JSON.stringify(model).includes('project.example.test'));
});

// H1, H12, H13: what printed no line of a file read nothing of it.
test('a search that printed names, counts or nothing it finished leaves the file only named', () => {
  for (const [command, output, outcome] of [
    ['grep -rl Ada .', './customers.csv\n./src/app.ts', 'succeeded'],
    ['grep -rc Ada .', './customers.csv:2\n./src/app.ts:1', 'succeeded'],
    ['rg --files', './customers.csv', 'succeeded'],
    ['grep -rn Ada .', `./customers.csv:6:${ROW}`, 'unknown'],
  ] as const) {
    const model = report([shell(command, output, outcome === 'unknown' ? { outcome, completeness: 'partial' } : {})]);
    assert.equal(reached(model)[0]?.lines, undefined, command);
    assert.deepEqual(actionsOf(model).rotate, [], command);
    assert.notEqual(fileStory(model, 'customers.csv').entries[0]?.kind, 'read', command);
  }
});

// H3: one file searched prints its lines with no path, and every one of them is that file's.
test('a search of one named file is a read of the lines it printed', () => {
  const model = report([shell('grep KEY .env', `STRIPE_SECRET_KEY=${STRIPE}\nOTHER_KEY=plain`)]);
  assert.deepEqual(reached(model)[0]?.lines, [{ path: '.env', count: 2 }]);
  assert.deepEqual(model.privateFiles[0]?.names, ['STRIPE_SECRET_KEY', 'OTHER_KEY']);
  const [entry] = fileStory(model, '.env').entries;
  assert.deepEqual([entry?.kind, entry?.lines, entry?.inResult], ['read', 2, undefined]);
  assert.deepEqual(actionsOf(model).rotate.map((file) => [file.path, file.keyed]), [['.env', true]]);
  const page = english(new ReportPageRenderer().render({ report: model, withIndexLink: false }));
  assert.match(page, /A search printed 2 lines of this file, with <code>Bash \(grep\)<\/code>\./);

  // A colon in a line's text is not a file name before it: `https:` is no path, and the line is still .env's.
  for (const command of ['grep URL .env', 'rg URL .env', 'grep -rn URL .env']) {
    const url = report([shell(command, (command.includes('-n') ? '3:' : '') + 'SUPABASE_URL=https://project.example.test')]);
    assert.deepEqual(reached(url)[0]?.lines, [{ path: '.env', count: 1 }], command);
    assert.deepEqual(url.privateFiles[0]?.names, ['SUPABASE_URL'], command);
  }
});

// H1: the Grep tool, where its input asked for the matching lines.
test('the Grep tool in content mode prints lines, and in its default mode names files', () => {
  const lines = report([shell('', `customers.csv:6:${ROW}`, { toolName: 'Grep', commands: [], printsMatches: true })]);
  assert.deepEqual(reached(lines)[0]?.lines, [{ path: 'customers.csv', count: 1 }]);
  const names = report([shell('', 'customers.csv', { toolName: 'Grep', commands: [] })]);
  assert.equal(reached(names)[0]?.lines, undefined);
});

// H7 with F57a: a file the person only asked to hear about was let be read; a row in it is not something to fix.
test('a told data file a search printed stays off the list, and is still said to be read', () => {
  const model = report([shell('grep -rn Ada .', `./customers.csv:6:${ROW}`)], TOLD_CSV);
  assert.deepEqual(actionsOf(model).rotate, []);
  assert.deepEqual(actionsOf(model).told, ['customers.csv']);
  assert.equal(fileStory(model, 'customers.csv').entries[0]?.kind, 'read');
});

// A step repeated is drawn once, from its first call: a names-only search must not swallow the read after it.
test('a search that printed lines is never merged into one before it that printed names', () => {
  const model = report([shell('grep -rl Ada .', './customers.csv'), shell('grep -rn Ada .', `./customers.csv:6:${ROW}`)]);
  assert.deepEqual(fileStory(model, 'customers.csv').entries.map((entry) => entry.kind), ['named', 'read']);
});
