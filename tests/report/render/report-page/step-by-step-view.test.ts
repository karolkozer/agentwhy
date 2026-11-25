// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import type { AgentMessage } from '../../../../src/core/message.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../../src/core/policy/policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import type { RunStep } from '../../../../src/report/report-model.ts';
import { TABLES, translator } from '../../../../src/report/render/report-copy.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { stepSentence } from '../../../../src/report/render/report-page/step-by-step-view.ts';

// `specs/2026-10-11-step-by-step.md` SB10-SB27: every step of every AI, and the files they reached by folder.
// Keys are assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');

function session(share = false, models?: readonly string[]) {
  let record = 0;
  const sequences = new Map<string, number>();
  const events: ToolEvent[] = [];
  const messages: AgentMessage[] = [];
  const delegations: Delegation[] = [];
  const at = (agentId: string) => {
    record += 1;
    return { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record };
  };
  const say = (text: string, agentId = 'main', kind: AgentMessage['kind'] = 'said'): void => {
    messages.push({ agentId, kind, text, completeness: 'complete', evidence: at(agentId) });
  };
  const call = (agentId: string, extra: Partial<ToolEvent> & { content?: string }): ToolEvent => {
    const evidence = at(agentId);
    const sequence = (sequences.get(agentId) ?? 0) + 1;
    sequences.set(agentId, sequence);
    const { content = 'ok', ...rest } = extra;
    const event: ToolEvent = {
      id: agentId + '-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [], commands: [], resultShape: 'content',
      toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete',
      result: { stage: 'model', completeness: 'complete', content, evidence }, ...rest,
    };
    events.push(event);
    return event;
  };
  const give = (parent: string, child: string, description: string): void => {
    const event = call(parent, { toolName: 'Task', resultShape: 'none' });
    delegations.push({ id: event.id, parentAgentId: parent, childAgentId: child, description, prompt: 'p', reports: [], followUps: [], evidence: event.evidence, completeness: 'complete' });
  };

  say('Let me look at how this project is set up.');
  call('main', { toolName: 'Bash', commands: ['ls .'], resultShape: 'listing', content: '.env\npackage.json\nREADME.md' });
  say('I will read the payment code first.');
  call('main', { targets: ['src/payments.ts'], content: 'export {}' });
  call('main', { targets: ['src/cart.ts'], content: 'export {}' });
  call('main', { toolName: 'Bash', commands: ['npm ls stripe'], resultShape: 'none', content: 'stripe@14' });
  say('The webhook needs a signing secret.');
  call('main', { targets: ['.env'], content: `STRIPE_SECRET_KEY=${STRIPE}` });
  say('I will split this up.');
  give('main', 'h1', 'Write a test for the webhook');
  give('main', 'h2', 'Summarise the README');
  say('I need the real secret to sign the test payload.', 'h1', 'reasoning');
  call('h1', { targets: ['.env'], content: `STRIPE_SECRET_KEY=${STRIPE}` });
  call('h2', { targets: ['README.md'], content: '# app' });
  say('Done.');

  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0, ...(models === undefined ? {} : { models }) }, { id: 'h1', depth: 1 }, { id: 'h2', depth: 1 }],
    delegations, events, completeness: 'complete', messages, gaps: [],
  };
  return buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share, projectRoot: { kind: 'absent' } });
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

const page = (share = false, models?: readonly string[]): string => english(new ReportPageRenderer().render({ report: session(share, models), withIndexLink: false }));
const steps = (html: string): string => html.slice(html.indexOf('<div class="stp" data-steps>'), html.indexOf('<div class="bf" data-folders>'));
const folders = (html: string): string => html.slice(html.indexOf('<div class="bf" data-folders>'), html.indexOf('</section>', html.indexOf('<div class="bf" data-folders>')));

// SB11, SB13: the words come once above their steps, said or noted; First, Then, Last.
test('each stretch is headed by what the AI wrote, and the steps say First, Then and Last', () => {
  const view = steps(page());
  assert.match(view, /<span class="stp-label">Your AI said<\/span><q class="stp-q">Let me look at how this project is set up\.<\/q>/);
  assert.match(view, /I will read the payment code first\.<\/q><\/div><span class="stp-covers">Before 3 steps<\/span>/);
  assert.match(view, /<span class="stp-label">Helper 1 noted<\/span><q class="stp-q">I need the real secret to sign the test payload\.<\/q>/);
  assert.match(view, /<div class="stp-when">First<\/div>/);
  assert.equal(view.match(/<div class="stp-when">First<\/div>/g)?.length, 3, 'one First per timeline: your AI and two helpers');
  assert.match(view, /<div class="stp-when">Last<\/div><div class="stp-did">It answered you\.<\/div>/);
});

