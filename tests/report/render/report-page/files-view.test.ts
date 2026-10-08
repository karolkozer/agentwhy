// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
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
import { computerRules, projectDenyRules } from '../../../../src/report/project-rules.ts';
import { FIX_WIZARD_SCRIPT } from '../../../../src/report/render/report-page/fix-wizard-script.ts';
import { DATA_TABLE_STYLE } from '../../../../src/report/render/ui/data-table.ts';
import { LOOKS } from '../../../../src/report/render/ui/status-look.ts';
import { APP_WORDS } from '../../../../src/report/render/ui/words/app-words.ts';
import { REPORT_WORDS } from '../../../../src/report/render/ui/words/report-words.ts';
import { FILES_SCRIPT, FILES_VIEW_STYLE } from '../../../../src/report/render/report-page/files-view.ts';
import { EVERYDAY_CALLS_KEPT } from '../../../../src/report/build-report.ts';
import { fileStory } from '../../../../src/report/render/report-page/file-story.ts';
import { fileRows, kindOfName, listedFiles, type FileAccess } from '../../../../src/report/render/report-page/files.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { REPORT_VIEWS_SCRIPT } from '../../../../src/report/render/report-page/report-views.ts';
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

/** One window of the page, from its id to the end of its dialog. */
const windowOf = (html: string, id: string): string => {
  const at = html.indexOf('id="' + id + '"');
  assert.notEqual(at, -1, id);
  return html.slice(html.lastIndexOf('<dialog', at), html.indexOf('</dialog>', at));
};

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
  // 2026-10-07: what the AI opened is what it read, changed, or opened without reading. The fifth file of this session
  // is the one it was stopped from, which it never opened - counted, the heading said "opened 5 files" over a stop.
  assert.match(page, /Your AI opened 4 files\./);
  assert.match(page, /Only 2 were private\./);
  // .env is protected now and was read: the one row with the bar, and its mode is the row's own control (QE1).
  assert.match(html, /<div class="dt-row dt-linked" role="row"[^>]*data-file-key="0"[^>]*><span class="dt-bar"/);
  assert.match(html, /data-mode-cell="0"[\s\S]*?class="fl-pencil"/);
  // QE8: Protect it is drawn on it hidden, the state the row falls back to where protection is taken away.
  assert.match(html, /<span class="fl-prot" data-protect-open="0" hidden>/);
  // customers.csv is not protected: its row offers the rule, and its wizard opens the same window.
  assert.match(html, /<dialog class="pp pp-confirm" id="protect-1"/);
  assert.match(html, /id="fix-1"[\s\S]*?data-protect-open="1"/);
  assert.match(page, /Not private/);
  assert.match(html, /<span data-files-shown>5<\/span> of 5 files shown\./);
});

// P35: the table in its parts - what the AI read, what is not known, what it was stopped from, what it only saw the
// name of, the rest - each under its heading. Changed 2026-10-05: a private file stopped was listed with the rest, so a
// conversation the AI was stopped in drew one part and no heading at all (the maintainer: "why no sections here?").
test('the table heads each part it has, and only those', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const page = english(html);
  assert.match(page, /<div class="dt-group" role="row"[^>]* data-files-tier="0"><span class="dt-group-cell" role="cell"><span class="dt-group-dot dt-group-coral" aria-hidden="true"><\/span>Private files your AI read<span class="dt-group-count">2<\/span><\/span><\/div><div class="dt-row[^"]*" role="row"[^>]*data-file-key="0"/);
  assert.match(page, /data-files-tier="3"><span class="dt-group-cell" role="cell"><span class="dt-group-dot dt-group-mint" aria-hidden="true"><\/span>Private files it was stopped from opening<span class="dt-group-count">1<\/span><\/span><\/div><div class="dt-row[^"]*" role="row"[^>]*data-file-key="2"/);
  assert.match(page, /data-files-tier="5">[\s\S]*?Everything else<span class="dt-group-count">2<\/span><\/span><\/div><div class="dt-row[^"]*" role="row"[^>]*data-file-key="3"/);
  assert.doesNotMatch(page, /data-files-tier="[124]"/, 'no heading over a part with no rows');
  assert.equal(page.match(/class="dt-group" role="row"[^>]* data-files-tier=/g)?.length, 3);

  // Only a stop and everyday files: two parts, so both are headed.
  const stoppedOnly = english(new ReportPageRenderer().render({ report: report(EVENTS().filter((event) => event.outcome === 'blocked' || !/\.env|customers/.test(event.targets[0] ?? '')), WITH_CSV), withIndexLink: false, denied: [] }));
  assert.match(stoppedOnly, /data-files-tier="3">[\s\S]*?Private files it was stopped from opening[\s\S]*?data-files-tier="5">[\s\S]*?Everything else/);

  const alone = new ReportPageRenderer().render({ report: report([read('README.md', '# app'), read('src/app.ts', 'export {};')]), withIndexLink: false, denied: [] });
  assert.doesNotMatch(alone, /class="dt-group"[^>]*data-files-tier/, 'one part needs no heading');
});

// P35: an everyday file can be made private from its row - the rule Settings writes when a file is added there.
test('a file that is not private offers Make it private, which writes the same rule as Protect it', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const page = english(html);
  assert.match(page, /data-file-key="3"[\s\S]*?<span data-protect-open="3"><span class="tag tag-grey tag-sm">[\s\S]*?Not private<[\s\S]*?<span data-protected="3" hidden><span class="tag tag-mint tag-sm">[\s\S]*?Private<[\s\S]*?<span class="fl-prot" data-protect-open="3">[\s\S]*?Make it private →[\s\S]*?<span data-made="block" data-made-key="3" hidden><span class="look look-mint">[\s\S]*?Blocked<[\s\S]*?<span data-made="tell" data-made-key="3" hidden><span class="look look-sand">[\s\S]*?Track</, 'BT7: made private, both answers drawn and both columns say so');
  assert.match(page, /<dialog class="pp pp-confirm" id="protect-3"[\s\S]*?Make this file private\?[\s\S]*?This applies to <code>README\.md<\/code>\. You can undo it anytime in Settings\.[\s\S]*?data-protect="3" data-protect-mode="block" data-pattern="\.\/README\.md" data-pattern-every="\*\*\/README\.md"[\s\S]*?Yes, block it/);
  assert.match(page, /id="file-3"[\s\S]*?Make it private →/, 'its simple window offers it too');
});

