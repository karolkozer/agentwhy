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
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import type { ReportModel } from '../../src/report/report-model.ts';
import { ONWARD_SECRET, ONWARD_SESSION_ID, onwardSessionFiles, type OnwardVariant } from '../helpers/onward-session.ts';
import { renderPage } from '../helpers/report-page.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

async function reportOn(t: Parameters<typeof writeSession>[0], variant: OnwardVariant, share = false): Promise<ReportModel> {
  const root = await writeSession(t, onwardSessionFiles(variant));
  const model = await source.read(join(root, `${ONWARD_SESSION_ID}.jsonl`));
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, share), { share, projectRoot: model.projectRoot });
}

const summary = (report: ReportModel): string => new TextReportRenderer(100).render(report);
const full = (report: ReportModel): string => new TextReportRenderer(100, { full: true }).render(report);
const page = (report: ReportModel): string => renderPage(report);
/** Lines joined where `wrap` broke them, so a sentence can be matched whole. */
const joined = (text: string): string => text.replace(/\n +/g, ' ');

/** The summary's "appeared after" lines, each joined where it wrapped. */
function appearedLines(text: string): string[] {
  const lines = text.split('\n');
  return lines.flatMap((line, at) => {
    if (!line.startsWith('    → then the same value was in: ')) return [];
    const rest: string[] = [];
    for (let next = at + 1; /^ {6}\S/.test(lines[next] ?? ''); next += 1) rest.push((lines[next] ?? '').trim());
    return [[line.trim(), ...rest].join(' ')];
  });
}

