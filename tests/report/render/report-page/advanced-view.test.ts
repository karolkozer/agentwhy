// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';

// `specs/2026-09-23-the-report-page.md` P39-P41: the full record, for a developer.
// Keys are assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');

let sequence = 0;
function read(path: string, agentId: string): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: `STRIPE_SECRET_KEY=${STRIPE}`, evidence },
  };
}

function report() {
  const delegation: Delegation = {
    followUps: [],
    id: 'task', parentAgentId: 'main', childAgentId: 'agent-x7', description: 'Look around', prompt: 'p', reports: [],
    evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
  };
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, { id: 'agent-x7', type: 'Explore', depth: 1 }],
    delegations: [delegation], events: [read('apps/web/.env', 'main'), read('apps/web/.env', 'agent-x7'), read('apps/api/.env', 'main')],
    completeness: 'complete', messages: [], gaps: [],
  };
  return buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');
const advanced = (html: string): string => html.slice(html.indexOf('<section id="advanced"'));

// P40: the four numbers, the files grouped by what still needs doing, and a row that opens the story's record.
test('the private files are grouped by what still needs doing, and a row opens the full record', () => {
  const html = new ReportPageRenderer().render({ report: report(), withIndexLink: false, marks: new Map([['apps/api/.env', 'rotated']]) });
  const page = english(advanced(html));
  assert.match(page, /Private files read<\/div><div class="sx-value sx-coral">2</);
  assert.match(page, /AIs involved<\/div><div class="sx-value">2</);
  assert.match(page, /Fixed<\/div><div class="sx-value">1 \/ 2</);
  assert.match(page, /Needs action · 1[\s\S]*?apps\/web\/\.env[\s\S]*?Fixed · 1[\s\S]*?apps\/api\/\.env/);
  assert.match(html, /<a class="adv-row adv-open" href="#story-0" data-popup-open="story-0" data-story-tab="2"/);
});

// P27, P41: the agent's own identity is shown here and nowhere else on the page.
test('each AI is a row with its job as asked, and only here with its id and type', () => {
  const html = new ReportPageRenderer().render({ report: report(), withIndexLink: false });
  const page = english(advanced(html));
  assert.match(page, /Helper 1<\/span><span class="adv-id">agent-x7 · Explore<\/span>/);
  assert.match(page, /“Look around”/);
  assert.match(page, /<a class="adv-row adv-agent adv-edge-read" href="#helper-1"/);
  const start = html.indexOf('<section id="advanced"');
  // The views come first and the windows after them: Advanced ends where the first window begins.
  const end = html.indexOf('<dialog', start);
  const elsewhere = html.slice(0, start) + html.slice(end);
  assert.ok(!elsewhere.includes('agent-x7 · Explore'), 'its identity is named nowhere else');
  // Elsewhere the id is only in an evidence reference of a story's full record, which is for a developer too.
  const mentions = elsewhere.match(/[^>]{0,6}agent-x7[^<]{0,8}/g) ?? [];
  assert.ok(mentions.length > 0 && mentions.every((mention) => mention.startsWith('agent agent-x7 record')), mentions.join(' | '));
});
