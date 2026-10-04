// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PROJECT_LIST_STYLE, projectList, type ProjectListRow } from '../../../../src/report/render/ui/project-list.ts';

const NOW = Date.parse('2026-09-28T14:00:00Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const row = (extra: Partial<ProjectListRow> = {}): ProjectListRow => ({
  id: '-Users-someone-Projects-shop',
  name: 'shop',
  place: '~/Projects/shop',
  folder: 'there',
  conversations: 12,
  newest: { modifiedAt: NOW - 2 * HOUR, entryPoint: 'editor' },
  setUp: true,
  current: false,
  ...extra,
});

const list = (rows: readonly ProjectListRow[], extra: { unreadable?: number; temporary?: number; action?: (one: ProjectListRow) => string } = {}): string =>
  projectList({ rows, unreadable: extra.unreadable ?? 0, ...(extra.temporary === undefined ? {} : { temporary: extra.temporary }), now: NOW, timeZone: 'UTC', ...(extra.action === undefined ? {} : { action: extra.action }) });

const en = (text: string): string => `<span class="i18n" lang="en">${text}</span>`;

// which-project V10, as the maintainer's design of 2026-09-28 draws it.
test('the project shown stands on its own under "You’re here now", and the others share one table', () => {
  const html = list([row({ id: 'b', name: 'blog', setUp: false }), row({ id: 'a', name: 'shop', current: true })]);
  const [here, others] = html.split('<div class="pjl-table">');
  assert.ok(here?.includes(en('You’re here now')) && here.includes('<div class="pjl-here pjl-here-set">') && here.includes('>shop</span>'));
  assert.ok(here?.includes(en('Other projects · newest first')), 'the table is headed');
  assert.ok(others?.includes(en('Project')) && others.includes(en('Status')) && others.includes('>blog</span>'));
  assert.ok(!others?.includes('>shop</span>'), 'the project shown is not in the table too');
});

test('a row says when it was last used and how many AI chats it has; where it is, whole, on hover', () => {
  const html = list([row()]);
  assert.match(html, /<span class="pjl-name" title="~\/Projects\/shop">shop<\/span>/);
  assert.ok(html.includes(en('Last used 2 hours ago')) && html.includes(en('12 AI chats')));
});

test('last used is said as near as it is: just now, minutes, hours, yesterday, then the day', () => {
  const at = (ago: number): string => list([row({ newest: { modifiedAt: NOW - ago } })]);
  assert.ok(at(20_000).includes(en('Last used just now')));
  assert.ok(at(1 * MINUTE).includes(en('Last used 1 minute ago')) && at(25 * MINUTE).includes(en('Last used 25 minutes ago')));
  assert.ok(at(1 * HOUR).includes(en('Last used 1 hour ago')) && at(13 * HOUR).includes(en('Last used 13 hours ago')));
  assert.ok(at(20 * HOUR).includes(en('Last used yesterday')), 'the day before, in the page\'s clock');
  assert.ok(list([row({ newest: { modifiedAt: Date.parse('2026-09-21T09:30:00Z') } })]).includes(en('Last used Mon, Sep 21')));
  assert.ok(at(3 * HOUR).includes('<span class="i18n" lang="pl">Ostatnio 3 godziny temu</span>'), 'Polish counts hours in three forms');
  assert.ok(at(5 * HOUR).includes('<span class="i18n" lang="pl">Ostatnio 5 godzin temu</span>'));
});

// V10: set up, never protected - the list knows whether agentwhy runs there, not what each file is set to.
test('set up is mint, not set up yet is amber, and a state not known is not said', () => {
  assert.match(list([row()]), /<span class="pjl-status"><span class="tag tag-mint tag-sm">/);
  assert.match(list([row({ setUp: false })]), /<span class="pjl-status"><span class="tag tag-amber tag-sm">.*Not set up yet/);
  const { setUp: _known, ...unread } = row();
  assert.ok(list([unread]).includes('<span class="pjl-status"></span>'));
  assert.ok(!list([row(), row({ setUp: false })]).includes('Protected'));
});

test('a project shown that is not set up does not stand out in mint', () => {
  assert.ok(list([row({ current: true, setUp: false })]).includes('<div class="pjl-here">'));
});

