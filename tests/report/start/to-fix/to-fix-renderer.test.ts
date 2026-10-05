// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { CheckRow, HistoryLine, IndexCheck } from '../../../../src/report/check/check-lines.ts';
import type { FileStory } from '../../../../src/report/render/report-page/file-story.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { ToFixRenderer } from '../../../../src/report/start/to-fix/to-fix-renderer.ts';

// `.ai/plans/2026-09-23-to-fix-redesign.md`, steps 3 and 5: the To fix page, and what its spec's §6 asks of it.

const NOW = Date.parse('2026-09-23T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];

const entry = (name: string, at: string): IndexEntry => ({
  provider: 'claude-code',
  name, title: ('Asked in ' + name) as Redacted, modifiedAt: Date.parse(at), delegations: 0,
  report: { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] },
});
const row = (label: CheckRow['label'], path: string, sessions: readonly string[], extra: Partial<CheckRow> = {}): CheckRow =>
  ({ label, path: path as Redacted, sessions, ...extra });
const line = (path: string, note?: string): HistoryLine =>
  ({ path, label: 'rotate', result: 'rotated', at: Date.parse('2026-09-18T10:00:00Z'), sessions: [], status: 'standing', reopened: false, ...(note === undefined ? {} : { note }) });

const CHECK: IndexCheck = {
  rows: [
    row('rotate', '.env', ['a', 'b'], { reopened: { result: 'rotated', at: Date.parse('2026-09-19T12:00:00Z') } }),
    row('template', '.env.example', ['a']),
    row('result', '.env.local', ['b']),
  ],
  refusedAttempts: 1,
  history: [line('.env.production', 'New keys in Stripe')],
};

