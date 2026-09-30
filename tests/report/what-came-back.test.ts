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
import {
  RETURN_SESSION_ID,
  RETURNED_SECRET,
  returnSessionFiles,
  type ReturnSessionOptions,
} from '../helpers/return-session.ts';
import { renderPage } from '../helpers/report-page.ts';

/** One AI's drawer on the report page (the report page spec P30): your AI, then Helper 1, … */
/** A row of "What it did next" and its answer, within that one row. */
const answer = (row: string, cls: string): RegExp => new RegExp(row + '<\\/span>(?:(?!hw-row)[\\s\\S])*?<span class="sw-yn' + cls + '">');
const drawerOf = (html: string, at: number): string => {
  const start = html.indexOf('<dialog class="dr" id="helper-' + at + '"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</dialog>', start));
};
import { writeSession } from '../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

async function reportOn(t: Parameters<typeof writeSession>[0], options: ReturnSessionOptions, share = false): Promise<ReportModel> {
  const root = await writeSession(t, returnSessionFiles(options));
  const model = await source.read(join(root, `${RETURN_SESSION_ID}.jsonl`));
  return buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, share), { share, projectRoot: model.projectRoot });
}

const summary = (report: ReportModel): string => new TextReportRenderer(100).render(report);
const full = (report: ReportModel): string => new TextReportRenderer(100, { full: true }).render(report);

