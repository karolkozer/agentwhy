// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../src/report/build-report.ts';
import type { AgentFlow, ReportModel } from '../../src/report/report-model.ts';
import { GOLDEN_SESSION_ID, goldenSessionFiles } from '../helpers/golden-session.ts';
import { ONWARD_SECRET, ONWARD_SESSION_ID, onwardSessionFiles } from '../helpers/onward-session.ts';
import { renderPage } from '../helpers/report-page.ts';
import { RETURN_SESSION_ID, returnSessionFiles } from '../helpers/return-session.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

async function reportOn(t: Parameters<typeof writeSession>[0], session: Record<string, string>, id: string, share = false): Promise<ReportModel> {
  const root = await writeSession(t, session);
  const model = await source.read(join(root, `${id}.jsonl`));
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, share), { share, projectRoot: model.projectRoot });
}

/** A flow as a reader runs an eye down it: number, kind, and what the step says, in a few words. */
function told(flow: AgentFlow | undefined): string[] {
  return (flow?.steps ?? []).map((step) => {
    const times = step.count > 1 ? ` ${step.count}×` : '';
    const broken = step.broken === true ? ' broken' : '';
    switch (step.kind) {
      case 'asked':
        return `${step.number} asked`;
      case 'reached':
        return `${step.number} reached${times} ${step.did} ${step.files.join(',')} ${step.sources.join(',')} ${step.outcome}${broken}`;
      case 'carried':
        return `${step.number} carried ${step.did}`;
      case 'used':
        return `${step.number} used ${step.landed}${times}${step.programs === undefined ? '' : ` (${step.programs.join(', ')})`} after ${step.after ?? step.source}`;
      case 'delegated':
        return `${step.number} delegated ${step.strength}${broken}`;
      case 'returned':
        return `${step.number} returned ${step.strength}${broken}`;
      case 'received':
        return `${step.number} received${times} ${step.files.join(',')}`;
    }
  });
}

const flowOf = (report: ReportModel, agentIndex: number): AgentFlow | undefined =>
  report.flows.find((flow) => flow.agentIndex === agentIndex);

// Criteria 1 and 2: the motivating case as it went, one flow for each agent, in the order of its own records.
test('the motivating case gives the session and its agent a flow each, in the order of their records', async (t) => {
  const report = await reportOn(t, goldenSessionFiles(), GOLDEN_SESSION_ID);

  assert.deepEqual(report.flows.map((flow) => flow.agentIndex), [0, 1]);
  assert.deepEqual(told(flowOf(report, 0)), [
    '1 reached Read apps/web/.npmrc input succeeded',
    '2 delegated value',
    '3 used file after 2',
  ]);
  assert.deepEqual(told(flowOf(report, 1)), [
    '1 asked',
    '2 reached Bash (grep) apps/web/.env.development result succeeded',
    '3 reached Read apps/web/.env.local input blocked',
    '4 used said after 2',
    '5 returned value',
  ]);
  const written = flowOf(report, 0)?.steps[2];
  assert.deepEqual(written?.kind === 'used' ? written.targets?.map(String) : [], ['docs/incident.md']);
  const asked = flowOf(report, 1)?.steps[0];
  assert.equal(asked?.kind === 'asked' ? `${asked.askedTo}` : '', 'Find why the webhook returns 500');
});

// Criteria 3 and 4 (R3, R4): three searches running are one step with every program; the fourth, apart, stays a step.
test('consecutive steps that say the same thing collapse, with their programs; alike steps apart stay apart', async (t) => {
  const report = await reportOn(t, onwardSessionFiles('repeated'), ONWARD_SESSION_ID);
  const flow = flowOf(report, 0);

  assert.deepEqual(told(flow), [
    '1 reached Read apps/web/.env input succeeded',
    '2 used command 3× (grep, rg) after 1',
    '3 used said after 1',
    '4 used command (grep) after 1',
  ]);
  assert.equal(flow?.steps[1]?.evidence.length, 2, 'a collapsed step keeps the record of its first and its last');
});

// Criterion 4: a use nothing earlier carried points at no step, and says so by its source.
test('a use with nothing before it points at no step, and the read that follows it is a step of its own', async (t) => {
  const report = await reportOn(t, onwardSessionFiles('typed-first'), ONWARD_SESSION_ID);

  assert.deepEqual(told(flowOf(report, 0)), [
    '1 used file after none',
    '2 reached Read apps/web/.env input succeeded',
    '3 used command (curl) after 2',
  ]);
});

// R2 `carried`: a plain file whose result carried the value is a step, and the use after it points at it.
test('a result that reached nothing protected but carried the value is a step a later use points at', async (t) => {
  const report = await reportOn(t, onwardSessionFiles('background'), ONWARD_SESSION_ID);
  const reviewer = report.flows.find((flow) => flow.steps.some((step) => step.kind === 'carried'));

  assert.deepEqual(told(reviewer), ['1 asked', '2 carried Bash (cat)', '3 used command (grep) after 2']);
});

