import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import type { Agent } from '../../../../src/core/agent.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { ClaudeCodeSessionDiscovery } from '../../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { RETURN_SESSION_ID, returnSessionFiles } from '../../../helpers/return-session.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';

// The frame of the report page (the report page spec P1-P3, P43, P45, `a-way-back` R8-R10), and the facts the earlier
// page's agent summary said (`plain-report`), carried over when that page was removed (the plan's slice h).

const main: Agent = { id: 'main', type: 'main', depth: 0 };
const session = (events: ToolEvent[] = [], agents: Agent[] = [main]): SessionModel => ({
  provider: 'claude-code',
  turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  sessionId: 'sess-one', projectRoot: { kind: 'absent' }, agents, delegations: [], events, completeness: 'complete', messages: [], gaps: [],
});
const page = (withIndexLink: boolean, model: SessionModel = session()): string =>
  new ReportPageRenderer().render({ report: buildReport(model, DEFAULT_POLICY, new Redactor('test')), withIndexLink });
const navOf = (html: string): string => html.match(/<aside class="sb">[\s\S]*?<\/aside>/)?.[0] ?? '';
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// P2, `a-way-back` R8: the brand and the first item lead back to the index `start` wrote beside the report.
test('the way back leads to the index when the run wrote one beside the report, from the sidebar', () => {
  const nav = navOf(page(true));
  assert.match(nav, /<a class="sb-brand" href="index\.html"/);
  assert.match(nav, /<a class="sb-item" href="index\.html">[\s\S]*?← All conversations/);
  // An empty record is a gap (P60), and its screen ends in the same way back as a clean one (2026-09-25).
  assert.equal(page(true).match(/href="index\.html"/g)?.length, 3, 'the brand, the one item and Done, and nowhere else');
  assert.match(page(true), /<div class="rp-back"><a[^>]*href="index\.html"/);
});

// R8: a report written on its own lands in the temporary directory itself, where `index.html` may name a file nobody
// here wrote. So the name appears nowhere at all - not as a link, not as text.
test('a report written without an index beside it names index.html nowhere in the file', () => {
  assert.ok(!page(false).includes('index.html'));
});

// P2, P45: the sidebar lists the four views; with no script, every view is on the page and its link goes down to it.
test('the sidebar lists the four views, each a link to a section of the page', () => {
  const html = page(false);
  const nav = navOf(html);
  for (const view of ['todo', 'helpers', 'files', 'advanced']) {
    assert.match(nav, new RegExp('<a class="sb-item[^"]*" href="#' + view + '"'));
    assert.match(html, new RegExp('<section id="' + view + '" data-view>'));
  }
  assert.ok(!nav.includes('js-only">') || nav.indexOf('js-only') === nav.indexOf('sb-lang js-only'), 'only the language choice waits for a script');
});

// R4: every item carries its name as text in each language.
test('every item carries its name as text in each language', () => {
  const nav = navOf(page(true));
  for (const lang of ['en', 'pl', 'de']) assert.ok(nav.includes('<span class="i18n" lang="' + lang + '">'), lang);
  assert.match(nav, /lang="pl">Przebieg</);
  assert.match(nav, /lang="de">Ablauf</);
});

// P43: a page on its own reaches nowhere.
test('the page carries the security policy it always did', () => {
  assert.ok(page(true).includes("default-src 'none'"));
  assert.ok(page(true).includes("connect-src 'none'"));
});

// The tab's icon is the page's own bytes: a `data:` URI, so it needs no policy that lets the page reach anywhere.
test('the tab carries the mark, and the policy allows only data: images for it', () => {
  const html = page(true);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,/);
  assert.ok(html.includes('img-src data:;'));
  assert.ok(!/img-src[^;]*https?:/.test(html));
});

const files = new NodeFileSystem();
const sessions = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

// An agent that reached the same file twice - searched for the variable, then read the file it found it in - is one
// reader with two events: counted once as a reader, and never dropped as an event.
test('a file names each AI that read it once, however many times it did, and keeps every event', async (t) => {
  const root = await writeSession(t, returnSessionFiles({ carried: 'value', twice: true }));
  const report = buildReport(await sessions.read(join(root, `${RETURN_SESSION_ID}.jsonl`)), DEFAULT_POLICY, new Redactor('test'));
  const html = new ReportPageRenderer().render({ report, withIndexLink: false });
  const at = html.indexOf('<a class="adv-row adv-open" href="#story-0"');
  const row = html.slice(at, html.indexOf('</a>', at));
  assert.equal((row.match(/<span class="av /g) ?? []).length, 1, 'one reader for the one agent that read it');
  assert.match(english(html), /Times opened<\/div><div class="sx-value">2</, 'and both of its reads are in the file’s record');
});

// plain-report, carried from the earlier page's agent summary: a path in a listing is a name, not contents.
test('a path in a listing is said as a name, never as contents read', () => {
  const evidence = { source: { kind: 'main' as const }, record: 1 };
  const listing: ToolEvent = {
    id: 'call', agentId: 'main', sequence: 1, toolName: 'Bash', input: {}, targets: [], commands: ['find apps -name .env'],
    resultShape: 'listing', toolKnown: true, outcome: 'succeeded', completeness: 'complete', evidence, result: { stage: 'model', completeness: 'complete', content: 'apps/web/.env', evidence },
  };
  const html = english(page(false, session([listing])));
  assert.match(html, /Name only/);
  assert.match(html, /Your AI saw this file’s name, but nothing shows it read what’s inside\./);
  assert.doesNotMatch(html.slice(html.indexOf('<section id="todo"'), html.indexOf('<section id="files"')), /tc-title/, 'nothing to fix: its contents were not read');
});

// plain-report: an agent with no recorded action is not one that did nothing, and neither is folded as "nothing real".
test('no recorded actions is said apart from actions that touched nothing private', () => {
  const quiet = page(false, session([], [main, { id: 'helper', depth: 1 }]));
  const drawer = quiet.slice(quiet.indexOf('<dialog class="dr" id="helper-1"'), quiet.indexOf('</dialog>', quiet.indexOf('<dialog class="dr" id="helper-1"')));
  assert.match(english(drawer), /Its actions were not recorded, so this can’t say what it did\. That does not mean it did nothing\./);
  assert.doesNotMatch(quiet, /<details class="fold"><summary class="fold-line">/, 'it is not folded away with the helpers that saw nothing');
});

// Found at 390px: a drawer opened from Advanced lived inside Helpers, a view not shown, so it opened and was not seen.
// Every window sits outside the views, where whichever view opens it can show it.
test('no window is inside a view, so every view can open any of them', async (t) => {
  const root = await writeSession(t, returnSessionFiles({ carried: 'value' }));
  const report = buildReport(await sessions.read(join(root, `${RETURN_SESSION_ID}.jsonl`)), DEFAULT_POLICY, new Redactor('test'));
  const html = new ReportPageRenderer().render({ report, withIndexLink: false });
  const views = html.slice(html.indexOf('<section id="todo" data-view>'), html.indexOf('<dialog'));
  assert.ok(html.includes('<dialog class="dr" id="helper-1"'), 'the page has drawers');
  assert.ok(views.includes('<section id="advanced" data-view>'), 'and every view comes before the first window');
  assert.doesNotMatch(views, /<dialog/);
});
