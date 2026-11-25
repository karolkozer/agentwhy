// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';
import { conversationAnswer } from '../../../src/report/answers/conversation-answer.ts';
import { listAnswer } from '../../../src/report/answers/list-answer.ts';
import type { SessionIndex } from '../../../src/report/start/session-index.ts';
import { buildReport } from '../../../src/report/build-report.ts';
import type { ReportModel } from '../../../src/report/report-model.ts';
import { lookOfReport, placeInChat } from '../../../src/report/render/chat/chat-answer.ts';
import { translator } from '../../../src/report/render/report-copy.ts';
import { fileRows } from '../../../src/report/render/report-page/files.ts';
import { toDoItems } from '../../../src/report/render/report-page/to-do.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV1, CV11, CV12: what is answered about one conversation.

let record = 0;
let sequence = 0;
function call(path: string, content = 'x', extra: Partial<ToolEvent> = {}, agentId = 'main'): ToolEvent {
  record += 1;
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}
const edit = (path: string): ToolEvent => call(path, 'ok', { toolName: 'Edit', resultShape: 'none', written: ['text'] });
function handOver(child: string, description: string): { event: ToolEvent; delegation: Delegation } {
  const event = call('', 'done', { id: 'task-' + child, toolName: 'Task', targets: [], resultShape: 'none' });
  return { event, delegation: { followUps: [], id: event.id, parentAgentId: 'main', childAgentId: child, description, prompt: 'p', reports: [], evidence: event.evidence, completeness: 'complete' } };
}
function report(events: ToolEvent[], delegations: Delegation[] = [], gaps: SessionModel['gaps'] = []): ReportModel {
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, ...delegations.map((each) => ({ id: each.childAgentId as string, depth: 1 }))],
    delegations, events, completeness: gaps.length === 0 ? 'complete' : 'partial', messages: [], gaps,
  };
  return buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
}
const t = translator('en');

test('its look and its numbers are the page\'s', () => {
  const built = report([call('src/a.ts'), call('.env', 'KEY=1'), call('.env', 'no', { outcome: 'blocked' }), call('keys/a.pem', 'no', { outcome: 'blocked' })]);
  const answer = conversationAnswer(built, t);
  const rows = fileRows(built, toDoItems(built), new Set(), undefined).filter((row) => row.private);
  assert.equal(answer.look, lookOfReport(built));
  assert.equal(answer.numbers.read, rows.filter((row) => row.access === 'read').length);
  assert.equal(answer.numbers.stopped, rows.filter((row) => row.access === 'stopped').length);
  assert.equal(answer.files.length, rows.length);
});