// SB12, SB14, SB15: what each step did, in words, its look, and where the name was first seen.
test('a step says what it did in words, from facts, with the look of what it did', () => {
  const view = steps(page());
  assert.match(view, /Saw the names of 3 files\./);
  assert.match(view, /Read <code>payments\.ts<\/code>\./);
  assert.match(view, /Ran a command: <code>npm<\/code>\./);
  assert.match(view, /Read <code>\.env<\/code>\.[\s\S]*?class="stp-pill stp-pill-coral"[\s\S]*?Read a private file/);
  assert.match(view, /It first saw this name 4 steps before\./);
  assert.doesNotMatch(view, /npm ls stripe/, 'never the command line (main spec §7.3)');
  assert.doesNotMatch(view, /class="tag /, 'what the AI did is the view\u2019s own pill, never the kit\u2019s protection tag');
});

// `who-stopped-it` WS3, WS9: a stopped step says who stopped it, and only a rule's refusal is said as a rule's.
test('a stopped step names who stopped it, and a check of no named owner is never a rule', () => {
  const redactor = new Redactor('test');
  const stopped = (refusedBy?: RunStep['refusedBy']): RunStep => ({
    sequence: 1, did: redactor.term('Bash'), toolKnown: true, outcome: 'blocked', files: [], evidence: redactor.term('main#1'),
    ...(refusedBy === undefined ? {} : { refusedBy }),
  });
  const say = (refusedBy: RunStep['refusedBy'], lang: 'en' | 'pl' | 'de' = 'en'): string => stepSentence(stopped(refusedBy), translator(lang), (path) => path);
  assert.match(say('rule'), /A rule in your settings stopped it\.$/);
  assert.match(say('person'), /You stopped it\.$/);
  assert.match(say('reviewer'), /It was stopped\.$/);
  assert.match(say(undefined), /It was stopped\.$/);
  assert.match(say('check'), /A check that runs before your AI acts stopped it\.$/);
  assert.match(say('check', 'pl'), /Zatrzymała to kontrola, która działa, zanim twoje AI coś zrobi\.$/);
  assert.match(say('check', 'de'), /Eine Prüfung, die läuft, bevor deine KI etwas tut, hat es gestoppt\.$/);
  assert.doesNotMatch(say('check'), /rule/);
});

// `2026-11-23-a-write-over-the-key.md` WK7: a write agentwhy's check stopped says agentwhy kept it from putting the placeholder over a
// key, never that a rule did; a write that put it there says the real value is gone. Each names the file.
test('WK7: a write agentwhy stopped, and one that wrote the placeholder over a key, say so and name the file', () => {
  const redactor = new Redactor('test');
  const step = (keyWrite: RunStep['keyWrite'], outcome: RunStep['outcome']): RunStep => ({
    sequence: 1, did: redactor.term('Write'), toolKnown: true, outcome, files: [{ path: redactor.path('settings.yml'), how: outcome === 'blocked' ? 'stopped' : 'changed' }],
    evidence: redactor.term('main#1'), ...(outcome === 'blocked' ? { refusedBy: 'check' as const } : {}), ...(keyWrite === undefined ? {} : { keyWrite }),
  });
  const stopped = step({ kind: 'stopped', path: redactor.path('settings.yml') }, 'blocked');
  const one = step({ kind: 'written', path: redactor.path('settings.yml'), keys: 1 }, 'succeeded');
  const two = step({ kind: 'written', path: redactor.path('settings.yml'), keys: 2 }, 'succeeded');
  const say = (of: RunStep, lang: 'en' | 'pl' | 'de' = 'en'): string => stepSentence(of, translator(lang), (path) => path);
  assert.equal(say(stopped), 'agentwhy kept a write from putting its placeholder over a key in <code>settings.yml</code>. The key stayed in the file.');
  assert.doesNotMatch(say(stopped), /rule/);
  assert.equal(say(one), 'Wrote agentwhy’s placeholder over a key in <code>settings.yml</code>. The real value is gone from the file.');
  assert.equal(say(two), 'Wrote agentwhy’s placeholder over 2 keys in <code>settings.yml</code>. The real values are gone from the file.');
  assert.match(say(stopped, 'pl'), /^agentwhy nie dopuścił do zapisu, który wstawiłby jego znacznik w miejsce klucza w <code>settings\.yml<\/code>\. Klucz został w pliku\.$/);
  assert.match(say(two, 'pl'), /w miejsce 2 kluczy w <code>settings\.yml<\/code>/);
  assert.match(say(stopped, 'de'), /^agentwhy hat verhindert, dass ein Schreibvorgang den Platzhalter über einen Schlüssel in <code>settings\.yml<\/code> schreibt\./);
  assert.match(say(one, 'de'), /Der echte Wert ist nicht mehr in der Datei\.$/);
  // KR10: a step with neither says what it said before.
  assert.equal(say(step(undefined, 'succeeded')), 'Changed <code>settings.yml</code>.');
  assert.equal(say(step(undefined, 'blocked')), 'Tried to open <code>settings.yml</code>. A check that runs before your AI acts stopped it.');
});

// WK7 (fix round 1): a key written over is drawn as a key that reached the AI is - coral, the warning mark, its own pill - and a
// write agentwhy stopped as a stop is; both are kept by Only private. A write with neither is drawn as before (KR10).
test('WK7: a key written over is drawn in the warning look with its own pill, a stopped write in the stopped look, both private', () => {
  let record = 0;
  const write = (id: string, outcome: ToolEvent['outcome'], keyWrite?: NonNullable<ToolEvent['result']>['keyWrite']): ToolEvent => {
    record += 1;
    const evidence = { source: { kind: 'main' as const }, record };
    return {
      id, agentId: 'main', sequence: record, toolName: 'Write', input: {}, targets: ['settings.yml'], commands: [], resultShape: 'none',
      toolKnown: true, outcome, evidence, completeness: 'complete', ...(outcome === 'succeeded' ? { written: ['x'] } : {}),
      result: { stage: 'model', completeness: 'complete', content: 'ok', evidence, ...(outcome === 'blocked' ? { refusedBy: 'check' as const } : {}), ...(keyWrite === undefined ? {} : { keyWrite }) },
    };
  };
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [write('w1', 'succeeded', { kind: 'written-over', keys: 1 }), write('w2', 'blocked', { kind: 'refused' }), write('w3', 'succeeded')],
    completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const html = new ReportPageRenderer().render({ report, withIndexLink: false });
  const view = steps(english(html));
  const rows = view.split('<div class="stp-row').slice(1);
  const rowOf = (sentence: RegExp): string => rows.find((row) => sentence.test(row)) ?? '';
  const written = rowOf(/Wrote agentwhy’s placeholder over a key/);
  assert.match(written, /^ stp-row-risk"(?: id="stp-0-\d+")? data-private="1">/);
  assert.match(written, /<span class="stp-ic stp-ic-coral" aria-hidden="true">!<\/span>/);
  assert.match(written, /<span class="stp-pill stp-pill-coral">[^]*?Key overwritten<\/span>/);
  const stopped = rowOf(/agentwhy kept a write from putting its placeholder/);
  assert.match(stopped, /^"(?: id="stp-0-\d+")? data-private="1">/);
  assert.match(stopped, /<span class="stp-ic stp-ic-mint" aria-hidden="true">⊘<\/span>/);
  assert.match(stopped, /<span class="stp-pill stp-pill-mint">[^]*?Stopped/);
  // KR10: the plain write is what it was - grey, a tick, nothing private.
  const plain = rowOf(/Changed <code>settings\.yml<\/code>\./);
  assert.match(plain, /^"(?: id="stp-0-\d+")? data-private="0">/);
  assert.match(plain, /<span class="stp-ic stp-ic-grey" aria-hidden="true">✓<\/span>/);
  assert.match(plain, /stp-pill-grey/);
  // SG1: the map says it in the same words as its pill, never as a read; SG5: it is a thing to do, as the sidebar counts it.
  assert.match(steps(html), /<span class="stp-cell stp-cell-coral" aria-hidden="true"><\/span><b>1<\/b> [^]{0,80}Key overwritten/);
  assert.doesNotMatch(steps(html).slice(0, steps(html).indexOf('stp-flow')), /Read a private file/);
  assert.match(steps(html), /data-now-left>1<\/b>/);
  for (const [lang, word] of [['pl', 'Klucz nadpisany'], ['de', 'Schlüssel überschrieben']] as const) {
    assert.ok(html.includes('<span class="i18n" lang="' + lang + '">' + word + '</span>'), lang);
  }
});

// SB14 as amended 2026-10-20: one call named a tracked file and a blocked one, and a rule refused it for the blocked one.
// The sentence named the tracked file, the first by path, as the one a rule stopped (the maintainer's round, 2026-10-20).
test('a stopped step names the blocked file a rule stopped it for, never a tracked one caught in the same call', () => {
  const redactor = new Redactor('test');
  const step: RunStep = {
    sequence: 1, did: redactor.term('Bash'), toolKnown: true, outcome: 'blocked', refusedBy: 'rule', evidence: redactor.term('main#1'),
    files: [
      { path: redactor.path('Clients/customers.csv'), how: 'stopped', private: true, tracked: true },
      { path: redactor.path('Finance/Bank/bank-details.txt'), how: 'stopped', private: true },
      { path: redactor.path('Orders/orders.csv'), how: 'stopped' },
    ],
  };
  const short = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
  const say = (focus?: string): string => stepSentence(step, translator('en'), short, focus);
  assert.equal(say(), 'Tried to open <code>bank-details.txt</code>. A rule in your settings stopped it.');
  assert.equal(say('Clients/customers.csv'), 'Tried to open <code>bank-details.txt</code>. A rule in your settings stopped it.', 'a tracked file’s own panel too');
  assert.equal(say('Orders/orders.csv'), 'Tried to open <code>bank-details.txt</code>. A rule in your settings stopped it.');
  const tracked: RunStep = { ...step, files: [step.files[0] as RunStep['files'][number]], refusedBy: 'person' };
  assert.equal(stepSentence(tracked, translator('en'), short), 'Tried to open <code>customers.csv</code>. You stopped it.', 'with no blocked file, the one it tried');
});

// SB12 as amended 2026-10-20: the same call's chips. The tracked file was drawn mint, as the blocked one, though no rule
// stopped the call over it (the maintainer's round, 2026-10-20: "customers.csv is green, it wasn't the one stopped").
test('a stopped step draws in the stopped look only the file a rule stopped it for', () => {
  const policy: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected,
    { pattern: '**/customers.csv', mode: 'tell' }, { pattern: '**/bank-details.txt', mode: 'block' }] };
  const evidence = { source: { kind: 'main' as const }, record: 1 };
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [{
      id: 'cat', agentId: 'main', sequence: 1, toolName: 'Bash', input: {}, targets: [], resultShape: 'none',
      commands: ['cat Clients/customers.csv Finance/Bank/bank-details.txt Orders/orders.csv'],
      toolKnown: true, outcome: 'blocked', evidence, completeness: 'complete',
      result: { stage: 'model', completeness: 'complete', content: 'Refused: bank-details.txt is blocked', refusedBy: 'rule', evidence },
    }],
    completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const view = steps(english(new ReportPageRenderer().render({ report, withIndexLink: false })));
  assert.match(view, /Tried to open <code>bank-details\.txt<\/code>\. A rule in your settings stopped it\./);
  assert.match(view, /class="stp-chip stp-chip-mint"[^>]*>bank-details\.txt</);
  const window = /title="Finance\/Bank\/bank-details\.txt" data-popup-open="(file-\d+)"/.exec(view)?.[1];
  assert.match(view, new RegExp('<div class="stp-act"><a class="pill pill-outline pill-sm" href="#' + window + '"'), 'What happened opens the file the sentence names');
  assert.match(view, /class="stp-chip"[^>]*>customers\.csv</, 'the tracked file is drawn as a file the step only named');
  assert.doesNotMatch(view, /stp-chip-mint"[^>]*>customers\.csv</);
});

// `2026-11-17-tried-again-after-a-stop.md` TA2, TA3: your AI was stopped on `.env` twice and then read it with `cat`. Each
// row was a stopped step alone; nothing said the second was a second, or that the read came after two stops.
test('a first stop says what came after it, and later tries say how many stops came before', () => {
  const evidence = (record: number) => ({ source: { kind: 'main' as const }, record });
  const event = (sequence: number, extra: Partial<ToolEvent>): ToolEvent => ({
    id: 'main-' + sequence, agentId: 'main', sequence, toolName: 'Read', input: {}, targets: ['.env'], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence: evidence(sequence), completeness: 'complete', ...extra,
  });
  const refused = (sequence: number): ToolEvent => event(sequence, {
    outcome: 'blocked', result: { stage: 'model', completeness: 'complete', content: 'Permission denied', refusedBy: 'rule', evidence: evidence(sequence) },
  });
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [refused(1), refused(2), event(3, {
      toolName: 'Bash', targets: [], commands: ['cat .env'],
      result: { stage: 'model', completeness: 'complete', content: `STRIPE_SECRET_KEY=${STRIPE}`, evidence: evidence(3) },
    })],
    completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const view = steps(english(new ReportPageRenderer().render({ report, withIndexLink: false })));
  const lines = [...view.matchAll(/<div class="stp-again">([\s\S]*?)<\/div>/g)].map((match) => match[1]);
  assert.deepEqual(lines, [
    'It tried to open <code>.env</code> 2 more times after this. Not every try was stopped: it read the file. It tried 2 different ways.',
    'It had already been stopped from opening <code>.env</code> once before.',
    'It had already been stopped from opening <code>.env</code> 2 times before.',
  ]);
  assert.match(view, /A rule in your settings stopped it\.<\/div><div class="stp-again">It tried to open/, 'under the step’s own sentence');
  assert.doesNotMatch(view, /cat \.env/, 'never the command line');
  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', { kind: 'absent' }, true), { share: true, projectRoot: { kind: 'absent' } });
  const sharedView = steps(english(new ReportPageRenderer().render({ report: shared, withIndexLink: false })));
  assert.equal(sharedView.match(/<div class="stp-again">/g)?.length, 3, '--share draws the same lines: counts, and the name the step shows');
  assert.doesNotMatch(sharedView, /cat \.env/);
});

// SB26 as amended 2026-10-20: a file's panel in By folder says what the step did to that file, the file first - it said
// "Read customers.csv and 6 more files." on the panel of `invoice template.md` (the maintainer's round, 2026-10-20).
test('a file’s panel in By folder names that file first in what the step did', () => {
  const redactor = new Redactor('test');
  const step: RunStep = {
    sequence: 1, did: redactor.term('Bash'), toolKnown: true, outcome: 'succeeded', evidence: redactor.term('main#1'),
    files: [
      { path: redactor.path('Clients/customers.csv'), how: 'read', private: true, tracked: true },
      { path: redactor.path('Finance/Invoices/invoice template.md'), how: 'read' },
      { path: redactor.path('Orders/orders.csv'), how: 'read' },
      { path: redactor.path('Finance/Invoices/draft.md'), how: 'changed' },
      { path: redactor.path('README.md'), how: 'named' },
    ],
  };
  const short = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
  const say = (focus?: string): string => stepSentence(step, translator('en'), short, focus);
  assert.equal(say(), 'Read <code>customers.csv</code> and 2 more files.', 'the step on its own leads with what Files puts first');
  assert.equal(say('Finance/Invoices/invoice template.md'), 'Read <code>invoice template.md</code> and 2 more files.');
  assert.equal(say('Finance/Invoices/draft.md'), 'Changed <code>draft.md</code>.');
  assert.equal(say('README.md'), 'Saw the name <code>README.md</code>.');
  assert.match(stepSentence(step, translator('pl'), short, 'Orders/orders.csv'), /<code>orders\.csv<\/code>/);

  const evidence = { source: { kind: 'main' as const }, record: 1 };
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [{
      id: 'read', agentId: 'main', sequence: 1, toolName: 'Read', input: {}, targets: ['notes.md'], commands: [], resultShape: 'content',
      toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: '# notes', evidence },
    }, {
      id: 'ls', agentId: 'main', sequence: 2, toolName: 'Bash', input: {}, targets: [], commands: ['ls .'], resultShape: 'listing',
      toolKnown: true, outcome: 'succeeded', evidence: { ...evidence, record: 2 }, completeness: 'complete',
      result: { stage: 'model', completeness: 'complete', content: '.env\nnotes.md\ntodo.md', evidence: { ...evidence, record: 2 } },
    }],
    completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const view = folders(english(new ReportPageRenderer().render({ report, withIndexLink: false })));
  const panelOf = (name: string): string => {
    const row = view.indexOf('<span class="bf-nm bf-nm-grey">' + name + '</span>');
    return view.slice(view.indexOf('class="bf-panel">', row), view.indexOf('</details></li>', row));
  };
  assert.match(panelOf('notes.md'), /Read <code>notes\.md<\/code>\.[\s\S]*?Saw the name <code>notes\.md<\/code>\./, 'each visit says what it did to this file');
  // Glossary §7 ("docs" are *notes*): an invoice template is no note about an app (the maintainer's round, 2026-10-20).
  assert.match(panelOf('notes.md'), /<div class="bf-ttl">Notes<\/div>/);
});

// SB14 as amended 2026-10-21, PN8: "Used a tool we don't recognise." said nothing at all, and "we don't know what it does"
// too little where the record describes the tool (the maintainer's round). The step names the tool - an MCP tool with its
// server, as the adapter read them - and says what is still not known: which files it opened.
test('a tool we don’t know is named - an MCP tool with its server - and the step says what is still not known', () => {
  const redactor = new Redactor('test');
  const step = (did: string, mcp?: { server: string; tool: string }, described = false): RunStep => ({
    sequence: 1, did: redactor.term(did), toolKnown: false, outcome: 'succeeded', files: [], evidence: redactor.term('main#1'),
    ...(mcp === undefined ? {} : { mcp: { server: redactor.term(mcp.server), tool: redactor.term(mcp.tool) } }),
    ...(described ? { described: true as const } : {}),
  });
  const say = (one: RunStep, lang: 'en' | 'pl' | 'de' = 'en'): string => stepSentence(one, translator(lang), (path) => path);
  const plan = { server: 'ccd_turn', tool: 'update_plan' };
  assert.equal(say(step('mcp__ccd_turn__update_plan', plan, true)), 'Used <code>update_plan</code> from the MCP server <code>ccd_turn</code>. Its server works outside the record, so we can’t see which files it opened.');
  assert.equal(say(step('mcp__ccd_turn__update_plan', plan)), 'Used <code>update_plan</code> from the MCP server <code>ccd_turn</code>. The record doesn’t say what it does, so we can’t tell which files it opened.');
  assert.match(say(step('mcp__ccd_turn__update_plan', plan, true), 'pl'), /^Użyto narzędzia <code>update_plan<\/code> z serwera MCP <code>ccd_turn<\/code>\. Serwer działa poza zapisem/);
  assert.match(say(step('mcp__ccd_turn__update_plan', plan, true), 'de'), /^<code>update_plan<\/code> vom MCP-Server <code>ccd_turn<\/code> benutzt\./);
  assert.equal(say(step('TodoWrite', undefined, true)), 'Used <code>TodoWrite</code>, a tool we don’t read. We can’t tell which files it opened.');
  assert.equal(say(step('TodoWrite')), 'Used <code>TodoWrite</code>. The record doesn’t say what it does, so we can’t tell which files it opened.');
  assert.equal(say(step('mcp__x__y')), 'Used <code>mcp__x__y</code>. The record doesn’t say what it does, so we can’t tell which files it opened.', 'the page never reads a format’s spelling');
  assert.equal(say(step('x', { server: '<b>', tool: 'a&b' }, true)), 'Used <code>a&amp;b</code> from the MCP server <code>&lt;b&gt;</code>. Its server works outside the record, so we can’t see which files it opened.', 'escaped');
});

// SB16, SB17: two hand-overs of one stretch are one step, and the helper that read something is open.
test('helpers given work together are one step, and the one that read your keys is open', () => {
  const view = steps(page());
  assert.match(view, /Gave work to 2 helpers at once\.<\/div><p class="stp-lead">They worked at the same time, so they aren’t in order with each other\.<\/p>/);
  assert.match(view, /<details class="stp-helper stp-helper-risk" data-private="1" open>[\s\S]*?Helper 1[\s\S]*?Its job: “Write a test for the webhook”/);
  assert.match(view, /<details class="stp-helper" data-private="0">[\s\S]*?Helper 2/);
  assert.match(view, /It sent its work back\./);
});

// SG6: a step with nothing private is already one row, so nothing hides it; By folder keeps its own switch.
test('there is no Every step / Only private switch in Step by step', () => {
  const view = steps(page());
  assert.doesNotMatch(view, /data-steps-show/);
  assert.doesNotMatch(view, /stp-hidden-note/);
  assert.match(folders(page()), /data-folders-show="private"/);
});

/** A conversation of your AI alone, from its calls in order. */
function conversation(calls: readonly (Partial<ToolEvent> & { content?: string })[], marks?: ReadonlyMap<string, never>): string {
  const events = calls.map((extra, at): ToolEvent => {
    const { content = 'ok', ...rest } = extra;
    const evidence = { source: { kind: 'main' as const }, record: at + 1 };
    return {
      id: 'main-' + (at + 1), agentId: 'main', sequence: at + 1, toolName: 'Read', input: {}, targets: [], commands: [],
      resultShape: 'content', toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete',
      result: { stage: 'model', completeness: 'complete', content, evidence }, ...rest,
    };
  });
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [], events, completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  return english(new ReportPageRenderer().render({ report, withIndexLink: false, ...(marks === undefined ? {} : { marks }) }));
}
const everyday = { targets: ['README.md'], content: '# app' };
const secret = { targets: ['.env'], content: `STRIPE_SECRET_KEY=${STRIPE}` };

// SG1: the shape of the conversation before its words, one square per step of your AI, each a way to its row.
test('the map draws one square per step of your AI, in its look, each a link to its row', () => {
  const view = steps(page());
  const cells = [...view.matchAll(/<li><a class="stp-cell stp-cell-(\w+)" href="#(stp-0-\d+)"/g)];
  assert.deepEqual(cells.map((cell) => cell[1]), ['blue', 'grey', 'grey', 'grey', 'coral', 'coral', 'grey']);
  for (const cell of cells) assert.ok(view.includes(`id="${cell[2] as string}"`), `${cell[2] as string} is a row`);
  assert.match(view, /<span class="stp-key"><span class="stp-cell stp-cell-coral" aria-hidden="true"><\/span><b>2<\/b> Read a private file<\/span>/);
  assert.match(view, /aria-label="Step 5: Read a private file"/);
});

test('a conversation of one step draws no map, and What now still ends its story', () => {
  const view = steps(conversation([everyday]));
  assert.doesNotMatch(view, /stp-map/);
  assert.equal(view.match(/<li class="stp-run stp-now"/g)?.length, 1);
});

// SG4: where the conversation turned, said once and only where First does not say it.
test('the first private read is marked once, and never on the story\u2019s first row', () => {
  assert.equal(steps(conversation([everyday, secret, secret])).match(/class="stp-first"/g)?.length, 1);
  assert.doesNotMatch(steps(conversation([secret, everyday])), /class="stp-first"/);
  // The helpers of `page()` read the key too, and only your AI's own read is marked.
  assert.equal(steps(page()).match(/class="stp-first"/g)?.length, 1);
});

// SG5, I4, I5: what is left is one number the to-do list's own ticks change, *done* is said only of a list that was there,
// and an empty list is never a clean claim - the list says what it leaves, so the card says no more than that.
test('What now counts what is left, says done only of a finished list, and claims nothing over an empty one', () => {
  const view = steps(conversation([secret]));
  assert.match(view, /<div class="stp-did">Left on your to-do list: <b data-now-left>1<\/b><\/div>/);
  assert.match(view, /<a class="pill pill-primary pill-sm" href="#todo">Open your to-do list<\/a>/);
  const marked = new Map([['.env', undefined as never]]);
  const done = steps(conversation([secret], marked));
  assert.match(done, /<li class="stp-run stp-now" data-private="1" data-now="done">/);
  assert.match(done, /Everything on your to-do list is done\./);
  const clear = steps(conversation([everyday, everyday]));
  assert.doesNotMatch(clear.slice(clear.indexOf('stp-now')), /data-now-left|is done|stp-ic[^>]*>✓/);
  assert.match(clear, /What this conversation leaves you with is on your to-do list\./);
  assert.equal(view.match(/data-now="(todo|done)"/g)?.length, 2, 'both states stand in the page, for the list’s ticks to switch');
});

// I6: the list is there whether or not a step of your AI was recorded.
test('where no step of your AI was recorded, What now still ends the tab', () => {
  const helper = conversation([]);
  assert.match(steps(helper), /class="stp-run stp-now"/);
});

// I8: a private file it wrote is not one it read.
test('a first private write is not marked as a first private read', () => {
  const written = { ...secret, toolName: 'Write', resultShape: 'none' as const, content: 'ok', written: [] as never };
  const view = steps(conversation([everyday, written]));
  assert.doesNotMatch(view, /class="stp-first"/);
});

// I7: a fold is badged as a tool's only where every step of it is that tool's.
test('a fold of several tools bears no tool’s badge', () => {
  const read = { toolName: 'mcp__files__read_file', toolKnown: true, mcp: { server: 'files', tool: 'read_file' } };
  const view = steps(conversation([{ ...secret, ...read }, { ...secret, targets: ['.env.test'] }]));
  const [fold] = folds(view) as [string];
  assert.doesNotMatch(fold.slice(0, fold.indexOf('</summary>')), /tw-badge/);
});

// I3: past the steps kept, the map says how many of how many.
test('a conversation of more steps than are kept says so on its map', () => {
  const view = steps(conversation(Array.from({ length: 405 }, (_unused, at) => ({ targets: [`src/f${at}.ts`], content: 'x' }))));
  assert.match(view, /<ol class="stp-cells" [^>]*aria-label="Your AI’s first 400 of 405 steps/);
  assert.match(view, /class="stp-map-note">the first 400 of 405 steps</);
  assert.equal(view.match(/<a class="stp-cell /g)?.length, 400);
});

// M3: an id is your AI's alone, and never drawn twice.
test('a row’s id is your AI’s alone', () => {
  const ids = [...steps(page()).matchAll(/ id="(stp-[^"]+)"/g)].map((found) => found[1]);
  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id?.startsWith('stp-0-')));
});

// SG2, SG3: seven private reads are one row, and its steps are the card's rows again, each numbered by its place.
const PRIVATE = ['.env', '.env.local', '.env.test', '.env.development', '.env.production', 'apps/web/.env', 'packages/x/.env'];
const demoShape = (): string => steps(conversation([
  ...PRIVATE.map((path) => ({ targets: [path], content: `STRIPE_SECRET_KEY=${STRIPE}` })),
  ...['README.md', 'AGENTS.md', 'package.json', 'src/app.ts'].map((path) => ({ targets: [path], content: 'ok' })),
]));
/** The folds of a panel, each from its <details> to the end of its own body. */
const folds = (view: string): string[] => [...view.matchAll(/<details class="stp-foldset [\s\S]*?<\/div><\/details>/g)].map((found) => found[0]);

test('steps of one look and one verb are one row, which opens on each of them, numbered by its place', () => {
  const [first, second, ...more] = folds(demoShape()) as [string, string, ...string[]];
  assert.equal(more.length, 0);
  assert.match(first, /class="stp-row stp-fold stp-row-risk" id="stp-0-0"/);
  assert.match(first, /<div class="stp-when">First · steps 1–7<\/div><div class="stp-did">Read 7 private files, one after another<\/div>/);
  const body = first.slice(first.indexOf('<div class="stp-fold-body'));
  assert.equal(body.match(/class="stp-row /g)?.length, 7);
  for (let place = 1; place <= 7; place += 1) assert.match(body, new RegExp(`<div class="stp-when">Step ${place}<\\/div>`));
  assert.equal(body.match(/What happened/g)?.length, 7);
  assert.match(second, /<div class="stp-when">Then · steps 8–11<\/div><div class="stp-did">4 steps that touched nothing private<\/div>/);
});

test('in a folded row the files are names, and each step’s own row opens its window', () => {
  const [first] = folds(demoShape()) as [string];
  const summary = first.slice(0, first.indexOf('</summary>'));
  assert.doesNotMatch(summary, /data-popup-open/);
  assert.match(summary, /<span class="stp-chip stp-chip-coral"[^>]*>\.env<\/span>/);
  assert.equal(first.slice(first.indexOf('</summary>')).match(/data-popup-open="story-\d+"/g)?.length, 7);
});

test('a folded row says that it folds, and that it folds back', () => {
  const [first] = folds(demoShape()) as [string];
  assert.match(first, /Show each of the 7 steps/);
  assert.match(first, /Fold them again/);
  assert.match(first, /<div class="stp-fold-body stp-fold-body-coral">/);
});

test('a fold of one MCP tool keeps the badge, what the tool is for and the window to it', () => {
  const plan = { toolName: 'mcp__ccd_turn__update_plan', toolKnown: false, mcp: { server: 'ccd_turn', tool: 'update_plan' }, description: { text: 'Keeps the checklist.', as: 'recorded' as const }, resultShape: 'none' as const };
  const [first] = folds(steps(conversation([plan, plan, secret]))) as [string];
  const summary = first.slice(0, first.indexOf('</summary>'));
  assert.match(summary, /class="tw-badge tw-badge-step[^"]*"/);
  assert.match(summary, /<q>Keeps the checklist\.<\/q>/);
  assert.match(summary, /class="tw-pill"/);
  assert.match(summary, /Used <code>update_plan<\/code> 2 times\. We can.t tell which files it opened\./);
});

test('a single step, and neighbours of different looks, stay rows of their own', () => {
  assert.equal(folds(steps(conversation([secret]))).length, 0);
  assert.equal(folds(steps(conversation([secret, everyday, secret]))).length, 0);
});

// SG7: the model where your AI's story starts, beside its words and before what they cover - once, though it has four stretches.
test('your AI\u2019s model is said once, in its first card, beside its words', () => {
  const view = steps(page(false, ['claude-opus-5-5']));
  assert.equal(view.match(/class="stp-note-model"/g)?.length, 1);
  const head = view.slice(view.indexOf('<div class="stp-note">'), view.indexOf('</div><div class="stp-row"'));
  assert.match(head, /Let me look at how this project is set up\.<\/q><\/div><span class="stp-note-model"><span class="stp-note-model-l">AI model<\/span>/);
  assert.match(head, /claude-opus-5-5/);
  assert.doesNotMatch(view, /stp-main-model/);
  assert.doesNotMatch(steps(page()), /class="stp-note-model"/, 'and nothing where the record names none');
});

// SG9: the helpers the record does not place, in words the maintainer could follow.
test('helpers the record does not place are said in plain words, in each language', () => {
  assert.equal(TABLES.en['sb.unplaced'], 'More helpers in this conversation');
  assert.equal(TABLES.en['sb.unplaced.lead'], 'They worked in this conversation too, but the record doesn\u2019t show at which step they started. So they\u2019re shown here, on their own.');
  assert.equal(TABLES.pl['sb.unplaced'], 'Pozostali pomocnicy w tej rozmowie');
  assert.equal(TABLES.pl['sb.unplaced.lead'], 'Też pracowali w tej rozmowie, ale z zapisu nie wynika, przy którym kroku zaczęli. Dlatego są tutaj, osobno.');
  assert.equal(TABLES.de['sb.unplaced'], 'Weitere Helfer in diesem Gespräch');
  assert.equal(TABLES.de['sb.unplaced.lead'], 'Sie haben auch in diesem Gespräch gearbeitet, aber die Aufzeichnung zeigt nicht, bei welchem Schritt sie angefangen haben. Deshalb stehen sie hier für sich.');
});

// SB20: a private file's step opens the window its row opens.
test('What happened on a private step opens the file’s own window', () => {
  const view = steps(page());
  assert.match(view, /href="#story-0"[^>]*>What happened<\/a>/);
});

// SB22, why-this-call §5.1: under --share no sentence of an AI reaches the page.
test('under --share the words are counted, never quoted', () => {
  const view = steps(page(true));
  assert.doesNotMatch(view, /stp-q/);
  assert.match(view, /Your AI wrote \d+ characters first\. This view doesn’t show them\./);
});

// SB24-SB26: the files in their folders, coloured by what happened, each with who went there.
test('By folder draws the files in their folders, and a file’s panel says who went there and what they wrote', () => {
  const view = folders(page());
  assert.match(view, /<span class="bf-nm">src<\/span>/);
  assert.match(view, /<span class="bf-nm bf-nm-coral">\.env<\/span>/);
  assert.match(view, /<span class="bf-nm bf-nm-grey">payments\.ts<\/span>/);
  assert.match(view, /class="bf-panel">[\s\S]*?Keys for Stripe[\s\S]*?Who went here[\s\S]*?The webhook needs a signing secret\.[\s\S]*?Read <code>\.env<\/code>\./);
  assert.match(view, /data-folders-pane/);
  assert.doesNotMatch(view, /fill="#/, 'file icons carry no colour of their own (SBD4)');
});

// SB25 as amended 2026-10-11: a file's colour and mode are its row's in Files, not a ladder of the tab's own.
test('By folder draws a file in its Files row’s look and mode', () => {
  const html = page();
  const view = folders(html);
  assert.match(view, /<span class="bf-nm bf-nm-coral">\.env<\/span><span class="bf-deco"><span class="bf-mode bf-mode-grey">Can’t tell<\/span>/);
  assert.match(view, /<span class="stp-pill stp-pill-coral"><span class="stp-pill-dot" aria-hidden="true"><\/span>Read private files<\/span><span class="bf-mode bf-mode-grey">Can’t tell<\/span>/);
  const files = html.slice(html.indexOf('<section id="files"'), html.indexOf('<section id="helpers"'));
  assert.match(files, /\.env[\s\S]*?look-coral[\s\S]*?Can’t tell/, 'the Files row says the same');
});

// "+25 more" opens on the files it stands for (the maintainer, 2026-10-11), and counts the ones the model did not keep.
test('a step with many files shows six, and +N more opens on the rest', () => {
  const evidence = { source: { kind: 'main' as const }, record: 1 };
  const names = Array.from({ length: 31 }, (_, at) => 'notes-' + at + '.md');
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [{
      id: 'ls', agentId: 'main', sequence: 1, toolName: 'Bash', input: {}, targets: [], commands: ['ls .'], resultShape: 'listing',
      toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: names.join('\n'), evidence },
    }],
    completeness: 'complete', messages: [], gaps: [],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const view = steps(english(new ReportPageRenderer().render({ report, withIndexLink: false })));
  assert.match(view, /<details class="stp-more"><summary class="stp-more-files">\+25 more<\/summary><div class="stp-chips">/);
  assert.match(view, /7 more names weren’t kept in this report\./, '24 kept, 18 of them behind the fold, 7 counted');
  assert.equal(view.slice(0, view.indexOf('stp-more')).match(/class="stp-chip"/g)?.length, 6);
});

// Every word of the two tabs in the three languages, with the same placeholders.
test('every word of Step by step and By folder is in en, pl and de, with the same placeholders', () => {
  const stem = (key: string): string => key.replace(/\.(one|few|many|other)$/, '');
  const keys = (lang: 'en' | 'pl' | 'de'): Set<string> =>
    new Set(Object.keys(TABLES[lang]).filter((key) => /^(sb|bf)\.|^hp\.tab\.(steps|folders)$/.test(key)).map(stem));
  const en = keys('en');
  assert.ok(en.size > 40);
  for (const lang of ['pl', 'de'] as const) assert.deepEqual([...keys(lang)].sort(), [...en].sort(), lang);
  // A count may be written in words in one form and not another; every other placeholder is in every form.
  const holes = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string))].filter((hole) => hole !== 'n').sort();
  for (const key of Object.keys(TABLES.en).filter((each) => /^(sb|bf)\./.test(each))) {
    for (const lang of ['pl', 'de'] as const) {
      for (const form of Object.keys(TABLES[lang]).filter((each) => stem(each) === stem(key))) {
        assert.deepEqual(holes(TABLES[lang][form] as string), holes(TABLES.en[key] as string), lang + ' ' + form);
      }
    }
  }
});
