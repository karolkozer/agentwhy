import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../../src/core/policy/policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { fileStory, savedInto } from '../../../../src/report/render/report-page/file-story.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';

// `specs/2026-09-23-the-report-page.md` P12-P17: what happened to one file, from the model's facts and nothing else.
// Keys are assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');
const WITH_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };

let sequence = 0;
function read(path: string, content: string, agentId = 'main', extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

function session(events: ToolEvent[], delegations: Delegation[] = []): SessionModel {
  const helpers = [...new Set(events.map((event) => event.agentId).filter((id) => id !== 'main'))];
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations, events, completeness: 'complete', messages: [], gaps: [],
  };
}

const report = (events: ToolEvent[], delegations: Delegation[] = [], policy: Policy = DEFAULT_POLICY) =>
  buildReport(session(events, delegations), policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });

/** A helper asked to look, which read the file and passed a value from it back to your AI. */
const HELPED: Delegation[] = [{
  followUps: [],
  id: 'task', parentAgentId: 'main', childAgentId: 'helper', description: 'Find out why the app breaks', prompt: 'p',
  reports: [{ content: `found ${STRIPE}`, evidence: { source: { kind: 'agent', agentId: 'helper' }, record: 90 } }],
  evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
}];

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// P13, P14: in the record's order - your AI's steps, then the helper's - and a value that came back is its own entry.
test('the story is every step that named the file, agent by agent, in the record’s order', () => {
  const story = fileStory(report([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'helper')], HELPED), 'apps/web/.env');

  assert.deepEqual(story.entries.map((entry) => [entry.agent.ordinal ?? 'main', entry.kind]), [['main', 'read'], [1, 'read'], [1, 'passed']]);
  assert.equal(story.entries[2]?.to?.ordinal, undefined, 'passed back to your AI');
  assert.equal(story.readers, 2);
  assert.equal(story.opened, 2);
  assert.equal(story.stopped, 0);
  assert.deepEqual(story.holders.map((holder) => [holder.read, holder.passed]), [[true, false], [true, true]]);
  assert.equal(story.holders[1]?.agent.broughtBy, 'main');
});

test('a refused read is a stop, and is counted as one', () => {
  const events = [read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/web/.env', 'Permission denied', 'main', { outcome: 'blocked' })];
  const story = fileStory(report(events), 'apps/web/.env');
  assert.deepEqual(story.entries.map((entry) => entry.kind), ['read', 'stopped']);
  assert.equal(story.stopped, 1);
  assert.equal(story.opened, 1);
});

// R5, found by a review: `savedInto` walks the flows once instead of telling a story per row, and must still say what
// the stories say - of two files, each saved on by another agent, whether asked about together or one alone.
test('the files a value was saved into are the ones the stories of the paths asked about name, and no others', () => {
  const write = (path: string, text: string, agentId = 'main'): ToolEvent =>
    read(path, '', agentId, { toolName: 'Write', written: [text], outcome: 'unknown', resultShape: 'none' });
  const model = report([
    read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), write('backup/web.txt', `STRIPE_SECRET_KEY=${STRIPE}`),
    read('data/customers.csv', 'name,email\nAda,ada@example.test', 'helper'), write('backup/customers.csv', 'Ada,ada@example.test', 'helper'),
  ], [], WITH_CSV);
  const both = ['apps/web/.env', 'data/customers.csv'];
  const told = both
    .flatMap((path) => fileStory(model, path).entries.flatMap((entry) => (entry.kind === 'saved' ? (entry.into ?? []) : [])))
    .map(String).sort();

  assert.deepEqual(told, ['backup/customers.csv', 'backup/web.txt'], 'the stories name one file each');
  assert.deepEqual(savedInto(model, both).map(String).sort(), told);
  assert.deepEqual(savedInto(model, ['apps/web/.env']).map(String), ['backup/web.txt'], 'a path not asked about adds nothing');
});

// P12-P17 on the page: one window per to-do item, reached from its card.
test('every card’s "What happened" opens a window that tells the story in words', () => {
  const html = new ReportPageRenderer().render({
    report: report([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'helper')], HELPED),
    withIndexLink: false,
  });
  const page = english(html);
  assert.match(html, /<dialog class="pp pp-wide" id="story-0"/);
  assert.match(page, /2 AIs read the keys in this file — and now they have them\./);
  assert.match(page, /Opened the file and read the keys[\s\S]*?A helper read the keys too[\s\S]*?It was asked to “Find out why the app breaks”\.[\s\S]*?Passed what it read back to your AI/);
  assert.match(page, /It was exposed[\s\S]*?The AI now has this information[\s\S]*?Everything above is now in your conversation with the AI\./);
  assert.match(page, /Brought in by your AI/);
  assert.match(page, /We only see what the AI wrote down, not what it was thinking\./);
});