// `block-or-track-from-the-report` BT1-BT4, BT8: where the page can say exactly what holds a file, its window asks
// which mode it gets. Both answers are written and one is shown, so the window needs no script to swap them.
test('the window asks Block or Track, with Block chosen, and each answer carries its own sentence, tick and command', () => {
  const page = english(new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] }));
  const everyday = windowOf(page, 'protect-3');
  assert.match(everyday, /What should happen when your AI reaches it\?/);
  assert.match(everyday, /class="cf-radio cf-radio-1" type="radio" name="protect-3-case" value="1" checked/, 'BT1: Block when it opens');
  assert.match(everyday, /class="cf-radio cf-radio-2" type="radio" name="protect-3-case" value="2">/);
  assert.match(everyday, /Block it<\/span><span class="cf-opt-why">Your AI can’t open it or search through it\./);
  assert.match(everyday, /Track it<\/span><span class="cf-opt-why">Your AI can still read it[\s\S]*?you can’t take that back\./);
  // BT3, as amended 2026-10-06: one sentence for both answers - what the options share - because each option already
  // says what it does, and the window said it twice.
  assert.match(everyday, /<p class="cf-sentence">This applies to <code>README\.md<\/code>\. You can undo it anytime in Settings\.<\/p>/);
  assert.doesNotMatch(everyday, /cf-case-\d">This /, 'the sentence is not written per answer');
  assert.match(everyday, /data-protect-every="block"> Also make every file called <code>README\.md<\/code> private/);
  assert.match(everyday, /data-protect-every="tell"> Also track every file called <code>README\.md<\/code>/);
  // BT8: no flag writes a told list, so Track hands over the command that opens the page where it can be written.
  assert.match(everyday, /data-note-command="block"[\s\S]*?can’t change your settings itself/);
  assert.match(everyday, /data-note-command="tell"[\s\S]*?can’t track a file\. Run this in your project/);
});

// BT4 as reversed 2026-10-06 by the maintainer: both answers confirm in mint, on an everyday file and on a private one
// alike. Either is a mode chosen on purpose, and coral is kept for a change that leaves a file with nothing holding it.
test('both answers confirm in mint, on an everyday file and on a private one', () => {
  const page = english(new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] }));
  const everyday = windowOf(page, 'protect-3');
  assert.match(everyday, /class="pill pill-mint pill-lg" data-protect="3" data-protect-mode="block"[^>]*>Yes, block it</);
  assert.match(everyday, /class="pill pill-mint pill-lg" data-protect="3" data-protect-mode="tell"[^>]*>Yes, just track it</);
  const private_ = windowOf(page, 'protect-0');
  assert.match(private_, /Protect this file\?/);
  assert.match(private_, /class="pill pill-mint pill-lg" data-protect="0" data-protect-mode="block"[^>]*>Yes, block it</);
  assert.match(private_, /class="pill pill-mint pill-lg" data-protect="0" data-protect-mode="tell"[^>]*>Yes, just track it</);
  assert.doesNotMatch(private_, /pill-primary/, 'nothing in this window takes protection away');
});

// BT7: the Fix it wizard opens the same window, so the step that offered the rule holds both answers - and a file the
// person chose to track is not drawn as one that was protected.
test('the wizard says Protected or Tracked, by the answer chosen in the window', () => {
  const page = english(new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] }));
  assert.match(page, /<span class="wz-protected" data-made="block" data-made-key="1" hidden>Protected ✓<\/span><span class="wz-protected wz-tracked" data-made="tell" data-made-key="1" hidden>Tracked ✓<\/span>/);
});

// BT5, BTD3: a told entry written under a deny rule nobody can see changes nothing while reading as a change.
test('a file whose settings could not be read is offered no choice, and the window is the one it has always been', () => {
  const page = english(new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false }));
  const unknown = windowOf(page, 'protect-0');
  assert.doesNotMatch(unknown, /cf-choice|cf-radio|cf-case/, 'nothing to choose');
  assert.match(unknown, /class="pill pill-mint pill-lg" data-protect="0" data-protect-mode="block"[^>]*>Yes, protect it</);
  assert.match(unknown, /data-protect-every="block">/, 'and its one tick is still read by the script');
});

// BT9: the question and both answers in every language the page ships with.
test('the choice is written in en, pl and de', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const window_ = windowOf(html, 'protect-3');
  for (const words of ['What should happen when your AI reaches it?', 'Co ma się stać, gdy twoje AI po niego sięgnie?', 'Was soll passieren, wenn deine KI danach greift?']) {
    assert.ok(window_.includes(words), words);
  }
  for (const words of ['Yes, just track it', 'Tak, tylko obserwuj', 'Ja, nur beobachten']) {
    assert.ok(window_.includes(words), words);
  }
  for (const words of ['You can undo it anytime in Settings.', 'Możesz to w każdej chwili cofnąć w Ustawieniach.',
    'Du kannst es jederzeit in den Einstellungen rückgängig machen.']) {
    assert.ok(window_.includes(words), words);
  }
});

// BT6: a block is the deny rule it has always been; Track is the told list alone, with no rule to take out.
test('the script sends a rule for Block and a told list for Track', () => {
  assert.match(FIX_WIZARD_SCRIPT, /change: 'mode', to: 'tell', patterns: \[pattern\], rules: \[\], where: 'local'/);
  assert.match(FIX_WIZARD_SCRIPT, /change: 'protect', pattern/);
  assert.doesNotThrow(() => new Function(FIX_WIZARD_SCRIPT));
});

test('a file a rule already protects says so in its wizard instead of offering the rule again', () => {
  const html = english(new ReportPageRenderer().render({ report: report([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV), withIndexLink: false, denied: ['**/customers.csv'] }));
  assert.doesNotMatch(windowOf(html, 'fix-0'), /href="#protect-0"/, 'the wizard does not offer the rule again');
  assert.match(html, /<span class="wz-protected">Protected ✓<\/span>/);
  // QE8: the window is drawn all the same, for the state the row falls back to once protection is taken away.
  assert.match(html, /id="protect-0"/);
});

// P37: a row opens a window: the story of a file on the list, the simple window of any other.
test('a row opens the story of a listed file, and of an everyday file the AI read', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  // The row's link sits in its first cell, since a table row holds cells and nothing else (data-table.ts).
  assert.match(html, /data-file-key="0"[^>]*>(?:<span class="dt-bar"[^>]*><\/span>)?<span class="dt-cell" role="cell"><a class="dt-link" href="#story-0"[^>]* data-popup-open="story-0"/);
  // `the-same-window-for-every-file` EF1: README.md is nobody's private file and the AI read it, so it opens the window
  // a private file opens. Until 2026-10-05 it opened three answers that said neither when nor how.
  assert.match(html, /<dialog class="pp pp-wide" id="file-3"/);
});

