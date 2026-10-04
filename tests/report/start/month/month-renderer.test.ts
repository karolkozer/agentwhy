// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { MonthRenderer } from '../../../../src/report/start/month/month-renderer.ts';

const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const READ: Tally = { ...ZERO, contentsSeen: 1, filesReached: 1, namedByCall: 1 };

function entry(name: string, at: string, tally: Tally = ZERO, files: readonly string[] = []): IndexEntry {
  return {
    provider: 'claude-code',
    name,
    title: ('Asked in ' + name) as Redacted,
    modifiedAt: Date.parse(at),
    delegations: 1,
    report: { kind: 'generated', file: name + '.html', tally, incomplete: false, files: files.map((path) => ({ path: path as Redacted, kind: 'seen' as const })) },
  };
}

function index(entries: readonly IndexEntry[], extra: Partial<SessionIndex> = {}): SessionIndex {
  return {
    now: NOW, timeZone: 'UTC', since: NOW - 120 * 86_400_000, asked: '120d', project: '/Users/someone/projects/demo-shop', shared: false,
    widen: 'agentwhy start --since 240d', entries, settings: { level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' } }, ...extra,
  };
}

const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' };
const render = (model: SessionIndex): string => new MonthRenderer(LINKS).render(model);

/** The one period section of the page whose id is given. */
function section(page: string, id: string): string {
  const at = page.indexOf('id="' + id + '"');
  assert.ok(at > 0, id + ' is on the page');
  const next = /<section class="cw( cw-current)?" id=/.exec(page.slice(at));
  return page.slice(at, next === null ? undefined : at + next.index);
}

// F8, read for a month: the heading is the answer.
test('the heading names the month and answers how many times the AI worked and read something private', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z', READ, ['.env']), entry('b', '2026-09-02T08:00:00Z')]));
  assert.match(page, /<title>This month · agentwhy<\/title>/);
  assert.match(page, /lang="en">This month · September 2026</);
  assert.match(page, /lang="en">Your AI worked for you 2 times\./);
  assert.match(page, /lang="en">Once it read something private\./);
  assert.match(page, /lang="pl">Ten miesiąc · Wrzesień 2026</);
  assert.match(page, /lang="de">Dieser Monat · September 2026</);
});

test('a month with no work says so', () => {
  const page = render(index([entry('old', '2026-07-10T08:00:00Z')]));
  assert.match(section(page, 'month-0'), /lang="en">Your AI didn’t work for you this month\./);
});

