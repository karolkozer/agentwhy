// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IndexEverywhere, IndexHooks, IndexNotices, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { SettingsRenderer } from '../../../../src/report/start/settings/settings-renderer.ts';
import { settingsView } from '../../../../src/report/start/settings/settings-view.ts';
import { globalDefaults } from '../../../../src/setup/global-defaults.ts';

// `.ai/plans/2026-10-06-everything-on-this-computer.md` step 1, GD15, G13: the computer's Settings - the computer's rules,
// and the person's own answers for everywhere they work - and nothing of a project's.

const NOW = Date.parse('2026-10-06T10:00:00Z');
const HOOKS: IndexHooks = { watch: 'shared', refuse: 'shared', reads: { watch: 'shared', refuse: 'shared' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' };
const NOTICES: IndexNotices = {
  on: 'refused', clean: 'once', say: 'agent', notify: ['chat'],
  from: { on: 'everywhere', clean: 'default', say: 'default', notify: 'default' },
  path: '/Users/someone/.agentwhy/notices.json', unusable: false,
};
// The home folder's own settings, read as a project's would be - which the computer's page must not show as one.
const SETTINGS: IndexSettings = {
  level: 'no-read', protected: ['**/.ssh/**'], allowed: [], origin: { kind: 'default' }, hooks: HOOKS,
  mine: { '**/.ssh/**': { rule: './.ssh/**', file: 'shared', whole: true } }, held: { local: [], shared: ['**/.ssh/**'] }, told: { local: [], shared: [] }, notices: NOTICES,
};
const EVERYWHERE: IndexEverywhere = {
  rows: globalDefaults('darwin').map((row) => ({ ...row, present: true })),
  blocked: ['**/.ssh/**', '**/.aws/**'],
  told: ['**/Contracts/**'],
  codex: false,
};

function page(extra: Partial<SessionIndex> = {}): string {
  return new SettingsRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' }).render({
    now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', shared: false, widen: 'agentwhy start --since 14d', entries: [],
    settings: SETTINGS, everywhere: EVERYWHERE, scope: 'computer', onboarding: { intro: false }, ...extra,
  });
}

const english = (html: string): string => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
/** What the page draws: its own styles and scripts name every class and attribute it has. */
const drawn = (html: string): string => html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '');

test('the computer’s view holds the computer’s rows alone, and nothing of a project’s', () => {
  const view = settingsView(SETTINGS, EVERYWHERE, true);
  assert.deepEqual(view.rows.map((row) => [row.patterns[0], row.source, row.mode]), [
    ['**/.ssh/**', 'computer', 'block'], ['**/.aws/**', 'computer', 'block'], ['**/Contracts/**', 'computer', 'tell'],
  ]);
  assert.equal(view.canWrite, false, 'no project file to write');
  assert.deepEqual([view.unread, view.uninstall, view.developer, view.scope], [[], {}, [], undefined]);
  assert.deepEqual(view.computer, { add: true, alerts: false, uninstall: true, places: 'typed' }, 'alerts not read: no switch drawn from a guess');
  assert.deepEqual(settingsView(SETTINGS, { ...EVERYWHERE, blocked: 'unreadable' }, true).computer, { add: false, alerts: false, uninstall: false, places: 'typed' });
  // GD23: rows 2 and 3 wait on row 1 - the computer's alerts - as a project's wait on its hook.
  const off = settingsView(SETTINGS, { ...EVERYWHERE, alerts: false }, true);
  assert.deepEqual([off.known, off.alerts.on, off.stopped.locked, off.fine.locked, off.computer?.alerts], [true, false, true, true, true]);
  const on = settingsView(SETTINGS, { ...EVERYWHERE, alerts: true }, true);
  assert.deepEqual([on.alerts.on, on.stopped, on.fine], [true, { on: true, locked: false }, { on: true, locked: false }]);
  assert.equal(settingsView(SETTINGS, { ...EVERYWHERE, alerts: 'unreadable' }, true).known, false);
});

test('Private files lists the computer’s rules, with Add written through the computer’s route', () => {
  const html = page();
  const text = english(html);
  assert.doesNotMatch(text, /Not blocked yet|Finish blocking|Watch it too/, 'none of a project’s cards');
  assert.equal((html.match(/class="tag tag-grey tag-sm tag-outlined"/g) ?? []).length, 3, 'three rows, each the computer’s');
  assert.match(html, /<div class="set-list-add"><a class="pill pill-light pill-lg" href="#set-add"/);
  const add = /<dialog class="pp pp-confirm" id="set-add-confirm"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  assert.match(add, /data-set-add="\{&quot;everywhere&quot;:true\}" data-set-mode="block" data-set-url="api\/everywhere"/);
  assert.match(add, /data-set-add="\{&quot;everywhere&quot;:true\}" data-set-mode="tell" data-set-url="api\/everywhere"/, 'AS6: Block or Track');
  assert.match(english(add), /Protect it in every project\?/);
  assert.doesNotMatch(text, /set\.cannot|can’t change these settings/i, 'no "cannot write" line: it is not a project that cannot be written');
});