// `the-same-window-for-every-file` EFD1, EF6: a name a listing printed has a story one line long, so it keeps the simple
// window - and that window says the moment the file came up at, which the model held and no window showed.
test('a name only seen keeps the simple window, which says the moment it came up at', () => {
  const listing = { stage: 'model' as const, completeness: 'complete' as const, content: 'docs/guide.md\nREADME.md', evidence: { source: { kind: 'main' as const }, record: 900 } };
  const listed = read('docs', '', { toolName: 'Bash', targets: [], commands: ['ls docs'], resultShape: 'listing', result: listing });
  const built = report([listed, read('src/app.ts', 'export {};')]);
  const rows = fileRows(built, toDoItems(built), new Set(), []);
  const guide = rows.findIndex((row) => row.path === 'docs/guide.md');
  assert.notEqual(guide, -1, 'the name a listing printed is a row');
  assert.equal(built.everydayFiles.find((file) => String(file.path) === 'docs/guide.md')?.reaches, undefined, 'EFD1: no calls kept');
  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  const window_ = windowOf(page, 'file-' + guide);
  assert.match(window_, /<dialog class="pp pp-small"/);
  assert.match(window_, /<div class="fw-q">When it came up<\/div><div class="fw-a">First<\/div>/);
  assert.match(window_, /An everyday work file\. No rule marks it private, so it doesn’t need protection\./);
});

// EF1, EF2: the calls a window is told from - the AI, the tool, the outcome and the record - kept for a file no flow
// names, and no kind that only a traced value could make.
test('an everyday file the AI read is told from its own calls, in the words a private file’s story uses', () => {
  const built = report([read('README.md', '# app')]);
  const file = built.everydayFiles.find((one) => String(one.path) === 'README.md');
  assert.deepEqual(file?.reaches?.map((call) => [call.agentIndex, String(call.did), call.outcome, call.how]), [[0, 'Read', 'succeeded', 'read']]);
  const story = fileStory(built, 'README.md');
  assert.equal(story.traced, false, 'EF4: nothing was followed out of it');
  assert.deepEqual(story.entries.map((entry) => entry.kind), ['read']);
  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  const rows = fileRows(built, toDoItems(built), new Set(), []);
  const window_ = windowOf(page, 'file-' + rows.findIndex((row) => row.path === 'README.md'));
  assert.match(window_, /<dialog class="pp pp-wide"/);
  assert.match(window_, /data-tab="0"[^>]*>The story<[\s\S]*?data-tab="1"[^>]*>Diagram<[\s\S]*?data-tab="2"[^>]*>Full record</);
  assert.match(window_, /Opened the file and read it[\s\S]*?<code>Read<\/code>/, 'the story names what the call ran');
  // EF1: no rule marks it private, and the window never says one does. Found 2026-10-05 by looking at the page: the
  // diagram called README.md "your private file" and the record answered "why it's private".
  assert.match(window_, /an everyday work file/);
  assert.doesNotMatch(window_, /your private file|Why it’s private/);
});

// EF4, EFD2: agentwhy follows a value out of a protected file alone, so for any other file these four were never looked
// for. "No" would be a claim it cannot support, which invariant 4 forbids.
test('what was never traced says "not tracked", and a private file still says yes or no', () => {
  const everyday = english(new ReportPageRenderer().render({ report: report([read('README.md', '# app')]), withIndexLink: false, denied: [] }));
  assert.match(everyday, /NOT TRACKED/);
  assert.doesNotMatch(everyday, /class="sw-yn">NO</, 'no column claims it did not happen');
  const private_ = english(new ReportPageRenderer().render({ report: report([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV), withIndexLink: false, denied: [] }));
  assert.match(private_, /class="sw-yn">NO</, 'a traced story still answers');
  assert.doesNotMatch(private_, /NOT TRACKED/);
});

// EF8, EFD4: twenty calls per file, and the rest counted - never dropped in silence.
test('the calls kept for one everyday file stop at twenty, and the rest are counted', () => {
  const many = Array.from({ length: 23 }, () => read('README.md', '# app'));
  const file = report(many).everydayFiles.find((one) => String(one.path) === 'README.md');
  assert.equal(file?.calls, 23);
  assert.equal(file?.reaches?.length, EVERYDAY_CALLS_KEPT);
  assert.equal(file?.reachesLeftOut, 3);
  const page = english(new ReportPageRenderer().render({ report: report(many), withIndexLink: false, denied: [] }));
  assert.match(page, /3 more calls aren’t listed here\./, 'and the window says so, rather than dropping them in silence');
});

// A write is not a read: the story says so, and nothing says the AI was shown what was inside.
test('an everyday file the AI wrote says it changed it, and the diagram ends at the file', () => {
  const wrote = read('src/app.ts', '', { toolName: 'Write', targets: ['src/app.ts'], written: ['export {};'] });
  const built = report([wrote]);
  assert.equal(built.everydayFiles.find((one) => String(one.path) === 'src/app.ts')?.how, 'changed');
  const story = fileStory(built, 'src/app.ts');
  assert.deepEqual(story.entries.map((entry) => entry.kind), ['changed']);
  assert.equal(story.holders[0]?.read, false, 'writing it is not reading it');
  const rows = fileRows(built, toDoItems(built), new Set(), []);
  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  const window_ = windowOf(page, 'file-' + rows.findIndex((row) => row.path === 'src/app.ts'));
  assert.match(window_, /Changed it/);
  assert.doesNotMatch(window_, /data-node="company"/, 'nothing says what was inside before it was written');
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
  assert.deepEqual(await projectDenyRules(reader({}), '/Users/someone/app', '/Users/someone'), []);
  assert.deepEqual(await projectDenyRules(reader({
    '/Users/someone/app/.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(./data/customers.csv)', 'Edit(./data/customers.csv)', 'Bash(rm:*)'] } }),
    '/Users/someone/app/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
  }), '/Users/someone/app', '/Users/someone'), ['**/data/customers.csv', '**/.env*']);
  assert.equal(await projectDenyRules(reader({ '/Users/someone/app/.claude/settings.json': '{ not json' }), '/Users/someone/app', '/Users/someone'), undefined);
});

/*
 * `2026-10-05-protected-everywhere.md` G6: Claude Code reads the person's own `~/.claude/settings.json` in every
 * project (GB10), so a rule written there refuses a file whatever project a session ran in. Leaving it out of this
 * read made a page call such a file unprotected while Claude Code was refusing it - the one thing G6 exists to end.
 */
