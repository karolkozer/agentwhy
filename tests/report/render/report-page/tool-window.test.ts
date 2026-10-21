// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolDescription, ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { descriptionHtml } from '../../../../src/report/render/report-page/tool-window.ts';

// `2026-10-21-the-plan-and-the-recap.md` PN8, PND8: what a tool the adapter does not know is for, in its own description,
// in one window per tool, opened from each of its steps and each of its rows in Advanced. A key in a description is
// assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');

function session(): SessionModel {
  let record = 0;
  const call = (sequence: number, toolName: string, extra: Partial<ToolEvent> = {}): ToolEvent => {
    record += 1;
    const evidence = { source: { kind: 'main' as const }, record };
    return {
      id: 'call-' + sequence, agentId: 'main', sequence, toolName, input: {}, targets: [], commands: [], resultShape: 'none',
      toolKnown: false, outcome: 'succeeded', evidence, completeness: 'complete',
      result: { stage: 'model', completeness: 'complete', content: 'ok', evidence }, ...extra,
    };
  };
  const plan = (text: string): { mcp: { server: string; tool: string }; description: ToolDescription } =>
    ({ mcp: { server: 'ccd_turn', tool: 'update_plan' }, description: { text, as: 'recorded' } });
  return {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [],
    events: [
      call(1, 'mcp__ccd_turn__update_plan', plan('Keeps the checklist.')),
      call(2, 'mcp__ccd_turn__update_plan', plan(`Keeps the checklist the person sees.\nIt never opens a file. Example key: ${STRIPE}`)),
      call(3, 'McpToolCall', { mcp: { server: 'fictional_files', tool: 'read_file' }, description: { text: 'Returns the text of a file.', as: 'current' } }),
      // Codex names every MCP call `McpToolCall`: two tools of one name are two notes, by their server and tool.
      call(7, 'McpToolCall', { mcp: { server: 'fictional_files', tool: 'send_note' }, description: { text: 'Sends a note.', as: 'current' } }),
      call(4, 'TodoWrite'),
      call(5, 'Read', { toolKnown: true, targets: ['README.md'], resultShape: 'content', description: { text: 'Never shown.', as: 'recorded' } }),
      // A private file read, so Advanced draws this AI's run and its Every action it took.
      call(6, 'Read', { toolKnown: true, targets: ['.env'], resultShape: 'content', result: { stage: 'model', completeness: 'complete', content: 'DEBUG=true', evidence: { source: { kind: 'main' }, record: 6 } } }),
    ],
    completeness: 'complete', messages: [], gaps: [],
  };
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');
const built = (share = false) => buildReport(session(), DEFAULT_POLICY, new Redactor('test'), { share, projectRoot: { kind: 'absent' } });
const page = (share = false): string => english(new ReportPageRenderer().render({ report: built(share), withIndexLink: false }));

test('each tool the adapter does not know, with a description, is one note, its last call’s, redacted', () => {
  const tools = built().tools ?? [];
  assert.deepEqual(tools.map((note) => [String(note.tool), note.mcp === undefined ? undefined : String(note.mcp.tool), note.as, note.calls]), [
    ['McpToolCall', 'read_file', 'current', 1],
    ['McpToolCall', 'send_note', 'current', 1],
    ['mcp__ccd_turn__update_plan', 'update_plan', 'recorded', 2],
  ], 'one note per tool, by its server and tool - TodoWrite is described nowhere, and Read is a tool the adapter knows');
  const plan = String(tools[2]?.about);
  assert.match(plan, /^Keeps the checklist the person sees\.\nIt never opens a file\./, 'the last call’s description, its line breaks kept');
  assert.ok(!plan.includes(STRIPE), 'a key in a description never reaches the model');
});

// PN8 as the maintainer asked it to read: "ładnie i zrozumiale, żeby każdy rozumiał", then "jeszcze bardziej proste, zobacz
// guidelines" - the "What happened" window's shape (§4): the name in a chip, what it is for as the heading (§1.2), two
// numbers before any text (§9.3), the whole description laid out, a grey note left of Close.
test('a tool’s window says what it is for as its heading, two numbers, then the description written for the AI', () => {
  const html = page();
  const window = (id: string): string => html.slice(html.indexOf('<dialog class="pp pp-wide" id="' + id + '"'), html.indexOf('</dialog>', html.indexOf('id="' + id + '"')));
  const plan = window('tool-2');
  assert.match(plan, /<span class="tw-badge tw-badge-window"><svg class="tw-plug"[^>]*>[\s\S]*?<\/svg>MCP tool<\/span><span class="tw-chip">update_plan<\/span><span class="tw-from">from <b>ccd_turn<\/b>, an add-on connected to your AI app \(an MCP server\)<\/span>/);
  assert.match(plan, /<h2 class="tw-title" id="tool-2-title">Keeps the checklist the person sees\.<\/h2><p class="tw-said">In the words of whoever made the tool, as your AI was given them\.<\/p>/);
  assert.match(plan, /Times your AI used it here<\/div><div class="sx-value">2<\/div>[\s\S]*?Files it opened<\/div><div class="sx-value sx-amber">Not visible<\/div>/, 'amber: not known (guidelines §2)');
  assert.match(plan, /<p class="tw-why">The tool works inside its add-on, outside this conversation’s record, so the files it opened aren’t in it\.<\/p>/);
  assert.match(plan, /<h3 class="tw-h"><span class="tw-rule" aria-hidden="true"><\/span>The full description<\/h3><p class="tw-hint">Written for your AI, so where it says “you”, it means your AI\.<\/p><div class="tw-desc"><section class="tw-card"><p class="tw-card-text">Keeps the checklist the person sees\. It never opens a file\./, 'open, never folded');
  assert.match(plan, /<span class="pp-note">A description says what a tool is for, not what it did in this conversation\.<\/span>/, 'the grey note left of Close');
  assert.match(plan, /<dialog class="pp pp-wide"/, 'the "What happened" window\u2019s size and warmth: the description is its body (the maintainer: "większy, szerszy")');
  const files = window('tool-0');
  assert.match(files, /<h2 class="tw-title" id="tool-0-title">Returns the text of a file\.<\/h2><p class="tw-said">In the words of its add-on today\. It may have said otherwise during this conversation\.<\/p>/);
  assert.match(files, /<div class="sx-value">1<\/div>/);
  assert.doesNotMatch(files, /tw-desc/, 'a description of one sentence is said once');
  assert.match(window('tool-1'), /<span class="tw-chip">send_note<\/span>[\s\S]*?<h2 class="tw-title" id="tool-1-title">Sends a note\.<\/h2>/, 'each MCP tool its own window');
  assert.ok(!html.includes(STRIPE), 'a key in a description never reaches the page');
  assert.equal(html.match(/<dialog class="pp pp-wide" id="tool-\d+"/g)?.length, 3, 'one window per tool, however often it was called');

  const steps = html.slice(html.indexOf('<div class="stp" data-steps>'), html.indexOf('<div class="bf" data-folders>'));
  assert.equal(steps.match(/<p class="tw-step"><q>Keeps the checklist the person sees\.<\/q><\/p><div class="stp-act"><a class="tw-pill" href="#tool-2" data-popup-open="tool-2">/g)?.length, 2,
    'each step of the tool quotes what it is for, and opens its window');
  assert.match(steps, /Used <code>update_plan<\/code> from the MCP server <code>ccd_turn<\/code>\. Its server works outside the record, so we can’t see which files it opened\./);
  assert.match(steps, /Used <code>TodoWrite<\/code>\. The record doesn’t say what it does, so we can’t tell which files it opened\./);
  // "dodaj jakąś ikonę, że to MCP, żeby była widoczna", then "obok np. FIRST i mieć jakiś kolor": the plug in the step's
  // circle, and its badge beside First.
  assert.match(steps, /<span class="stp-ic stp-ic-grey" aria-hidden="true"><svg class="tw-plug"[\s\S]*?<div class="tw-when"><div class="stp-when">First<\/div><span class="tw-badge tw-badge-step"><svg class="tw-plug"[^>]*>[\s\S]*?<\/svg>MCP tool<\/span><\/div><div class="stp-did">Used <code>update_plan<\/code>/);
  assert.equal(steps.match(/tw-badge-step/g)?.length, 4, 'every MCP step, and no other: two of update_plan, read_file and send_note');
  assert.match(html, /mcp__ccd_turn__update_plan<a class="tw-i" href="#tool-2" data-popup-open="tool-2"[^>]*aria-label="What this tool does"/, 'and its row in Every action it took');
  assert.match(steps, /Used <code>send_note<\/code> from the MCP server <code>fictional_files<\/code>[\s\S]*?href="#tool-1"/, 'a step opens its own tool’s window, never another of the same name');
  assert.match(html, /McpToolCall<a class="tw-i" href="#tool-0"[\s\S]*?McpToolCall<a class="tw-i" href="#tool-1"/, 'and so does a row');
  assert.doesNotMatch(html, /Never shown\./, 'a tool the adapter knows says its own sentence');
});

test('under --share no description reaches the page, and a step still says what is not known', () => {
  const html = page(true);
  assert.equal(built(true).tools, undefined);
  assert.doesNotMatch(html, /href="#tool-|id="tool-|<a class="tw-|Keeps the checklist/);
  assert.match(html, /Used <code>update_plan<\/code> from the MCP server <code>ccd_turn<\/code>\. Its server works outside the record/);
});

// PN8: the description in parts, each its own card, as Step by step draws its stretches (the maintainer: "podzielić w
// oddzielne boxy"), its text escaped and only these tags added.
test('a description is cards - a paragraph, a paragraph with its list as rows - and no markup of its own', () => {
  const text = 'Keep the task list.\n\nNever spend a message on it alone:\n- First call: {"items": [...]}, the whole plan.\n  It may wrap.\n- Next: `advance`.\n- a plain item\n1. one\n2. two\n\n## Notes\n<script>x</script> & more';
  const card = (inner: string): string => '<section class="tw-card">' + inner + '</section>';
  const row = (mark: string, body: string, dot = true): string =>
    '<li class="tw-row"><span class="tw-mark' + (dot ? ' tw-mark-dot' : '') + '" aria-hidden="true">' + mark + '</span><div class="tw-row-body">' + body + '</div></li>';
  assert.equal(descriptionHtml(text),
    card('<p class="tw-card-text">Keep the task list.</p>') +
    card('<div class="tw-card-head">Never spend a message on it alone:</div><ol class="tw-rows">' +
      row('•', '<span class="tw-row-label">First call</span><span class="tw-row-text"><code>{&quot;items&quot;: [...]}</code>, the whole plan. It may wrap.</span>') +
      row('•', '<span class="tw-row-label">Next</span><span class="tw-row-text"><code>advance</code>.</span>') +
      row('•', '<span class="tw-row-text">a plain item</span>') + '</ol>') +
    card('<ol class="tw-rows">' + row('1', '<span class="tw-row-text">one</span>', false) + row('2', '<span class="tw-row-text">two</span>', false) + '</ol>') +
    '<h4 class="tw-part-h">Notes</h4>' +
    card('<p class="tw-card-text">&lt;script&gt;x&lt;/script&gt; &amp; more</p>'));
});