// Criterion 5 (R5): a report never delivered breaks the chain, on both ends.
test('a return never delivered is a broken step in the agent that asked and in the agent that ran', async (t) => {
  const report = await reportOn(t, returnSessionFiles({ carried: 'value', background: 'awaited' }), RETURN_SESSION_ID);

  assert.deepEqual(told(flowOf(report, 0)), ['1 delegated unknown broken']);
  assert.equal(told(flowOf(report, 1)).at(-1), '5 returned unknown broken');
});

// R12: the shared view has the flows too, through the same doors.
test('the shared view builds the same flows, with paths through the path door', async (t) => {
  const shared = await reportOn(t, goldenSessionFiles(), GOLDEN_SESSION_ID, true);

  assert.deepEqual(shared.flows.map((flow) => flow.steps.length), [3, 5]);
});

const page = (report: ReportModel): string => renderPage(report);
// What a reader sees: the words, without the markup or a path kept for a hover.
const visible = (html: string): string => html.replace(/<[^>]*>/g, ' ');

/** One AI's run in Advanced (the report page spec P62): from its article to the end of its steps. */
const runOf = (html: string, agentIndex: number): string => {
  const start = html.indexOf('<article class="rc-run" id="run-' + agentIndex + '">');
  return start < 0 ? '' : html.slice(start, html.indexOf('</ol>', start));
};
/** One AI's drawer (P30). */
const drawerOf = (html: string, at: number): string => {
  const start = html.indexOf('<dialog class="dr" id="helper-' + at + '"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</dialog>', start));
};