test('the rules that deny a file include the computer-wide ones, whatever project the session ran in', async () => {
  const reader = (files: Record<string, string>) => ({
    readText: async (path: string) => files[path] ?? Promise.reject(new FileAccessError('not-found', path)),
    readLines: () => { throw new Error('not used'); },
  });
  const everywhere = JSON.stringify({ permissions: { deny: ['Read(**/.ssh/**)', 'Edit(**/.ssh/**)'] } });

  assert.deepEqual(
    await projectDenyRules(reader({ '/Users/someone/.claude/settings.json': everywhere }), '/Users/someone/app', '/Users/someone'),
    ['**/.ssh/**'],
    'a project with no rules of its own still denies what the computer denies',
  );

  assert.deepEqual(
    await projectDenyRules(reader({
      '/Users/someone/app/.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(**/.env*)'] } }),
      '/Users/someone/.claude/settings.json': everywhere,
    }), '/Users/someone/app', '/Users/someone'),
    ['**/.env*', '**/.ssh/**'],
    "the project's own first, then what it does not name itself",
  );

  assert.deepEqual(
    await projectDenyRules(reader({
      '/Users/someone/app/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.ssh/**)'] } }),
      '/Users/someone/.claude/settings.json': everywhere,
    }), '/Users/someone/app', '/Users/someone'),
    ['**/.ssh/**'],
    'a pattern both name is one pattern, not two',
  );

  assert.equal(
    await projectDenyRules(reader({ '/Users/someone/.claude/settings.json': '{ not json' }), '/Users/someone/app', '/Users/someone'),
    undefined,
    'and a computer-wide file that cannot be read leaves what is denied unknown, as a project\'s does',
  );
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
  // QE1, QE8: the row's own control is the badge and its pencil; Protect it is drawn hidden, for the state it falls
  // back to where the person takes it off their private files.
  assert.match(row, /data-mode-cell="\d+"[\s\S]*?class="fl-pencil"/);
  assert.match(row, /<span class="fl-prot" data-protect-open="\d+" hidden>/);
  assert.match(english(html), /<option value="told">Track \(1\)<\/option>/);
  // Customer data the person let the AI read is nothing to fix; keys in a told file would be.
  assert.doesNotMatch(row, /data-files-fix/, 'a told data file is not on the to-do list');
  assert.ok(!toDoItems(built).some((item) => item.path === 'data/customers.csv'));
});

// `change-it-from-the-row` QE1-QE6: a row that says Blocked or Track can be changed from the report. The window is
// about the rule that holds the file, because the rule may be wider than the file (QED2), and it says how far it goes.
const TOLD: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };

test('a blocked row opens a window naming the rule, how far it reaches, and the mode in force', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'] });
  const page = english(html);
  assert.match(page, /data-mode-cell="0"[\s\S]*?class="fl-pencil"/, 'QE1: the badge and a pencil, one control');
  const window_ = english(windowOf(html, 'mode-0'));
  assert.match(window_, /<dialog class="pp pp-confirm" id="mode-0"[^>]* data-mode="block"/, 'the window carries the mode it is about');
  // apps/web/.env and apps/api/.env.local are both held by **\/.env*, so one is the other's company (QE2).
  assert.match(window_, /The rule <code>\*\*\/\.env\*<\/code> blocks it, and 1 more file of this conversation\./);
  assert.match(window_, /class="cf-radio cf-radio-1" type="radio" name="mode-0-case" value="1" checked/, 'QE3: it opens on the mode in force');
  assert.match(window_, /Block it<span class="md-when md-when-block"><span class="cf-opt-now">now<\/span>/);
  assert.match(window_, /data-mode-change="0" data-mode-to="tell" data-mode-patterns="\*\*\/\.env\*"/, 'QE6: it sends the rule, not the file');
  assert.doesNotMatch(window_, /pill-primary/, 'QE4: both answers confirm in mint');
});

test('a tracked row opens the same window on Track, and says no rule blocks it', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), TOLD), withIndexLink: false, denied: ['**/.env*'] });
  const key = /data-live-key="data\/customers\.csv" data-file-key="(\d+)"/.exec(html)?.[1] ?? '';
  const window_ = english(windowOf(html, 'mode-' + key));
  assert.match(window_, /data-mode="tell"/);
  assert.match(window_, /You chose Track for <code>\*\*\/customers\.csv<\/code>\. No rule of this project blocks it\./);
  assert.match(window_, new RegExp('class="cf-radio cf-radio-2" type="radio" name="mode-' + key + '-case" value="2" checked'), 'QE3');
  assert.match(window_, /Track it<span class="md-when md-when-tell"><span class="cf-opt-now">now<\/span>/);
  assert.match(window_, new RegExp('data-mode-change="' + key + '" data-mode-to="block" data-mode-patterns="\\*\\*/customers\\.csv"'));
});

// QE7, QED4: what the window says about the rule is a standing fact, not a thing one answer brings up, so nothing
// under the title belongs to a case and the window cannot grow and shrink as a person compares the two.
test('nothing in the window moves when the answer changes', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'] });
  const window_ = windowOf(html, 'mode-0');
  const sentence = /<p class="cf-sentence">[\s\S]*?<\/p>/.exec(window_)?.[0] ?? '';
  assert.doesNotMatch(sentence, /cf-case/, 'the sentence is the same whichever card is chosen');
  assert.doesNotMatch(window_, /cf-caution/, 'and no line appears with one of them');
});

// QE5: the way out is not a mode, so it is not a card - a quiet link, and a window of its own, where coral is right.
test('the way out is a quiet link, confirmed in a window of its own', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'] });
  const window_ = english(windowOf(html, 'mode-0'));
  assert.match(window_, /<p class="cf-drop"><a class="text-link" href="#drop-0" data-popup-open="drop-0">Stop protecting this file →<\/a>/);
  const drop = english(windowOf(html, 'drop-0'));
  assert.match(drop, /Stop protecting this file\?/);
  assert.match(drop, /This takes <code>\*\*\/\.env\*<\/code> out of your settings\./);
  assert.match(drop, /class="pill pill-primary pill-lg" data-mode-change="0" data-mode-to="none"[^>]*>[\s\S]*?Yes, stop protecting it/);
});

// QE10: where nothing can be said about what holds a file, nothing is offered - a run that could not read the
// settings, and a shared copy, which writes nothing at all (P46).
test('no window where the settings could not be read, and none on a shared copy', () => {
  // The page carries its own script, which names these attributes: only what it draws is asked about here.
  const drawn = (html: string): string => html.replace(/<script[\s\S]*?<\/script>/g, '');
  const unknown = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false });
  assert.doesNotMatch(drawn(unknown), /data-mode-cell|id="mode-/, 'Can’t tell is told nothing about');
  const built = buildReport({
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events: EVENTS(),
    completeness: 'complete', messages: [], gaps: [],
  }, WITH_CSV, new Redactor('test'), { share: true, projectRoot: { kind: 'absent' } });
  const shared = new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: ['**/.env*'] });
  assert.doesNotMatch(drawn(shared), /data-mode-cell|id="mode-/, 'a shared page changes nothing');
});