// what-came-back R11, R12, R15 and criterion 2.
test('a value that came back is counted once, said in the headline, and marked on the agent that returned it', async (t) => {
  const report = await reportOn(t, { carried: 'value' });

  assert.equal(report.tally.valuesReturned, 1);
  assert.match(`${report.headline.sentence}`, /An agent's answer carried a value from one of them back to the agent that started it\.$/);
  assert.deepEqual(report.returns.map(({ strength, paths }) => ({ strength, paths: paths.map(String) })), [
    { strength: 'value', paths: ['apps/web/.env.development'] },
  ]);
  assert.match(summary(report), /^ {2}└─ Agent 1 · Explore +2 actions +2 files reached +gave the value back$/m);
  assert.match(summary(report), /^ {4}↩ its answer to the session itself carried a value from apps\/web\/\.env\.development$/m);
  assert.match(full(report), /^▍What the agents answered$/m);
  assert.match(full(report), /^ {4}its answer carried a value from a protected file · apps\/web\/\.env\.development$/m);
});

// R4 names the file a value came from. One call printing two of them says which it was in neither view.
test('a value one call read from either of two files is said to come from one of them, never from both', async (t) => {
  const report = await reportOn(t, { carried: 'value', readsTogether: true });

  assert.deepEqual(report.returns.map(({ strength, paths }) => ({ strength, paths: paths.map(String) })), [
    { strength: 'value', paths: ['apps/web/.env', 'apps/web/.env.development'] },
  ]);
  assert.match(summary(report).replace(/\n {6}/g, ' '), /^ {4}↩ its answer to the session itself carried a value from apps\/web\/\.env or apps\/web\/\.env\.development$/m);
  // Two paths and a joiner still fit one line of `--full` at this width.
  assert.match(full(report), /its answer carried a value from a protected file · apps\/web\/\.env or apps\/web\/\.env\.development$/m);
  // The joiner belongs to the language around it, so the page carries its own in each.
  const page = renderPage(report);
  assert.match(page, /Its reply to the agent that gave it the task contained the same text as <code>apps\/web\/\.env<\/code> or <code>apps\/web\/\.env\.development<\/code>/);
  assert.match(page, /zawierała ten sam tekst, co <code>apps\/web\/\.env<\/code> lub <code>apps\/web\/\.env\.development<\/code>/);
  assert.match(page, /enthielt denselben Text wie <code>apps\/web\/\.env<\/code> oder <code>apps\/web\/\.env\.development<\/code>/);
  // The run's own step keeps the same "or" (the report page spec P63).
  assert.match(page, /<li class="rc-step rc-returned">[\s\S]*?contained the same text as <code>apps\/web\/\.env<\/code> or <code>apps\/web\/\.env\.development<\/code>/);
});

// Criteria 3 and 4, and R9.
test('a fragment, a path, a report and an unknown return are each said in their own words', async (t) => {
  assert.match(summary(await reportOn(t, { carried: 'fragment' })), /carried a value from apps\/web\/\.env\.development/);
  assert.match(summary(await reportOn(t, { carried: 'path' })), /its answer to the session itself named apps\/web\/\.env\.development/);
  assert.match(summary(await reportOn(t, { carried: 'nothing' })).replace(/\n {6}/g, ' '), /its answer to the session itself carried no traced value \(\d+ characters; it reached 2 protected files\)/);

  const unknown = summary(await reportOn(t, { carried: 'value', resultMissing: true }));
  assert.match(unknown, /its answer to the session itself could not be read/);
  assert.match(unknown, /1 × an agent's answer could not be read, so what was in it is unknown/);
  assert.doesNotMatch(unknown, /carried a value/, 'what the agent wrote is not what its answer carried');
});

// R4b: what the agent wrote is said beside what came back, and does not become it.
// R11 and R12 as amended on the second measurement: this is all the measured session's transcript records of its incident.
test('a value the agent only wrote in its own messages is said as written, in the headline and on the graph', async (t) => {
  const report = await reportOn(t, { carried: 'value', resultCarries: 'nothing' });
  const text = summary(report);

  assert.equal(report.tally.valuesReturned, 0);
  assert.equal(report.tally.valuesWritten, 1);
  assert.match(`${report.headline.sentence}`, /An agent wrote a value from one of them into its own messages, which the session's transcript now keeps\.$/);
  assert.doesNotMatch(`${report.headline.sentence}`, /answer carried/);
  assert.match(text, / wrote the value$/m);
  // Its drawer says it opened the file and repeated it in a message - and never that its reply carried it.
  const drawer = drawerOf(renderPage(report), 1);
  assert.match(drawer, /<div class="hw-a"><span class="i18n" lang="en">Yes<\/span>/);
  assert.match(drawer, /Repeated it in a message<\/span>[\s\S]*?<span class="sw-yn sw-yes">/);
  assert.match(drawer, answer('Passed it to another AI', ''), 'nothing crossed in its reply');
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.deepEqual(report.graph.agents.map((agent) => [agent.returned, agent.wroteValue]), [[undefined, true]]);
  assert.match(text.replace(/\n\s+/g, ' '), /its answer to the session itself carried no traced value \(\d+ characters; it reached 2 protected files\); it also wrote a value from apps\/web\/\.env\.development in its own messages/);
  assert.doesNotMatch(text, /gave the value back/);
  assert.match(renderPage(report), /It wrote the same text as <code>apps\/web\/\.env\.development<\/code> in its own messages/);
});

// Criterion 6, and the headline of R11: a weaker return does not raise it.
test('an ordinary value changes nothing, and a path that came back leaves the headline alone', async (t) => {
  const ordinary = await reportOn(t, { carried: 'ordinary' });
  const path = await reportOn(t, { carried: 'path' });

  assert.equal(ordinary.tally.valuesReturned, 0);
  assert.doesNotMatch(summary(ordinary), /gave the value back|a value from/);
  assert.doesNotMatch(`${path.headline.sentence}`, /came back/);
});

// Criterion 7 (R8): the agent in the middle reached nothing itself, and still handed the value on.
test('a value that travelled two hops is said for both agents', async (t) => {
  const text = summary(await reportOn(t, { carried: 'value', nested: true }));

  assert.equal(text.replace(/\n {6}/g, ' ').match(/carried a value from apps\/web\/\.env\.development/g)?.length, 2);
  assert.equal(text.match(/ gave the value back$/gm)?.length, 2);
});

// where-the-value-went criterion 3: the motivating case as its transcript records it. Its agent wrote the value and
// the report carrying it was delivered after a launch notice - so it came back, and is no longer only written.
test('a value in a report delivered after a launch notice is said to have come back, in every view', async (t) => {
  const report = await reportOn(t, { carried: 'value', background: 'delivered' });
  const text = summary(report);

  assert.equal(report.tally.valuesReturned, 1);
  assert.equal(report.tally.valuesWritten, 0);
  assert.match(`${report.headline.sentence}`, /An agent's answer carried a value from one of them back to the agent that started it\.$/);
  assert.match(text, /^ {2}└─ Agent 1 · Explore +2 actions +2 files reached +gave the value back$/m);
  assert.match(text, /^ {4}↩ its answer to the session itself carried a value from apps\/web\/\.env\.development$/m);
  assert.doesNotMatch(text, /wrote the value/);
  assert.match(full(report), /^ {4}its answer carried a value from a protected file · apps\/web\/\.env\.development$/m);
  const page = renderPage(report);
  assert.match(page, /Its reply to the agent that gave it the task contained the same text as <code>apps\/web\/\.env\.development<\/code>/);
  assert.match(page, /zawierała ten sam tekst, co <code>apps\/web\/\.env\.development<\/code>/);
});

// R5 and criterion 4: never delivered is not "could not be read", and says so in its own words, in every language.
test('a launch notice with no report delivered is an unknown return, said as never delivered', async (t) => {
  for (const background of ['queued', 'awaited'] as const) {
    const report = await reportOn(t, { carried: 'value', background });
    const text = summary(report).replace(/\n\s+/g, ' ');

    assert.equal(report.tally.valuesReturned, 0, background);
    assert.match(text, /it ran in the background, and its answer to the session itself never arrived/, background);
    assert.match(text, /1 × an agent ran in the background and its answer never arrived, so what was in it is unknown/, background);
    assert.doesNotMatch(text, /could not be read/, background);
    const page = renderPage(report);
    assert.match(page, /It ran in the background\. Its reply is not in the record/, background);
    assert.match(page, /Działał w tle\. Jego odpowiedzi nie ma w zapisie/, background);
    assert.match(page, /Er lief im Hintergrund/, background);
    // Never delivered is not a no: the row says it is not known.
    assert.match(drawerOf(page, 1), answer('Passed it to another AI', ' hw-unknown'), background);
  }
});

// Criterion 9: no view, no language and no mode carries the value, or any run of it.
test('no output carries the value that came back, or any 4-character run of it', async (t) => {
  for (const carried of ['value', 'fragment'] as const) {
    for (const share of [false, true]) {
      const report = await reportOn(t, { carried }, share);
      const outputs = [
        summary(report),
        full(report),
        new TextReportRenderer(80, { ascii: true }).render(report),
        new TextReportRenderer(100, { colour: true }).render(report),
        renderPage(report),
      ];

      for (const output of outputs) {
        for (let start = 0; start + 4 <= RETURNED_SECRET.length; start += 1) {
          assert.ok(!output.includes(RETURNED_SECRET.slice(start, start + 4)), `${carried}${share ? ', shared' : ''}`);
        }
      }
    }
  }
});

// Criterion 2 on the page (R14): the panel says it in three languages, and the graph marks the agent in words.
test('the page says what came back in the agent panel, in all three languages, and marks the node in words', async (t) => {
  const carried = await reportOn(t, { carried: 'value' });
  const html = renderPage(carried);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.deepEqual(carried.graph.agents.map((agent) => agent.returned), ['value']);
  assert.deepEqual(carried.returns.map((entry) => entry.strength), ['value']);

  assert.match(html, /Its reply to the agent that gave it the task contained the same text as <code>apps\/web\/\.env\.development<\/code>/);
  assert.match(html, /Jego odpowiedź dla agenta, który zlecił zadanie, zawierała ten sam tekst, co <code>apps\/web\/\.env\.development<\/code>/);
  assert.match(html, /Seine Antwort an den auftraggebenden Agenten enthielt denselben Text wie <code>apps\/web\/\.env\.development<\/code>/);
  // The helper is drawn as one that read, and its drawer says what it read went on - in words, not a colour alone.
  assert.match(html, /<a class="hd-node hd-risk" data-node="a1"/);
  assert.match(drawerOf(html, 1), answer('Passed it to another AI', ' sw-yes'));

  const nothing = await reportOn(t, { carried: 'nothing' });
  assert.deepEqual(nothing.returns.map(({ strength, filesReached }) => [strength, filesReached]), [['report', 2]]);
  assert.ok((nothing.returns[0]?.reportLength ?? 0) > 0, 'and how long the reply was, which the page says');
  const report = renderPage(nothing);
  assert.match(report, /No text from sensitive files was found in its reply \(\d+ characters\)/);
  assert.match(report, /W jego odpowiedzi \(\d+ znaków\) nie znaleziono tekstu z wrażliwych plików/);
});
