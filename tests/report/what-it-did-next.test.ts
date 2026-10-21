// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ContentFingerprints } from '../../src/core/access/content-fingerprints.ts';
import type { Delegation } from '../../src/core/delegation.ts';
import type { ToolEvent } from '../../src/core/event.ts';
import type { AgentMessage } from '../../src/core/message.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import type { ReportModel } from '../../src/report/report-model.ts';
import { alertOf } from '../../src/report/watch/agent-alert.ts';

/*
 * `2026-10-19-what-it-did-next.md`, found 2026-10-19 by the maintainer: the AI printed a tracked customer list in a loop
 * and wrote four of its email addresses in its answer, and the drawer said No four times under "What it did next". No
 * value was taken out of the loop's output, so nothing was followed, and nothing followed was drawn as nothing done.
 * Every name and address here is fictional.
 */
const ROOT = '/Users/someone/studio';
const CSV = 'Clients/customers.csv';
const EMAIL = 'anna.nowak@example.com';
// The second row has more than two words: set aside from the trace as prose (§5.2), which is the file's own text (DN2).
const ROWS = `id,name,email,owed\n1,Anna Nowak,${EMAIL},180\n2,Hotel Aurora Spa,office@aurora.example,1345\n`;
const TRACKED = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/Clients/customers.csv', mode: 'tell' as const }] };
const LOOP = `cd "${ROOT}" && for f in README.md ${CSV}; do echo "=== $f"; cat "$f"; done`;

const at = (agentId: string, record: number) => ({ source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record });

function call(id: string, agentId: string, record: number, fields: Partial<ToolEvent>, content: string): ToolEvent {
  return {
    id, agentId, sequence: record, toolName: 'Bash', input: {}, targets: [], commands: [], resultShape: 'listing', toolKnown: true,
    outcome: 'succeeded', workingDirectory: ROOT, evidence: at(agentId, record), completeness: 'complete',
    result: { stage: 'model', completeness: 'complete', content, evidence: at(agentId, record + 1) }, ...fields,
  };
}

/** The loop of the maintainer's conversation: a file's name, then its text, for each file. */
const loop = (agentId: string, record: number): ToolEvent =>
  call('loop-' + agentId, agentId, record, { input: { command: LOOP }, commands: [LOOP] }, `=== README.md\n# Studio\n=== ${CSV}\n${ROWS}`);
const command = (agentId: string, record: number, line: string): ToolEvent => call('cmd-' + record, agentId, record, { input: { command: line }, commands: [line] }, 'ok');
const said = (agentId: string, record: number, text: string): AgentMessage => ({ agentId, kind: 'said', text, completeness: 'complete', evidence: at(agentId, record) });