function page(check: IndexCheck = CHECK, extra: Partial<SessionIndex> = {}): string {
  const index: SessionIndex = {
    now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', project: '/Users/someone/projects/demo-shop', shared: false,
    widen: 'agentwhy start --since 14d', entries: [entry('a', '2026-09-23T09:59:00Z'), entry('b', '2026-09-22T15:37:00Z')],
    settings: { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' } },
    check,
    ...extra,
  };
  return new ToFixRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' }).render(index);
}

/** The English text a person reads, outside the developer details, the windows, styles and scripts. */
function readable(html: string): string {
  return html
    .replace(/<details class="tf-dev">[\s\S]*?<\/details>/, '')
    .replace(/<dialog[\s\S]*?<\/dialog>/g, '')
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

/** One window, from its opening tag to its end. */
function windowOf(html: string, id: string): string {
  const start = html.lastIndexOf('<dialog', html.indexOf('id="' + id + '"'));
  return html.slice(start, html.indexOf('</dialog>', start));
}

test('T1-T3: the page says how many, where to start, and that the protection held', () => {
  const html = page();
  const text = readable(html);
  assert.match(text, /Last 7 days · Sep 16 – 23/);
  assert.match(text, /2 files to fix\. Start with the 1 with real keys\./);
  assert.match(text, /To fix 2 Done 1/);
  assert.match(text, /Your protection worked: 1 try was stopped\./);
  assert.match(html, /<a class="sb-item sb-active" href="to-fix.html" aria-current="page">/);
  assert.match(html, /<main class="shell-main shell-list"/);
});

test('T4-T7: two groups of cards, each opening its file\'s window, and the names only seen folded', () => {
  const html = page();
  const text = readable(html);
  assert.match(text, /Change these keys 1 Your AI read the real keys inside\. Make new ones\. Passwords and keys Back again \.env in 2 conversations What happened Fix it →/);
  assert.match(text, /Take a quick look 1 .* \.env\.example in 1 conversation What happened Check it/);
  // The card opens Fix it; "What happened" is a control of its own, above the card's link.
  assert.match(html, /<a class="tc-link" href="#fix-0" data-popup-open="fix-0"/);
  assert.match(html, /<span class="tc-details tc-over"><a class="pill pill-secondary[^"]*" href="#story-0" data-popup-open="story-0">/);
  assert.match(html, /<details class="fold">[\s\S]*1 file — nothing to do\.[\s\S]*\.env\.local[\s\S]*Only saw the name/);
});

test('T11-T14: Fix it is the report page\'s wizard, with the conversations under Now fixing and the note before Done', () => {
  const html = page();
  const outside = html.replace(/<dialog[\s\S]*?<\/dialog>|<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(outside, /data-wz-next|data-wz-skip|data-fix-unmark/);
  const window = windowOf(html, 'fix-0');
  assert.match(window, /^<dialog class="pp pp-wizard" id="fix-0" aria-labelledby="fix-0-title">/);
  assert.match(window, /<div class="wz" data-wizard data-kind="keys" data-item="0" data-path="\.env" data-since="7d">/);
  assert.match(window, /File 1 of 2[\s\S]*Now fixing/);
  assert.match(window, /It’s back\.<\/strong> You marked it fixed on Sat, Sep 19\./);
  assert.match(window, /<details class="wz-where"><summary class="wz-where-toggle"><span class="i18n" lang="en">Where your AI read it · in 2 conversations/);
  // The note is typed in the last step, the one that writes the mark.
  assert.match(window, /data-step="2"[\s\S]*data-wz-note[\s\S]*?<\/section>[\s\S]*data-step="3"/);
  // T14: a file a key was read from is closed as rotated only; a sample file may also be closed as no real keys.
  assert.doesNotMatch(window, /data-wz-skip/);
  assert.match(windowOf(html, 'fix-1'), /data-wz-skip="not-secret"/);
  assert.match(html, /<div id="wizard-words" data-served="auto" hidden>/);
  assert.doesNotMatch(html, /<dialog class="dr"/, 'no drawer any more');
  assert.match(html, /<dialog class="pp pp-confirm" id="fix-undo-0"[\s\S]*?data-fix-unmark="\{&quot;path&quot;:&quot;\.env\.production&quot;\}"/);
});

test('T11a: What happened is the report page\'s window, told from the newest conversation that read the file', () => {
  const agent = { index: 0, actions: 3 };
  const story: FileStory = {
    entries: [{ agent, kind: 'read', count: 1, did: 'Read' as Redacted, outcome: 'succeeded', evidence: ['main:1' as Redacted] }],
    holders: [{ agent, read: true, changed: false, passed: false, saved: false, repeated: false, used: false, stopped: false }],
    readers: 1, opened: 1, stopped: 0, complete: true, traced: true,
  };
  const told = (name: string, at: string): IndexEntry => {
    const base = entry(name, at);
    return { ...base, report: { ...base.report, kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false,
      stories: { sessionId: ('session-' + name) as Redacted, files: new Map([['.env', story]]) } } };
  };
  const html = page(CHECK, { entries: [told('a', '2026-09-23T09:59:00Z'), told('b', '2026-09-22T15:37:00Z')] });
  const window = windowOf(html, 'story-0');
  assert.match(window, /^<dialog class="pp pp-wide" id="story-0"/);
  assert.match(window, /What happened to this file/);
  assert.match(window, /From your newest conversation that read it: “Asked in a” · Today, 09:59\. It was read in 1 more - see Conversations\./);
  // The same tabs as the report's, then every conversation.
  assert.match(window, /The story[\s\S]*Diagram[\s\S]*Full record[\s\S]*Conversations<\/span>[\s\S]*?<span class="tf-tab-count">2<\/span>/);
  assert.match(window, /session-a/, 'the record names the newest conversation');
  assert.doesNotMatch(window, /session-b/);
  assert.match(window, /href="#fix-0" data-popup-open="fix-0"/);
});

// Found by the maintainer (2026-09-24): the Diagram drew nothing, and Show all opened nothing.
test('T11a, T15: the Diagram has its boxes, lines and script, and Show all opens the list it sits under', () => {
  const many = Array.from({ length: 8 }, (_unused, at) => entry('c' + at, '2026-09-2' + (at % 3 + 1) + 'T0' + at + ':00:00Z'));
  const html = page({ rows: [row('rotate', '.env', many.map((each) => each.name))], refusedAttempts: 0 }, { entries: many });
  assert.match(html, /\.hd-board\{/, 'the diagram\'s boxes and lines are styled');
  assert.match(html, /querySelectorAll\('\[data-diagram\]'\)/, 'and lit by the diagram\'s script');
  const selector = /const section = all\.closest\('\.([\w-]+)'\)/.exec(html)?.[1];
  assert.equal(selector, 'tf-where-block');
  // Every Show all sits inside the list the script opens, wherever the list is drawn.
  const buttons = html.replace(/<script>[\s\S]*?<\/script>/g, '').match(/data-fix-all>/g)?.length ?? 0;
  assert.ok(buttons >= 2);
  assert.equal(html.match(/<div class="tf-where-block"><ul class="tf-where" data-fix-where>(?:(?!<div class="tf-where-block">)[\s\S])*?<div class="tf-where-foot"><button type="button" class="tf-all js-only" data-fix-all>/g)?.length, buttons);
});

test('T11a: a file no report could tell falls back to what the index knows', () => {
  const window = windowOf(page(), 'story-0');
  assert.match(window, /^<dialog class="pp pp-small" id="story-0"/);
  assert.match(window, /What your AI did[\s\S]*It opened this file and read the keys inside\./);
  assert.match(window, /Where your AI read it[\s\S]*Asked in a/);
  assert.match(window, /href="#fix-0" data-popup-open="fix-0" data-fix-from><span class="i18n" lang="en">Fix it →/);
});

test('T13: what every conversation read from a file names its service and its lines, never a value', () => {
  const html = page({
    rows: [row('rotate', '.env', ['a', 'b'], {
      keyed: true,
      read: { keys: ['stripe-key' as Redacted], names: ['STRIPE_SECRET_KEY' as Redacted, 'NODE_ENV' as Redacted], keyed: [{ name: 'STRIPE_SECRET_KEY' as Redacted, key: 'stripe-key' as Redacted }] },
    })],
    refusedAttempts: 0,
  });
  const window = windowOf(html, 'fix-0');
  assert.match(window, /Stripe/);
  assert.match(window, /<span class="wz-env-key">STRIPE_SECRET_KEY<\/span>/);
  assert.doesNotMatch(window, /<span class="wz-env-key">NODE_ENV<\/span>/, 'only the lines that held a key');
});

test('T15: a file\'s conversations, newest first, each leading to its report', () => {
  const window = windowOf(page(), 'fix-0');
  assert.ok(window.indexOf('Asked in a') < window.indexOf('Asked in b'), 'newest first');
  assert.match(window, /Today<\/span>[\s\S]*09:59/);
  assert.match(window, /<a class="pill pill-outline pill-md" href="a.html">/);
});

test('a path and a note from the record are escaped wherever they are written', () => {
  const html = page({
    rows: [row('rotate', 'x"><img src=y>.env', ['a'])],
    refusedAttempts: 0,
    history: [line('.env.test', '"><script>alert(1)</script>')],
  });
  assert.ok(!html.includes('<img src=y>'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /x&quot;&gt;&lt;img src=y&gt;\.env/);
});

test('T19: a shared page carries no note and no control that writes', () => {
  const html = page(CHECK, { shared: true });
  assert.doesNotMatch(html, /New keys in Stripe/);
  assert.doesNotMatch(html.replace(/<script>[\s\S]*?<\/script>|<style>[\s\S]*?<\/style>/g, ''), /data-wz-note|data-wz-skip|data-fix-unmark|tf-undo/);
  assert.match(windowOf(html, 'fix-0'), /data-wizard[^>]* data-shared/, 'the wizard writes nothing and hands over no command');
});

test('T18: with no script, both tabs are on the page under their headings', () => {
  const html = page();
  assert.equal(html.match(/<h3 class="tabs-fallback">/g)?.length, 2);
  assert.match(html, /\.js \.tf-where-row\.tf-more\{display:none\}/, 'only a script folds the older conversations');
});

test('T2: nothing left to fix is said in mint, and the empty lists say so', () => {
  const html = page({ rows: [], refusedAttempts: 0, history: [] });
  assert.match(readable(html), /Nothing left to fix\. Nice work\./);
  assert.match(html, /<p class="hero-action hero-calm"/);
  assert.match(readable(html), /Nothing marked yet\./);
  assert.doesNotMatch(readable(html), /Your protection worked/);
});

test('T21-T23: the page speaks the glossary, and names no service for a file', () => {
  const text = readable(page()).toLowerCase();
  assert.doesNotMatch(text, /sensitive|rotate|session/);
  assert.doesNotMatch(text, /supabase\.com|dashboard\.stripe/);
});

// Found by review (2026-09-24).
test('the row of tabs switches its pills with the protection pill beside it, and the developer details speak the CLI\'s words', () => {
  const html = page(CHECK);
  assert.match(html, /<div class="tabs-top"><div class="tabs-bar tabs-state js-only"[\s\S]*?<span class="tf-stopped">/);
  assert.match(html, /:scope > \.tabs-top > \.tabs-bar \[data-tab\]/, 'the kit\'s script finds the pills under the aside');
  const details = developerDetails(html);
  assert.match(details, /<span class="tf-dev-label">IN RESULT<\/span><span class="tf-dev-means">.*?name in command output only/);
  assert.doesNotMatch(details, />ROUTE</);
});

/** The developer details, from their opening tag to their end. */
function developerDetails(html: string): string {
  const start = html.indexOf('<details class="tf-dev">');
  return html.slice(start, html.indexOf('</details>', start));
}

// Found by the maintainer (2026-09-28): a column of bare session ids, broken mid-id, read as the values that leaked.
test('T16: the developer details name each column, say what a label means, and shorten the conversations behind a count', () => {
  const ids = ['2dfbb31d-3cb5-486e-9005-196ab6d6c053', 'c7534d9f-b229-4167-9df3-2b63b7e6f6b2', 'b7cb8a7c-6979-446f-8026-90e2767d0d8f', '98bdc8b6-053c-4b2d-8bb0-16c4fd39844f', 'fdfa8804-d3d1-4958-9e51-a50e85e9eb65'];
  const html = page({ rows: [row('result', '.env.local', ids)], refusedAttempts: 0, history: [] }, {
    entries: ids.map((id, at) => entry(id, '2026-09-2' + (at + 1) + 'T10:00:00Z')),
  });
  const details = developerDetails(html);
  assert.match(details, /What check says.*File.*Conversations/s);
  assert.match(details, /No key or password is shown here\./);
  assert.match(details, /<span class="tf-dev-count">(<span class="i18n" lang="en">)?5 conversations/);
  // Each id is its first 8 characters, with the whole id as its tooltip; the newest two are shown and the rest fold.
  assert.match(details, /<span class="chip" title="fdfa8804-d3d1-4958-9e51-a50e85e9eb65">fdfa8804<\/span>/);
  assert.match(details, /<span class="chip chip-extra" title="2dfbb31d-3cb5-486e-9005-196ab6d6c053">2dfbb31d<\/span>/);
  assert.doesNotMatch(details, />2dfbb31d-3cb5/);
  assert.equal(details.match(/class="chip chip-extra"/g)?.length, 3);
  assert.match(details, /\+3 more/);
  assert.match(details, /Every line, with its paths and what to do about them<\/span>.*?<code>agentwhy check --full --since 7d<\/code>/s);
});

test('T16: a shared page names its conversations by their place in the list, and says so', () => {
  const html = page(CHECK, { shared: true, entries: [entry('Session 1', '2026-09-23T09:59:00Z'), entry('Session 2', '2026-09-22T15:37:00Z')], check: {
    ...CHECK, rows: CHECK.rows.map((each) => ({ ...each, sessions: each.sessions.map((name) => (name === 'a' ? 'Session 1' : 'Session 2')) })),
  } });
  const details = developerDetails(html);
  assert.match(details, /numbered as in the list/);
  assert.match(details, /<span class="chip" title="Session 1">Session 1<\/span>/);
});

test('a command handed over from a page opened as a file reads the same range as the page', () => {
  const html = page(CHECK, { asked: '30d' });
  assert.match(windowOf(html, 'fix-0'), /data-since="30d"/);
  assert.match(html, /' --since ' \+ quoted\(since\)/);
});