/** One section of `--full`, from its heading to the next. */
function section(text: string, title: string): string {
  const start = text.indexOf(`▍${title}`);
  if (start < 0) return '';
  const end = text.indexOf('\n▍', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
}

// R11, R12, R14 and criterion 6.
test('a value written into a file that is not protected is counted once, leads the headline and marks the agent', async (t) => {
  const report = await reportOn(t, 'delegated');

  assert.equal(report.tally.filesWrittenOnward, 1);
  assert.equal(report.tally.valueUses, 4);
  // The two agents the line below names by their messages. Counted per agent, because that is what the report's
  // own panel answers per agent - and what a row of the index reads where no delegation returned anything.
  assert.equal(report.tally.wroteInMessages, 2);
  assert.match(`${report.headline.sentence}`, / The same value was also written into a file that is not protected\.$/);
  assert.match(summary(report), /^ {2}the session itself +3 actions +wrote the value into files$/m);
  assert.deepEqual(appearedLines(summary(report)), [
    '→ then the same value was in: 1 file that is not protected (notes/webhook.md) · 1 command (git) · messages of the session itself and Agent 1 · Explore',
  ]);
});

// R12 in `--full`, criteria 9 and 11: every use by where it landed, with the agent, what it came after and the record.
test('--full lists every use by where it landed, with the agent, what it came after and the record', async (t) => {
  const text = section(full(await reportOn(t, 'delegated')), 'Where the same value was afterwards');

  assert.match(text, /^ {2}In a file it wrote$/m);
  assert.match(joined(text), /the session itself · value from apps\/web\/\.env\.development · into notes\/webhook\.md · after another agent's answer carried it \[/);
  assert.match(joined(text), /the session itself · value from apps\/web\/\.env\.development · in a command that commits \(git\) · after another agent's answer carried it/);
  assert.match(joined(text), /Agent 1 · Explore · value from apps\/web\/\.env\.development · after it read that file itself/);
});

// R11 and criterion 8: writing a protected file is configuration work - stated in `--full`, never counted or led with.
test('a value written into a protected file is said in --full only, and the files that are not protected are counted', async (t) => {
  const report = await reportOn(t, 'direct');

  assert.equal(report.tally.filesWrittenOnward, 2);
  assert.match(`${report.headline.sentence}`, /was also written into 2 files that are not protected\.$/);
  assert.deepEqual(appearedLines(summary(report)), [
    '→ then the same value was in: 2 files that are not protected (notes/webhook.md, apps/api/config.ts) · 1 more (add --full)',
  ]);
  assert.match(joined(full(report)), /into apps\/web\/\.env\.production \(a protected file\) · after it read that file itself/);
});

// R8 and criteria 7 and 11: nothing earlier is said as such, and a value only taken out of a file is no use.
test('a use with nothing before it in its record says so, and a value only taken out of a file is no use', async (t) => {
  const text = joined(section(full(await reportOn(t, 'typed-first')), 'Where the same value was afterwards'));

  assert.match(text, /webhook\.md · nothing earlier in its record had it/);
  assert.doesNotMatch(text, /the user|typed/i);
  assert.doesNotMatch(text, /apps\/api\/config\.ts/);
  assert.match(text, /in a command \(curl\) · after it read that file itself/);
});

// R3 with R8: a report delivered late is what the session had it from; another agent had it from a plain file.
test('a report delivered late, a plain file and a prompt are each said as what the use came after', async (t) => {
  const background = joined(section(full(await reportOn(t, 'background')), 'Where the same value was afterwards'));
  const handedOn = await reportOn(t, 'handed-on');

  assert.match(background, /the session itself · value from apps\/web\/\.env\.development · into docs\/incident\.md · after another agent's answer carried it/);
  assert.match(background, /Agent 2 · general-purpose · value from apps\/web\/\.env\.development · in a command \(grep\) · after a file that is not protected showed it/);
  assert.match(section(full(handedOn), 'Where the same value was afterwards'), /^ {2}In instructions to another agent$/m);
  assert.deepEqual(appearedLines(summary(handedOn)), ['→ then the same value was in: instructions to 1 agent']);
});

// R13: the agent's panel says it in three languages, and the graph marks the agent in words.
test('the page says where the value appeared in one line and in the flow, in three languages, and marks the node', async (t) => {
  const report = await reportOn(t, 'delegated');
  const html = page(report);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.equal(report.graph.main.wroteOnward, true, 'the session itself wrote the value on');
  assert.deepEqual(report.uses.filter((use) => use.agentIndex === 0 && use.landed !== 'said')
    .map((use) => [use.landed, use.targets?.map(String), use.programs?.map(String), use.commits]),
  [['file', ['notes/webhook.md'], undefined, undefined], ['command', undefined, ['git'], true]]);
  assert.deepEqual(report.flows[0]?.steps.slice(2).map((step) => (step.kind === 'used' ? [step.landed, step.after] : [])),
    [['file', 1], ['command', 1]], 'each after the step in which the agent saw the text');

  // agent-flow R7, amended: each use is a step of the run (the report page spec P62), in three languages.
  assert.match(html, /The text was saved to <code class="rc-chip">notes\/webhook\.md<\/code>\. \(The agent had seen this text in step 1\.\)/);
  assert.match(html, /Tekst zapisano w <code class="rc-chip">notes\/webhook\.md<\/code>\. \(Agent widział ten tekst w kroku 1\.\)/);
  assert.match(html, /Der Text wurde in <code class="rc-chip">notes\/webhook\.md<\/code> geschrieben\. \(Der Agent hatte diesen Text in Schritt 1 gesehen\.\)/);
  assert.match(html, /A commit \(<b>git<\/b>\) contained the text\. \(The agent had seen this text in step 1\.\)/);
  // Your AI's drawer says it saved a copy, and the file's story says where - in words, never a colour alone.
  const start = html.indexOf('<dialog class="dr" id="helper-0"');
  const drawer = html.slice(start, html.indexOf('</dialog>', start));
  assert.match(drawer, /Saved a copy<\/span>(?:(?!hw-row)[\s\S])*?<span class="sw-yn sw-yes">/);
  assert.match(html, /Saved a copy<\/span>[\s\S]*?<div class="sw-ev-sub"><span class="i18n" lang="en">In <code>webhook\.md<\/code>\.<\/span>/);
});

// Criterion 12 and R10: no view carries the value, the words or command line that carried it, or a word of travel.
test('no view, shared or not, carries the value, what carried it, or a claim of how it travelled', async (t) => {
  for (const variant of ['delegated', 'direct', 'typed-first', 'background', 'handed-on'] as const) {
    for (const share of [false, true]) {
      const report = await reportOn(t, variant, share);
      const views = [summary(report), full(report), page(report)];

      for (const view of views) {
        for (let start = 0; start + 4 <= ONWARD_SECRET.length; start += 1) {
          assert.ok(!view.includes(ONWARD_SECRET.slice(start, start + 4)), `${variant}, share ${share}: a run of the value`);
        }
        for (const carried of ['use webhook secret', 'The handler signs with', 'Bearer', 'verify that']) {
          assert.ok(!view.includes(carried), `${variant}, share ${share}: ${carried}`);
        }
      }
      const said = [section(full(report), 'Where the same value was afterwards'), ...appearedLines(summary(report))].join('\n');
      assert.doesNotMatch(said, /\b(?:copied|leaked|sent|exfiltrat\w*|because|in order to)\b/i, `${variant}, share ${share}`);
    }
  }
});
