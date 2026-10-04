// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Agent } from '../../src/core/agent.ts';
import type { Delegation } from '../../src/core/delegation.ts';
import type { EventOutcome, ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { buildSessionView } from '../../src/report/render/session-view.ts';
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import { ESCAPES } from '../../src/shared/colour.ts';
import { renderPage } from '../helpers/report-page.ts';

const main: Agent = { id: 'main', type: 'main', depth: 0 };

/** One AI's drawer on the report page (the report page spec P30), by its place in the list: your AI, then Helper 1, … */
const drawerOf = (html: string, at: number): string => {
  const start = html.indexOf('<dialog class="dr" id="helper-' + at + '"');
  return start < 0 ? '' : html.slice(start, html.indexOf('</dialog>', start));
};
/** The page with the other languages taken out and the English left as plain text. */
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

function session(agents: Agent[], delegations: Delegation[], events: ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: main.id,
    projectRoot: { kind: 'absent' },
    agents: [main, ...agents],
    delegations,
    events,
    completeness: 'complete',
    messages: [],
    gaps: [],
  };
}

function read(id: string, agentId: string, outcome: EventOutcome, sequence: number): ToolEvent {
  const evidence = { source: { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id, agentId, sequence, toolName: 'Read', input: {}, targets: ['apps/web/.env'], commands: [],
    resultShape: 'content', toolKnown: true, outcome, evidence,
    completeness: outcome === 'unknown' ? 'partial' : 'complete',
    ...(outcome === 'unknown' ? {} : {
      result: { content: outcome === 'blocked' ? 'Permission denied' : 'Content returned', stage: 'model', completeness: 'complete', evidence },
    }),
  };
}

function delegation(id: string, parentAgentId: string, childAgentId: string, description = 'Check configuration'): Delegation {
  return {
    followUps: [],
    id, parentAgentId, childAgentId, description, prompt: 'Full prompt must stay private',
    reports: [], evidence: { source: { kind: 'agent', agentId: parentAgentId }, record: 1 }, completeness: 'complete',
  };
}

test('a refused attempt, unknown attempt and successful retry remain separate stories', () => {
  const model = session([{ id: 'child' }], [delegation('task', 'main', 'child')], [
    read('a', 'child', 'blocked', 1),
    read('b', 'child', 'unknown', 2),
    read('c', 'child', 'succeeded', 3),
    read('d', 'child', 'succeeded', 4),
  ]);
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  assert.deepEqual(report.stories.map(({ outcome, occurrences }) => ({ outcome, occurrences })), [
    { outcome: 'succeeded', occurrences: 2 },
    { outcome: 'unknown', occurrences: 1 },
    { outcome: 'blocked', occurrences: 1 },
  ]);
  assert.equal(report.tally.refusedAttempts, 1);
  assert.equal(report.tally.filesReached, 1);
  assert.match(report.stories[0]?.evidence ?? '', /record 3$/);
});

// The main agent is the one agent every session has, and the graph keeps it apart from the delegated ones.
// Counting only those told the index "file name in a result" about a session whose own report led with
// "an agent saw what is inside a sensitive file" - the two pages disagreeing about the same session.
test('the tally counts what the main agent saw, not only what its helpers saw', () => {
  const model = session([], [], [read('a', 'main', 'succeeded', 1)]);
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  const seen = buildSessionView(report).agents.filter((entry) => entry.saw);

  assert.equal(seen.length, 1, 'the report says the main agent saw what is inside');
  assert.equal(report.tally.contentsSeen, seen.length, 'and the count the index reads says the same');
});

test('graph links use original identities even when shortened display labels collide', () => {
  const first = 'agent-aaaa111111111111same';
  const second = 'agent-aaaa222222222222same';
  const model = session([{ id: first }, { id: second }], [
    delegation('task-1', 'main', first),
    delegation('task-2', first, second),
  ], [read('read-1', first, 'blocked', 1), read('read-2', second, 'succeeded', 1)]);
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  const parent = report.graph.agents.find((agent) => agent.index === 1);
  const child = report.graph.agents.find((agent) => agent.index === 2);
  assert.equal(parent?.label, child?.label, 'the shortened labels really collide');
  assert.equal(parent?.parentIndex, 0);
  assert.equal(child?.parentIndex, 1);
  assert.equal(report.stories.find((story) => story.outcome === 'succeeded')?.agentIndex, 2);
  assert.equal(report.delegations[1]?.childAgentIndex, 2);
  const html = renderPage(report);
  // Each AI has its own drawer, and the child names the parent it was linked to by identity, not by the label they share.
  assert.ok(html.includes('id="helper-1"'));
  assert.ok(html.includes('id="helper-2"'));
  assert.match(english(drawerOf(html, 2)), /Brought in by Helper 1/);
  assert.ok(!html.includes(first) && !html.includes(second), 'full identifiers do not reappear in attributes');
});

test('every agent is present at realistic scale, including nested, empty and unresolved agents', () => {
  const agents = Array.from({ length: 15 }, (_, index) => ({ id: 'child-' + index }));
  const tasks = agents.slice(0, 14).map((agent, index) =>
    delegation('task-' + index, index === 1 ? 'child-0' : 'main', agent.id));
  const report = buildReport(session(agents, tasks, []), DEFAULT_POLICY, new Redactor('test'));
  const html = renderPage(report);
  const ids = [...html.matchAll(/<dialog class="dr" id="(helper-\d+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 16);
  assert.equal(new Set(ids).size, 16);
  assert.equal(report.graph.agents.find((agent) => agent.index === 2)?.parentIndex, 1);
  assert.equal(report.graph.agents.find((agent) => agent.index === 15)?.parentIndex, undefined);
  // The nesting is drawn from recorded links only, and the agent nothing asked for is said to have no known start.
  assert.match(english(drawerOf(html, 2)), /Brought in by Helper 1/);
  assert.match(english(drawerOf(html, 15)), /Brought in to help/);
  assert.match(english(html), /Helpers with no known start<\/div>[\s\S]*?<li>Helper 15<\/li><\/ul>/);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.equal(report.graph.totalAgents, 16);
  assert.deepEqual(report.unattributedAgents.map((agent) => agent.agentIndex), [15]);
});

test('an orphan keeps its confidently linked descendants in the tree', () => {
  const report = buildReport(session([{ id: 'orphan' }, { id: 'child' }], [
    delegation('task', 'orphan', 'child'),
  ], []), DEFAULT_POLICY, new Redactor('test'));
  const html = renderPage(report);
  assert.match(english(html), /Helpers with no known start<\/div>[\s\S]*?<li>Helper 1<\/li><\/ul>/);
  assert.match(english(drawerOf(html, 2)), /Brought in by Helper 1/);
  assert.equal((html.match(/id="helper-2"/g) ?? []).length, 1, 'one drawer per agent, with one durable anchor');
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.deepEqual(report.unattributedAgents.map((agent) => agent.agentIndex), [1]);
  assert.deepEqual(report.graph.agents.map((agent) => [agent.index, agent.parentIndex]), [[1, undefined], [2, 1]]);
});

test('unknown-only and shape-only reports never claim a clean session', () => {
  const unknown = session([], [], [read('a', 'main', 'unknown', 1)]);
  const unknownReport = buildReport(unknown, DEFAULT_POLICY, new Redactor('test'));
  const unknownHtml = renderPage(unknownReport);
  // The model's own record of it, which holds whatever the page looks like (`.ai/plans/2026-09-23-report-redesign.md`, step 6).
  assert.equal(unknownReport.headline.severity, 'attention', 'a missing result is never a clean session');
  assert.deepEqual(unknownReport.stories.map((story) => story.outcome), ['unknown']);
  assert.equal(unknownReport.tally.contentsSeen, 0);
  // P60: with nothing on the list and a call whose outcome is not recorded, the list is never the mint "nothing" card.
  const unknownPage = english(unknownHtml);
  assert.match(unknownPage, /Nothing to fix that we can see\.[\s\S]*?But part of the record is missing\./);
  const toDo = unknownPage.slice(unknownPage.indexOf('<section id="todo"'), unknownPage.indexOf('<section id="files"'));
  assert.doesNotMatch(toDo, /class="guide guide-mint"|class="hero-tick"|All good\./, 'a missing result is never said as nothing seen');
  assert.match(unknownPage, /Actions with no known ending/);
  assert.match(unknownPage, /Not recorded/, 'and the file says its outcome is not recorded');
  const shape: ToolEvent = {
    ...read('b', 'main', 'succeeded', 1),
    targets: [],
    result: { stage: 'model', completeness: 'complete', content: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', evidence: { source: { kind: 'main' }, record: 2 } },
  };
  const shapeReport = buildReport(session([], [], [shape]), DEFAULT_POLICY, new Redactor('test'));
  const shapeHtml = renderPage(shapeReport);
  // The headline speaks of protected files, and none was reached; what keeps the page from calling this clean is the
  // shape found in a result, and that is a fact of the model every page has to read (the report page spec, P59).
  assert.equal(shapeReport.headline.severity, 'clear');
  assert.equal(shapeReport.tally.filesReached, 0);
  assert.deepEqual(shapeReport.secretShapes.map((finding) => finding.classes.map(String)), [['aws-access-key-id', 'value beside a sensitive name']]);
  assert.match(shapeHtml, /A result contains something that looks like a password or key/);
  assert.match(shapeHtml, /aws-access-key-id/);
  assert.ok(!shapeHtml.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!shapeHtml.includes('No file this policy protects was reached'));
});

/*
 * SW14, P59: a key shape in what a call printed is a private file's only where the call printed private files and nothing
 * else. Found by review: any call that named one was taken for one that printed it, and the window that says a key sits
 * in no private file was hidden over a key printed from the environment, or from another file on the same line.
 */
test('a key shape is a private file\'s only where the call printed private files alone', () => {
  const printed = (id: string, overrides: Partial<ToolEvent>): ToolEvent => ({
    ...read(id, 'main', 'succeeded', 1),
    result: { stage: 'model', completeness: 'complete', content: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE', evidence: { source: { kind: 'main' }, record: 2 } },
    ...overrides,
  });
  const bash = (id: string, command: string): ToolEvent => printed(id, { toolName: 'Bash', targets: [], commands: [command], resultShape: 'listing' });
  const report = buildReport(session([], [], [
    printed('read', {}),
    bash('cat', 'cat apps/web/.env 2>/dev/null'),
    bash('env', 'ls -a apps/web/.env && printenv'),
    bash('two', 'cat apps/web/.env notes.txt'),
  ]), DEFAULT_POLICY, new Redactor('test'));

  assert.deepEqual(report.secretShapes.map((finding) => finding.inPrivateFile === true), [true, true, false, false]);
});

test('transcript markup cannot create executable HTML, script content, or extra anchors', () => {
  const attack = '</script><img src=x onerror=alert(1)><a id="event-999">task</a>';
  const model = session([{ id: 'child' }], [delegation('task', 'main', 'child', attack)], [
    read('a', 'child', 'succeeded', 1),
  ]);
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  const html = renderPage(report);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('id="event-999"'));
  assert.ok(html.includes('&lt;/script&gt;'));
  // The page's one script block is its own constants and nothing else: the same for this session as for an empty one,
  // so no transcript text reaches it.
  const scripts = (page: string): readonly string[] => [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');
  assert.deepEqual(scripts(html), scripts(renderPage(buildReport(session([], [], []), DEFAULT_POLICY, new Redactor('test')))));
  assert.ok(!html.includes('Full prompt must stay private'));
});

// X23: a record that does not show every action that ran is never a clean report, whatever it did show.
test('a record without the actions or access it ran never gets the clean headline, and absent and unmeasured read apart', () => {
  const headline = (capabilities: SessionModel['capabilities']) =>
    buildReport({ ...session([], [], []), provider: 'codex', capabilities }, DEFAULT_POLICY, new Redactor('test')).headline;
  const file = { kind: 'main' } as const;

  const legacy = headline([{ question: 'actions', state: 'absent', source: file }, { question: 'access', state: 'absent', source: file }]);
  assert.equal(legacy.severity, 'attention');
  assert.equal(String(legacy.sentence), 'No file this policy protects is known to have been reached, but the record does not show everything that ran.');
  const unknownMode = headline([{ question: 'actions', state: 'unmeasured', source: file }]);
  assert.equal(unknownMode.severity, 'attention');
  assert.match(String(unknownMode.sentence), /whether the record shows everything that ran has not been measured\.$/);
  // One source known not to show it settles what an unmeasured one leaves open.
  assert.match(String(headline([{ question: 'access', state: 'unmeasured', source: file }, { question: 'actions', state: 'absent', source: file }]).sentence),
    /the record does not show everything that ran\.$/);
  // Only what bears on "nothing was reached" keeps it from being clean: hidden reasoning does not.
  assert.equal(headline([{ question: 'actions', state: 'supported', source: file }, { question: 'reasoning', state: 'absent', source: file }]).severity, 'clear');
  assert.equal(headline([]).severity, 'clear', 'a format that declares nothing, as Claude Code\'s does not, is unchanged');
});

// P61: the Record tab says each gap in its reader's language, and what the record cannot show once - never the model's
// English lines in a page read in Polish.
test('the Record tab says its gaps in the reader\'s language, and what the record cannot show once', () => {
  const model: SessionModel = {
    ...session([], [], [read('a', 'main', 'unknown', 1)]),
    provider: 'codex',
    completeness: 'partial',
    gaps: [{ kind: 'record-damaged' }, { kind: 'record-damaged' }, { kind: 'capability-absent', question: 'actions' }],
    capabilities: [{ question: 'actions', state: 'absent', source: { kind: 'main' } }, { question: 'reasoning', state: 'supported', source: { kind: 'main' } }],
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  assert.deepEqual(report.gaps.map((gap) => [gap.kind, gap.question, gap.count]),
    [['record-damaged', undefined, 2], ['capability-absent', 'actions', 1]]);
  assert.equal(report.gaps.length, report.missing.length, 'one gap for every line of missing');
  const polish = renderPage(report).replace(/<span class="i18n" lang="(en|de)">[\s\S]*?<\/span>/g, '');
  assert.match(polish, /Części tej rozmowy nie ma w zapisie/);
  assert.match(polish, /Uszkodzona linia/);
  assert.match(polish, /2 razy/);
  assert.match(polish, /Działania o nieznanym zakończeniu/);
  assert.equal((polish.match(/Jakie działania się odbyły/g) ?? []).length, 1, 'what the record cannot show is said once');
  for (const line of report.missing) assert.ok(!polish.includes(line), 'no English line of missing: ' + line);
  assert.doesNotMatch(polish, /BUILT-IN DEFAULT[^<]*<\/code><\/dd><\/div>/, 'the rule\'s source is a code only under Technical details');
});

test('no-disclose policy is explained without claiming that every read violated it', () => {
  const report = buildReport(session([], [], [read('a', 'main', 'succeeded', 1)]),
    { ...DEFAULT_POLICY, level: 'no-disclose' }, new Redactor('test'));
  const html = renderPage(report);
  assert.equal(report.scope.policy.level, 'no-disclose');
  assert.match(html, /Your AI passing on something from a private file\. Reading it is allowed\./);
  assert.doesNotMatch(html, /Your AI opening or searching a private file/, 'the policy that was not used is not explained as if it were');
  assert.doesNotMatch(html, /Otwarcie lub przeszukanie prywatnego pliku/, 'in any language');
});

// R6: an identifier names a run on someone's machine. The position is what a reader points at anyway.
test('the shared view names an agent by its position and lets no identifier through', () => {
  const agentId = 'a68274ca30b769747';
  const model = session([{ id: agentId, type: 'Explore', depth: 1 }], [], [read('toolu_x', agentId, 'succeeded', 1)]);

  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', { kind: 'absent' }, true), {
    share: true,
    projectRoot: { kind: 'absent' },
  });

  assert.ok(!JSON.stringify(shared).includes('a68274ca'), 'no agent identifier survives the shared view');
  assert.equal(`${shared.scope.sessionId}`, 'not shown');
});

// The earlier page opened a wide table in a dialog. The report page's tables scroll sideways where they stand, with or
// without a script, and keep their columns (guidelines §4) - so there is no dialog, and nothing is only in a script.
test('a wide table scrolls where it stands, and is on the page without the script', () => {
  const model = session([], [], [read('a', 'main', 'succeeded', 1)]);

  const html = renderPage(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

  assert.match(html, /<div class="dt"[^>]* data-files-table><div class="dt-head" role="row" style="grid-template-columns:[^;]+;min-width:980px">/);
  assert.match(html, /\.dt\{[^}]*overflow-x:auto/, 'it scrolls sideways');
  assert.doesNotMatch(html, /<dialog id="table-modal"/);
});

const ROOT = { kind: 'known', path: '/Users/someone/Projects/app' } as const;
const SHARED = { share: true, projectRoot: ROOT } as const;

// Spec §11: the terminal has to tell two files apart as surely as the page does.
test('two files with the same name are two lines in the terminal, not one', () => {
  const model = session([], [], [
    read('a', 'main', 'succeeded', 1),
    { ...read('b', 'main', 'succeeded', 2), targets: ['packages/widget/.env'] },
  ]);

  const text = new TextReportRenderer(100).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

  assert.ok(text.includes('apps/web/.env'), 'the first file is named');
  assert.ok(text.includes('packages/widget/.env'), 'and so is the second, by the part that differs');
});

// The page's half of criterion 2. A chip shows a name and keeps the path for its title, which a reader sees only by
// hovering - so the title must be the path, and what the chip itself says must never name two files. Found failing
// 2026-09-27: the report page had named every chip by the file's name alone since it replaced the earlier page.
test('two files with the same name are two labels on the page, not one, in either view', () => {
  const files = ['apps/web/.env', 'packages/widget/.env'];
  const model = session([], [], files.map((path, at) => ({ ...read(`r${at}`, 'main', 'succeeded', at + 1), targets: [path] })));

  for (const [view, redactor, options] of [['full', new Redactor('test'), undefined], ['shared', new Redactor('test', ROOT, true), SHARED]] as const) {
    const html = renderPage(buildReport(model, DEFAULT_POLICY, redactor, options));
    const named = new Map<string, Set<string>>();
    for (const [, path = '', label = ''] of html.matchAll(/<(?:span|code) class="[^"]*chip[^"]*" title="([^"]*)">([^<]*)</g)) {
      assert.ok(files.includes(path), `${view}: a chip’s title is its file’s path, and "${path}" is none`);
      named.set(label, (named.get(label) ?? new Set()).add(path));
    }

    assert.ok(named.size > 0, `${view}: the page has chips to read`);
    for (const [label, paths] of named) assert.equal(paths.size, 1, `${view}: "${label}" names ${[...paths].join(' and ')}`);
  }
});

const renderSummary = (model: SessionModel, width = 100): string =>
  new TextReportRenderer(width).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

// findings-worth-reading R7, criterion 7: nothing is dropped from the summary without saying so.
test('a group longer than eight files says how many more, and how to see them', () => {
  const events = Array.from({ length: 10 }, (_, index) => ({
    ...read(`r${index}`, 'main', 'succeeded', index + 1),
    targets: [`apps/app-${index}/.env`],
  }));
  const model = session([], [], events);

  const text = renderSummary(model);
  const full = new TextReportRenderer(100, { full: true }).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

  assert.equal(text.split('\n').filter((line) => /^ {4}● apps\/app-\d\/\.env /.test(line)).length, 8);
  assert.match(text, /^ {4}… and 2 more — add --full to see them$/m);
  for (let index = 0; index < 10; index += 1) assert.ok(full.includes(`apps/app-${index}/.env`), `--full names file ${index}`);
});

// R11: the end of a path is what tells a reader which file it is, and two lines must never read alike.
test('a path too long for its line keeps its end, and is never cut to something another file shares', () => {
  const at = (targets: readonly string[], width: number): string =>
    renderSummary(
      session([], [], targets.map((target, index) => ({ ...read(`r${index}`, 'main', 'succeeded', index + 1), targets: [target] }))),
      width,
    );

  const medium = at(
    [
      'services/billing-and-invoicing-service-one/config/.env',
      'services/customer-notifications-service/config/.env',
      'services/customer-notifications/deploy/production.env',
    ],
    60,
  );
  for (const line of medium.split('\n')) assert.ok(line.length <= 60, `a line exceeded 60: ${line}`);
  assert.match(medium, /^ {4}● …\/deploy\/production\.env +named +reached$/m, 'a long path keeps its end');
  assert.ok(!medium.includes('…/config/.env'), 'two paths that would be cut to the same text are not cut');
  assert.ok(medium.includes('services/billing-and-invoicing-service-one/config/.env'), 'they are shown whole instead');
  assert.ok(medium.includes('services/customer-notifications-service/config/.env'));

  const narrow = at(['a-directory-name-that-is-long/.env', 'apps/.env'], 40);
  for (const line of narrow.split('\n')) assert.ok(line.length <= 40, `a line exceeded 40: ${line}`);
  assert.ok(!narrow.includes('…/.env'), 'a path is not cut to a name another file on the page shares');
  assert.ok(narrow.includes('a-directory-name-that-is-long/.env'));
});

// R12: one sentence under every node is a column of repetition; said once, it names who it is about.
test('more than one agent with no recorded delegation is said once in the summary, and per agent in --full', () => {
  const model = session([{ id: 'x1', type: 'Explore', depth: 1 }, { id: 'x2', type: 'Explore', depth: 1 }], [], [
    read('a', 'x1', 'succeeded', 1),
    read('b', 'x2', 'succeeded', 2),
  ]);

  const text = renderSummary(model);
  const full = new TextReportRenderer(100, { full: true }).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

  // Found on a real session, where the sentence explaining these agents ran past the width in --full.
  for (const line of `${text}\n${full}`.split('\n')) assert.ok(line.length <= 100, `a line exceeded 100: ${line.length}`);
  assert.match(text, /^ {2}nothing recorded what asked for Agents 1 and 2$/m);
  assert.doesNotMatch(text, /nothing recorded what asked for this agent/);
  assert.equal(full.split('nothing recorded what asked for this agent').length - 1, 2);
});

// R8: otherwise the absolute form leaves by moving out of a path field and into a sentence.
test('an absolute path written inside a task description is treated as a path', () => {
  const withTask = (description: string): SessionModel => {
    return session([{ id: 'child', type: 'Explore', depth: 1 }], [delegation('call', 'main', 'child', description)], []);
  };
  const describe = (view: typeof SHARED | undefined, text: string): string => {
    const redactor = new Redactor('test', ROOT, view?.share ?? false);
    return `${buildReport(withTask(text), DEFAULT_POLICY, redactor, view).delegations[0]?.description}`;
  };

  assert.equal(describe(undefined, `check ${ROOT.path}/apps/web/.env`), 'check apps/web/.env');
  assert.equal(describe(SHARED, 'check /Users/someone/elsewhere/.env'), 'check outside the project');
});

// R3: the location goes, the fact that the agent left the project does not.
test('a path above the project keeps its signal in the shared model and loses where it is', () => {
  const model = session([], [], [{ ...read('a', 'main', 'succeeded', 1), targets: ['/Users/someone/.ssh/id_rsa'] }]);

  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', ROOT, true), SHARED);

  assert.deepEqual(shared.stories.map((story) => `${story.path}`), ['outside the project']);
  assert.equal(shared.tally.filesReached, 1, 'it is still a file that was reached');
});

// §7.5 forbids hiding in the browser what the file still contains. Truncating a long label for layout is not
// that: nobody reads an ellipsis as protection. A blur is exactly that, and is what this guards against.
// Criterion 7 over the whole document - the style sheet, each element's own style and the script that could set one -
// in both views, since the shared one is the view that is sent on.
test('nothing in the page is obscured by a filter instead of being left out of it, in either view', () => {
  const model = session([], [], [read('a', 'main', 'succeeded', 1)]);

  for (const [redactor, options] of [[new Redactor('test'), undefined], [new Redactor('test', ROOT, true), SHARED]] as const) {
    const html = renderPage(buildReport(model, DEFAULT_POLICY, redactor, options));
    assert.match(html, /<style>/);
    // A window's backdrop blurs the page behind it; nothing on the page is blurred instead of being left out.
    assert.doesNotMatch(html.replace(/backdrop-filter:blur\(\d+px\)/g, ''), /blur\(/);
    assert.doesNotMatch(html, /text-security/);
  }
});

// Review finding: a policy file is a path on the same machine as every other path in the report.
test('the shared view hides the path of the policy file it names', () => {
  const policy = { ...DEFAULT_POLICY, origin: { kind: 'file', path: '/Users/someone/private/policy.json' } } as const;
  const model = session([], [], [read('a', 'main', 'succeeded', 1)]);

  const shared = buildReport(model, policy, new Redactor('test', ROOT, true), SHARED);

  assert.ok(!`${shared.scope.policy.origin}`.includes('/Users/'), 'no account name reaches the header');
  assert.ok(`${shared.scope.policy.origin}`.includes('outside the project'), 'and the reader is told there was one');
});

// Review finding: with no root the two views do opposite things, so one sentence cannot describe both.
test('with no root the header says what the view it belongs to actually did', () => {
  const model = session([], [], [read('a', 'main', 'succeeded', 1)]);
  const rootless = { share: true, projectRoot: { kind: 'absent' } } as const;

  const full = new TextReportRenderer(100).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));
  const shared = new TextReportRenderer(100).render(
    buildReport(model, DEFAULT_POLICY, new Redactor('test', { kind: 'absent' }, true), rootless),
  );

  assert.ok(full.includes('so paths are shown as written'), 'the full view shows them as written');
  assert.ok(!shared.includes('so paths are shown as written'), 'the shared view does not, and must not claim to');
  assert.ok(shared.includes('shown as a category'), 'it says what it did instead');
});

// The defect that made the shared view useless: a path from a shell command is relative, and relative is inside.
test('the shared view keeps a path recorded relative to the working directory', () => {
  const model = session([], [], [
    read('a', 'main', 'succeeded', 1),
    { ...read('b', 'main', 'succeeded', 2), targets: ['packages/widget/.env'] },
  ]);

  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', ROOT, true), SHARED);

  assert.deepEqual(shared.stories.map((story) => `${story.path}`).sort(), ['apps/web/.env', 'packages/widget/.env']);
});

// findings-worth-reading R14, criterion 11: colour repeats what is written, and moves nothing.
test('without its escapes a coloured report is the uncoloured one, in both views, and --ascii has none', () => {
  const model = session([{ id: 'child', type: 'Explore', depth: 1 }], [delegation('task', 'main', 'child')], [
    read('a', 'child', 'succeeded', 1),
    { ...read('b', 'child', 'blocked', 2), targets: ['apps/web/.env.local'] },
    { ...read('c', 'main', 'unknown', 3), targets: ['apps/web/.npmrc'] },
  ]);
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));

  for (const view of [{}, { full: true }]) {
    const plain = new TextReportRenderer(80, view).render(report);
    const coloured = new TextReportRenderer(80, { ...view, colour: true }).render(report);

    assert.notEqual(coloured, plain, 'colour was applied, so the comparison below means something');
    assert.equal(coloured.replace(ESCAPES, ''), plain);
    assert.equal(
      new TextReportRenderer(80, { ...view, colour: true, ascii: true }).render(report),
      new TextReportRenderer(80, { ...view, ascii: true }).render(report),
      '--ascii turns colour off',
    );
  }
});

// R6, after a report on a real session showed the same file twice under one agent: once named by the call, once
// seen again in what came back. Two stories, two routes, one file - and a list that read as a duplicate.
test('a file reached both ways is one line that says both, with the times added up', () => {
  const evidence = (sequence: number) => ({ source: { kind: 'agent' as const, agentId: 'main' }, record: sequence });
  const grep: ToolEvent = {
    id: 'g', agentId: 'main', sequence: 2, toolName: 'Bash', input: {}, targets: [],
    commands: ['grep -rn SECRET apps'], resultShape: 'listing', toolKnown: true, outcome: 'succeeded',
    evidence: evidence(2), completeness: 'complete',
    result: { stage: 'model', completeness: 'complete', content: 'apps/web/.env:12:SECRET=x', evidence: evidence(2) },
  };
  const model = session([], [], [read('r', 'main', 'succeeded', 1), grep]);

  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'));
  const text = new TextReportRenderer(100).render(report);
  const rows = text.split('\n').filter((line) => /^ {4}[●○?] apps\/web\/\.env /.test(line));

  assert.equal(report.stories.length, 2, 'the model keeps a story per route, for --full and the page');
  assert.deepEqual(rows.length, 1, 'the summary says it once');
  assert.match(rows[0] ?? '', /● apps\/web\/\.env +named and in a result · 1 line printed +reached +2×$/);
});

// The two facts a reader came for are not merged into one: the policy held once and did not hold once.
test('the same file reached and refused stays two lines', () => {
  const model = session([], [], [read('a', 'main', 'succeeded', 1), read('b', 'main', 'blocked', 2)]);

  const text = new TextReportRenderer(100).render(buildReport(model, DEFAULT_POLICY, new Redactor('test')));

  assert.match(text, /● apps\/web\/\.env +named +reached$/m);
  assert.match(text, /○ apps\/web\/\.env +named +refused$/m);
});

