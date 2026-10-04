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
import { SENTENCE_CAP } from '../../src/shared/sentence.ts';
import { renderPage } from '../helpers/report-page.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });
const SECRET = 'EPzLE4tu9Argh963';
const REASONING = 'The handler signs with a secret, so it is set in one of the env files.';

const line = (content: unknown[], type: 'assistant' | 'user' = 'assistant'): string =>
  JSON.stringify({ type, isSidechain: false, cwd: '/work/app', message: { role: type, content } });
const thinking = (text: string): string => line([{ type: 'thinking', thinking: text, signature: 'sig' }]);
const bash = (id: string, command: string): string => line([{ type: 'tool_use', id, name: 'Bash', input: { command } }]);
const read = (id: string, path: string): string => line([{ type: 'tool_use', id, name: 'Read', input: { file_path: path } }]);
const answer = (id: string, content: string): string => line([{ type: 'tool_result', tool_use_id: id, content }], 'user');
const GREP = 'toolu_01WHYGREPAAAAAAAAAAAAAA';
const READ = 'toolu_01WHYREADAAAAAAAAAAAAAA';
const FOUND = `apps/web/.env.development:12:WEBHOOK_SECRET=${SECRET}`;

async function reportOf(t: Parameters<typeof writeSession>[0], lines: readonly string[], share = false): Promise<ReportModel> {
  const root = await writeSession(t, { 'why.jsonl': `${lines.join('\n')}\n` });
  const model = await source.read(join(root, 'why.jsonl'));
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, share), { share, projectRoot: model.projectRoot });
}

const full = (report: ReportModel): string => new TextReportRenderer(100, { full: true }).render(report);