// T7: the month carries no ✦ card; its lists say where to start (maintainer, 2026-09-23).
test('the month has no guide card, whether or not there is something to fix', () => {
  const page = render(index([entry('bad', '2026-09-15T13:44:00Z', READ, ['.env']), entry('old', '2026-07-10T08:00:00Z')]));
  assert.doesNotMatch(page, /class="guide /);
  assert.doesNotMatch(page, /Start with/);
});

// F11, as a calendar: Monday first, one tile per day, the days before the 1st left blank.
test('the month is a calendar: weekday heads, blanks before the 1st, and one tile per day', () => {
  const page = render(index([entry('a', '2026-09-14T08:00:00Z', READ, ['.env']), entry('b', '2026-09-14T09:00:00Z')]));
  const now = section(page, 'month-0');
  const grid = now.slice(now.indexOf('<div class="mv-grid">'));
  assert.match(now, /<div class="mv-head" aria-hidden="true"><span><span class="i18n" lang="en">Mon<\/span>/, 'the week starts on Monday');
  assert.match(grid, /^<div class="mv-grid"><span class="mv-blank" aria-hidden="true"><\/span><button/, 'September 2026 opens on a Tuesday');
  assert.equal((grid.match(/<(a|button type="button") class="cw-day /g) ?? []).length, 30, 'September has thirty days');
  assert.match(grid, /<a class="cw-day cw-day-bad" data-day="(\d+)" href="#day-\1" data-popup-open="day-\1"><span class="cw-day-label">14<\/span><span class="cw-day-count">2<\/span>/,
    'a day with work opens its window, and is a link to it with no script');
  assert.match(grid, /lang="en">1 to check</);
  assert.match(grid, /class="cw-day cw-day-none" data-day="\d+" disabled><span class="cw-day-label">13</, 'a day with no work cannot be chosen');
  assert.match(grid, /class="cw-day cw-day-future" data-day="\d+" disabled><span class="cw-day-label">24</, 'a day still ahead says nothing');
  assert.match(grid, /<span class="cw-day-name" hidden><span class="i18n" lang="en">Mon, Sep 14<\/span>/, 'the chip names the whole day');
});

// T4: a month opens whole, even on a day that holds a conversation.
test('the month opens whole, never on today', () => {
  const page = render(index([entry('today', '2026-09-23T08:00:00Z')]));
  assert.match(page, /<section class="cw cw-current" id="month-0" data-period-at="0" data-kind="month" data-first="20697">/, '1 September 2026 is day 20697');
  assert.ok(!page.includes('data-today'));
});

// F10, for months: every month with a conversation is on the page; the switcher's steps are links.
test('every month with a conversation is on the page, and the switcher steps between them with no script', () => {
  const page = render(index([entry('now', '2026-09-23T08:00:00Z'), entry('then', '2026-06-08T08:00:00Z')]));
  assert.match(page, /<section class="cw" id="month-3" data-period-at="1" data-kind="month" data-first="\d+">/);
  assert.match(page, /lang="en">3 months ago · June 2026</);
  assert.match(page, /<a class="cw-step" href="#month-3" data-period-go="1"/);
  assert.match(section(page, 'month-3'), /<a class="text-link" href="#month-0" data-period-go="0"><span class="i18n" lang="en">Back to this month</);
  assert.match(page, /<button type="button" class="cw-switch-label" data-period-pick data-label-en="Choose a month"/);
});

// T8: nothing is listed under the calendar; a day's conversations are in its window.
test('the month draws no lists under the calendar', () => {
  const page = render(index([entry('bad', '2026-09-10T08:00:00Z', READ, ['.env']), entry('fine', '2026-09-11T08:00:00Z')]));
  assert.doesNotMatch(page, /<section class="cw-need"|<section class="cw-others"|<input type="checkbox" id="conv-tech"/);
  assert.equal((page.match(/<div class="dt-row/g) ?? []).length, 2, 'each conversation once, in its day\u2019s window');
});

test('the sidebar marks This month, and every page it leads to', () => {
  const page = render(index([entry('a', '2026-09-23T08:00:00Z')]));
  assert.match(page, /<a class="sb-item sb-active" href="month\.html" aria-current="page"/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /href="settings\.html"/);
});

// T5: a day opens in a wide window in the middle of the page (maintainer, 2026-09-23: not a drawer from the side).
test('a day opens in a wide window that lists its conversations, those to fix first', () => {
  const page = render(index([
    entry('fine', '2026-09-14T09:00:00Z'), entry('bad', '2026-09-14T08:00:00Z', READ, ['.env']), entry('other', '2026-09-15T08:00:00Z'),
  ]));
  const at = page.indexOf('<dialog class="pp pp-wide" id="day-20710"');
  assert.ok(at > 0, 'Monday 14 September 2026 is day 20710');
  const window = page.slice(at, page.indexOf('</dialog>', at));
  assert.match(window, /aria-labelledby="day-20710-title"/);
  assert.match(window, /id="day-20710-title"><span class="i18n" lang="en">Mon, Sep 14</);
  assert.match(window, /lang="en">2 conversations · 1 to check</);
  assert.match(window, /class="mv-pp-dot mv-pp-dot-coral"/);
  assert.match(window, /look-coral[\s\S]*?<b>1<\/b>/, 'the count by look, as the tile\u2019s summary gives it');
  assert.match(window, /data-popup-close/, 'it closes from inside');
  assert.ok(window.indexOf('Asked in bad') < window.indexOf('Asked in fine'), 'what needs fixing comes first');
  assert.ok(!window.includes('Asked in other'), 'only that day');
  assert.match(page, /<dialog class="pp pp-wide" id="day-20711"[^>]*>[\s\S]*?lang="en">1 conversation · All good</);
  assert.ok(!page.includes('id="day-20709"'), 'a day with no work has no window');
  assert.match(page, /data-popup-open/, 'the window script is on the page');
});

// Found in use (2026-09-25): a day whose read was fixed said "All good" in mint, so the calendar hid when it happened (F11).
test('a day whose read was fixed says so in coral, ahead of the conversations not checked', () => {
  const page = render(index([
    entry('done', '2026-09-16T08:00:00Z', READ, ['.env']), { ...entry('old', '2026-09-16T09:00:00Z'), report: { kind: 'outside-range' } },
  ], { check: { rows: [], refusedAttempts: 0 } }));
  assert.match(page, /<a class="cw-day cw-day-fixed" data-day="20712"[^>]*><span class="cw-day-label">16<\/span><span class="cw-day-count">2<\/span>[\s\S]*?lang="en">1 read, fixed</);
  assert.match(page, /lang="pl">1 odczyt, naprawiony</);
  assert.match(page, /lang="de">1 gelesen, behoben</);
  const at = page.indexOf('<dialog class="pp pp-wide" id="day-20712"');
  const window = page.slice(at, page.indexOf('</dialog>', at));
  assert.match(window, /lang="en">2 conversations · 1 read, fixed</);
  assert.match(window, /class="mv-pp-dot mv-pp-dot-coral"/);
  assert.doesNotMatch(window, /All good/);
});

// T9: a tile with work says on hover how many conversations were in each look, in the rows' icons and words.
test('a day with work sums itself up on hover, by look, and a day with none has no summary', () => {
  const NAMED: Tally = { ...ZERO, filesReached: 1, onlyThroughResult: 1 };
  const BLOCKED: Tally = { ...ZERO, refusedAttempts: 1 };
  const page = render(index([
    entry('a', '2026-09-14T08:00:00Z', READ, ['.env']), entry('b', '2026-09-14T09:00:00Z', NAMED), entry('c', '2026-09-14T10:00:00Z', NAMED),
    entry('d', '2026-09-14T11:00:00Z', BLOCKED), entry('e', '2026-09-20T11:00:00Z'),
  ]));
  const tile = (page.match(/<a class="cw-day[^"]*" data-day="20710"[\s\S]*?<\/a>/) ?? [''])[0];
  const tip = tile.slice(tile.indexOf('<span class="mv-tip'));
  assert.match(tip, /^<span class="mv-tip mv-tip-start" aria-hidden="true">/, 'a Monday opens its summary inward');
  assert.match(tip, /lang="en">Mon, Sep 14 · 4 conversations</);
  assert.match(tip, /look-coral[\s\S]*?lang="en">Read private files<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)*<\/span><\/span><b>1<\/b>/);
  assert.match(tip, /look-blue[\s\S]*?lang="en">Only saw a name<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)*<\/span><\/span><b>2<\/b>/);
  assert.match(tip, /look-mint[\s\S]*?lang="en">Stopped<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)*<\/span><\/span><b>1<\/b>/);
  assert.doesNotMatch(tip, /Nothing private/, 'a look nobody was in is not listed');
  assert.match(tip, /lang="en">Click to see them</);
  assert.match(page, /data-day="20716"[^>]*>[\s\S]*?<span class="mv-tip mv-tip-end"/, 'a Sunday opens it inward from the right');
  assert.doesNotMatch((page.match(/data-day="20709"[\s\S]*?<\/button>/) ?? [''])[0], /mv-tip/, 'a day with no work has none');
});

// F6: every period is on the page with no script; the script only shows one at a time.
test('the page carries its script, and reads without it', () => {
  const page = render(index([entry('now', '2026-09-23T08:00:00Z'), entry('then', '2026-08-08T08:00:00Z')]));
  assert.match(page, /\.js \.cw:not\(\.cw-current\)\{display:none\}/);
  assert.match(page, /const periods = \[\.\.\.document\.querySelectorAll\('\[data-period-at\]'\)\]/);
  assert.match(page, /view: 'months'/, 'a month is chosen from a year of months');
  // The requests the page may make are to its own server: the language picked, for the line in the conversation
  // (the-agent-tells-you R29), and a conversation older than the run to check (F55).
  // And whether the page is still the version it was sent (live-pages L3), and a conversation's report, beside the
  // page, for the files window (F58).
  assert.deepEqual([...page.matchAll(/fetch\(([^,]+),/g)].map((call) => call[1]), ["'api/notify'", 'location.pathname', "'api/version/' + file", "'api/include'", 'report']);
  assert.doesNotMatch(page, /XMLHttpRequest|https?:\/\/(?!www\.w3\.org)/);
});

// F58, changed 2026-09-25: a day's window lists its conversations in Conversations' table, and a row's "See all {n}
// files" opens the page's one files window over it.
test('a day window lists its conversations as Conversations does, and opens every file of one in the files window', () => {
  const read = entry('now', '2026-09-23T08:00:00Z', READ, ['.env']);
  const page = render(index([{ ...read, report: { ...read.report, reached: 9 } } as IndexEntry]));
  const day = page.slice(page.indexOf('<dialog class="pp pp-wide" id="day-'), page.indexOf('</dialog>', page.indexOf('id="day-')));
  assert.match(day, /<div class="dt" role="table" data-conversations>/);
  assert.match(day, /lang="en">What happened</);
  assert.match(day, /<a class="cw-see" href="now\.html#files" data-all-files="now\.html"><span class="i18n" lang="en">See all 9 files →<\/span>/);
  assert.equal((page.match(/<dialog class="pp pp-wide" id="conv-files"/g) ?? []).length, 1, 'one files window on the page');
  assert.match(page, /window\.agentwhyFiles/, 'the window starts the Files view it shows');
});