// QE11: both windows in every language the page ships with.
test('the row’s window is written in en, pl and de', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'] });
  const window_ = windowOf(html, 'mode-0') + windowOf(html, 'drop-0');
  for (const words of ['Keep it blocked', 'Zostaw blokadę', 'Blockiert lassen',
    'Stop protecting this file', 'Przestań chronić ten plik', 'Diese Datei nicht mehr schützen']) {
    assert.ok(window_.includes(words), words);
  }
  // QE12: and the control that opens it is named in all three, as the kit's own bin is.
  assert.match(html, /data-label-en="Change what happens to [^"]*" data-label-pl="Zmień, co się dzieje z /);
});

// QE14: Conversations shows this table in a window of its own, and carries a row's windows into it. The windows a
// row's own controls open say so, so they travel too and the change is made there, not on the report.
test('the windows a row\u2019s controls open are marked to travel with the rows', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'] });
  for (const id of ['mode-0', 'drop-0']) assert.match(windowOf(html, id), /<dialog[^>]* data-row-window/, id);
  const protect = /id="protect-\d+"/.exec(html)?.[0] ?? '';
  assert.notEqual(protect, '', 'a Protect window is drawn');
  assert.match(windowOf(html, protect.slice(4, -1)), /<dialog[^>]* data-row-window/);
});

// QE13: the page's views follow the address, and a window is not a view - going to one must not move the page under
// the reader. Before this, every hash change scrolled to the top, so opening a window from a row near the bottom of
// the Files table threw the reader back to the hero (the maintainer, 2026-10-06).
test('opening a window does not move the view under it', () => {
  assert.match(REPORT_VIEWS_SCRIPT, /window\.addEventListener\('hashchange', \(\) => \{ if \(pick\(\)\) window\.scrollTo\(0, 0\); \}\);/);
  assert.match(REPORT_VIEWS_SCRIPT, /const already = view\.classList\.contains\('rv-on'\);/);
  assert.doesNotThrow(() => new Function(REPORT_VIEWS_SCRIPT));
});

// QE6: what each answer sends. Track keeps the rule's reach by putting the rule itself on the told list; nothing takes
// a deny rule out but --remove --unprotect, which is one request per rule.
test('the script sends the rule the window named, and one request per rule where a block is taken away', () => {
  assert.match(FIX_WIZARD_SCRIPT, /change: 'mode', to, patterns, rules: to === 'tell' \? patterns : \[\], where: 'local'/);
  assert.match(FIX_WIZARD_SCRIPT, /patterns\.map\(\(pattern\) => \(\{ change: 'unprotect', pattern \}\)\)/);
  assert.match(FIX_WIZARD_SCRIPT, /if \(to === from\) \{ dialog\.close\(\); return; \}/, 'QE3: keeping the mode in force writes nothing');
  assert.match(FIX_WIZARD_SCRIPT, /agentwhy init --remove '/, 'QE9: and what to run where nothing was reached');
  assert.doesNotThrow(() => new Function(FIX_WIZARD_SCRIPT));
});

// Conversations F14: "14 files" in a row counts what the report's Files tab lists. With no name only seen, its sidebar
// counts the same (with one, the next test: the sidebar keeps to the files opened, P32a).
test('the count a conversation row shows is the count of the report\u2019s Files tab', () => {
  const built = report(EVENTS(), WITH_CSV);
  const html = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  const sidebar = /<a class="sb-item" href="#files">[\s\S]*?<span class="sb-count">(\d+)<\/span>/.exec(html);
  assert.ok(sidebar, 'the report counts its files in the sidebar');
  assert.equal(listedFiles(built), Number(sidebar[1]));
});

// P32, changed 2026-10-05 by the maintainer: every file of the conversation is a row - a name a listing printed among them,
// private or not - so a person sees what else the AI was among, and may make it private. A name only seen sits with the
// rest, "Name only", "Not private" and Make it private beside it; it is never counted as opened (P32a), and a
// conversation row's "See all {n} files" leads to every row.
test('every name a listing printed is a row with the rest, offered Make it private, and never counted as opened', () => {
  const listed = read('', ['README.md', 'fake-key.txt', 'data/customers.csv'].join('\n'),
    { toolName: 'Bash', targets: [], commands: ['ls -1'], resultShape: 'listing' });
  const built = report([listed, read('src/app.ts', 'export {};')], WITH_CSV);
  const html = new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] });
  const page = english(html);

  assert.match(page, /Your AI opened 1 file\./, 'a name only seen is not a file opened');
  assert.match(html, /<a class="sb-item" href="#files">[\s\S]*?<span class="sb-count">1<\/span>/, 'nor in the sidebar');
  const table = html.slice(html.indexOf('data-files-table'));
  for (const name of ['README.md', 'fake-key.txt', 'data/customers.csv', 'src/app.ts']) assert.ok(table.includes('title="' + name + '"'), name + ' is a row');
  const fake = english(/<div class="dt-row[^"]*"[^>]*data-live-key="fake-key\.txt"[^>]*>[\s\S]*?<\/div>/.exec(html)?.[0] ?? '');
  assert.match(fake, /Name only[\s\S]*?Not private[\s\S]*?Make it private →/);
  assert.match(fake, /data-tier="5"/, 'with the rest, not with the private names');
  assert.match(page, /Every file of this conversation is listed, private or not\./);
  assert.equal(listedFiles(built), 4, 'a conversation row leads to every row');
});

// Past the most a page lists, names only seen are counted and said, never dropped in silence.
test('names past the most a page lists are said as a number under the table', () => {
  const many = Array.from({ length: 205 }, (_unused, at) => `src/file-${at}.ts`).join('\n');
  const built = report([read('', many, { toolName: 'Bash', targets: [], commands: ['rg --files'], resultShape: 'listing' })]);
  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  assert.match(page, /5 more file names it saw aren’t listed\./);
});