// Criteria 6 and 7, on the report page: each AI's run is read in Advanced, rendered once, and each AI's drawer says what
// it did in plain words. The earlier page's dialog to read a run at full width is gone: the run is at full width already.
test('the drawer says what happened in plain words, and each run is read once, in Advanced', async (t) => {
  const report = await reportOn(t, onwardSessionFiles('delegated'), ONWARD_SESSION_ID);
  const html = page(report);

  assert.equal((html.match(/<article class="rc-run" id="run-\d+">/g) ?? []).length, report.flows.length, 'a run for each agent with a flow');
  assert.equal(report.flows.length, 2);
  for (const flow of report.flows) assert.equal((html.match(new RegExp('id="run-' + flow.agentIndex + '"', 'g')) ?? []).length, 1, 'rendered once');
  assert.match(html, /<section class="rc-runs"><div class="rc-runs-head"><h3 class="rc-h">[\s\S]*?How it happened/, 'the section says what it holds');
  assert.match(html, /<dialog class="dr" id="helper-\d+"(?:(?!<\/dialog>)[\s\S])*?What it did next/, 'and the drawer of the AI that read answers in rows');
  assert.doesNotMatch(html, /<p class="use /, 'no paragraph for each use');
});

// Criteria 3, 4, 5 and 10 on the page: numbered steps, a collapsed step counted, "after step N", chips, a dashed break.
test('the flow numbers its steps, counts a collapsed one, points back, and draws a broken chain dashed', async (t) => {
  const repeated = page(await reportOn(t, onwardSessionFiles('repeated'), ONWARD_SESSION_ID));
  const flow = runOf(repeated, 0);

  assert.match(flow, /<li class="rc-step rc-reached"><span class="rc-n rc-tone-coral">1<\/span>[\s\S]*?<b>Read<\/b> showed it the same text as in <code class="rc-chip">apps\/web\/\.env<\/code>\./);
  assert.match(flow, /<li class="rc-step rc-used"><span class="rc-n rc-tone-coral">2<\/span>[\s\S]*?<b class="rc-times">3 ×<\/b> A command \(<b>grep<\/b>, <b>rg<\/b>\) contained the text\. \(The agent had seen this text in step 1\.\)/);
  const awaited = page(await reportOn(t, returnSessionFiles({ carried: 'value', background: 'awaited' }), RETURN_SESSION_ID));
  assert.match(awaited, /<li class="rc-step rc-delegated rc-broken">[\s\S]*?Its reply is not in the record\./);
});

// Criterion 8: a delegated step leads to the run of the agent it started, and the other end leads back.
test('a delegated step links to the flow of the agent it started, and its returned step links back', async (t) => {
  const html = page(await reportOn(t, goldenSessionFiles(), GOLDEN_SESSION_ID));

  assert.match(html, /<li class="rc-step rc-delegated">(?:(?!<\/li>)[\s\S])*?href="#run-1"/);
  assert.match(html, /<li class="rc-step rc-returned">(?:(?!<\/li>)[\s\S])*?href="#run-0"/);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  const report = await reportOn(t, goldenSessionFiles(), GOLDEN_SESSION_ID);
  const links = (kind: string) => report.flows.flatMap((flow) =>
    flow.steps.flatMap((step) => (step.kind === kind && 'toAgentIndex' in step ? [[flow.agentIndex, step.toAgentIndex]] : [])));
  assert.deepEqual(links('delegated'), [[0, 1]], 'the session started agent 1');
  assert.deepEqual(links('returned'), [[1, 0]], 'and agent 1 answered the session');
  assert.deepEqual(report.graph.agents.map((agent) => agent.returned), ['value']);
});

// Criterion 9: three languages, no forbidden word, and nothing of the value or what carried it, shared or not.
test('the flow speaks three languages and carries no value, command line or carried words, shared or not', async (t) => {
  for (const share of [false, true]) {
    const html = page(await reportOn(t, onwardSessionFiles('delegated'), ONWARD_SESSION_ID, share));
    const flows = html.slice(html.indexOf('<section class="rc-runs">'), html.indexOf('</section>', html.indexOf('<section class="rc-runs">')));

    assert.ok(flows.length > 0, `share ${share}`);
    assert.match(flows, /lang="pl">Dostał zadanie</);
    assert.match(flows, /lang="de">Bekam einen Auftrag</);
    assert.doesNotMatch(flows, /\b(?:copied|leaked|sent|exfiltrat\w*|because)\b/i);
    for (let start = 0; start + 4 <= ONWARD_SECRET.length; start += 1) {
      assert.ok(!html.includes(ONWARD_SECRET.slice(start, start + 4)), `share ${share}: a run of the value`);
    }
    for (const carried of ['use webhook secret', 'The handler signs with']) assert.ok(!html.includes(carried), carried);
  }
});

// Seen on the measured session's page: a tool called Read reading "read", and the same two files listed again at every use between
// steps that named other files. (The earlier page's dialog, whose close button was named after tables, is gone.)
test('a tool is used rather than repeated, and named files are said once', async (t) => {
  const html = page(await reportOn(t, onwardSessionFiles('background'), ONWARD_SESSION_ID));

  assert.match(html, /<b>Bash \(cat\)<\/b> showed the same text\. Which file it came from is not clear\./);
  const session = runOf(html, 0);
  assert.match(session, /Its reply contained the same text as <code>apps\/web\/\.env\.development<\/code>\./, 'the delivered answer names the files');
  assert.doesNotMatch(session, /The same value from|carried the same value from/, 'and no use after it names them again');
});

// The first layer answers the reader's question; the exact record order remains in the full run.
test('a helper’s drawer answers first - it opened the file, and passed it on - and its job and run come after', async (t) => {
  const html = page(await reportOn(t, goldenSessionFiles(), GOLDEN_SESSION_ID));
  const drawer = drawerOf(html, 1);

  assert.match(drawer, /<div class="hw-a"><span class="i18n" lang="en">Yes<\/span>/, 'the answer is one word');
  assert.match(drawer, /Passed it to another AI<\/span>(?:(?!hw-row)[\s\S])*?<span class="sw-yn sw-yes">/, 'and the delivered reply is a yes');
  assert.ok(drawer.indexOf('Did it open a private file?') < drawer.indexOf('What it did next'));
  assert.match(drawer, /lang="pl">Czy otworzył prywatny plik\?<\/span>/);
  assert.match(runOf(html, 1), /<li class="rc-step/, 'and its run is in Advanced');
  assert.match(drawerOf(html, 0), /Saved a copy<\/span>(?:(?!hw-row)[\s\S])*?<span class="sw-yn sw-yes">/, 'your AI saved the value to a file');
});

test('a busy session answers in a few rows, and keeps every step in the full run', async (t) => {
  const report = await reportOn(t, onwardSessionFiles('noisy'), ONWARD_SESSION_ID);
  const html = page(report);
  const drawer = drawerOf(html, 0);

  assert.equal((drawer.match(/<div class="hw-row">/g) ?? []).length, 4, 'four rows, not the whole run');
  assert.match(drawer, /Saved a copy<\/span>(?:(?!hw-row)[\s\S])*?<span class="sw-yn sw-yes">/);
  assert.doesNotMatch(visible(drawer.slice(drawer.indexOf('What it did next'))), /apps\/api|Bash/, 'technical evidence is not in the answer');
  const flow = runOf(html, report.flows[0]?.agentIndex ?? 0);
  assert.equal((flow.match(/<li class="rc-step/g) ?? []).length, report.flows[0]?.steps.length);
  assert.match(flow, /apps\/web\/\.env\.production/);
  assert.match(flow, /notes\/webhook\.md/);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  const last = report.flows[0]?.steps.at(-1);
  assert.deepEqual(last?.kind === 'used' ? [last.landed, last.targets?.map(String)] : [], ['file', ['notes/webhook.md']]);
  assert.ok(report.flows[0]?.steps.some((step) => step.kind === 'reached' && step.files.map(String).includes('apps/web/.env.production')));
});