// GD23: the same three rows as a project's - row 1 alerts in every project, its window the computer's.
test('Alerts is a project\u2019s three rows: row 1 alerts in every project, and rows 2 and 3 waiting on it', () => {
  const off = page({ everywhere: { ...EVERYWHERE, alerts: false } });
  const card = /<article class="set-msg set-msg-main"[\s\S]*?<\/article>/.exec(drawn(off))?.[0] ?? '';
  assert.match(card, /data-popup-open="set-ev-alerts-on"/, 'its switch opens the computer\u2019s window');
  const window_ = /<dialog class="pp pp-confirm" id="set-ev-alerts-on"[\s\S]*?<\/dialog>/.exec(off)?.[0] ?? '';
  assert.match(window_, /data-set-write="\{&quot;alerts&quot;:true\}" data-set-url="api\/everywhere"/);
  assert.match(english(window_), /Turn on alerts in every project\?/);
  assert.equal((drawn(off).match(/data-set-needs-first/g) ?? []).length, 2, 'rows 2 and 3 locked while it is off');
  assert.doesNotMatch(drawn(off), /set-watch-on|set-ev-alerts-note|class="set-msgs set-ev-alerts"/, 'no project\u2019s window, and the line under each row is drawn');

  const on = page({ everywhere: { ...EVERYWHERE, alerts: true } });
  assert.match(english(on), /On — in every project/);
  assert.match(on, /<dialog class="pp pp-confirm" id="set-ev-alerts-off"[\s\S]*?data-set-write="\{&quot;alerts&quot;:false\}" data-set-url="api\/everywhere"/);
  assert.match(on, /data-set-notice="\{&quot;on&quot;:&quot;value&quot;,&quot;scope&quot;:&quot;everywhere&quot;\}"/);
  assert.match(on, /data-set-notice="\{&quot;clean&quot;:&quot;off&quot;,&quot;scope&quot;:&quot;everywhere&quot;\}"/);

  assert.doesNotMatch(drawn(page()), /set-ev-alerts-on|data-set-notice="\{&quot;(on|clean)&quot;/, 'alerts not read: no switch, and rows 2 and 3 wait');
});

// GD24: General has a project's Uninstall, for what the computer setup wrote; who a project's setup is for stays a project's.
test('General keeps the system notifications and the setup, and offers Uninstall for what the computer setup wrote', () => {
  const html = page();
  assert.match(html, /data-set-notice="\{&quot;notify&quot;:\[&quot;chat&quot;,&quot;os&quot;\],&quot;scope&quot;:&quot;everywhere&quot;\}"/);
  assert.match(html, /href="onboarding\.html"/, 'the setup again');
  assert.doesNotMatch(drawn(html), /id="set-uninstall"|data-set-who|set-scopes|<details class="set-dev">/, 'nothing of a project\u2019s');
  assert.match(drawn(html), /<section class="set-box set-uninstall">[\s\S]*?Uninstall agentwhy from this computer[\s\S]*?href="#set-ev-uninstall"/);
  const window_ = /<dialog class="pp pp-confirm" id="set-ev-uninstall"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  assert.match(window_, /data-set-write="\{&quot;uninstall&quot;:true\}" data-set-url="api\/everywhere"/);
  assert.match(english(window_), /Each project’s own setup stays, and so does agentwhy’s check in Codex/);

  const nothing = page({ everywhere: { ...EVERYWHERE, blocked: [], told: [], alerts: false } });
  assert.doesNotMatch(drawn(nothing), /set-ev-uninstall/, 'nothing of the computer\u2019s there, no card');
  assert.match(drawn(page({ everywhere: { ...EVERYWHERE, blocked: [], told: [], alerts: true } })), /set-ev-uninstall/, 'alerts alone are something to take out');
});

// GD15: the card says what the page is, in every language, and opens the projects window as a project's card does.
test('the sidebar’s card is the computer’s, in every language, and opens the projects window', () => {
  const projects = { rows: [], unreadable: 0, switchable: true, choosable: false, removable: false };
  const html = page({ projects });
  const card = /<a class="sb-project sb-project-link"[\s\S]*?<\/a>/.exec(html)?.[0] ?? '';
  assert.match(card, /href="#projects" data-popup-open="projects"/);
  assert.match(card, /<span class="i18n" lang="en">This computer<\/span><span class="i18n" lang="pl">Ten komputer<\/span><span class="i18n" lang="de">Dieser Computer<\/span>/, 'short, as a folder\u2019s name is');
  assert.match(card, /<span class="i18n" lang="en">Showing<\/span>/);
  assert.match(html, /<a class="sb-item[^"]*"[^>]*href="settings\.html"/, 'Settings is in the menu: this page has its own');
});