// `the-order-it-went` OW3-OW5 as amended 2026-10-05 by the maintainer: "the person does not understand this Order,
// everything has 1". No column of numbers: the order is chosen, and only where the files came up at more than one
// moment; in it, each moment's files stand under a heading in words. One listing that printed every name is one moment,
// so nothing is offered there.
test('the order the AI went is offered only where files came up at more than one moment, never as a column of numbers', () => {
  const listed = read('', ['README.md', 'fake-key.txt'].join('\n'), { toolName: 'Bash', targets: [], commands: ['ls -1'], resultShape: 'listing' });
  const oneMoment = english(new ReportPageRenderer().render({ report: report([listed]), withIndexLink: false, denied: [] }));
  assert.doesNotMatch(oneMoment, /In what order\?|<select[^>]*data-files-sort|class="dt-group"[^>]*data-files-step|<div class="dt"[^>]*data-files-orderable/,
    'one listing is one moment: nothing to order');
  assert.doesNotMatch(oneMoment, /role="columnheader">Order</, 'and no column of numbers');

  const twoMoments = english(new ReportPageRenderer().render({ report: report([listed, read('README.md', '# app'), read('src/app.ts', 'export {};')]), withIndexLink: false, denied: [] }));
  assert.match(twoMoments, /In what order\?[\s\S]*?<option value="need">What needs you first<\/option><option value="steps">The order your AI went<\/option>/);
  const readme = /<div class="dt-row[^"]*"[^>]*data-live-key="README\.md"[^>]*>/.exec(twoMoments)?.[0] ?? '';
  // OW1 as amended 2026-10-05 ("how do I see how it went?" - a conversation that searched the project first and read
  // customers.csv after showed no order at all): a file listed, then read, stands where it was read.
  assert.match(readme, /data-order-agent="0" data-order-step="2" data-order-place="0"/, 'a file listed, then read, stands where it was read');
  assert.match(twoMoments, /<div class="dt-group" role="row"[^>]* data-files-step hidden data-order-agent="0" data-order-step="1" data-order-place="-1">[\s\S]*?First<span class="dt-group-count">1<\/span>/,
    'the first moment\'s heading, drawn hidden for the script to place: the name only listed');
  assert.match(twoMoments, /data-files-step hidden data-order-agent="0" data-order-step="2" data-order-place="-1">[\s\S]*?Then<span class="dt-group-count">1<\/span>[\s\S]*?data-files-step hidden data-order-agent="0" data-order-step="3" data-order-place="-1">[\s\S]*?Then<span class="dt-group-count">1<\/span>/,
    'README.md read, then src/app.ts read: a moment each');
  assert.doesNotMatch(twoMoments, /data-order-step="4" data-order-place="-1"/, 'no moment holds no file');

  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  assert.match(english(html), /<div class="fl-filters js-only">[\s\S]*?In what order\?[\s\S]*?What the AI did/, 'beside the filters, first');
  assert.match(english(html), /data-files-step hidden data-order-agent="0" data-order-step="2" data-order-place="-1">[\s\S]*?Then<span class="dt-group-count">1<\/span>/);
  assert.match(html, /<span class="i18n" lang="pl">[\s\S]*?W jakiej kolejności\?/, 'in every language');
  assert.match(html, /<span class="i18n" lang="pl">Najpierw<\/span><span class="i18n" lang="de">Zuerst<\/span>/);
});