// why-this-call R6-R8 and criterion 2: the words are quoted where the finding is, and said to be what was written.
test('what the agent wrote before the call is quoted under the finding, and on the page in three languages', async (t) => {
  const report = await reportOf(t, [thinking(REASONING), bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'), answer(GREP, FOUND)]);
  const html = renderPage(report);

  // The line wraps, so the comparison is made on the text with its wrapping joined up again.
  const joined = full(report).replace(/\n {13}/g, ' ');
  assert.match(joined, new RegExp(`wrote    "${REASONING}" · its own working-out`), 'the kind is said, so a plan is not read as a message');
  assert.match(html, /The agent’s note before this action/);
  assert.match(html, /Notatka agenta przed tym działaniem/);
  assert.match(html, /Notiz des Agenten vor dieser Aktion/);
  assert.match(html, new RegExp(REASONING.slice(0, 40)));
});

// R2 and criterion 2: one block before three calls is said to stand before three, not written for the first.
test('words that stand before a run of calls say how many they stand before', async (t) => {
  const report = await reportOf(t, [
    thinking('Check the three of them.'),
    bash('toolu_01WHYONEAAAAAAAAAAAAAAA', 'ls apps'),
    answer('toolu_01WHYONEAAAAAAAAAAAAAAA', 'apps'),
    bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'),
    answer(GREP, FOUND),
    bash('toolu_01WHYTWOAAAAAAAAAAAAAAA', 'true'),
    answer('toolu_01WHYTWOAAAAAAAAAAAAAAA', 'ok'),
  ]);

  assert.match(full(report), /wrote    "Check the three of them\." · its own working-out · stands before 3 calls/);
});

// R3 and criterion 3: a call that follows another call has nothing of its own, and the report says exactly that.
test('a call with nothing written before it says so, and points at no record', async (t) => {
  const report = await reportOf(t, [
    read(READ, 'apps/web/.env'),
    answer(READ, 'PORT=3000'),
    bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'),
    answer(GREP, FOUND),
  ]);

  assert.match(full(report), /^ {4}wrote    nothing before this call$/m);
  assert.match(renderPage(report), /No earlier message was recorded for this action\./);
});

// Found on the measured session, where all 249 reasoning blocks are empty: what an agent did not write and
// what the record did not keep are different facts, and the report says which one it has.
test('a block the record kept without words is said as that, not as nothing', async (t) => {
  const report = await reportOf(t, [thinking(''), bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'), answer(GREP, FOUND)]);

  assert.match(full(report), /^ {4}wrote    no words before this call - the record kept 1 of them empty$/m);
  assert.match(renderPage(report), /The earlier message was recorded without its text/);
});

// §5.1, level B: a sentence past the cap is cut, and the cut is said rather than left to read as the whole thought.
test('a sentence past the cap is cut, and says so in both views', async (t) => {
  const long = `The handler signs every webhook with a secret ${'and the search has to cover every package '.repeat(4)}before anything else.`;
  const report = await reportOf(t, [thinking(long), bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'), answer(GREP, FOUND)]);
  const text = full(report);
  const quoted = /wrote {4}"([^"]*)"/.exec(text.replace(/\n {13}/g, ' '));

  assert.ok((quoted?.[1]?.length ?? 0) <= SENTENCE_CAP, `the sentence was ${quoted?.[1]?.length} characters`);
  assert.match(text, /\(cut\)/);
  assert.match(renderPage(report), /Cut at the first 200 characters\./);
});

// Criteria 4 and 5: the scanner recognises the minority of secrets, so a traced run decides - not a pattern.
test('words carrying a value read from a protected file are not shown, and the report says what they carried', async (t) => {
  const report = await reportOf(t, [
    read(READ, 'apps/web/.env'),
    answer(READ, `WEBHOOK_SECRET=${SECRET}`),
    thinking(`The secret is ${SECRET}; check the handler against it.`),
    bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'),
    answer(GREP, FOUND),
  ]);
  const outputs = [full(report), new TextReportRenderer(100).render(report), renderPage(report)];

  assert.match(full(report), /wrote    not shown - these words carried a value from apps\/web\/\.env/);
  for (const output of outputs) {
    for (let start = 0; start + 4 <= SECRET.length; start += 1) {
      assert.ok(!output.includes(SECRET.slice(start, start + 4)), 'no run of the value reaches any view');
    }
  }
});

// Criterion 4: under --share only the fact, and criterion 6: never a reason, in any of them.
test('the shared view shows the fact and not the words, and no view calls them a reason', async (t) => {
  const lines = [thinking(REASONING), bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'), answer(GREP, FOUND)];
  const shared = full(await reportOf(t, lines, true));
  const plain = full(await reportOf(t, lines));

  assert.match(shared, new RegExp(`wrote    ${REASONING.length} characters, not shown in this view`));
  assert.ok(!shared.includes(REASONING));
  for (const text of [shared, plain]) {
    for (const line of text.split('\n').filter((row) => row.includes('wrote    '))) {
      assert.doesNotMatch(line, /\breason\b|\bwhy\b|\bintended\b/i, line);
    }
  }
  assert.equal(SENTENCE_CAP, 200, 'the cap the maintainer chose');
});

// The maintainer's choice of 2026-09-15, after four findings from one grep printed the same context four times.
test('files reached by one call are one block, with the context said once', async (t) => {
  const found = [
    'apps/web/.env.test:3:WEBHOOK_SECRET=one',
    'apps/web/.env.development:12:WEBHOOK_SECRET=two',
    'packages/widget/.env:4:WEBHOOK_SECRET=three',
  ].join('\n');
  const report = await reportOf(t, [thinking(REASONING), bash(GREP, 'grep -rn "WEBHOOK_SECRET" apps'), answer(GREP, found)]);
  const text = full(report);

  assert.match(text, /^ {2}3 files, in one call$/m);
  assert.match(text, /^ {4}files    apps\/web\/\.env\.test$/m);
  assert.match(text, /^ {13}apps\/web\/\.env\.development$/m);
  assert.match(text, /^ {13}packages\/widget\/\.env$/m);
  assert.equal((text.match(/^ {4}who {6}/gm) ?? []).length, 1, 'said once, not once per file');
  assert.equal((text.match(/^ {4}wrote {4}/gm) ?? []).length, 1);
});

