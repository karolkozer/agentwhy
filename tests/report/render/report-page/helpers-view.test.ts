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
import { helperViews } from '../../../../src/report/render/report-page/helpers.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';

// `specs/2026-09-23-the-report-page.md` P26-P30: who your AI brought in, and which of them saw your private files.
// Keys are assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');

let sequence = 0;
function call(path: string, content: string, agentId: string, extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

const delegation = (child: string, description: string): Delegation => ({
  followUps: [],
  id: 'task-' + child, parentAgentId: 'main', childAgentId: child, description, prompt: 'p', reports: [],
  evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
});

function report(events: ToolEvent[], helpers: string[]) {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations: helpers.map((id) => delegation(id, 'Job of ' + id)), events, completeness: 'complete', messages: [], gaps: [],
  };
  return buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

/** One helper read keys, one was refused, one only reached a template's name, one did nothing private. */
const SESSION = () => report([
  call('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'main'),
  call('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'reader'),
  call('apps/api/.env', 'Permission denied', 'refused', { outcome: 'blocked' }),
  call('apps/web', '.env.example\nREADME.md', 'lister', { toolName: 'Bash', targets: [], commands: ['ls apps/web'], resultShape: 'listing' }),
  call('README.md', '# app', 'quiet'),
], ['reader', 'refused', 'lister', 'quiet']);

// P28, R12c: what each AI did, from the flows - and "only a sample file" only where the path is named as a template.
test('each AI is read, stopped, a sample file only, or untouched', () => {
  const views = helperViews(SESSION());
  assert.deepEqual(views.map((view) => [view.agent.ordinal ?? 'main', view.status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [[1, 'read'], [2, 'stopped'], [3, 'sample'], [4, 'none'], ['main', 'read']].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  assert.equal(views[0]?.agent.ordinal, undefined, 'your AI first');
});

test('the heading counts helpers, and says how many of them read something private', () => {
  const page = english(new ReportPageRenderer().render({ report: SESSION(), withIndexLink: false }));
  assert.match(page, /Your AI got help from 4 helpers\./);
  assert.match(page, /Only 1 of them read your private files\./);
  assert.match(page, /<strong>3 other helpers<\/strong> <span class="fold-rest">didn’t see anything real\.<\/span>/);
  assert.match(page, /Tried to open a private file\. It was stopped\./);
  assert.match(page, /Only saw a sample file\./);
});

// P28: your AI on top; every helper hangs from it, and says who brought it in.
test('the list puts your AI first, and hangs the helpers and the fold from it', () => {
  const view = helpersSection(new ReportPageRenderer().render({ report: SESSION(), withIndexLink: false }));
  const list = view.slice(view.indexOf('<div class="hl-list">'));
  assert.match(list, /^<div class="hl-list"><a class="hl-card hl-risk" href="#helper-0"[^>]*>[\s\S]*?Your AI<\/span><span class="hl-line">[\s\S]*?<\/a><div class="hl-tree">/);
  assert.match(list, /<div class="hl-tree"><div class="hl-branch"><span class="hl-arrow" aria-hidden="true"><\/span><a class="hl-card hl-risk"[\s\S]*?Helper 1<span class="hl-by">Brought in by your AI<\/span>/);
  assert.match(list, /<div class="hl-branch hl-branch-fold"><span class="hl-arrow" aria-hidden="true"><\/span><div class="hl-fold"><details class="fold">/);
  assert.equal(list.match(/class="hl-branch/g)?.length, 2, 'the helper that read, and the fold');
});

// P30, F53: the drawer quotes the job as asked, says what it read, and explains in sentences from facts.
test('a helper’s drawer quotes its job, names what it read, and explains it without a model', () => {
  const html = new ReportPageRenderer().render({ report: SESSION(), withIndexLink: false });
  const page = english(html);
  assert.match(html, /<dialog class="dr" id="helper-1"/);
  assert.match(page, /“Job of reader”/);
  assert.match(page, /Did it open a private file\?[\s\S]*?Yes[\s\S]*?It read what’s inside these files:/);
  // R5: apps/api/.env is on the page too, so the file is named by as much of its path as tells the two apart.
  assert.match(page, /Your AI brought it in to help\. It read <code>web\/\.env<\/code>\./);
  assert.match(page, /It stayed away from your private files\./);
  assert.match(html, /href="#fix-0" data-popup-open="fix-0"/, 'Fix these files opens the wizard on its file');
});

// P29: the diagram is in the page, with a line per thing that happened, and boxes that open what they name.
test('the diagram draws a line per AI and file, and needs no script to be seen', () => {
  const html = new ReportPageRenderer().render({ report: SESSION(), withIndexLink: false });
  assert.match(html, /<path class="hd-edge hd-read" data-from="a0" data-to="f0"/);
  assert.match(html, /<path class="hd-edge hd-stopped" data-from="a2"/);
  assert.match(html, /<path class="hd-edge hd-work" data-from="a0" data-to="a1"/);
  assert.match(html, /data-node="f0"[^>]* href="#story-0"/, 'a file on the list opens its story');
});

// P26-P29 with no helper: your AI still did the work, so the list and the diagram show it alone.
const ALONE = () => report([
  call('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'main'),
  call('apps/api/.env', 'Permission denied', 'main', { outcome: 'blocked' }),
], []);

const helpersSection = (html: string): string => english(html.slice(html.indexOf('<section id="helpers"'), html.indexOf('<section id="advanced"')));

test('with no helper the heading says your AI worked alone, and what it read', () => {
  const view = helpersSection(new ReportPageRenderer().render({ report: ALONE(), withIndexLink: false }));
  assert.match(view, /Behind the scenes/);
  assert.match(view, /<h1 class="hero-fact">Your AI worked alone\.<\/h1><p class="hero-action" role="doc-subtitle">It read 1 private file\.<\/p>/);
  assert.match(view, /This time it brought in none\./);
  assert.doesNotMatch(view, /didn’t bring in any helpers/);
});

test('with no helper the list has a card for your AI, which opens its drawer', () => {
  const html = new ReportPageRenderer().render({ report: ALONE(), withIndexLink: false });
  const view = helpersSection(html);
  assert.match(view, /<a class="hl-card hl-risk" href="#helper-0" data-popup-open="helper-0">[\s\S]*?Your AI[\s\S]*?Read 1 private file[\s\S]*?See what →<\/span><\/a>/);
  assert.equal(view.match(/class="hl-card/g)?.length, 1, 'one card: your AI');
  assert.doesNotMatch(view, /class="hl-fold"/, 'nothing to fold');
  assert.match(html, /<dialog class="dr" id="helper-0"/, 'its drawer is on the page');
});

test('with no helper the diagram joins You to your AI, and your AI to each private file', () => {
  const view = helpersSection(new ReportPageRenderer().render({ report: ALONE(), withIndexLink: false }));
  assert.match(view, /data-node="you"[\s\S]*?>You<\/span>/);
  assert.match(view, /data-node="a0"[^>]* href="#helper-0"/);
  assert.match(view, /<path class="hd-edge hd-work" data-from="you" data-to="a0"/);
  assert.match(view, /<path class="hd-edge hd-read" data-from="a0" data-to="f0"/);
  assert.match(view, /<path class="hd-edge hd-stopped" data-from="a0" data-to="f1"/);
  assert.equal(view.match(/<path /g)?.length, 3, 'a line per thing that happened, and no other');
  assert.doesNotMatch(view, /class="hd-col"[^>]*>Helpers</, 'no heading over an empty column');
  assert.match(view, /class="hd-col" style="left:66.497%">Files</, 'the files stand beside your AI');
  assert.match(view, /data-node="f0"[^>]* href="#story-0"/);
});

test('with no helper and nothing private read, the heading says so, and your AI promises no line', () => {
  const view = helpersSection(new ReportPageRenderer().render({ report: report([call('README.md', '# app', 'main')], []), withIndexLink: false }));
  assert.match(view, /<div class="hv hv-clean">/);
  assert.match(view, /Your AI worked alone\.<\/h1><p class="hero-action" role="doc-subtitle">It didn’t touch anything private\.<\/p>/);
  assert.match(view, /class="hl-card"[\s\S]*?Didn’t touch anything private\./);
  assert.equal(view.match(/<path /g)?.length, 1, 'only You to your AI');
  assert.doesNotMatch(view, /class="hd-col"[^>]*>(Helpers|Files)</);
  assert.match(view, /data-node="a0"[^>]*><span class="hd-port hd-in"><\/span><span class="hd-icon/, 'no connector dot on its right');
});

// Invariant 4: where a helper was asked for and its work is not recorded, "worked alone" is not said.
test('with a helper asked for and not recorded, the heading does not say your AI worked alone', () => {
  const { childAgentId: _lost, ...asked } = delegation('lost', 'Job of lost');
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [asked], events: [call('README.md', '# app', 'main')], completeness: 'complete', messages: [], gaps: [],
  };
  const built = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const view = helpersSection(new ReportPageRenderer().render({ report: built, withIndexLink: false }));
  assert.doesNotMatch(view, /Your AI worked alone/);
  assert.match(view, /Your AI has no helpers in the record\./);
  assert.match(view, /Part of the record is missing, so we can’t say it worked alone\./);
});