// OW3, OWD1 amended 2026-10-05 by the maintainer: "Step" was not understood. The number is which time an AI came across
// files - 1, 2, 3, never the gaps its other actions leave - and a helper is named in words, as the page names it elsewhere.
test('the order counts each time an AI came across files from 1, and names a helper in words', () => {
  const listing = (id: string, names: string[], sequence: number, agentId = 'main') =>
    ({ ...read('', names.join('\n'), { toolName: 'Bash', targets: [], commands: ['ls -1'], resultShape: 'listing', agentId, sequence }), id });
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 'main', projectRoot: { kind: 'absent' },
    agents: [{ id: 'main', type: 'main', depth: 0 }, { id: 'helper', type: 'subagent', depth: 1 }],
    delegations: [{ id: 'spawn', parentAgentId: 'main', childAgentId: 'helper', reports: [], followUps: [], evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete' }],
    events: [
      listing('a', ['README.md', 'notes.txt'], 1),
      listing('b', ['app.ts'], 4),
      listing('c', ['lib.ts'], 9),
      listing('d', ['guide.md'], 3, 'helper'),
    ],
    completeness: 'complete', messages: [], gaps: [],
  };
  const built = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
  const rows = fileRows(built, toDoItems(built), new Set(), []);
  const orderOf = (path: string) => rows.find((row) => row.path === path)?.step;
  assert.deepEqual(['README.md', 'notes.txt', 'app.ts', 'lib.ts'].map((path) => orderOf(path)?.number), [1, 1, 2, 3], 'actions 1, 4 and 9 read 1, 2 and 3');
  assert.deepEqual([orderOf('guide.md')?.helper, orderOf('guide.md')?.number], [1, 1], 'a helper counts its own, from 1');

  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  assert.deepEqual([...page.matchAll(/data-files-step hidden[^>]*><span class="dt-group-cell" role="cell"><span class="dt-group-dot[^"]*" aria-hidden="true"><\/span>([^<]+)</g)].map((match) => match[1]),
    ['First', 'Then', 'Then', 'Helper 1, first'], 'each AI\'s moments in words, a helper named as the page names it');
  assert.doesNotMatch(page, /data-files-step hidden[^>]*><span class="dt-group-cell" role="cell"><span class="dt-group-dot[^"]*" aria-hidden="true"><\/span>H1/,
    'never the graph\'s short name');
});

// Found 2026-10-05 by the maintainer, on "Check for John in customers": the AI listed the project, then searched
// customers.csv for the name. Every file had come up in the listing, so there was one moment and no order to choose,
// and the read the person wanted to find stood nowhere. A row stands at the step its status came from.
test('a private file listed, then read, stands at the read, so the order shows the listing first and the read after', () => {
  const listing = read('', ['README.md', 'data/customers.csv', 'src/app.ts'].join('\n'), { toolName: 'Bash', targets: [], commands: ['rg --files'], resultShape: 'listing' });
  const search = read('', '3:John,john@example.test', { toolName: 'Bash', targets: [], commands: ['rg -n John data/customers.csv'], resultShape: 'listing' });
  const built = report([listing, search], WITH_CSV);
  const rows = fileRows(built, toDoItems(built), new Set(), []);
  assert.deepEqual(rows.map((row) => [row.path, row.access, row.step?.number]), [
    ['data/customers.csv', 'read', 2],
    ['README.md', 'name', 1],
    ['src/app.ts', 'name', 1],
  ]);
  const page = english(new ReportPageRenderer().render({ report: built, withIndexLink: false, denied: [] }));
  assert.match(page, /In what order\?/, 'two moments, so the order is offered');
  assert.match(page, /data-order-step="1" data-order-place="-1">[\s\S]*?First<span class="dt-group-count">2<\/span>[\s\S]*?data-order-step="2" data-order-place="-1">[\s\S]*?Then<span class="dt-group-count">1<\/span>/);
});

// OW5, OW6: the script moves rows and never hides one - by AI, step and place, every part's heading hidden by a class,
// each moment's heading put over its files and shown - and the default puts every element back where it was drawn, the
// moments' headings hidden. Run against a small stand-in for the page.
test('the order the AI went moves the rows by AI, step and place under their moments, and the default puts them back', () => {
  const element = (name: string, data: Record<string, string> = {}, kind: 'part' | 'row' | 'moment' = 'part') => ({
    name, dataset: data, hidden: kind === 'moment', kind,
    hasAttribute: (attribute: string) => attribute === 'data-order-agent' && kind !== 'part',
  });
  const head = element('head');
  const part0 = element('part 0');
  const late = element('step 5', { orderAgent: '0', orderStep: '5', orderPlace: '0' }, 'row');
  const part2 = element('part 2');
  const second = element('step 1, second', { orderAgent: '0', orderStep: '1', orderPlace: '1' }, 'row');
  const first = element('step 1, first', { orderAgent: '0', orderStep: '1', orderPlace: '0' }, 'row');
  const helper = element('helper, step 1', { orderAgent: '1', orderStep: '1', orderPlace: '0' }, 'row');
  const none = element('no step', { orderAgent: '9999', orderStep: '0', orderPlace: '0' }, 'row');
  const firstMoment = element('First', { orderAgent: '0', orderStep: '1', orderPlace: '-1' }, 'moment');
  const lateMoment = element('Then', { orderAgent: '0', orderStep: '5', orderPlace: '-1' }, 'moment');
  const listeners: ((event: { target: unknown }) => void)[] = [];
  const select = { value: 'need', matches: (selector: string) => selector === '[data-files-sort]' };
  const box = { querySelectorAll: () => [select], addEventListener: (_type: string, listener: (event: { target: unknown }) => void) => listeners.push(listener) };
  const table = {
    children: [head, part0, late, part2, second, helper, first, none, firstMoment, lateMoment],
    classList: {
      set: new Set<string>(),
      toggle(name: string, on: boolean) { if (on) this.set.add(name); else this.set.delete(name); },
      contains(name: string) { return this.set.has(name); },
    },
    closest: () => box,
    querySelectorAll(selector: string) {
      return this.children.filter((each) => (selector === '[data-files-step]' ? each.kind === 'moment' : selector === '[data-file-key]' && each.kind === 'row'));
    },
    appendChild(child: unknown) { this.children = [...this.children.filter((each) => each !== child), child as typeof head]; },
  };
  const scope = { querySelectorAll: (selector: string) => (selector === '[data-files-orderable]' ? [table] : []) };
  const page = globalThis as unknown as { window?: unknown; document?: unknown };
  const before = { window: page.window, document: page.document };
  page.window = {};
  page.document = { querySelectorAll: () => [], addEventListener: () => undefined };
  try {
    new Function(FILES_SCRIPT)();
    (page.window as { agentwhyFiles: (scope: unknown) => void }).agentwhyFiles(scope);
    const choose = (value: string) => { select.value = value; listeners.forEach((listener) => listener({ target: select })); };

    choose('steps');
    assert.deepEqual(table.children.map((each) => each.name),
      ['head', 'part 0', 'part 2', 'First', 'step 1, first', 'step 1, second', 'Then', 'step 5', 'helper, step 1', 'no step']);
    assert.ok(table.classList.set.has('fl-by-step'), 'the parts\' headings are hidden by a class the filters leave alone');
    assert.deepEqual([firstMoment.hidden, lateMoment.hidden], [false, false], 'each moment\'s heading stands over its files');
    late.hidden = true;
    choose('steps');
    assert.equal(lateMoment.hidden, true, 'a moment whose files a filter hid hides its heading too');
    late.hidden = false;
    choose('need');
    assert.deepEqual(table.children.map((each) => each.name),
      ['head', 'part 0', 'step 5', 'part 2', 'step 1, second', 'helper, step 1', 'step 1, first', 'no step', 'First', 'Then']);
    assert.ok(!table.classList.set.has('fl-by-step'));
    assert.deepEqual([firstMoment.hidden, lateMoment.hidden], [true, true], 'and out of it, no moment is shown');
  } finally {
    page.window = before.window;
    page.document = before.document;
  }
});

// F58: the Conversations page shows a report's Files view in a window, so the script works per view and can be run again.
test('the Files script starts each view on the page by itself, and can start one put in later', () => {
  assert.doesNotThrow(() => new Function(FILES_SCRIPT));
  assert.match(FILES_SCRIPT, /scope\.querySelectorAll\('\[data-files-table\]'\)\.forEach\(start\)/);
  assert.match(FILES_SCRIPT, /scope\.querySelectorAll\('\[data-files-orderable\]'\)\.forEach\(order\)/, 'and its order, per view too (OW6)');
  assert.match(FILES_SCRIPT, /const box = table\.closest\('\.fl'\) \|\| document;/);
  assert.doesNotMatch(FILES_SCRIPT, /document\.querySelector\('\[data-files-(table|search)\]'\)/, 'nothing reaches past its own view');
});

// The maintainer, 2026-09-25: a mode inside the private tag went unseen, so what happens when the AI reaches a file is a
// column of its own, and Protect it stands beside the coral "Not blocked" it changes.
test('what stops the AI is a column of its own, and a private file nothing stops says so in coral beside Protect it', () => {
  const html = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: [] });
  const head = /<div class="dt-head"[^>]*>[\s\S]*?<\/div>/.exec(html.slice(html.indexOf('data-files-table')))?.[0] ?? '';
  // OW3 as amended 2026-10-05: no column of numbers opens the row.
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
  assert.match(csv, /<p class="sw-summary">Your AI opened this file and read what’s inside\.<\/p><p class="sw-context">Nothing to do\. If you’d rather your AI never opens it, set it to Block in Settings\.<\/p>/);
  assert.match(csv, /data-tab="0"[^>]*>The story<[\s\S]*?data-tab="1"[^>]*>Diagram<[\s\S]*?data-tab="2"[^>]*>Full record</);
  assert.match(csv, /The AI now has this information/, 'it was read, so the story ends with the company');
  assert.match(csv, /data-node="company"/);
  assert.doesNotMatch(csv, /Fix it|data-story-fix/, 'nothing to fix');

  const named = window(keyOf('apps/api/.env.local'));
  assert.match(named, /<dialog class="pp pp-wide"/);
  assert.match(named, /<p class="sw-summary">Your AI saw this file’s name, but nothing shows it read what’s inside\.<\/p>/);
  assert.doesNotMatch(named, /The AI now has this information|data-node="company"|hd-risk/, 'only its name was seen: nothing went on');
  assert.match(named, /data-node="file"[^>]*>[\s\S]*?<span class="hd-icon hd-icon-blue"><svg[^>]*>[\s\S]*?<\/svg><\/span>/, 'the file box in the row’s blue');

  // EF1 as amended 2026-10-05: an everyday file the AI read opens the same window, told from its own calls.
  assert.match(window(keyOf('README.md')), /^<dialog class="pp pp-wide"/, 'an everyday file read opens the same window');
});