test('the strip is one step each, and the moments that matter are said with their places', () => {
  const answer = conversationAnswer(report([edit('src/a.ts'), edit('src/b.ts'), call('.env', 'KEY=1'), call('config/.env', 'KEY=1'), edit('src/c.ts')]), t);
  assert.equal(answer.steps.n, 5);
  assert.deepEqual(answer.steps.list.map((step) => step.tone), ['grey', 'grey', 'coral', 'coral', 'grey']);
  assert.deepEqual(answer.steps.moments.map((moment) => [moment.from, moment.to, moment.tone]), [[3, 4, 'coral']]);
  assert.equal(answer.steps.ordinary, 3);
  assert.ok(answer.steps.moments[0]?.said.includes('2'));
  assert.ok(!/[`*_]/.test(answer.steps.moments[0]?.said ?? ''), 'plain words, no Markdown');
});

test('a helper is said with its task and what it reached', () => {
  const { event, delegation } = handOver('helper', 'Check the payment settings');
  const answer = conversationAnswer(report([event, call('config/.env', 'KEY=1', {}, 'helper')], [delegation]), t);
  assert.deepEqual(answer.helpers.map((helper) => [helper.helper, helper.asked, helper.files.map((file) => file.path)]), [[1, 'Check the payment settings', ['config/.env']]]);
  assert.equal(answer.numbers.helpers, 1);
});

test('a path above the project is its name and where it lies, in every part', () => {
  const answer = conversationAnswer(report([call('/Users/someone/elsewhere/.env', 'KEY=1')]), t);
  assert.ok(!JSON.stringify(answer).includes('/Users/someone'));
  assert.equal(answer.files[0]?.path, '.env');
  assert.ok(answer.files[0]?.place !== undefined);
});

test('a record with a gap says why, and one without says nothing of it', () => {
  assert.equal(conversationAnswer(report([call('src/a.ts')]), t).notChecked, undefined);
  const gap = { kind: 'session-truncated', detail: 'x' } as unknown as SessionModel['gaps'][number];
  const answer = conversationAnswer(report([call('src/a.ts')], [], [gap]), t);
  if (answer.look === 'unchecked') assert.ok((answer.notChecked ?? []).length > 0);
});

test('no step recorded is said as none, and breaks nothing', () => {
  const answer = conversationAnswer(report([]), t);
  assert.deepEqual([answer.steps.n, answer.steps.moments, answer.files, answer.todo], [0, [], [], []]);
});

test('a file the person marked done is not asked for again, and with every one done the conversation is fixed', () => {
  const built = report([call('.env', 'KEY=1'), call('config/.env', 'KEY=1')]);
  const items = toDoItems(built).map((item) => item.path as string);
  assert.ok(items.length > 0);
  const some = conversationAnswer(built, t, new Set(items.slice(0, 1)));
  assert.equal(some.todo.length, items.length - 1);
  const all = conversationAnswer(built, t, new Set(items));
  assert.deepEqual([all.todo.length, all.look], [0, 'fixed']);
  assert.equal(conversationAnswer(report([call('src/a.ts')]), t, new Set(['.env'])).look, 'none');
});

// The review of 2026-11-24: what follows was said wrongly.
test('what it asks is counted over every thing to do, not over the ones a chat has room for', () => {
  const built = report(Array.from({ length: 10 }, (_, n) => call(`service-${n}/.env`, 'API_KEY=1')));
  const answer = conversationAnswer(built, t);
  const items = toDoItems(built);
  assert.equal(items.length, 10);
  assert.deepEqual([answer.todo.length, answer.todoMore, answer.todoKeys], [6, 4, items.filter((item) => item.kind === 'keys').length]);
});

test('a step that only wrote a private file is none that read one', () => {
  const answer = conversationAnswer(report([edit('.env.a'), edit('.env.b'), call('.env', 'KEY=1')]), t);
  assert.equal(answer.steps.list.filter((step) => step.tone === 'coral').length, 3);
  assert.equal(answer.steps.reads, 1);
});

test('your AI\'s ordinary steps are its own; a helper\'s are said as a helper\'s', () => {
  const { event, delegation } = handOver('helper', 'Look around');
  const answer = conversationAnswer(report([event, edit('src/a.ts'), call('src/b.ts', 'x', {}, 'helper'), call('src/c.ts', 'x', {}, 'helper')], [delegation]), t);
  assert.deepEqual([answer.steps.n, answer.steps.ordinary, answer.steps.helperSteps], [2, 1, 2]);
});

test('TK2: what is not known of the ordinary steps is said with them', () => {
  const answer = conversationAnswer(report([call('', 'x', { toolName: 'mystery', toolKnown: false, targets: [], resultShape: 'none' }), call('src/a.ts', 'x', { outcome: 'unknown' }), edit('src/b.ts')]), t);
  assert.ok((answer.steps.notKnown ?? []).join(' ').includes(t('ch.steps.unseen', { n: 1 })), JSON.stringify(answer.steps));
  assert.equal(conversationAnswer(report([edit('src/b.ts')]), t).steps.notKnown, undefined);
});

test('a file\'s name is said as it is, whatever marks it holds', () => {
  for (const folder of ['_a', '__env__', 'a_b_c', '_x_y_', '[app]']) {
    const said = conversationAnswer(report([call(`${folder}/.env`, 'KEY=1'), call('other/.env', 'KEY=1')]), t).steps.moments[0]?.said ?? '';
    assert.ok(said.includes(`${folder}/.env`) && said.includes('other/.env'), `${folder}: ${said}`);
  }
});

// Seen by the maintainer, 2026-11-24: a card named a private file "-Users-…-Open-Source-…". Claude Code calls a project's folder by its
// whole path, so a name alone was the path AYD9 keeps out of the chat.
test('a folder called by a path is never named by it: what holds it is', () => {
  for (const path of ['~/.claude/projects/-Users-someone-work-shop', '/Users/someone/.claude/projects/-Users-someone-work-shop/', '/home/someone/.claude/projects/-home-someone-shop', 'C:/Users/someone/.claude/projects/C--Users-someone-shop', '~/.claude/projects/D--work-acme', '~/.claude/projects/-opt-acme-shop', '~/.claude/projects/plain']) {
    assert.deepEqual(placeInChat(path, 'known'), { shown: '.claude/projects', place: 'outside' }, path);
  }
  assert.deepEqual(placeInChat('/private/tmp/claude-501/-Users-someone-work-shop', 'known'), { shown: 'claude-501', place: 'outside' });
  assert.deepEqual(placeInChat('~/.claude/projects/-Users-someone-work-shop/4f2a.jsonl', 'known'), { shown: '4f2a.jsonl', place: 'outside' });
  for (const path of ['/srv/x/-workspaces-acme-shop', '/srv/x/-data-acme/', '/srv/x/D--work-acme']) assert.deepEqual(placeInChat(path, 'known').shown, 'x', path);
  assert.equal(placeInChat('~/.config/acme/-Users-x-y', 'known').shown, 'acme');
  assert.equal(placeInChat('~/.claude/projects', 'known').shown, 'projects');
  assert.deepEqual(placeInChat('~/notes/-Users.md', 'known'), { shown: '-Users.md', place: 'outside' });
});

// "i pusto jest?", the same day: a card with a number and no name.
test('it counts every file its report lists, private or not', () => {
  const model = report([call('.env', 'SHOP=1'), call('src/app.ts', 'export {};'), call('src/cart.ts', 'export {};')]);
  assert.equal(conversationAnswer(model, translator('en')).all, fileRows(model, toDoItems(model), new Set(), undefined).length);
  assert.ok(conversationAnswer(model, translator('en')).all >= 3);
});

// The second review of 2026-11-25: the list and the conversation's own card count one file alike (TK4), from one model.
test('TK4: a conversation and its row in a list count its private files the same way', () => {
  const index = (model: ReportModel) => ({ now: 0, since: 0, asked: '7d', entries: [{ name: 'c', provider: 'claude-code', lastActive: 0, delegations: 0,
    report: { kind: 'generated', file: 'r.html', tally: model.tally, incomplete: false, counts: model.fileCounts } }] }) as unknown as SessionIndex;
  const failed = { outcome: 'refused', result: { stage: 'model', completeness: 'complete', content: 'no', refusedBy: 'rule', evidence: { source: { kind: 'main' as const }, record: 1 } } } as unknown as Partial<ToolEvent>;
  const unknown = { outcome: 'unknown', result: undefined } as unknown as Partial<ToolEvent>;
  for (const events of [
    [call('.env', 'SHOP=1')], [edit('.env')], [edit('.env'), call('.env', 'no', failed)], [edit('.env'), call('.env', 'x', unknown)], [call('.env', 'no', failed), call('.env', 'x', unknown)],
    [call('.env', 'SHOP=1'), edit('.env'), call('keys/a.pem', 'no', failed), edit('keys/b.pem')],
  ]) {
    const model = report(events);
    const { helpers: _, ...numbers } = conversationAnswer(model, translator('en')).numbers;
    assert.deepEqual(listAnswer(index(model), 'project').rows[0]?.files, numbers);
  }
});

// "niech tutaj sie cos wiecej pokaze", 2026-11-25: a step that saw five names showed one.
test('a step holds every file it met, private ones first, each with what happened, and what it ran', () => {
  const names = ['.env', '.env.local', 'keys/a.pem', 'src/app.ts', 'src/cart.ts'];
  const listing = call('', names.join('\n'), { toolName: 'Bash', targets: [], commands: ['rg --files'], resultShape: 'listing' } as unknown as Partial<ToolEvent>);
  const answer = conversationAnswer(report([listing, call('/Users/someone/other/.env', 'X=1')]), translator('en'));
  const seen = answer.steps.moments.find((one) => (one.met?.length ?? 0) > 1);
  assert.deepEqual(seen?.met?.slice(0, 2).map((file) => file.path).sort(), ['.env', '.env.local']);
  assert.ok(seen?.met?.every((file) => file.access === 'name'));
  assert.deepEqual(seen?.met?.map((file) => `${file.path} ${file.everyday === true}`).sort(), ['.env false', '.env.local false', 'keys/a.pem true', 'src/app.ts true', 'src/cart.ts true'], 'no rule of the default policy holds the last three');
  assert.ok((seen?.ran ?? []).some((one) => /rg/.test(one)), JSON.stringify(seen?.ran));
  const outside = answer.steps.moments.flatMap((one) => one.met ?? []).find((file) => file.place === 'outside' || file.place === 'elsewhere');
  assert.equal(outside?.path, '.env');
  assert.ok(!JSON.stringify(answer).includes('/Users/someone'));
});

test('a step carries the look the page labels it with, and what its AI wrote before it', () => {
  const answer = conversationAnswer(report([call('.env', 'SHOP=1')]), translator('en'));
  assert.equal(answer.steps.moments[0]?.label, 'sb.tag.read');
  assert.equal(answer.steps.moments[0]?.wrote, undefined, 'a record with no words says none');
});

// The maintainer, 2026-11-25: a conversation of four helpers showed none, because none had met a private file.
test('every helper is said, those that met a private file first', () => {
  const one = handOver('one', 'Draw the logo');
  const two = handOver('two', 'Check the payment settings');
  const answer = conversationAnswer(report([one.event, two.event, call('logo.svg', '<svg/>', {}, 'one'), call('config/.env', 'KEY=1', {}, 'two')], [one.delegation, two.delegation]), t);
  assert.deepEqual(answer.helpers.map((helper) => [helper.helper, helper.asked, helper.files.length]), [[2, 'Check the payment settings', 1], [1, 'Draw the logo', 0]]);
  assert.equal(answer.helpersMore, 0);
  const none = conversationAnswer(report([one.event, call('logo.svg', '<svg/>', {}, 'one')], [one.delegation]), t);
  assert.deepEqual(none.helpers.map((helper) => [helper.helper, helper.asked, helper.files]), [[1, 'Draw the logo', []]]);
});

// The maintainer, 2026-11-25: five helpers were drawn and none of them read the file - their own AI did, and nothing said so.
test('each private file says which AI it was, and your own AI\'s files stand by themselves', () => {
  const two = handOver('two', 'Check the payment settings');
  const answer = conversationAnswer(report([two.event, call('.env', 'KEY=1'), call('config/.env', 'KEY=1', {}, 'two')], [two.delegation]), t);
  assert.deepEqual(Object.fromEntries(answer.files.map((file) => [file.path, file.by])), { '.env': [0], 'config/.env': [1] });
  assert.deepEqual(answer.mine, [{ path: '.env', access: 'read' }]);
  assert.equal(answer.mineMore, 0);
  const both = conversationAnswer(report([two.event, call('.env', 'KEY=1'), call('.env', 'KEY=1', {}, 'two')], [two.delegation]), t);
  assert.deepEqual(both.files.map((file) => file.by), [[0, 1]]);
});

test('a file that was only written says which AI wrote it, and no AI is named for more than its own record says', () => {
  const two = handOver('two', 'Check the payment settings');
  const wrote = conversationAnswer(report([two.event, edit('.env')], [two.delegation]), t);
  assert.deepEqual(wrote.files, [{ path: '.env', access: 'changed', by: [0] }]);
  for (const main of [call('.env'), edit('.env'), call('.env', 'x', { outcome: 'blocked' }), call('.env', 'x', { toolName: 'NoSuchTool', toolKnown: false })]) {
    const answer = conversationAnswer(report([two.event, main, call('.env', 'x', { outcome: 'unknown' }, 'two')], [two.delegation]), t);
    for (const file of answer.files) for (const who of file.by ?? []) {
      const own = (who === 0 ? answer.mine : answer.helpers.find((one) => one.helper === who)?.files)?.find((one) => one.path === file.path);
      assert.ok(file.access === 'changed' || own?.access === file.access, JSON.stringify([file, own]));
    }
  }
});

// The second review of 2026-11-25: a step's own label said *Nothing private* over the helper it started, which had read a key.
test('a moment is labelled by what happened in it, and one of no private file claims nothing', () => {
  const read = handOver('reader', 'Check the payment settings');
  const gave = conversationAnswer(report([read.event, call('config/.env', 'KEY=1', {}, 'reader')], [read.delegation]), t);
  for (const moment of gave.steps.moments) {
    assert.notEqual(moment.label, 'look.none', moment.said);
    assert.equal(moment.tone === 'grey' ? moment.label === '' : moment.label !== '', true, `${moment.tone} ${moment.label}`);
  }
  assert.ok(gave.steps.moments.some((moment) => moment.tone === 'coral' && moment.label === 'sb.tag.read'));
});

test('a helper none of whose actions was recorded is said as that, never as one that met no private file', () => {
  const { delegation, event } = handOver('silent', 'Check the payment settings');
  const answer = conversationAnswer(report([event], [delegation]), t);
  assert.deepEqual(answer.helpers.map((helper) => [helper.helper, helper.files.length, helper.unrecorded]), [[1, 0, true]]);
});

test('a file an AI only wrote is changed in its own list too', () => {
  const write = edit('.env');
  const answer = conversationAnswer(report([write]), t);
  assert.deepEqual(answer.files.map((file) => [file.access, file.by]), [['changed', [0]]]);
  assert.deepEqual(answer.mine, [{ path: '.env', access: 'changed' }]);
});