function report(events: ToolEvent[], messages: AgentMessage[], helpers: string[] = [], policy: Policy = TRACKED, fingerprints?: ContentFingerprints): ReportModel {
  const delegations: Delegation[] = helpers.map((child) => ({
    followUps: [], id: 'task-' + child, parentAgentId: 'main', childAgentId: child, description: 'Look at the clients', prompt: 'p', reports: [],
    evidence: at('main', 1), completeness: 'complete',
  }));
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'known', path: ROOT },
    agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations, events, messages, completeness: 'complete', gaps: [],
  };
  return buildReport(model, policy, new Redactor('test', model.projectRoot), { share: false, projectRoot: model.projectRoot, ...(fingerprints === undefined ? {} : { fingerprints }) });
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');
const page = (built: ReportModel): string => new ReportPageRenderer().render({ report: built, withIndexLink: false });
const drawerOf = (html: string, at: number): string => {
  const start = html.indexOf('<dialog class="dr" id="helper-' + at + '"');
  return start < 0 ? '' : english(html.slice(start, html.indexOf('</dialog>', start)));
};
/** "What it did next", row by row, as the drawer answers it. */
const nextOf = (drawer: string): Record<string, string> => Object.fromEntries(
  [...drawer.matchAll(/<div class="hw-row"><span>([^<]+)<\/span><span class="sw-yn[^"]*">([^<]+)<\/span><\/div>/g)].map((row) => [row[1], row[2]]),
);

// DN1, DN3: nothing of the loop's file was followed; the ways the AI took after reading it are not known, the others No.
test('a file printed in a loop, then an answer and a command: what it did next is not known, and No only where it did nothing', () => {
  const built = report([loop('main', 3), command('main', 5, 'ls Orders')], [said('main', 7, `Café Lumen owes £180. Write to ${EMAIL}.`)]);

  assert.deepEqual(built.flows[0]?.unfollowed?.map(({ path, next }) => [String(path), next]), [[CSV, ['command', 'said']]]);
  const drawer = drawerOf(page(built), 0);
  assert.deepEqual(nextOf(drawer), {
    'Passed it to another AI': 'NO', 'Saved a copy': 'NO', 'Repeated it in a message': 'NOT KNOWN', 'Used it to run something': 'NOT KNOWN',
  });
  assert.match(drawer, /<span class="sw-yn hw-unknown">NOT KNOWN<\/span>/, 'in the colour of what is not known');
  assert.match(drawer, /We can’t follow what it read any further, so we don’t know what it did with it next\./);
});

// DN3: a way taken before the file was read could not have carried it, and stays a No.
test('words the AI wrote before it read the file leave its answer a No', () => {
  const built = report([loop('main', 3)], [said('main', 1, 'I will look at the client files.')]);

  assert.deepEqual(built.flows[0]?.unfollowed?.map(({ next }) => next), [[]]);
  assert.equal(nextOf(drawerOf(page(built), 0))['Repeated it in a message'], 'NO');
  assert.doesNotMatch(drawerOf(page(built), 0), /We can’t follow/, 'nothing it did after is unknown, so nothing is said of it');
});

// DN2: a row of words is the file's own text and is in no trace, though the header and another row are.
test('a table read whole with a row of words is not followed, and a value of it that is traced still says Yes', () => {
  const read = call('read', 'main', 3, { toolName: 'Read', input: { file_path: CSV }, targets: [CSV], resultShape: 'content' }, ROWS);
  const quiet = report([read], [said('main', 5, 'Two clients owe money.')]);
  assert.deepEqual(quiet.flows[0]?.unfollowed?.map(({ path }) => String(path)), [CSV]);
  assert.equal(nextOf(drawerOf(page(quiet), 0))['Repeated it in a message'], 'NOT KNOWN');

  const quoted = report([read], [said('main', 5, `Write to ${EMAIL}.`)]);
  assert.equal(nextOf(drawerOf(page(quoted), 0))['Repeated it in a message'], 'YES', 'a traced value found is said, unknown or not');
});

// DN1 beside what-came-back criterion 6: values taken and set aside as ordinary leave nothing private to follow.
test('a file of ordinary values only is followed, and its answers stay No', () => {
  const env = call('env', 'main', 3, { toolName: 'Read', input: { file_path: 'apps/web/.env' }, targets: ['apps/web/.env'], resultShape: 'content' }, 'PORT=3000\nDEBUG=true');
  const built = report([env], [said('main', 5, 'The server listens on port 3000.')], [], DEFAULT_POLICY);

  assert.equal(built.flows[0]?.unfollowed, undefined);
  assert.equal(nextOf(drawerOf(page(built), 0))['Repeated it in a message'], 'NO');
});

// DN3: a helper's reply goes back to the agent that asked it, after everything it read.
test('a helper that read a file it cannot be followed from may have passed it on in its reply', () => {
  const built = report([loop('reader', 3)], [], ['reader']);

  assert.deepEqual(built.flows.find((flow) => flow.agentIndex === 1)?.unfollowed?.map(({ next }) => next), [['reply']]);
  assert.equal(nextOf(drawerOf(page(built), 1))['Passed it to another AI'], 'NOT KNOWN');
});

// DN4: the file's own window says it in its table, as the drawer does.
test('the file’s window says Not known in “What each AI did with it”, beside a Yes for the read', () => {
  const html = page(report([loop('main', 3), command('main', 5, 'ls Orders')], [said('main', 7, `Write to ${EMAIL}.`)]));
  const start = html.indexOf('<div class="sw-grid sw-grid-each">');
  const row = html.slice(start, html.indexOf('</div>', html.indexOf('sw-mono', start)));
  const answers = [...row.matchAll(/<span class="sw-yn([^"]*)">/g)].map((match) => match[1]);

  assert.deepEqual(answers, [' sw-yes', '', '', ' sw-unknown', ' sw-unknown'], 'read, passed, saved, repeated, used');
});

// DN6: Advanced counts every private file an AI read, and lists one it was let read under its own group.
test('Advanced counts a tracked file the AI read, and lists it under Nothing to do', () => {
  const html = page(report([loop('main', 3)], []));
  const advanced = english(html.slice(html.indexOf('<section id="advanced"'), html.indexOf('<dialog', html.indexOf('<section id="advanced"'))));

  assert.match(advanced, /Private files read<\/div><div class="sx-value sx-coral">1</);
  assert.match(advanced, /Events recorded<\/div><div class="sx-value">1</);
  assert.match(advanced, /Fixed<\/div><div class="sx-value">0 \/ 0</);
  assert.match(advanced, /<div class="adv-group adv-group-quiet">Nothing to do · 1<\/div><a class="adv-row" href="#(file-\d+)" data-popup-open="\1" data-story-tab="2"/);
  assert.match(advanced, /customers\.csv/);
  assert.doesNotMatch(advanced, /No private file’s contents reached an AI\./);
  const window = /href="#(file-\d+)"/.exec(advanced)?.[1] ?? '';
  assert.match(html, new RegExp('<dialog[^>]* id="' + window + '"'), 'the row opens a window that is on the page');
});

test('Advanced with no private file read still says so', () => {
  const built = report([command('main', 3, 'ls Orders')], []);
  const html = page(built);
  assert.match(english(html.slice(html.indexOf('<section id="advanced"'))), /No private file’s contents reached an AI\./);
});

/*
 * DND4, DND5, DND8 (option 1, decided 2026-10-19 by the maintainer): where the file is a private table and the read
 * showed fields only it holds, the four answers say Yes where one of them went, and No for the rest - in the drawer and
 * the file's window, and nowhere else. The project's files as the walk hands them over: the table, an invoice that
 * names one of its clients, the README the loop printed too.
 */
const STUDIO = (): ContentFingerprints => ContentFingerprints.of([
  { path: `${ROOT}/${CSV}`, lines: ROWS.split('\n'), private: true },
  { path: `${ROOT}/Orders/invoice-0912.md`, lines: ['Billed to Hotel Aurora Spa for the gala flowers.'], private: false },
  { path: `${ROOT}/README.md`, lines: ['# Studio'], private: false },
], 'test');
const tableRead = (answer: string): ReportModel =>
  report([loop('main', 3), command('main', 5, 'ls Orders')], [said('main', 7, answer)], [], TRACKED, STUDIO());

test('a table whose own email the AI wrote in its answer says Yes there, and No where nothing of its own went', () => {
  const built = tableRead(`Café Lumen owes £180. Write to ${EMAIL}.`);
  assert.deepEqual(built.flows[0]?.unfollowed?.map(({ path, next, byFields }) => [String(path), next, byFields?.found]), [[CSV, ['command', 'said'], ['said']]]);

  const html = page(built);
  const drawer = drawerOf(html, 0);
  assert.deepEqual(nextOf(drawer), { 'Passed it to another AI': 'NO', 'Saved a copy': 'NO', 'Repeated it in a message': 'YES', 'Used it to run something': 'NO' });
  assert.match(drawer, /It repeated something from them in its own words\./);
  assert.doesNotMatch(drawer, /We can’t follow/, 'nothing of it is left not known');
  const start = html.indexOf('<div class="sw-grid sw-grid-each">');
  const row = html.slice(start, html.indexOf('</div>', html.indexOf('sw-mono', start)));
  assert.deepEqual([...row.matchAll(/<span class="sw-yn([^"]*)">/g)].map((match) => match[1]), [' sw-yes', '', '', ' sw-yes', ''], 'the window says what the drawer says');
});

// DNB9: a client's name the invoice holds too says nothing of whose it is.
test('a field another file of the project holds is no Yes, and the table answers No', () => {
  const drawer = drawerOf(page(tableRead('Hotel Aurora Spa is still waiting for its invoice.')), 0);
  assert.equal(nextOf(drawer)['Repeated it in a message'], 'NO');
});

// DND8: the fact reaches the four answers and nothing else - no use, step, count, to-do or line in the chat.
test('what a table\'s fields answer changes nothing but the four answers', () => {
  const quoted = tableRead(`Write to ${EMAIL}.`);
  const plain = tableRead('Two clients owe money.');
  const without = (built: ReportModel) => JSON.stringify({ ...built, flows: built.flows.map(({ unfollowed: _gone, ...flow }) => flow) });

  assert.equal(without(quoted), without(plain), 'the model is the same but for the four answers\' facts');
  assert.deepEqual(quoted.uses, []);
  assert.ok(quoted.flows.every((flow) => flow.steps.every((step) => step.kind !== 'used')), 'no step says it went on');
  assert.equal(alertOf(quoted, 0)?.level, alertOf(plain, 0)?.level, 'the chat says what it said');
  assert.equal(alertOf(quoted, 0)?.level, 'reached');
});