// `protected-everywhere` G15: a computer-wide block is answered before anything a project says, and a computer-wide
// Track is the computer's. A row one holds offers no change from the report - it would report one that changed
// nothing - and is changed in Settings, where the computer's rules are listed.
test('a row the computer’s own rules hold offers no change from the report', () => {
  const drawn = (html: string): string => html.replace(/<script[\s\S]*?<\/script>/g, '');
  const blocked = new ReportPageRenderer().render({ report: report(EVENTS(), WITH_CSV), withIndexLink: false, denied: ['**/.env*'], everywhere: { blocked: ['**/.env*'], told: [] } });
  assert.doesNotMatch(drawn(blocked), /data-mode-cell="0"|id="mode-0"/, 'blocked by the computer: no pencil, no window');

  const told = new ReportPageRenderer().render({ report: report(EVENTS(), TOLD), withIndexLink: false, denied: ['**/.env*'], everywhere: { blocked: [], told: ['**/customers.csv'] } });
  const key = /data-live-key="data\/customers\.csv" data-file-key="(\d+)"/.exec(told)?.[1] ?? '';
  assert.doesNotMatch(drawn(told), new RegExp('data-mode-cell="' + key + '"|id="mode-' + key + '"'), 'tracked by the computer: the same');
  assert.match(drawn(told), /data-mode-cell="0"/, 'a row only the project holds keeps its window');
});

// G15's input: the computer's own blocks and Tracks, read apart from the project's - an unreadable file gives nothing.
test('the computer\u2019s own rules are read apart: its blocks, its told list, and nothing from a file nobody can read', async () => {
  const reader = (files: Record<string, string>): FileReader => ({
    readText: async (path) => {
      const text = files[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => { throw new Error('not used'); },
  });
  const told = '/Users/someone/.agentwhy/private-files.json';
  assert.deepEqual(await computerRules(reader({}), '/Users/someone', told), { blocked: [], told: [] });
  assert.deepEqual(await computerRules(reader({
    '/Users/someone/.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(**/.aws/**)', 'Edit(**/.aws/**)', 'Bash(rm *)'] } }),
    [told]: JSON.stringify({ version: 1, tell: ['**/Contracts/**'] }),
  }), '/Users/someone', told), { blocked: ['**/.aws/**'], told: ['**/Contracts/**'] });
  assert.deepEqual(await computerRules(reader({ '/Users/someone/.claude/settings.json': '{ not json', [told]: 'not json' }), '/Users/someone', told), { blocked: [], told: [] });
  assert.deepEqual(await computerRules(reader({ [told]: JSON.stringify({ version: 1, tell: ['**/x/**'] }) }), '/Users/someone', undefined), { blocked: [], told: [] }, 'no told list where the run keeps none');
});

/*
 * Found 2026-10-07 by the maintainer, who saw `fl.acc.opened` printed on their page: a word key with no words behind
 * it is drawn as the key, in every language at once. Every value of the two closed unions a row is drawn from has its
 * words, so the next value added is caught here and not on a page - the record below is exhaustive, so a new value
 * stops the typecheck until it is listed.
 */
test('every look and every access a row can hold has its words, in all three languages', () => {
  const every: Readonly<Record<FileAccess, true>> = { read: true, opened: true, name: true, unknown: true, stopped: true, changed: true };
  const accesses = Object.keys(every) as readonly FileAccess[];
  const missing: string[] = [];
  for (const lang of ['en', 'pl', 'de'] as const) {
    for (const access of accesses) {
      for (const key of [`fl.acc.${access}`, `fl.w.did.${access}`]) if (REPORT_WORDS[lang][key] === undefined) missing.push(`${lang} ${key}`);
    }
    for (const look of Object.values(LOOKS)) if (APP_WORDS[lang][look.label] === undefined) missing.push(`${lang} ${look.label}`);
  }
  assert.deepEqual(missing, []);
});

/*
 * Found 2026-10-08 by the maintainer, who saw "Opened, didn't read it" lying across the tag beside it: the AI column
 * is 120px, a circle and a gap take 35 of them, and a look's words are one line (`status-icon.ts`). Two things keep a
 * row readable - the words in that column are the short form, and in a table cell they wrap - and both are asked for
 * here, since neither is visible from the words alone.
 */
test('the words of the AI column are short enough for it, and a cell lets them wrap', () => {
  const every: Readonly<Record<FileAccess, true>> = { read: true, opened: true, name: true, unknown: true, stopped: true, changed: true };
  const tooLong: string[] = [];
  for (const lang of ['en', 'pl', 'de'] as const) {
    for (const access of Object.keys(every) as readonly FileAccess[]) {
      const words = String(REPORT_WORDS[lang][`fl.acc.${access}`] ?? '');
      // Two words at most, and no word longer than the column: what fits beside the circle, measured in letters.
      if (words.split(' ').length > 2 || words.split(' ').some((word) => word.length > 14)) tooLong.push(`${lang} fl.acc.${access}: ${words}`);
    }
  }
  assert.deepEqual(tooLong, [], 'the AI column holds one or two short words (guidelines, File table)');
  assert.match(DATA_TABLE_STYLE, /\.dt-cell \.look-label\{white-space:normal/, 'and a cell wraps them rather than running into the next column');
});

/*
 * `every-tab-says-read` ER7, found 2026-10-08 by the maintainer: a row said "Read - tracked", and the window its "See 1
 * file" opened led with "Your AI didn't open any file." over the same file, "Name only". A file the AI was handed whole
 * is read whether or not anything in it looks like a key.
 */
test('a private file the AI read whole is "Read it" and counted as opened, though nothing in it looks like a key', () => {
  const built = report([read('customers.csv', 'Anna Nowak, Lodz')], WITH_CSV);
  const html = english(new ReportPageRenderer().render({ report: built, withIndexLink: false }));

  assert.deepEqual(fileRows(built, toDoItems(built), new Set(), undefined).map((row) => [row.path, row.access]), [['customers.csv', 'read']]);
  assert.ok(html.includes('Your AI opened 1 file.'));
  assert.ok(!html.includes('Your AI didn\u2019t open any file.'));
});