test('folders that are gone are folded into one line at the table’s foot, and offer nothing', () => {
  const called: string[] = [];
  const html = list([row({ id: 'a', name: 'blog' }), row({ id: 'g', name: 'old', folder: 'gone' })], { action: (one) => { called.push(one.name); return '<button>Open</button>'; } });
  assert.match(html, /<details class="pjl-gone"><summary class="pjl-gone-line">/);
  assert.ok(html.includes(en('1 project can’t be found anymore')) && html.includes(en('This folder isn’t there anymore')));
  assert.deepEqual(called, ['blog'], 'the action is asked of the folders that are there');
  assert.ok(!/<details class="pjl-gone">.*<button>Open<\/button>/.test(html));
});

// which-project V10b: a folder not looked at is not gone - it offers what any row offers - and nothing is said of it.
test('a folder not looked at is listed among the others, offers the way to it, and has no status', () => {
  const { setUp: _known, ...notLooked } = row({ id: 'b', name: 'notes', folder: 'not-looked' });
  const html = list([row({ id: 'a', name: 'shop', current: true }), notLooked], { action: (one) => `<a data-switch="${one.id}">Open</a>` });
  const notes = /<li class="pjl-row"[^>]*data-search="notes[^"]*">[\s\S]*?<\/li>/.exec(html)?.[0] ?? '';
  assert.match(notes, /<a data-switch="b">Open<\/a>/);
  assert.match(notes, /<span class="pjl-status"><\/span>/);
  assert.doesNotMatch(html, /isn’t there anymore|can’t be found/, 'it is not taken for a folder that is gone');
});

test('the page decides what a row offers, beside its status', () => {
  const html = list([row({ name: 'blog' })], { action: (one) => `<button data-id="${one.id}">Open</button>` });
  assert.match(html, /<span class="pjl-action"><button data-id="-Users-someone-Projects-shop">Open<\/button><\/span>/);
  assert.ok(list([row()]).includes('<span class="pjl-action"></span>'), 'nothing where the page offers nothing');
});

// Invariant 1: a folder's name and place are the person's own words, escaped on the page.
test('a folder name and place are escaped', () => {
  const html = list([row({ name: '<b>x', place: '"><img src=x>' })]);
  assert.ok(!html.includes('<img') && !html.includes('<b>x'));
  assert.ok(html.includes('&lt;b&gt;x') && html.includes('&quot;&gt;&lt;img'));
});

test('thirty others at most, then how many older, then how many could not be read; with none, it is said', () => {
  const rows = Array.from({ length: 33 }, (_, at) => row({ id: `p${at}`, name: `p${at}`, newest: { modifiedAt: NOW - at * HOUR } }));
  const html = list(rows, { unreadable: 2 });
  assert.equal(html.match(/<li class="pjl-row" /g)?.length, 30);
  assert.ok(html.includes(en('3 older projects')) && html.includes(en('2 more projects couldn’t be read.')));
  assert.ok(list([row({ current: true })]).includes(en('No other projects yet. Work with Claude Code or Codex in another folder, and it shows up here.')));
  assert.ok(!list([row()]).includes(en('You’re here now')), 'a run in no project shows no project as here');
});

test('projects in the computer\'s temporary space are counted under the list, never listed', () => {
  assert.ok(list([row()], { temporary: 2 }).includes(en('Hidden: 2 temporary folders')));
  assert.ok(!list([row()]).includes('Hidden:'));
});

// V11, the maintainer's design: the step's rows - a radio first, and where the folder lies.
test('the step\'s rows name the folder a project lies in - the home folder by name - and offer no action', () => {
  const html = projectList({ rows: [row({ place: '~/shop' }), row({ id: 'b', name: 'blog', place: '/srv/sites/blog' })], unreadable: 0, now: NOW, timeZone: 'UTC', pick: 'g', action: () => '<button>Open</button>' });
  assert.ok(html.includes(en('in your home folder')) && html.includes(en('in /srv/sites')));
  assert.ok(!html.includes('<button>Open</button>'), 'a radio in place of what the window offers');
  assert.match(html, /<label class="pjl-pick"><input type="radio" class="pjl-radio-input" name="g" value="b"/);
});

// The maintainer, 2026-09-29: the row chosen is mint - choosing a project is safe; coral read as a warning.
test('the step\'s row chosen is drawn in mint, never coral', () => {
  assert.match(PROJECT_LIST_STYLE, /\.pjl-radio-input:checked\+\.pjl-radio \.pjl-radio-dot\{background:var\(--mint\)/);
  assert.match(PROJECT_LIST_STYLE, /\.pjl-pick-here:has\(:checked\)\{border-color:var\(--mint-50\)\}/);
  assert.doesNotMatch(PROJECT_LIST_STYLE, /:checked[^{]*\{[^}]*coral/);
});
