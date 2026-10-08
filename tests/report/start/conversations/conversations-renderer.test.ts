// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { ConversationsRenderer } from '../../../../src/report/start/conversations/conversations-renderer.ts';
import { PERIODS_SCRIPT } from '../../../../src/report/start/conversations/periods-script.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { withoutSupportLinks } from '../../../helpers/support-links.ts';

const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const READ: Tally = { ...ZERO, contentsSeen: 1, filesReached: 1, namedByCall: 1 };

function entry(name: string, at: string, tally: Tally = ZERO, files: readonly string[] = [], extra: Partial<IndexEntry> = {}): IndexEntry {
  return {
    provider: 'claude-code',
    name,
    title: ('Asked in ' + name) as Redacted,
    modifiedAt: Date.parse(at),
    delegations: 1,
    report: { kind: 'generated', file: name + '.html', tally, incomplete: false, files: files.map((path) => ({ path: path as Redacted, kind: 'seen' as const })) },
    ...extra,
  };
}

function index(entries: readonly IndexEntry[], extra: Partial<SessionIndex> = {}): SessionIndex {
  return {
    now: NOW, timeZone: 'UTC', since: NOW - 30 * 86_400_000, asked: '30d', project: '/Users/someone/projects/demo-shop', shared: false,
    widen: 'agentwhy start --since 60d', entries, settings: { level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' } }, ...extra,
  };
}

const render = (model: SessionIndex): string =>
  new ConversationsRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' }).render(model);

/** The HTML of the one row whose title names it. */
function rowOf(page: string, name: string): string {
  const at = page.indexOf('Asked in ' + name + '<');
  assert.ok(at > 0, name + ' is on the page');
  const start = page.lastIndexOf('<div class="dt-row', at);
  // The last row ends where the page's own scripts begin: they name the classes a row carries, and a slice running to
  // the end of the document would read them as the row's (found 2026-10-06, when the page gained the write path).
  const next = page.indexOf('<div class="dt-row', at);
  const end = next < 0 ? page.indexOf('<script', at) : next;
  return page.slice(start, end < 0 ? undefined : end);
}

const english = (html: string): string => html.replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '');

// F8: the heading is the answer, at 0, 1 and N.
test('the heading says how many times the AI worked and how many times it read something private', () => {
  const many = render(index([entry('a', '2026-09-23T08:00:00Z', READ), entry('b', '2026-09-22T08:00:00Z', READ), entry('c', '2026-09-22T09:00:00Z')]));
  assert.match(many, /lang="en">Your AI worked for you 3 times\./);
  assert.match(many, /lang="en">2 times it read something private\./);

  const once = render(index([entry('a', '2026-09-23T08:00:00Z', READ)]));
  assert.match(once, /lang="en">Your AI worked for you once\./);
  assert.match(once, /lang="en">Once it read something private\./);

  const none = render(index([entry('a', '2026-09-23T08:00:00Z')]));
  assert.match(none, /lang="en">Nothing private was read\./);
});

// F9: the guide card names one conversation, and never lists file names in its sentence.
test('the guide names the newest conversation that read something, with a count, and leads to its report', () => {
  const page = render(index([entry('old', '2026-09-21T08:00:00Z', READ, ['.env']), entry('new', '2026-09-23T08:59:00Z', READ, ['.env.production', '.env', '.env.local'])]));
  assert.match(page, /lang="en">Start with today, 08:59\./);
  assert.match(page, /lang="en">You asked: “Asked in new”\. Your AI read 3 private files along the way\. About 2 minutes to fix\./);
  assert.match(page, /<a class="pill pill-primary pill-lg" href="new\.html">/);
  const guide = page.slice(page.indexOf('class="guide'), page.indexOf('class="cw-week"'));
  assert.ok(!guide.includes('.env.production'), 'no file name in the sentence');
});

test('with nothing read, the guide is the mint card and "Needs your attention" is not drawn', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')]));
  assert.match(page, /class="guide guide-mint"/);
  assert.match(page, /lang="en">Nothing to fix this week\./);
  const body = page.slice(page.indexOf('<main'), page.indexOf('</main>'));
  assert.ok(!body.includes('data-need'), 'no attention list');
  assert.ok(!body.includes('class="guide guide-coral"'));
});

// F14: the action is always a button - Fix it on a read, See report otherwise - and only a read carries the bar.
// Changed 2026-09-25: the button leads to the report, and the row is not a link.
test('a read row carries the bar and "Fix it"; every other row "See report"; a row with no report says so', () => {
  const page = render(index([
    entry('read', '2026-09-23T08:00:00Z', READ, ['.env']),
    entry('clean', '2026-09-23T07:00:00Z'),
    entry('outside', '2026-09-23T06:00:00Z', ZERO, [], { report: { kind: 'outside-range' } }),
    entry('failed', '2026-09-23T05:00:00Z', ZERO, [], { report: { kind: 'failed' } }),
  ]));
  const read = rowOf(page, 'read');
  assert.match(read, /class="dt-bar"/);
  assert.match(read, /lang="en">Fix it →</);
  assert.match(read, /<a class="pill pill-primary pill-task" href="read\.html"><span class="i18n" lang="en">Fix it →</);
  assert.ok(!read.includes('dt-link'), 'the row itself is not a link');

  const clean = rowOf(page, 'clean');
  assert.ok(!clean.includes('dt-bar'));
  assert.match(clean, /<a class="pill pill-outline pill-task" href="clean\.html"><span class="i18n" lang="en">See report</);

  for (const name of ['outside', 'failed']) assert.ok(!rowOf(page, name).includes('dt-link'), name + ' has nowhere to lead');
  // A report that failed has none to give; one older than the run is checked on request (F55).
  assert.match(rowOf(page, 'failed'), /lang="en">No report</);
  assert.match(rowOf(page, 'outside'), /lang="en">Check it</);
  assert.match(rowOf(page, 'outside'), /agentwhy start --since 60d/, 'the command that brings it in is in the technical line');
  assert.ok(!page.includes('Nothing to do'), 'never "Nothing to do" in the action column');
});

// F14, changed 2026-09-25: What happened says how many private files were read, as a count - never their names (§9.1).
test('a read row counts the private files its AI read, and names none of them', () => {
  const page = render(index([entry('many', '2026-09-23T08:00:00Z', READ, ['a/.env', 'b/.env', 'c/.env', 'd/.env', 'e/.env'])]));
  const row = rowOf(page, 'many');
  assert.match(row, /<span class="cw-did"><span class="look look-coral">[\s\S]*?lang="en">Read 5 private files</);
  assert.ok(!row.replace(/<[^>]+>/g, ' ').includes('a/.env'), 'no file name in what the row says (the search still finds it)');
  assert.ok(!row.includes('class="chip'), 'no chips on the Conversations page');
  const one = rowOf(render(index([entry('one', '2026-09-23T08:00:00Z', READ, ['.env'])])), 'one');
  assert.match(one, /lang="en">Read 1 private file</);
});

test('a row whose AI read nothing private says so in its look', () => {
  const row = rowOf(render(index([entry('clean', '2026-09-23T08:00:00Z')])), 'clean');
  assert.match(row, /<span class="look look-grey">[\s\S]*?lang="en">Nothing private</);
});

// F6: with no script every week is on the page, one under another.
test('every week with a conversation is on the page, and the current one is shown first', () => {
  const page = render(index([entry('now', '2026-09-23T08:00:00Z'), entry('then', '2026-09-08T08:00:00Z')]));
  // AN4: data-view is where AN1's switch exists at all - every week here, since each has a conversation.
  assert.match(page, /<section class="cw cw-current" id="week-0" data-period-at="0" data-kind="week" data-first="\d+"( data-today="\d+")?( data-view="sectioned")?>/);
  assert.match(page, /<section class="cw" id="week-2" data-period-at="1" data-kind="week" data-first="\d+"( data-view="sectioned")?>/);
  assert.match(page, /lang="en">2 weeks ago · Sep 7.{1,3}13</, 'named by the calendar; the range as the language writes one');
  assert.match(page, /<a class="cw-step" href="#week-2" data-period-go="1"/, 'the earlier step is a link, so it works with no script');
});