// P15: every line joins two boxes the hover script knows, and a helper hangs below the row your AI's line runs along.
test('the diagram joins its boxes by lines, with each box saying what it did and no label on a line', () => {
  const html = new ReportPageRenderer().render({
    report: report([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'helper')], HELPED),
    withIndexLink: false,
  });
  const window = html.slice(html.indexOf('id="story-0"'));
  const diagram = window.slice(window.indexOf('data-diagram'), window.indexOf('hd-hint'));
  const edges = [...diagram.matchAll(/data-from="(\w+)" data-to="(\w+)"/g)].map(([, from, to]) => from + '>' + to);
  const helper = edges.find((edge) => edge.startsWith('a0>h'))?.slice(3) as string;
  assert.deepEqual(edges, ['you>a0', 'a0>' + helper, 'a0>file', helper + '>file', 'file>company']);
  for (const id of ['you', 'a0', helper, 'file', 'company']) assert.match(diagram, new RegExp('data-node="' + id + '"'), id);
  const top = (id: string): number => Number(new RegExp('data-node="' + id + '" style="[^"]*top:(\\d+)px').exec(diagram)?.[1]);
  assert.ok(top(helper) > top('a0'), 'the helper hangs below your AI');
  assert.equal(top('a0'), top('file'), 'your AI and the file share a row');
  assert.ok(!diagram.includes('sd-label'), 'no label sits on a line');
});

// P15: where only a helper read the file, your AI has no line to it, so the helper stands on the file's row and the
// chain runs straight: you, your AI, the helper, the file, the company.
test('the diagram keeps a helper on the file\'s row where your AI never reached the file itself', () => {
  const html = new ReportPageRenderer().render({
    report: report([read('src/app.ts', 'export {};'), read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'helper')], HELPED),
    withIndexLink: false,
  });
  const window = html.slice(html.indexOf('id="story-0"'));
  const diagram = window.slice(window.indexOf('data-diagram'), window.indexOf('hd-hint'));
  const edges = [...diagram.matchAll(/data-from="(\w+)" data-to="(\w+)"/g)].map(([, from, to]) => from + '>' + to);
  const helper = edges.find((edge) => edge.startsWith('a0>h'))?.slice(3) as string;
  assert.ok(!edges.includes('a0>file'), 'your AI has no line to the file');
  const top = (id: string): number => Number(new RegExp('data-node="' + id + '" style="[^"]*top:(\\d+)px').exec(diagram)?.[1]);
  assert.equal(top(helper), top('a0'), 'the helper stands on the row');
  assert.equal(top(helper), top('file'), 'in line with the file');
});

// F24, F51: the company's copy is never said to stay or to be beyond deleting, and nothing is said about the contents.
test('the window never says the copy stays, and says nothing about what the file holds', () => {
  const page = english(new ReportPageRenderer().render({ report: report([read('data/customers.csv', 'name,email\nAda,ada@example.test')], [], WITH_CSV), withIndexLink: false }));
  for (const words of ['stays there', 'can’t delete', 'can\'t be deleted', 'keeps a copy', 'names and emails', 'customers']) {
    // The wizard's answers describe what each choice means in general (F49); they say nothing about this file.
    const said = page.replace(/customers\.csv/g, '').replace(/People’s details \(customers, users, staff\)/g, '').replace(/<span class="wz-option-what">[\s\S]*?<\/span>/g, '');
    assert.ok(!said.includes(words), words);
  }
  assert.match(page, /Your AI read this file — and now it has this information\./, 'a file with no key is "read", not "the keys"');
});

// P16, M4: until times are in the model, the record has no time column and says order is the record's.
test('the full record lists each event in order, with no clock time', () => {
  const page = english(new ReportPageRenderer().render({ report: report([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]), withIndexLink: false }));
  assert.match(page, /1 event · in order/);
  assert.ok(!/<span>Time<\/span>/.test(page), 'no time column');
  assert.match(page, /Files like this usually hold keys and passwords\./);
  assert.match(page, /\*\*\/\.env\*/);
});

// P17, P44: a file marked done says so at the foot of its window.
test('a done file’s window shows Done instead of Fix it', () => {
  const events = [read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)];
  const open = new ReportPageRenderer().render({ report: report(events), withIndexLink: false });
  const done = new ReportPageRenderer().render({ report: report(events), withIndexLink: false, marks: new Map([['apps/web/.env', 'rotated']]) });
  assert.match(open, /<span data-story-fix="0">[\s\S]*?<span data-story-fixed="0" hidden>/);
  assert.match(done, /<span data-story-fix="0" hidden>[\s\S]*?<span data-story-fixed="0">/);
});
