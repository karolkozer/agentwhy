import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../../src/core/policy/policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { projectDenyRules } from '../../../../src/report/project-rules.ts';
import { FILES_SCRIPT, FILES_VIEW_STYLE } from '../../../../src/report/render/report-page/files-view.ts';
import { fileRows, kindOfName, listedFiles } from '../../../../src/report/render/report-page/files.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../../../src/report/render/report-page/to-do.ts';

// `specs/2026-09-23-the-report-page.md` P31-P37, M3: every file the AI reached, and whether a rule of the project
// protects it. Keys are assembled at run time, so no string here has the shape of a real one.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');
const WITH_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };

let sequence = 0;
function read(path: string, content: string, extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

function report(events: ToolEvent[], policy: Policy = DEFAULT_POLICY) {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events,
    completeness: 'complete', messages: [], gaps: [],
  };
  return buildReport(model, policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
}

const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

const EVENTS = () => [
  read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`),
  read('data/customers.csv', 'name,email\nAda,ada@example.test'),
  read('apps/api/.env', 'Permission denied', { outcome: 'blocked' }),
  read('README.md', '# app'),
  read('src/app.ts', 'export {};'),
];

// P32, P36: private files first, then everyday ones; protected only where a rule of the project matches.
test('every file is a row once, private first, protected only by a rule of the project', () => {
  const built = report(EVENTS(), WITH_CSV);
  const items = toDoItems(built);
  const rows = fileRows(built, items, new Set(['data/customers.csv']), ['**/.env*']);
  assert.deepEqual(rows.map((row) => [row.path, row.private, row.access, row.protection, row.group]), [
    ['apps/web/.env', true, 'read', 'yes', 'fix'],
    ['data/customers.csv', true, 'read', 'no', 'fixed'],
    ['apps/api/.env', true, 'stopped', 'yes', 'none'],
    ['README.md', false, 'read', 'na', 'none'],
    ['src/app.ts', false, 'read', 'na', 'none'],
  ]);
  assert.ok(fileRows(built, items, new Set(), undefined).filter((row) => row.private).every((row) => row.protection === 'unknown'), 'unread settings are not a no');
});

// P33: an everyday file is named from one fixed table, never from its contents.
test('an everyday file is named by its name alone', () => {
  assert.deepEqual(['AGENTS.md', 'notes.txt', 'package.json', '.gitignore', 'app.ts', 'logo.png'].map(kindOfName),
    ['fl.kind.aiNotes', 'fl.kind.notes', 'fl.kind.settings', 'fl.kind.settings', 'fl.kind.code', 'fl.kind.file']);
});

test('the view counts the files, offers Protect it where nothing protects a file, and draws the bar where a rule came late', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/apps/web/.env'] });
  const page = english(html);
  assert.match(page, /Your AI opened 5 files\./);
  assert.match(page, /Only 3 were private\./);
  // .env is protected now and was read: the one row with the bar, and no Protect it on it.
  assert.match(html, /<div class="dt-row dt-linked" role="row"[^>]*data-file-key="0"[^>]*><span class="dt-bar"/);
  assert.doesNotMatch(html, /data-protect-open="0"/);
  // customers.csv is not protected: its row offers the rule, and its wizard opens the same window.
  assert.match(html, /<dialog class="pp pp-confirm" id="protect-1"/);
  assert.match(html, /id="fix-1"[\s\S]*?data-protect-open="1"/);
  assert.match(page, /Not private/);
  assert.match(html, /<span data-files-shown>5<\/span> of 5 files shown\./);
});

// P35: the table in its parts - what the AI read, what it only saw the name of, the rest - each under its heading.
test('the table heads each part it has, and only those', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const page = english(html);
  assert.match(page, /<div class="dt-group" role="row"[^>]* data-files-tier="0"><span class="dt-group-cell" role="cell"><span class="dt-group-dot dt-group-coral" aria-hidden="true"><\/span>Private files your AI read<span class="dt-group-count">2<\/span><\/span><\/div><div class="dt-row[^"]*" role="row"[^>]*data-file-key="0"/);
  assert.match(page, /data-files-tier="2">[\s\S]*?Everything else<span class="dt-group-count">3<\/span><\/span><\/div><div class="dt-row[^"]*" role="row"[^>]*data-file-key="2"/);
  assert.doesNotMatch(page, /data-files-tier="1"/, 'no heading over a part with no rows');
  assert.equal(page.match(/class="dt-group"/g)?.length, 2);

  const alone = new ReportPageRenderer().render({ report: report([read('README.md', '# app'), read('src/app.ts', 'export {};')]), withIndexLink: false, denied: [] });
  assert.doesNotMatch(alone, /class="dt-group"/, 'one part needs no heading');
});

// P35: an everyday file can be made private from its row - the rule Settings writes when a file is added there.
test('a file that is not private offers Make it private, which writes the same rule as Protect it', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const page = english(html);
  assert.match(page, /data-file-key="3"[\s\S]*?<span data-protect-open="3"><span class="tag tag-grey tag-sm">[\s\S]*?Not private<[\s\S]*?<span data-protected="3" hidden><span class="tag tag-mint tag-sm">[\s\S]*?Private<[\s\S]*?<span class="fl-prot" data-protect-open="3">[\s\S]*?Make it private →[\s\S]*?<span data-protected="3" hidden><span class="look look-mint">[\s\S]*?Blocked</, 'made private, both columns say so');
  assert.match(page, /<dialog class="pp pp-confirm" id="protect-3"[\s\S]*?Make this file private\?[\s\S]*?This adds <code>README\.md<\/code> to your private files, in your settings\.[\s\S]*?data-protect="3" data-pattern="\.\/README\.md" data-pattern-every="\*\*\/README\.md"[\s\S]*?Yes, make it private/);
  assert.match(page, /id="file-3"[\s\S]*?Make it private →/, 'its simple window offers it too');
});

test('a file a rule already protects says so in its wizard instead of offering the rule again', () => {
  const html = english(new ReportPageRenderer().render({ report: report([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV), withIndexLink: false, denied: ['**/customers.csv'] }));
  assert.doesNotMatch(html, /id="protect-0"/);
  assert.match(html, /<span class="wz-protected">Protected ✓<\/span>/);
});

// P37: a row opens a window: the story of a file on the list, the simple window of any other.
test('a row opens the story of a listed file, and the simple window of any other', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  // The row's link sits in its first cell, since a table row holds cells and nothing else (data-table.ts).
  assert.match(html, /data-file-key="0"[^>]*>(?:<span class="dt-bar"[^>]*><\/span>)?<span class="dt-cell" role="cell"><a class="dt-link" href="#story-0"[^>]* data-popup-open="story-0"/);
  assert.match(html, /<dialog class="pp pp-small" id="file-3"/);
  assert.match(english(html), /An everyday work file\. No rule marks it private, so it doesn’t need protection\./);
});

test('the filters are laid out as a column only once a script runs, so the gap between their rows holds', () => {
  // `.js .js-only{display:revert}` (tokens.ts) outranks a one-class rule and turned the column into a block, whose
  // `gap` is nothing; a `display` on `.fl-filters` alone would also outrank `.js-only{display:none}` without a script.
  assert.match(FILES_VIEW_STYLE, /\.fl-filters\{(?![^}]*display)[^}]*gap:12px/);
  assert.match(FILES_VIEW_STYLE, /\.js \.fl-filters\.js-only\{display:flex\}/);
});

test('when the settings could not be read, nothing is called unprotected', () => {
  const page = english(new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false }));
  assert.match(page, /<span class="look look-grey"><span class="look-glyph" aria-hidden="true">\?<\/span><span class="look-label">Can’t tell</);
  assert.doesNotMatch(page, /look-label">Not blocked</);
  assert.doesNotMatch(page, /<span class="tag tag-coral tag-sm">/, 'no private file is drawn as one nothing protects');
});

// M3: the two settings files of the project, read through the port; a file that does not parse is not "no rules".
test('the project’s deny rules are read from both settings files, and an unreadable one is not guessed past', async () => {
  const reader = (files: Record<string, string>): FileReader => ({
    readText: async (path) => {
      const text = files[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => { throw new Error('not used'); },
  });
  assert.deepEqual(await projectDenyRules(reader({}), '/Users/someone/app'), []);
  assert.deepEqual(await projectDenyRules(reader({
    '/Users/someone/app/.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(./data/customers.csv)', 'Edit(./data/customers.csv)', 'Bash(rm:*)'] } }),
    '/Users/someone/app/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
  }), '/Users/someone/app'), ['**/data/customers.csv', '**/.env*']);
  assert.equal(await projectDenyRules(reader({ '/Users/someone/app/.claude/settings.json': '{ not json' }), '/Users/someone/app'), undefined);
});

// Found on a new project, 2026-09-24: files that were never in it were listed as files the AI opened. A name seen only in
// what a command printed, or in a command's text, is never counted as opened (P32, P49) - and, the maintainer decided the
// same day, it is not folded away either: it is in the one list, after what was read and before everything else. A name
// in the input of a tool the adapter does not know is a mention, and is not a row at all (R12b).
test('a name the AI only saw is in the list after what was read, never counted as opened, and a mention is not a file', () => {
  const printed = read('apps/web/.env.local', 'apps/web/.env.local', { toolName: 'Bash', targets: [], commands: ['python3 list.py'], resultShape: 'listing' });
  const asked = read('.env', 'Which .env should I use?', { toolName: 'AskUserQuestion', toolKnown: false, resultShape: 'none' });
  const html = new ReportPageRenderer().render({ report: report([printed, asked, read('README.md', '# app')]), withIndexLink: false, denied: [] });
  const page = english(html);

  assert.match(page, /Your AI opened 1 file\./, 'only the file it worked on is counted');
  assert.match(html, /<a class="sb-item" href="#files">[\s\S]*?<span class="sb-count">1<\/span>/, 'in the sidebar too');
  assert.doesNotMatch(html, /<div class="fl-names">/, 'no fold');
  const table = html.slice(html.indexOf('data-files-table'));
  assert.ok(table.indexOf('.env.local') > 0 && table.indexOf('.env.local') < table.indexOf('README.md'), 'the name only seen comes before the everyday file');
  assert.doesNotMatch(page.replace(/Which \.env should I use\?/g, ''), /<span class="fl-chip" title="\.env">/, 'the mention is no row');
});

// F57, 2026-09-24: a file the person chose only to be told about is their choice, not a file left unprotected. It is
// mint (2026-09-25: grey read as unknown), it is filtered by its own answer, and nothing on the page offers to protect it.
test('a told file is the person’s choice: mint, filtered on its own, and never offered protection', () => {
  const told: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };
  const built = report(EVENTS(), told);
  const rows = fileRows(built, toDoItems(built), new Set(), ['**/.env*']);
  assert.equal(rows.find((row) => row.path === 'data/customers.csv')?.protection, 'told');
  assert.equal(rows.find((row) => row.path === 'apps/web/.env')?.protection, 'yes');

  const html = new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: ['**/.env*'] });
  const row = /<div class="dt-row[^"]*"[^>]*data-prot="told"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
  assert.match(english(row), /<span class="tag tag-mint tag-sm">[\s\S]*?Private<[\s\S]*?<span class="look look-sand"><span class="look-glyph" aria-hidden="true"><svg[^>]*><path d="M2 12s3\.5-7[\s\S]*?look-label">Track</, 'its own column, with the eye Settings draws for Track');
  const blocked = /<div class="dt-row[^"]*"[^>]*data-prot="yes"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
  assert.match(english(blocked), /<span class="tag tag-mint tag-sm">[\s\S]*?Private<[\s\S]*?<span class="look look-mint"><span class="look-glyph" aria-hidden="true"><svg[^>]*><rect[\s\S]*?look-label">Blocked</, 'the padlock Settings draws for Block');
  assert.doesNotMatch(row, /data-protect-open|pill-light/, 'no Protect it for a file the person let through');
  assert.match(english(html), /<option value="told">Track \(1\)<\/option>/);
  // Customer data the person let the AI read is nothing to fix; keys in a told file would be.
  assert.doesNotMatch(row, /data-files-fix/, 'a told data file is not on the to-do list');
  assert.ok(!toDoItems(built).some((item) => item.path === 'data/customers.csv'));
});

// Conversations F14: "14 files" in a row counts what the report's Files tab lists, as its sidebar counts them.
test('the count a conversation row shows is the count of the report\u2019s Files tab', () => {
  const built = report(EVENTS(), WITH_CSV);
  const html = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  const sidebar = /<a class="sb-item" href="#files">[\s\S]*?<span class="sb-count">(\d+)<\/span>/.exec(html);
  assert.ok(sidebar, 'the report counts its files in the sidebar');
  assert.equal(listedFiles(built), Number(sidebar[1]));
});

// F58: the Conversations page shows a report's Files view in a window, so the script works per view and can be run again.
test('the Files script starts each view on the page by itself, and can start one put in later', () => {
  assert.doesNotThrow(() => new Function(FILES_SCRIPT));
  assert.match(FILES_SCRIPT, /window\.agentwhyFiles = \(scope\) => scope\.querySelectorAll\('\[data-files-table\]'\)\.forEach\(start\)/);
  assert.match(FILES_SCRIPT, /const box = table\.closest\('\.fl'\) \|\| document;/);
  assert.doesNotMatch(FILES_SCRIPT, /document\.querySelector\('\[data-files-(table|search)\]'\)/, 'nothing reaches past its own view');
});

// The maintainer, 2026-09-25: a mode inside the private tag went unseen, so what happens when the AI reaches a file is a
// column of its own, and Protect it stands beside the coral "Not blocked" it changes.
test('what stops the AI is a column of its own, and a private file nothing stops says so in coral beside Protect it', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const head = /<div class="dt-head"[^>]*>[\s\S]*?<\/div>/.exec(html.slice(html.indexOf('data-files-table')))?.[0] ?? '';
  assert.deepEqual([...english(head).matchAll(/role="columnheader">([^<]+)</g)].map((match) => match[1]), ['File', 'AI', 'Private file', 'When your AI reaches it', 'Action']);
  const row = /<div class="dt-row[^"]*"[^>]*data-prot="no"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? '';
  assert.match(english(row), /<span class="tag tag-coral tag-sm">[\s\S]*?Private<[\s\S]*?<span class="fl-prot" data-protect-open="\d+"><span class="look look-coral"><span class="look-glyph" aria-hidden="true">!<\/span><span class="look-label">Not blocked<[\s\S]*?Protect it →/);
});

// The maintainer, 2026-09-25: every file of the table opens the same window a file on the to-do list does - its story,
// the diagram and the record - not only those to fix. What was done is said first and what to do under it, with no Fix
// it; the company closes the story only where the contents were read. An everyday file, of which the model holds no
// steps, keeps its simple window (P37).
test('every private file opens its "What happened" window; the company is in it only where the file was read', () => {
  const told: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };
  const listing = { stage: 'model' as const, completeness: 'complete' as const, content: 'apps/api/.env.local\nREADME.md', evidence: { source: { kind: 'main' as const }, record: 900 } };
  const listed = read('apps/api', '', { toolName: 'Bash', targets: [], commands: ['ls -a apps/api'], resultShape: 'listing', result: listing });
  const built = report([read('data/customers.csv', 'name,email\nAda,ada@example.test'), listed, read('README.md', '# app')], told);
  const rows = fileRows(built, toDoItems(built), new Set(), undefined);
  const keyOf = (path: string): number => rows.findIndex((row) => row.path === path);
  const html = english(new ReportPageRenderer().render({ report: built, withIndexLink: false }));
  const window = (key: number): string => {
    const at = html.indexOf('<dialog class="pp pp-');
    const start = html.indexOf('id="file-' + key + '"', at);
    assert.ok(start > 0, 'file-' + key + ' has a window');
    return html.slice(html.lastIndexOf('<dialog', start), html.indexOf('</dialog>', start));
  };

  const csv = window(keyOf('data/customers.csv'));
  assert.match(csv, /^<dialog class="pp pp-wide" id="file-\d+" aria-labelledby="file-\d+-title">/, 'the wide window a file on the list opens');
  assert.match(csv, /<p class="sw-summary">Your AI opened this file and read what’s inside\.<\/p><p class="sw-context">Nothing to do\. If you’d rather Claude Code never opens it, set it to Block in Settings\.<\/p>/);
  assert.match(csv, /data-tab="0"[^>]*>The story<[\s\S]*?data-tab="1"[^>]*>Diagram<[\s\S]*?data-tab="2"[^>]*>Full record</);
  assert.match(csv, /The AI now has this information/, 'it was read, so the story ends with the company');
  assert.match(csv, /data-node="company"/);
  assert.doesNotMatch(csv, /Fix it|data-story-fix/, 'nothing to fix');

  const named = window(keyOf('apps/api/.env.local'));
  assert.match(named, /<dialog class="pp pp-wide"/);
  assert.match(named, /<p class="sw-summary">Your AI saw this file’s name, but nothing shows it read what’s inside\.<\/p>/);
  assert.doesNotMatch(named, /The AI now has this information|data-node="company"|hd-risk/, 'only its name was seen: nothing went on');
  assert.match(named, /data-node="file"[^>]*>[\s\S]*?<span class="hd-icon hd-icon-blue"><svg[^>]*>[\s\S]*?<\/svg><\/span>/, 'the file box in the row’s blue');

  assert.match(window(keyOf('README.md')), /^<dialog class="pp pp-small"/, 'an everyday file keeps its simple window');
});