test('every string is written in all three languages', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env'])]));
  assert.match(page, /lang="pl">Wymaga twojej uwagi</);
  assert.match(page, /lang="de">Braucht deine Aufmerksamkeit</);
  assert.match(page, /<option value="pl">Polski<\/option>/);
});

// The title is transcript content, already past the redactor, and still escaped wherever it is written.
test('a title is escaped in the row, in its search key and in the guide', () => {
  const page = render(index([entry('x', '2026-09-23T08:00:00Z', READ, ['.env'], { title: '<img src=x onerror=alert(1)>' as Redacted })]));
  assert.ok(!page.includes('<img src=x'));
  assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

// R48, spec R6: a shared page names no machine, offers no settings and shows no title.
test('a shared page names no project and offers no Settings', () => {
  const { title: _title, ...untitled } = entry('a', '2026-09-23T08:00:00Z');
  const { project: _project, ...shared } = index([untitled], { shared: true });
  const page = render(shared);
  assert.ok(!page.includes('demo-shop'));
  assert.ok(!page.includes('href="settings.html"'), 'a shared page offers no Settings (R48)');
  assert.match(page, /lang="en">A shared page</);
  assert.match(page, /lang="en">A conversation with no title</);
});

test('the sidebar leads to the views drawn elsewhere and counts what is left to fix', () => {
  const rows = [{ label: 'rotate' as const, path: '.env' as Redacted, sessions: [] }, { label: 'route' as const, path: 'x' as Redacted, sessions: [] }];
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')], { check: { rows, refusedAttempts: 0 } }));
  assert.match(page, /<a class="sb-item" href="to-fix\.html">[\s\S]*?<span class="sb-count sb-count-coral">1<\/span><\/a>/);
  assert.match(page, /href="month\.html"/);
  assert.match(page, /href="settings\.html"/);
  assert.match(page, /<a class="sb-item sb-active" href="index\.html" aria-current="page">/);
  assert.match(page, /lang="en">Runs on your computer\. Nothing is uploaded\.</);
});

// §7.5, R53: the page reaches nothing but its own reports.
test('the page loads nothing from anywhere and links only to its own files', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env'])]));
  assert.ok(!/https?:\/\//.test(withoutSupportLinks(page)), 'no absolute URL but the sidebar\'s two to agentwhy\'s own site (F7)');
  assert.ok(!/<(script|link|img)[^>]+src=/.test(page.replace(/<link rel="icon"[^>]*>/, '')), 'nothing is loaded');
  assert.match(page, /connect-src 'self'/);
});

// O9, guidelines §7: the words the glossary replaced are not on the page.
test('the page uses the glossary’s words, not the ones it replaced', () => {
  const page = english(render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env']), entry('b', '2026-09-22T08:00:00Z')])));
  for (const word of ['sensitive', 'delegation', 'subagent', 'rotate', 'session']) {
    assert.ok(!new RegExp('\\b' + word + '\\b', 'i').test(page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')), word);
  }
});

test('days and times are the machine’s, and the technical details say which zone they are', () => {
  const page = render(index([entry('late', '2026-09-20T22:30:00Z')], { timeZone: 'Europe/Warsaw' }));
  assert.match(rowOf(page, 'late'), /<span class="cw-time">00:30<\/span>/);
  assert.match(page, /lang="en">Days and times are Europe\/Warsaw\./);
});

// The earlier page's calendar, opened from the week's name (maintainer, 2026-09-23): loaded in a script of its own,
// and each week says which Monday it starts on, so a day chosen in the calendar finds its week.
test('the week\u2019s name opens the calendar, and each week says its Monday', () => {
  const page = render(index([entry('now', '2026-09-23T08:00:00Z'), entry('then', '2026-09-08T08:00:00Z')]));
  assert.match(page, /<button type="button" class="cw-switch-label" data-period-pick/);
  assert.match(page, /id="week-0" data-period-at="0" data-kind="week" data-first="20717"/, 'Monday 21 September 2026 is day 20717');
  assert.match(page, /<script>!function\(e,t\)\{"object"==typeof exports/, 'the calendar has a script of its own');
});

test('the project is one line: its initial, and its whole name on hover', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/projects/test-project-for-agentwhy' }));
  assert.match(page, /<div class="sb-project" title="test-project-for-agentwhy"><span class="sb-project-mark" aria-hidden="true">T<\/span>/);
  assert.ok(!page.includes('<span class="sb-project-place">'), 'no place where the run was not told the home directory');
});

// which-project V1: which folder this is, under its name - cut short on one line, and whole on hover.
test('the project card says where the folder is, under its name, and whole on hover', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop', place: '~/Projects/shop' }));
  assert.match(page, /<div class="sb-project" title="~\/Projects\/shop">/);
  assert.match(page, /<span class="sb-project-name">shop<\/span><span class="sb-project-place">~\/Projects\/shop<\/span>/);
});

// F10, changed 2026-09-24: every week opens whole; opening on today made the heading and the lists count different things.
test('every week opens whole, and the day chosen is a chip over every list', () => {
  const page = render(index([entry('today', '2026-09-23T08:00:00Z', READ), entry('earlier', '2026-09-21T08:00:00Z')]));
  assert.ok(!page.includes('data-today'), 'no day is chosen for the script');
  assert.match(page, /<div class="cw-daybar js-only" data-day-bar hidden><button type="button" class="cw-day-chip" data-day-clear/);
  const markup = page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '');
  assert.ok(markup.indexOf('data-day-bar') < markup.indexOf('data-need-fix'), 'the chip stands over "Needs your attention"');
  assert.equal((markup.match(/data-day-clear/g) ?? []).length, 1, 'and nowhere else - not inside the fold');
});

// F8, F13, changed 2026-09-24: with nothing to fix, nothing is folded shut and the heading is mint.
test('a week with nothing to fix says so in mint, and lists its conversations open', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z'), entry('b', '2026-09-22T08:00:00Z')]));
  assert.match(page, /<p class="hero-action hero-calm" role="doc-subtitle"><span class="i18n" lang="en">Nothing private was read\./);
  assert.match(page, /lang="en">Each time is one conversation with your AI\. All of them were fine — open any to see what your AI did\./);
  assert.match(page, /<section class="cw-others cw-bare"><details class="fold" data-others data-live-keep open>/, 'open with no script too');
  assert.match(page, /<div class="cw-list-head" data-list-head><h2 class="cw-h2"><span class="i18n" lang="en">Your conversations<\/span>/);

  const busy = render(index([entry('a', '2026-09-23T08:00:00Z', READ), entry('b', '2026-09-22T08:00:00Z')]));
  assert.match(busy, /<section class="cw-others"><details class="fold" data-others data-live-keep>/, 'under something to fix, folded');
  assert.doesNotMatch(busy, /class="hero-action hero-calm"/);
  assert.doesNotMatch(busy, /All of them were fine/);
});

const NAMED: Tally = { ...ZERO, filesReached: 1, namedByCall: 1 };
const STOPPED: Tally = { ...ZERO, refusedAttempts: 1 };

// F13, F14, changed 2026-09-24: the rest in groups in F16's order, five a group until asked, and the fold says what it holds.
test('the rest is grouped by what the AI did, five rows a group, and its line names each group', () => {
  const quiet = Array.from({ length: 7 }, (_unused, at) => entry('quiet' + at, '2026-09-2' + (1 + (at % 3)) + 'T0' + at + ':00:00Z'));
  const page = render(index([entry('fix', '2026-09-23T09:00:00Z', READ), ...quiet, entry('stop', '2026-09-22T10:00:00Z', STOPPED), entry('name', '2026-09-21T10:00:00Z', NAMED)]));
  // AN1, AN2: stopped before the added flat list, which draws the same conversations again with no groups.
  const rest = page.slice(page.indexOf('<section class="cw-others'), page.indexOf('<section class="cw-flat"'));
  const heads = [...rest.matchAll(/data-look-head="(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(heads, ['name', 'stopped', 'none'], 'only a name, then stopped, then nothing private');
  assert.match(rest, /<span class="dt-group-dot dt-group-blue" aria-hidden="true"><\/span><span class="i18n" lang="en">Only saw a name<\/span>/);
  assert.match(rest, /dt-group-mint/, 'stopped in its own colour');
  assert.equal((rest.match(/class="dt-row[^"]*" role="row"[^>]*data-look="none"/g) ?? []).length, 7, 'every row is written, for a page with no script');
  assert.match(rest, /<div class="dt-note" role="row" style="min-width:1000px" data-look-note="none" hidden>/, 'past five, a note - shown only by the script');
  assert.match(english(rest), /Show all <span data-look-n="none">7<\/span>/);
  assert.doesNotMatch(rest, /data-look-note="(name|stopped)"/, 'a group of five or fewer has none');
  const line = rest.slice(0, rest.indexOf('</summary>'));
  assert.match(line, /data-mix-look="name"[\s\S]*data-mix-look="stopped"[\s\S]*data-mix-look="none"/, 'the folded line names its groups in order');
  // The maintainer, 2026-09-25: the groups on the line are facts, not filters - nothing there to press.
  assert.doesNotMatch(line, /<button|data-open-look/, 'said, not pressed');
  assert.doesNotMatch(line, /cw-mix-row js-only/, 'said with no script too');
  assert.match(rest, /data-pick-look="all" aria-pressed="true" data-live-keep/);
});

// F14, F58, changed 2026-09-25: What the AI did and every file it reached are one column - the look, and under it a
// link to the report's Files tab that the page opens as a window.
test('each row counts every file of its conversation under what happened, and leads to its report\u2019s Files tab', () => {
  const counted = entry('counted', '2026-09-23T08:00:00Z', READ, ['.env']);
  const withCount = { ...counted, report: { ...counted.report, reached: 14 } } as IndexEntry;
  const none = entry('none', '2026-09-22T08:00:00Z');
  const withNone = { ...none, report: { ...none.report, reached: 0 } } as IndexEntry;
  const old = entry('old', '2026-09-22T14:39:00Z', ZERO, [], { report: { kind: 'outside-range' } });
  const page = render(index([withCount, withNone, old]));
  const head = (page.match(/<div class="dt-head"[\s\S]*?<\/div>/) ?? [''])[0];
  assert.deepEqual([...english(head).matchAll(/lang="en">([^<]+)</g)].map((match) => match[1]), ['When', 'What you asked', 'What happened', 'Your setting', 'Action']);
  assert.match(page, /<div class="dt" role="table" data-conversations>/);
  assert.match(rowOf(page, 'counted'), /<a class="cw-see" href="counted\.html#files" data-all-files="counted\.html"><span class="i18n" lang="en">See all 14 files →<\/span>/);
  assert.ok(!rowOf(page, 'none').includes('cw-see'), 'none counted: no link to an empty list');
  assert.ok(!rowOf(page, 'old').includes('cw-see'), 'no report: no link');
  assert.match(english(rowOf(page, 'old')), /<span class="cw-did"><span class="look look-grey">[\s\S]*?lang="en">Not checked yet</, 'no report: its look says why');
  assert.equal((page.match(/<dialog class="pp pp-wide" id="conv-files"/g) ?? []).length, 1, 'one window for every row');
  assert.match(page, /window\.agentwhyFiles/, 'the window starts the Files view it shows');
  // The maintainer, 2026-09-25: a row of the window does not take the person to the report - it opens that file's
  // window, brought from the report and opened here, over this one; a row with no window there leads nowhere.
  assert.match(page, /const found = target \? page\.getElementById\(target\) : null;/);
  assert.match(page, /link\.setAttribute\('data-popup-open', link\.getAttribute\('data-cwf-open'\)\)/);
  assert.match(page, /held\.replaceChildren\(\.\.\.windows\.map/);
  assert.match(page, /const linked = link\.closest\('\.dt-linked'\);\n\s*if \(linked\) linked\.classList\.remove\('dt-linked'\);\n\s*link\.remove\(\);/);
  // `change-it-from-the-row` QE14: and what a row's own controls open comes with the rows, so Protect it, Make it
  // private and the pencil are answered here rather than on the report the reader would otherwise be sent to.
  assert.match(page, /const travels = found && found\.tagName === 'DIALOG' && \(row \|\| found\.hasAttribute\('data-row-window'\)\);/);
  assert.match(page, /if \(wordsOf && !document\.getElementById\('wizard-words'\)\) document\.body\.appendChild/);
  assert.match(page, /<div data-files-windows><\/div>/, 'where the windows are held');
  assert.match(page, /window\.agentwhyDiagrams\(held\)/, 'and their diagrams started');
  for (const piece of ['.sw-head', '.tabs-bar', '.hd-board', '.stat']) assert.ok(page.includes(piece), piece + ' is styled on this page');
});

// Found in use (2026-09-24): a conversation older than the run was drawn as clean - "No private files", folded under
// "nothing private to fix", its day "All good", the heading "Nothing private was read". It was not read at all (F17).
test('a conversation this run did not read is not called clean anywhere', () => {
  const old = entry('old', '2026-09-22T14:39:00Z', ZERO, [], { report: { kind: 'outside-range' } });
  const page = render(index([old], { widen: 'agentwhy start --since 14d' }));
  const text = page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.doesNotMatch(text, /Nothing private was read|nothing private to fix|All good|No private files|Nothing to fix this week/);
  assert.match(text, /One couldn’t be checked\./);
  assert.match(text, /1 conversation wasn’t checked\./, 'the guide card says so, with no button');
  assert.match(text, /\? Not checked \( 1 \) — not read yet\. Show Hide This run didn’t read them yet\. Press Check it beside one to read it now, or run agentwhy start --since 14d to include them all\./,
    'a fold of its own: the line says what it holds, the reason and the command are inside it');
  assert.match(page, /<section class="cw-need cw-unchecked" data-need><details class="fold fold-grey"><summary[\s\S]*?data-need-count>1</,
    'shut on arrival, and its count is above the fold, where the day chosen rewrites it');
  assert.doesNotMatch(page, /<details class="fold fold-grey" open>/, 'nothing opens it: a list nobody can act on');
  assert.match(text, /1 not checked/, 'its day');
  assert.match(page, /<section class="cw-need cw-unchecked" data-need>[\s\S]*?<span class="look-label"><span class="i18n" lang="en">Not checked yet<\/span>/, 'its row');
});

// Found by looking at a project only Codex worked in: every Codex record has a gap (X23), and its read conversation was
// said to be one "this run didn't read", older than the run - and the command offered would not have changed that.
test('a conversation read with gaps in its record is said to be read, and what the record cannot show is said', () => {
  const codex = entry('codex', '2026-09-23T08:00:00Z', ZERO, [], { provider: 'codex' });
  const partial = { ...codex, report: { ...codex.report, incomplete: true } } as IndexEntry;
  const plain = (page: string): string => page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const alone = plain(render(index([partial])));
  assert.match(alone, /One couldn’t be fully checked\./);
  assert.match(alone, /one conversation with your AI\. Nothing is waiting for you to fix\./, 'no coral is spoken of where there is none');
  assert.match(alone, /1 conversation couldn’t be fully checked\./);
  assert.match(alone, /\? Couldn’t check fully \( 1 \) — read, but their record has gaps\. Show Hide Their record leaves out some steps, so their reports may not show everything your AI opened\./,
    'headed as its rows are, not "Not checked", and shut with Hide');
  assert.doesNotMatch(alone, /didn’t read them|--since|This run|marked in coral/, 'it was read, and no command reads it more');
  assert.match(alone, /1 conversation couldn’t be fully checked\. It’s listed below, with the reason\./, 'the card points to the list');
  assert.equal(alone.split('Their record leaves out some steps').length - 1, 1, 'and the reason is said once, beside the rows');
  assert.match(alone, /1 not fully checked/, 'its day, as its list is headed');

  const old = entry('old', '2026-09-22T14:39:00Z', ZERO, [], { report: { kind: 'outside-range' } });
  const both = plain(render(index([partial, old], { widen: 'agentwhy start --since 14d' })));
  assert.match(both, /2 conversations couldn’t be fully checked\./, 'true of both, where "weren’t checked" is not');
  assert.match(both, /Not checked \( 2 \) — some older than this check, the rest read with gaps\. Show Hide Some are older than this check, or their record couldn’t be opened\. The others leave out some steps/);
});

/*
 * Decided by the maintainer 2026-10-07: their AI ran `wc -l customers.csv` on a file they track, and the row said "Only
 * saw a name" over a file the command had opened. What the AI got was a count, so its text never reached it either. The
 * row says the fact between the two, and the look is its own.
 */
test('a private file a command opened without reading says so, between a read and a name seen', () => {
  const opened: Tally = { ...ZERO, filesReached: 1, namedByCall: 1, filesOpened: 1 };
  const page = english(render(index([
    entry('counted', '2026-09-23T08:00:00Z', opened, ['customers.csv']),
    entry('quiet', '2026-09-23T07:00:00Z'),
  ])));
  const own = rowOf(page, 'counted').slice(0, rowOf(page, 'counted').indexOf('</div>'));

  assert.match(own, /lang="en">Opened, didn’t read it</);

  /*
   * 2026-10-07: a file whose text reached the AI is a read at this rung too, with or without a value traced in it - a
   * row of ordinary words is traced as prose, and the row said "Only saw a name" over a file the AI had quoted. A
   * tracked file read says what it has always said, now that the rung is reached at all.
   */
  const handed: Tally = { ...ZERO, filesReached: 1, namedByCall: 1, filesRead: 1 };
  const readPage = english(render(index([entry('printed', '2026-09-23T08:00:00Z', handed, ['customers.csv']), entry('quiet', '2026-09-23T07:00:00Z')])));
  assert.match(rowOf(readPage, 'printed'), /lang="en">Read 1 private file</);

  const tracked = entry('watched', '2026-09-23T08:00:00Z', handed);
  const told = { ...tracked, report: { ...tracked.report, files: [{ path: 'customers.csv' as Redacted, kind: 'told' as const }] } } as IndexEntry;
  assert.match(rowOf(english(render(index([told, entry('quiet', '2026-09-23T07:00:00Z')]))), 'watched'), /lang="en">Read — tracked</);
  assert.doesNotMatch(own, /Only saw a name|Read private files/);
  assert.match(page, /<section class="cw-others[\s\S]*?Asked in counted</, 'nothing to fix, so it is listed with the rest');
});

// Found in the maintainer's run: a Codex conversation that listed `.env` was "Only saw a name - Nothing to fix", folded
// under "nothing private to fix", while its report led with "we can't say it read nothing private" (X10, F17).
// Changed 2026-10-05 by the maintainer, twice: a record with gaps whose every attempt has a known end and that saw only
// names is listed with the rest, as its report now says "nothing to do" of it; one beside an attempt of no known end is
// still listed apart, its cell "Not known".
test('a record with gaps that saw only names is listed with the rest; beside an attempt of no known end, apart', () => {
  const named: Tally = { ...ZERO, filesReached: 1, namedByCall: 1 };
  const base = entry('listed', '2026-09-23T08:00:00Z', named, ['.env'], { provider: 'codex' });
  const gapped = { ...base, report: { ...base.report, incomplete: true, files: [{ path: '.env' as Redacted, kind: 'named' as const }] } } as IndexEntry;
  const unsure = { ...gapped, name: 'tried', title: 'Asked in tried' as Redacted, modifiedAt: Date.parse('2026-09-23T07:00:00Z'),
    report: { ...gapped.report, file: 'tried.html', tally: { ...named, unknownAttempts: 1 } } } as IndexEntry;
  const page = english(render(index([gapped, unsure])));

  // A row holds spans alone, so its first `</div>` closes it.
  const own = (name: string) => rowOf(page, name).slice(0, rowOf(page, name).indexOf('</div>'));
  assert.match(own('listed'), /lang="en">Only saw a name</);
  assert.match(own('listed'), /lang="en">Nothing to fix</);
  assert.match(page, /<section class="cw-others[\s\S]*?Asked in listed</, 'listed with the rest');
  assert.match(own('tried'), /lang="en">Couldn’t check fully</);
  assert.match(own('tried'), /lang="en">Not known</);
  assert.doesNotMatch(own('tried'), /Nothing to fix/);
  assert.match(page, /<section class="cw-need cw-unchecked" data-need>[\s\S]*?Asked in tried</, 'what has no known end is listed apart');
  assert.match(page, /1 conversation couldn’t be fully checked\./, 'and only it is counted so');
});

// Every Codex key starts `codex-`, and a UUIDv7's first characters are a timestamp: cut from the key, every row read `codex-01…`.
test('a row\'s technical id is cut from its id, not from the key that names its AI', () => {
  const key = 'codex-01a0ec9c-0000-7000-8000-000000000001';
  const page = render(index([entry(key, '2026-09-23T08:00:00Z', ZERO, [], { provider: 'codex' }), entry('5f3c1b2a-9d4e-4f6a-8b7c-0e1d2f3a4b5c', '2026-09-23T09:00:00Z')]));

  assert.match(rowOf(page, key), new RegExp('<span title="' + key + '">01a0ec9c…</span>'), 'the whole key stays in its tooltip');
  assert.match(rowOf(page, '5f3c1b2a-9d4e-4f6a-8b7c-0e1d2f3a4b5c'), /<span title="5f3c1b2a-[^"]*">5f3c1b2a…<\/span>/, 'a Claude Code id is as it was');
});

test('F55: a conversation older than the run offers to be checked, and a shared page does not', () => {
  const old = entry('old-id', '2026-09-22T14:39:00Z', ZERO, [], { report: { kind: 'outside-range' } });
  const page = render(index([old], { widen: 'agentwhy start --since 14d' }));
  assert.match(page, /<button type="button" class="pill pill-outline pill-task" data-include="old-id" data-command="agentwhy start --since 14d"/);
  assert.match(page, /lang="en">Not checked yet</);
  assert.match(page, /fetch\('api\/include'/);
  const shared = render(index([old], { shared: true, widen: 'agentwhy start --since 14d' }));
  assert.doesNotMatch(shared.replace(/<script>[\s\S]*?<\/script>/g, ''), /data-include=/);
});

// Every script of the page is one <script>: one that does not parse stops every other, so each is parsed here.
test('the page\u2019s scripts parse, each on its own and all together', () => {
  assert.doesNotThrow(() => new Function(PERIODS_SCRIPT));
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ), entry('b', '2026-09-22T08:00:00Z')]));
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? '');
  scripts.forEach((script) => assert.doesNotThrow(() => new Function(script)));
});

// Left through a row's report, a long list opens again where the person was: kept in this tab, put back once.
test('the page keeps its place when a row’s report is opened, and puts it back once', () => {
  assert.match(PERIODS_SCRIPT, /closest\('\.cw-action a\[href\]'\)\) leave\(\)/);
  assert.match(PERIODS_SCRIPT, /sessionStorage\.setItem\(PLACE/);
  assert.match(PERIODS_SCRIPT, /sessionStorage\.removeItem\(PLACE\)/);
  assert.match(PERIODS_SCRIPT, /window\.scrollTo\(0, place\.scroll \|\| 0\)/);
});

// Found in use (2026-09-25): every file of a conversation was marked done and To fix counted nothing, yet its card still
// said "Start with yesterday, 20:53 … About 2 minutes to fix." What the AI read stays said; what to do follows the marks
// (F8, F9, F11, F12, F16, changed 2026-09-25).
const visible = (page: string): string => page.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const MARKED = { rows: [], refusedAttempts: 0 };

test('a conversation whose every file was marked done asks for nothing, and still says what the AI read', () => {
  const page = render(index([entry('done', '2026-09-22T20:53:00Z', READ, ['.env']), entry('quiet', '2026-09-23T08:00:00Z')], { check: MARKED }));
  const text = visible(page);
  assert.match(page, /<p class="hero-action hero-calm" role="doc-subtitle"><span class="i18n" lang="en">Once it read something private\./, 'said, in mint');
  assert.match(text, /Everything it read has been fixed — open any to see what your AI did\./);
  assert.match(page, /class="guide guide-mint"/);
  assert.match(text, /Nothing to fix this week\. Your AI read something private, and it’s all fixed now\./);
  assert.doesNotMatch(text, /Start with|About 2 minutes to fix|Needs your attention|to check|didn’t read anything private/);
  assert.ok(!page.includes('<section class="cw-need" data-need data-need-fix>'), 'no attention list');
  const row = english(rowOf(page, 'done'));
  // The maintainer, 2026-09-25: "Read 1 private file, now fixed" in mint read as if nothing had happened. What the AI
  // did stays coral; whether it is fixed is a column of its own.
  assert.match(row, /<span class="cw-did"><span class="look look-coral"><span class="look-glyph" aria-hidden="true">◉<\/span><span class="look-label"><span class="i18n" lang="en">Read 1 private file</);
  assert.match(row, /<span class="look look-mint"><span class="look-glyph" aria-hidden="true">✓<\/span><span class="look-label"><span class="i18n" lang="en">Fixed</);
  assert.doesNotMatch(row, /now fixed/);
  assert.ok(!row.includes('dt-bar'), 'no bar: nothing to do');
  assert.match(row, /lang="en">See report</);
  const rest = page.slice(page.indexOf('<section class="cw-others'));
  assert.deepEqual([...rest.matchAll(/data-look-head="(\w+)"/g)].map((match) => match[1]), ['fixed', 'none'], 'fixed first, as the ladder climbs');
  assert.match(english(rest), /data-mix-look="fixed"><span class="cw-mix-glyph" aria-hidden="true">◉<\/span><span class="i18n" lang="en">Read, now fixed</);
  // The maintainer, 2026-09-25: a day whose read was fixed drew "All good" in mint, which hid when it happened (F11).
  assert.match(english(page), /class="cw-day cw-day-fixed"[^>]*><span class="cw-day-label">(?:(?!cw-day-count)[\s\S])*<span class="cw-day-count">1<\/span><span class="cw-day-state">[^]*?lang="en">1 read, fixed</, 'its day, in coral');
  assert.doesNotMatch(page, /class="cw-day cw-day-bad/, 'no day asks for a fix');
  // The script's list is the page's (`period-section.ts` REST), in its order: a look missing from either drops its rows.
  assert.match(PERIODS_SCRIPT, /const LOOKS = \['fixed', 'opened', 'name', 'stopped', 'none'\];/, 'the script shows the group');
});

test('a conversation with one file still to do stays to fix, and the heading counts the fixed one too', () => {
  const rows = [{ label: 'rotate' as const, path: 'keys.pem' as Redacted, sessions: ['open'] }];
  const page = render(index([entry('open', '2026-09-21T09:00:00Z', READ, ['.env', 'keys.pem']), entry('done', '2026-09-23T08:59:00Z', READ, ['.env'])],
    { check: { rows, refusedAttempts: 0 } }));
  const text = visible(page);
  assert.match(text, /2 times it read something private\./, 'both happened');
  assert.match(text, /Start with Mon, Sep 21, 09:00\./, 'the newer one is done, so the card names the other');
  assert.match(text, /Your AI read 2 private files along the way\. About 2 minutes to fix\./);
  const need = page.slice(page.indexOf('<section class="cw-need" data-need data-need-fix>'), page.indexOf('<section class="cw-others'));
  assert.ok(need.includes('Asked in open<') && !need.includes('Asked in done<'), 'only the open one needs attention');
  assert.match(english(rowOf(page, 'open')), /lang="en">Fix it →</);
  assert.match(english(rowOf(page, 'open')), /<span class="look look-coral"><span class="look-glyph" aria-hidden="true">✕<\/span><span class="look-label"><span class="i18n" lang="en">Not yet</);
});

test('the Fixed column answers every row: nothing to fix where nothing was read, not known where nothing was checked', () => {
  const old = entry('old', '2026-09-22T14:39:00Z', ZERO, [], { report: { kind: 'outside-range' } });
  const page = render(index([entry('quiet', '2026-09-23T08:00:00Z'), old]));
  assert.match(english(rowOf(page, 'quiet')), /<span class="cw-fixed-plain"><span class="i18n" lang="en">Nothing to fix</);
  assert.match(english(rowOf(page, 'old')), /<span class="cw-fixed-plain"><span class="i18n" lang="en">Not known</);
});

test('nothing is called fixed where the marks could not be read, or where no file was one a mark closes', () => {
  const unread = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env'])], { check: { ...MARKED, marksUnreadable: true } }));
  assert.match(visible(unread), /Start with today, 08:00\./, 'a record that could not be read hid nothing');

  const told = entry('told', '2026-09-23T08:00:00Z', READ);
  const onlyTold = { ...told, report: { ...told.report, files: [{ path: 'notes.md' as Redacted, kind: 'told' as const }] } } as IndexEntry;
  const page = render(index([onlyTold], { check: MARKED }));
  assert.doesNotMatch(visible(page), /fixed/, 'a file the person let the agent read was never fixed by anyone');
});

// F57a, found in use (2026-09-25): a conversation that read only a file the person chose Track for, which held no key,
// offered "Fix it", and its report said there was nothing to fix. It read it, so it is put before the person as a read
// is - its bar, a day "to check" - under "For your info" (the maintainer, 2026-09-25; it was "Needs your attention"
// the same morning), and it leads to its report, not to a fix: nothing in it is to fix, and nothing says it read nothing.
test('a conversation that read only what the person let it read is for their info, and leads to its report', () => {
  const told = entry('told', '2026-09-22T20:53:00Z', READ);
  const onlyTold = { ...told, report: { ...told.report, files: [{ path: 'customers.csv' as Redacted, kind: 'told' as const }] } } as IndexEntry;
  const page = render(index([onlyTold, entry('quiet', '2026-09-23T08:00:00Z')], { check: MARKED }));
  const text = visible(page);
  assert.match(text, /Once it read something private\./, 'it happened');
  assert.match(text, /It read only files you let it read — open any to see what your AI did\./);
  assert.match(text, /Nothing to fix this week\. Your AI read only private files you let it read\./);
  assert.doesNotMatch(text, /Start with|About 2 minutes to fix|fixed|didn’t read anything private/);
  // The maintainer, 2026-09-25: not under "Needs your attention", which asks for work, but under "For your info".
  assert.ok(!page.includes('<section class="cw-need" data-need data-need-fix>'), 'nothing needs attention');
  const info = page.slice(page.indexOf('<section class="cw-need cw-info" data-need data-need-info>'), page.indexOf('<section class="cw-others'));
  assert.ok(info.includes('Asked in told<') && !info.includes('Asked in quiet<'), 'it is for their info; the quiet one is not');
  assert.match(english(info), /<details class="fold fold-sand" open><summary class="fold-line"><span class="fold-mark" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span><span class="fold-text"><strong><span class="i18n" lang="en">For your info<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)* \(<span data-need-count>1<\/span>\)<\/strong> <span class="fold-rest"><span class="i18n" lang="en">— your AI read files you track\. Nothing to fix\.</, 'Track\u2019s eye, a count the script narrows, and what it means');
  assert.match(english(page), /data-day="20718"[^>]*>[\s\S]*?lang="en">1 to check</, 'its day');
  const row = english(rowOf(page, 'told'));
  assert.match(row, /<span class="cw-did"><span class="look look-sand"><span class="look-glyph" aria-hidden="true">✓<\/span><span class="look-label"><span class="i18n" lang="en">Read — tracked</);
  // The maintainer, 2026-09-25: its Your setting cell says the mode the person chose - Settings' eye and words - not
  // "Nothing to fix", which read as if the AI had read nothing.
  assert.match(row, /<span class="look look-sand"><span class="look-glyph" aria-hidden="true"><svg[^>]*>[\s\S]*?<\/svg><\/span><span class="look-label"><span class="i18n" lang="en">Track</);
  assert.doesNotMatch(row, /Nothing to fix|Not yet/);
  assert.ok(row.includes('dt-bar dt-bar-sand'), 'its bar, as a read, in Track\u2019s sand - it asks for nothing');
  assert.match(row, /lang="en">See report</);
  assert.doesNotMatch(row, /Fix it/, 'there is nothing in its report to fix');
  const rest = page.slice(page.indexOf('<section class="cw-others'));
  assert.deepEqual([...rest.matchAll(/data-look-head="(\w+)"/g)].map((match) => match[1]), ['none']);
});

test('a week with both: "Needs your attention" counts only what is to fix, and "For your info" follows it', () => {
  const told = entry('told', '2026-09-22T20:53:00Z', READ);
  const onlyTold = { ...told, report: { ...told.report, files: [{ path: 'customers.csv' as Redacted, kind: 'told' as const }] } } as IndexEntry;
  const page = render(index([entry('fix', '2026-09-23T08:00:00Z', READ, ['.env']), onlyTold]));
  const need = page.slice(page.indexOf('data-need-fix>'), page.indexOf('data-need-info>'));
  assert.ok(need.includes('Asked in fix<') && !need.includes('Asked in told<'), 'the fix above, the tracked read under it');
  assert.match(need, /<span class="cw-need-count" data-need-count>1<\/span>/);
  assert.match(page.slice(page.indexOf('data-need-info>')), /Asked in told</);
});

test('a told file that held keys is still to fix: only a key change undoes that', () => {
  const told = entry('keys', '2026-09-23T08:00:00Z', READ);
  const files = [{ path: '.env' as Redacted, kind: 'seen' as const }, { path: 'customers.csv' as Redacted, kind: 'told' as const }];
  const page = render(index([{ ...told, report: { ...told.report, files } } as IndexEntry]));
  assert.match(english(rowOf(page, 'keys')), /lang="en">Fix it →</);
});

// live-pages L7a, the maintainer 2026-09-25: Conversations takes a new version in place - each period keeps its element
// and what was set on it, its content is the new one, and the row at the top of the view is held where it was.
test('Conversations can take a new version of itself in place, and This month is reloaded as before', () => {
  assert.match(PERIODS_SCRIPT, /if \(kind !== 'week'\) return;\n\s*const signature/, 'only Conversations: This month keeps day windows outside its periods');
  assert.match(PERIODS_SCRIPT, /period\.replaceChildren\(\.\.\.\[\.\.\.nextPeriods\[at\]\.childNodes\]/, 'the period element is kept, its content swapped');
  assert.match(PERIODS_SCRIPT, /nextPeriods\.length !== periods\.length \|\| nextPeriods\.some\(\(period, at\) => period\.id !== periods\[at\]\.id\)\) return null/, 'other periods: not in place');
  assert.match(PERIODS_SCRIPT, /window\.scrollBy\(0, held\.getBoundingClientRect\(\)\.top - anchorTop\)/, 'the row under the reader stays put');
  for (const kept of ['searchNow.value = kept.search', "kept.more.includes(button.dataset.lookMore)", 'othersNow.open = kept.open']) assert.ok(PERIODS_SCRIPT.includes(kept), kept);
  // AN4: the swapped-in markup's pills always say Sectioned, so a period reading Flat would have shown the flat list
  // under a switch that said Sectioned. The view is on the period element, which the swap keeps: it marks them again.
  assert.match(PERIODS_SCRIPT, /if \(period\.dataset\.view\) setView\(period, period\.dataset\.view\);/, 'the view the person chose survives a new version');
  assert.match(PERIODS_SCRIPT, /\.sb-item\[href="/, 'the sidebar counts follow');
});

// AN11, AN12 (live-pages L7a): AN2 draws every conversation twice, so an update has two rows to choose between. It
// lights, counts and reveals the one in the view the period has open - the other is under display:none, where a light
// is not seen and the pill's "Show" cannot keep its promise. AND5: the panel the row is in says which, never geometry.
test('an update picks the copy of a conversation standing in the view that is open', () => {
  const source = /const inOpenView = \(row\) => \{[\s\S]*?\n {2}\};/.exec(PERIODS_SCRIPT);
  assert.ok(source, 'the script declares the rule');
  const inOpenView = new Function(source[0] + '\n return inOpenView;')() as (row: unknown) => boolean;
  // A row that answers only what the rule asks of it: which period it is in, and whether it stands in the flat panel.
  const row = (view: string | null, flat: boolean): unknown => ({
    closest: (selector: string) => {
      if (selector === '[data-period-at]') return view === null ? null : { dataset: view === '' ? {} : { view } };
      if (selector === '[data-flat]') return flat ? {} : null;
      throw new Error('unexpected selector ' + selector);
    },
  });
  assert.equal(inOpenView(row(null, false)), true, 'a row in no period is its own only copy');
  assert.equal(inOpenView(row('', false)), true, 'a period with no switch drawn has only the one copy');
  assert.equal(inOpenView(row('sectioned', false)), true, 'Sectioned open: the grouped copy');
  assert.equal(inOpenView(row('sectioned', true)), false, 'Sectioned open: not the flat copy');
  assert.equal(inOpenView(row('flat', false)), false, 'Flat open: not the grouped copy');
  assert.equal(inOpenView(row('flat', true)), true, 'Flat open: the flat copy');
  // The rule is of no use unless both sides of the comparison are taken through it.
  assert.match(PERIODS_SCRIPT, /\.dt-row\[data-live-key\]'\)\]\.filter\(inOpenView\)\.forEach\(\(row\) => \{ if \(!before\.has/, 'the baseline is one copy each');
  assert.match(PERIODS_SCRIPT, /const fresh = \[\.\.\.document\.querySelectorAll\('\.dt-row\[data-live-key\]'\)\]\.filter\(inOpenView\)/, 'and so is what is compared against it');
});

// AN5 as amended, AN13, AND1 (the maintainer, 2026-10-08, looking at it built): a day chosen left the flat list
// showing the whole week - the day chip said Monday over a table of every conversation of it. The day narrows both
// views now, and the flat heading counts what the day holds, as a section's heading does.
test('a day chosen narrows the flat list too, and its heading counts what the day holds', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env']), entry('b', '2026-09-21T08:00:00Z')]));
  const flat = page.slice(page.indexOf('<section class="cw-flat"'));
  assert.match(flat, /<span class="cw-need-count" data-flat-count>2<\/span>/, 'a count the script rewrites');
  assert.match(flat, /<div class="dt-empty" role="row" hidden><span role="cell"><span class="i18n" lang="en">No conversations match\./, 'and the line a table shows with every row hidden');

  const source = /const flat = period\.querySelector\('\[data-flat\]'\);[\s\S]*?\n {4}\}\n/.exec(PERIODS_SCRIPT);
  assert.ok(source, 'the script narrows the flat list');
  assert.doesNotMatch(source[0], /\bquery\b|data-search|data-look=/, 'by the day alone: the search and the group pills are the grouped view\u2019s own (AND6)');
  const narrow = new Function('period', 'day', source[0]) as (period: unknown, day: string) => void;
  const rows = [{ dataset: { day: '100' }, hidden: false }, { dataset: { day: '101' }, hidden: false }, { dataset: { day: '100' }, hidden: false }];
  const count = { textContent: '3' };
  const none = { hidden: true };
  const section = {
    querySelectorAll: (selector: string) => (selector === '.dt-row[data-day]' ? rows : selector === '[data-flat-count]' ? [count] : []),
    querySelector: (selector: string) => (selector === '.dt-empty' ? none : null),
  };
  const period = { querySelector: (selector: string) => (selector === '[data-flat]' ? section : null) };

  narrow(period, '100');
  assert.deepEqual(rows.map((row) => row.hidden), [false, true, false], 'only the day\u2019s rows');
  assert.equal(count.textContent, '2');
  assert.equal(none.hidden, true, 'rows are shown, so no line about none');

  narrow(period, '');
  assert.deepEqual(rows.map((row) => row.hidden), [false, false, false], 'the whole period again');
  assert.equal(count.textContent, '3');

  // AN13: only a day the period holds no conversation on, which no tile offers (`dayTile` disables an empty day).
  narrow(period, '999');
  assert.equal(count.textContent, '0');
  assert.equal(none.hidden, false, 'and the table says none match rather than standing empty');

  // A period with no flat list at all - This month (AN8) - is left alone.
  narrow({ querySelector: () => null }, '100');
});

// which-project V2, V11, V14: the card opens the window that switches projects, where the run has them.
test('the project card opens the window that switches projects, and each other project offers the way to it', () => {
  const project = (id: string, name: string, extra: object) => ({ id, name, place: `~/Projects/${name}`, folder: 'there' as const, conversations: 3, newest: { modifiedAt: NOW }, current: false, ...extra });
  const projects = {
    rows: [project('-a', 'shop', { setUp: true, current: true }), project('-b', 'blog', { setUp: true }), project('-c', 'notes', { setUp: false })],
    unreadable: 0,
    switchable: true,
    choosable: false,
    removable: false,
  };
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop', place: '~/Projects/shop', projects }));
  assert.match(page, /<a class="sb-project sb-project-link" href="#projects" data-popup-open="projects" title="~\/Projects\/shop">/);
  assert.match(page, /<dialog class="pp pp-list" id="projects" aria-labelledby="projects-title">/);
  assert.ok(page.includes('<span class="i18n" lang="en">Switch project</span>'));
  assert.match(page, /<button type="button" class="pill pill-light pill-md" data-switch-project="-b" data-switch-name="blog">/, 'Open is light');
  assert.match(page, /<button type="button" class="pill pill-primary pill-md" data-switch-project="-c" data-switch-name="notes">/, 'Set it up is coral');
  assert.ok(!page.includes('data-switch-project="-a"'), 'the project shown offers no way to itself');
  assert.ok(page.includes('agentwhy reads your conversations with Claude Code'), 'the window says which AI (V5)');

  const fixed = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop', projects: { ...projects, switchable: false } }));
  assert.ok(fixed.includes('id="projects"') && !fixed.includes('data-switch-project="'), 'a run that cannot switch lists, and offers nothing');

  const without = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop' }));
  assert.ok(!without.includes('id="projects"') && !without.includes('sb-project-link" href'), 'no window, and the card is not a button');
});

// protected-everywhere G10, the approved mock's way back in: everything on this computer, a row above the projects, where
// the run serves the computer-wide path - mint and counted where it keeps files from the AI, its sentence where none.
test('the projects window offers everything on this computer above the projects, and leads to its step', () => {
  const project = (id: string, name: string) => ({ id, name, place: `~/Projects/${name}`, folder: 'there' as const, conversations: 3, newest: { modifiedAt: NOW }, current: id === '-a', setUp: true });
  const projects = { rows: [project('-a', 'shop'), project('-b', 'blog')], unreadable: 0, switchable: true, choosable: false, removable: false };
  const rows = [{ id: 'ssh' as const, kind: 'folder' as const, path: '.ssh', pattern: '**/.ssh/**', present: true }];
  const links = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' };
  const drawn = (everywhere: SessionIndex['everywhere'], withLinks: ConstructorParameters<typeof ConversationsRenderer>[0] = links): string =>
    new ConversationsRenderer(withLinks).render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop', projects, ...(everywhere === undefined ? {} : { everywhere }) }));

  const held = drawn({ rows, blocked: ['**/.ssh/**', '**/.aws/**'], told: [], codex: false });
  const row = /<div class="pjw-ev pjw-ev-held">[\s\S]*?<\/a><\/div>/.exec(held)?.[0] ?? '';
  assert.ok(held.indexOf('pjw-ev-held') < held.indexOf('data-switch-project="-b"'), 'above the projects');
  assert.match(row, /Everything on this computer[\s\S]*?2 kinds of files kept from your AI, in every project/);
  // Step 4 (GD15): Open shows the computer's own view, by the switch a project's Open uses.
  assert.match(row, /<button type="button" class="pill pill-light pill-md" data-switch-project=":computer" data-switch-name="This computer">/);

  const none = drawn({ rows, blocked: [], told: [], codex: false });
  assert.match(none, /<div class="pjw-ev">[\s\S]*?Files that belong to no project[\s\S]*?data-switch-project=":computer"/, 'the computer\u2019s view, where its Settings add them');

  // On the computer's page the row is the one shown; where the run cannot switch, the onboarding's step is the way left.
  const shown = new ConversationsRenderer(links).render(index([entry('a', '2026-09-23T08:00:00Z')], { scope: 'computer', projects, everywhere: { rows, blocked: [], told: [], codex: false } }));
  assert.match(shown, /<div class="pjw-ev">[\s\S]*?Shown now/);
  assert.doesNotMatch(shown, /data-switch-project=":computer"/);
  const fixed = new ConversationsRenderer(links).render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/shop', projects: { ...projects, switchable: false }, everywhere: { rows, blocked: [], told: [], codex: false } }));
  assert.match(fixed, /<a class="pill pill-outline pill-md" href="onboarding\.html#everywhere">[\s\S]*?Choose files →/);

  assert.doesNotMatch(drawn(undefined), /class="pjw-ev/, 'not where the run does not serve the path');
  const { onboarding: _none, ...noOnboarding } = links;
  assert.doesNotMatch(drawn({ rows, blocked: [], told: [], codex: false }, noOnboarding), /class="pjw-ev/, 'nor where no onboarding page is written');
});

// which-project V12: Choose a folder… where the computer has a window for it; how to add a project where it has none.
test('the window offers the computer\'s folder window where there is one, and a way to search the list', () => {
  const projects = (choosable: boolean) => ({
    rows: [{ id: '-a', name: 'shop', place: '~/Projects/shop', folder: 'there' as const, conversations: 3, newest: { modifiedAt: NOW }, current: false }],
    unreadable: 0,
    switchable: true,
    choosable,
    removable: false,
  });
  const offered = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/blog', projects: projects(true) }));
  assert.match(offered, /<button type="button" class="pill pill-light pill-lg" data-choose-folder><svg /);
  assert.ok(offered.includes('<span class="i18n" lang="en">Choose a folder…</span>') && !offered.includes('Open your project’s folder in your code editor'));
  assert.match(offered, /<input type="search" class="pjl-search js-only" data-project-search/);

  const none = render(index([entry('a', '2026-09-23T08:00:00Z')], { project: '/Users/someone/Projects/blog', projects: projects(false) }));
  assert.ok(!none.includes('data-choose-folder>') && none.includes('Open your project’s folder in your code editor'));
});

// The maintainer's design, 2026-09-29: a week with no conversation yet says so, and what happens next - not a count of
// zero with "Nothing private was read." in coral, and "open any" with nothing to open.
const PATTERNS = DEFAULT_POLICY.protected.map((each) => each.pattern);
function protectedBy(refuse: 'local' | false, alerts = true): IndexSettings {
  return {
    level: 'no-read', protected: PATTERNS, allowed: [], origin: { kind: 'default' },
    hooks: { watch: alerts ? 'local' : false, refuse, reads: { watch: 'local', refuse: 'local' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' },
    mine: Object.fromEntries(PATTERNS.map((pattern) => [pattern, { file: 'local' as const, rule: 'Read(' + pattern + ')', whole: true }])),
    held: { local: PATTERNS, shared: [] },
    // Told of the tries it stopped (F30): the level of alerts that says so.
    notices: {
      on: 'refused', clean: 'once', say: 'agent', notify: ['chat'], path: '/Users/someone/.agentwhy/notices.json', unusable: false,
      from: { on: 'project', clean: 'default', say: 'default', notify: 'default' },
    },
  };
}
const thisWeek = (page: string): string => english(page.slice(page.indexOf('id="week-0"'), page.indexOf('id="week-1"') > 0 ? page.indexOf('id="week-1"') : undefined));

test('a week with no conversation yet says so, since when, and what happens next', () => {
  const week = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')])));
  assert.match(week, /<h1 class="hero-fact hero-alone"><span class="i18n" lang="en">No conversations yet this week\.</);
  assert.match(week, /lang="en">That’s normal — you haven’t asked your AI for anything in this project since Monday\.</);
  assert.doesNotMatch(week, /hero-action|Nothing private was read|open any|data-need|cw-others/, 'no count of what was read, and no lists');
  assert.match(week, /lang="en">What happens next</);
  assert.match(week, /lang="en">Open Claude Code or Codex and ask for anything\.</);
  // Codex is read since 2026-09-29 (the Codex plan's step 8); Cursor's own AI is still not.
  assert.ok(!/Cursor/.test(week.replace(/<dd[\s\S]*?<\/dd>/g, '')), 'no AI agentwhy does not see is offered');
  assert.match(week, /lang="en">agentwhy reads your conversations with Claude Code/, '"Nothing showing up?" answers which AI it sees');
  assert.match(week, /<span class="cw-live">/, '"Connected" is written, and shown only while the server answers');
  assert.match(render(index([])), /:root\[data-live="on"\] \.cw-live\{display:inline-flex\}/);

  const monday = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')], { now: Date.parse('2026-09-21T10:00:00Z') })));
  assert.match(monday, /lang="en">That’s normal — you haven’t asked your AI for anything in this project today\.</);
});

test('this week’s tiles say today has nothing yet and the days ahead are coming up', () => {
  const week = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')])));
  assert.match(week, /class="cw-day cw-day-none" data-day="\d+" disabled><span class="cw-day-label"><span class="i18n" lang="en">Mon 21</);
  assert.match(week, /class="cw-day cw-day-yet cw-day-today" data-day="\d+" disabled><span class="cw-day-label"><span class="i18n" lang="en">Today<\/span>[\s\S]*?<span class="cw-day-count">0<\/span>[\s\S]*?lang="en">Nothing yet</);
  assert.equal((week.match(/class="cw-day cw-day-future"/g) ?? []).length, 4, 'Thursday to Sunday');
  assert.match(week, /class="cw-day cw-day-future"[^>]*><span class="cw-day-label">[\s\S]*?<span class="cw-day-count">&nbsp;<\/span>[\s\S]*?lang="en">Coming up</);
});

test('where the private files are blocked whole, the card says protection is on and leads to last week', () => {
  const week = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')], { settings: protectedBy('local') })));
  assert.match(week, /lang="en">That’s normal — [^<]*since Monday\. Your private files are protected either way\.</);
  assert.match(week, /<div class="guide guide-mint guide-acts"><span class="guide-mark" aria-hidden="true"><svg /);
  assert.match(week, /lang="en">Protection is on\.</);
  assert.match(week, /lang="en">Your private files stay blocked\. If your AI tries to open one, we’ll alert you\.</);
  assert.match(week, /<a class="pill pill-light pill-lg" href="#week-1" data-period-go="1"><span class="i18n" lang="en">See last week →</);

  const quiet = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')], { settings: protectedBy('local', false) })));
  assert.match(quiet, /lang="en">Your private files stay blocked\.</, 'no alert promised where no hook tells');
  const older = thisWeek(render(index([entry('before', '2026-09-01T08:00:00Z')], { settings: protectedBy('local') })));
  assert.match(older, /href="#week-3" data-period-go="1"><span class="i18n" lang="en">See your last conversations →</);
  const first = thisWeek(render(index([], { settings: protectedBy('local') })));
  assert.ok(first.includes('Protection is on.') && !first.includes('guide-acts') && !first.includes('See last week'), 'nothing before: nowhere to lead');
});

test('where they are not, the card says how many and leads to Settings; where it is not known, no card', () => {
  const open = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')], { settings: protectedBy(false) })));
  assert.match(open, /<div class="guide guide-coral">/);
  assert.match(open, /lang="en">\d+ private files aren’t fully blocked\.</);
  assert.match(open, /<a class="pill pill-primary pill-lg" href="settings\.html"><span class="i18n" lang="en">Open Settings →</);
  assert.ok(!open.includes('protected either way') && !open.includes('Protection is on'));

  for (const extra of [{}, { shared: true }] as const) {
    const unknown = thisWeek(render(index([entry('before', '2026-09-17T08:00:00Z')], extra)));
    assert.ok(!unknown.includes('class="guide') && !unknown.includes('protected either way'), 'nothing claimed either way');
  }
});

// `codex-blocks-too` CK12, decided by the maintainer on 2026-09-30: a stop is agentwhy's own fact, so a record with gaps in
// which agentwhy stopped a read and nothing was reached says Stopped; amended 2026-10-05, so does one beside a name seen.
test('a record with gaps where agentwhy stopped a read says Stopped, beside a name seen too', () => {
  const stopped = entry('stopped', '2026-09-23T08:00:00Z', STOPPED, [], { provider: 'codex' });
  const partial = { ...stopped, report: { ...stopped.report, incomplete: true } } as IndexEntry;
  const alsoNamed = entry('named', '2026-09-23T09:00:00Z', { ...STOPPED, filesReached: 1, namedByCall: 1 }, ['.env'], { provider: 'codex' });
  const both = { ...alsoNamed, report: { ...alsoNamed.report, incomplete: true, files: [{ path: '.env' as Redacted, kind: 'named' as const }] } } as IndexEntry;
  const page = english(render(index([partial, both])));

  assert.doesNotMatch(rowOf(page, 'stopped'), /Couldn’t check fully/);
  assert.match(rowOf(page, 'stopped'), /lang="en">Stopped</);
  // Amended 2026-10-05 by the maintainer: a stop outranks a name seen - the agent found the file, was stopped from opening
  // it, and the rule held. Listed with the rest, as any Stopped is.
  // A row holds spans alone, so its first `</div>` closes it; the slice past it is the next section.
  const named = rowOf(page, 'named').slice(0, rowOf(page, 'named').indexOf('</div>'));
  assert.match(named, /lang="en">Stopped</);
  assert.doesNotMatch(named, /Couldn’t check fully|Only saw a name/);
  assert.doesNotMatch(page, /<section class="cw-need cw-unchecked"/, 'nothing is listed apart');
});

// `everything-on-this-computer.md` step 2: on the computer's page a row names the project it was held in, beside its AI,
// where it is on hover - and it can be searched for by it. A project's own page names none: every row is its own.
test('a row of the computer’s page names its project, and a project’s own page names none', () => {
  const page = render(index([
    entry('in-app', '2026-09-23T08:00:00Z', ZERO, [], { project: { id: '-my-app', name: 'my-app', place: '~/Projects/my-app' } }),
    entry('in-blog', '2026-09-23T09:00:00Z', ZERO, [], { provider: 'codex', project: { id: '-blog', name: 'blog' } }),
  ], { scope: 'computer' }));
  assert.match(rowOf(page, 'in-app'), /<span class="cw-ai"><span class="tag tag-grey tag-badge">Claude Code<\/span> <span class="cw-project" title="~\/Projects\/my-app"><span class="tag tag-grey tag-badge tag-outlined">my-app<\/span><\/span><\/span>/);
  assert.match(rowOf(page, 'in-blog'), /<span class="cw-project"><span class="tag tag-grey tag-badge tag-outlined">blog<\/span><\/span>/, 'no place, no hover');
  assert.match(rowOf(page, 'in-app'), /data-search="[^"]* my-app"/);

  assert.doesNotMatch(render(index([entry('own', '2026-09-23T08:00:00Z')])), /class="cw-project"/);
});

// The maintainer, 2026-10-07: "jak mam napis Opening the files… dodaj tam loader fajny, a nie napis" - the files window
// opens on the shape of its table, shimmering, and the words stay for a screen reader alone.
test('the files window opens on a shimmering table, its words left for a screen reader', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env'])]));
  assert.match(page, /<div class="cwf-loading" data-files-loading role="status"><span class="sr-only"><span class="i18n" lang="en">Opening the files…<\/span>/);
  assert.match(page, /<div class="cwf-skel" aria-hidden="true">(<span><\/span>){5}<\/div>/);
  assert.match(page, /@keyframes cwfShimmer/);
  assert.match(page, /@media \(prefers-reduced-motion:reduce\)\{\.cwf-skel span\{animation:none\}\}/, 'still where motion is unwelcome');
});

// The maintainer, 2026-10-07: under "Couldn't check fully", why - the two reasons that matter most, or that its AI writes
// down not every step where nothing of the conversation's own is missing. No other row says it.
test('a row that could not be checked fully says why, in two reasons at most', () => {
  const unchecked = (name: string, provider: 'codex' | 'claude-code', gaps: NonNullable<Extract<IndexEntry['report'], { kind: 'generated' }>['gaps']>): IndexEntry => {
    const base = entry(name, '2026-09-23T08:00:00Z', ZERO, [], { provider });
    return { ...base, report: { ...base.report, incomplete: true, gaps } } as IndexEntry;
  };
  const page = english(render(index([
    unchecked('own', 'codex', { unread: 3, unsure: 1, unlinked: 2 }),
    unchecked('format', 'codex', { format: true }),
    unchecked('one', 'claude-code', { noResult: 1 }),
  ])));
  assert.match(rowOf(page, 'own'), /<span class="cw-why"><span class="i18n" lang="en">3 commands ran, and the record doesn’t say what they reached<\/span><span aria-hidden="true"> · <\/span><span class="i18n" lang="en">1 output not known to be whole<\/span><\/span>/);
  assert.doesNotMatch(rowOf(page, 'own'), /matched to their step/, 'two at most');
  assert.match(rowOf(page, 'format'), /lang="en">Codex doesn’t write down every step</);
  assert.match(rowOf(page, 'one'), /lang="en">1 step has no result</);
  assert.doesNotMatch(english(render(index([entry('clean', '2026-09-23T08:00:00Z')]))), /class="cw-why"/);
});
