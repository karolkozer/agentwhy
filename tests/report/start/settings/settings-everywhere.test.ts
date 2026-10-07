// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IndexEverywhere, IndexHooks, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { SettingsRenderer } from '../../../../src/report/start/settings/settings-renderer.ts';
import { settingsView } from '../../../../src/report/start/settings/settings-view.ts';
import { SETTINGS_SCRIPT } from '../../../../src/report/start/settings/settings-script.ts';
import { globalDefaults } from '../../../../src/setup/global-defaults.ts';

// `.ai/specs/2026-10-05-protected-everywhere.md` G6, G15, step 3's display half: Settings shows the computer's rules
// beside the project's, says which wrote each, offers their switch and their removal through the computer's own route,
// and offers no Track on a project row the computer blocks anyway.

const NOW = Date.parse('2026-10-06T10:00:00Z');
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const HOOKS: IndexHooks = { watch: 'local', refuse: 'local', reads: { watch: 'default', refuse: 'default' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' };

function settings(extra: Partial<IndexSettings> = {}): IndexSettings {
  return { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, told: { local: [], shared: [] }, ...extra };
}

/** A Mac whose computer blocks its SSH keys and AWS login and a ledger by name, and tracks a contracts folder. */
function everywhere(extra: Partial<IndexEverywhere> = {}): IndexEverywhere {
  return {
    rows: globalDefaults('darwin').map((row) => ({ ...row, present: true })),
    blocked: ['**/.ssh/**', '**/.aws/**', '**/ledger.csv'],
    told: ['**/Contracts/**'],
    codex: true,
    ...extra,
  };
}

function page(index: Partial<SessionIndex> = {}): string {
  return new SettingsRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' }).render({
    now: NOW, timeZone: 'UTC', since: NOW - 30 * 86_400_000, asked: '30d', project: '/Users/someone/projects/demo-shop', shared: false,
    widen: 'agentwhy start --since 60d', entries: [], settings: settings(), everywhere: everywhere(), ...index,
  });
}

/** The computer's own Settings (`everything-on-this-computer.md` step 1): its rows alone, each changed here. */
function computerPage(extra: Partial<IndexEverywhere> = {}): string {
  return new SettingsRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' }).render({
    now: NOW, timeZone: 'UTC', since: NOW - 30 * 86_400_000, asked: '30d', shared: false,
    widen: 'agentwhy start --since 60d', entries: [], settings: settings(), everywhere: everywhere(extra), scope: 'computer',
  });
}
/** Where a computer row sits on the computer's page, whose windows are numbered by it. */
const computerAt = (pattern: string, extra: Partial<IndexEverywhere> = {}): number =>
  settingsView(settings(), everywhere(extra), true).rows.findIndex((row) => row.patterns[0] === pattern);

const windowOf = (html: string, id: string): string => new RegExp('<dialog class="pp pp-confirm" id="' + id + '"[\\s\\S]*?</dialog>').exec(html)?.[0] ?? '';
const writeOf = (window: string): unknown => {
  const raw = / data-set-write="([^"]*)"/.exec(window)?.[1] ?? '{}';
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
};
const english = (html: string): string => html.replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('G6: the computer’s rules join the list after the project’s, each named and marked as the computer’s', () => {
  const view = settingsView(settings(), everywhere());
  const computer = view.rows.filter((row) => row.source === 'computer');
  assert.deepEqual(computer.map((row) => [row.patterns[0], row.mode, row.computer?.id ?? row.name ?? '-']), [
    ['**/.ssh/**', 'block', 'ssh'],
    ['**/.aws/**', 'block', 'aws'],
    ['**/ledger.csv', 'block', '-'],
    ['**/Contracts/**', 'tell', '-'],
  ]);
  // One folder, one name on one page: `.ssh` is a built-in group's, and keeps the group's name rather than GD14's.
  assert.equal(computer[0]?.name, 'ssh');
  assert.equal(computer[0]?.computer?.id, undefined);
  // GD33: on a project's page they are shown and not changed - the computer's own page changes them.
  assert.ok(computer.every((row) => row.computer?.switchable === false && row.computer.removable === false), 'read-only on a project\u2019s page');
  assert.ok(settingsView(settings(), everywhere(), true).rows.every((row) => row.computer?.switchable === true && row.computer.removable === true), 'changed on the computer\u2019s own');
  assert.ok(computer.every((row) => row.remove === undefined && row.switchTo === undefined && row.untell === undefined), 'nothing of the project’s route');
  assert.equal(view.rows.findIndex((row) => row.source === 'computer'), view.rows.length - computer.length, 'after every row of the project');
  assert.deepEqual(settingsView(settings()).rows.filter((row) => row.source === 'computer'), [], 'none where the run read no computer rules');
});

// G15: a computer-wide block is answered before any Track, so a project's Track on the same file would change nothing.
test('G15: a project row the computer blocks too keeps Block, loses its switch to Track, and says why', () => {
  const view = settingsView(settings(), everywhere());
  const ssh = view.rows.find((row) => row.name === 'ssh' && row.source !== 'computer');
  assert.equal(ssh?.everywhere, true);
  assert.equal(ssh?.switchTo, undefined);
  // K1, K2: the computer's rule holds in Claude Code everywhere, and `refuse` runs here, so it is blocked whole.
  assert.equal(ssh?.kept, undefined, 'not "Not blocked yet" - the computer blocks it');
  const noRefuse = settingsView(settings({ hooks: { ...HOOKS, refuse: false } }), everywhere()).rows.find((row) => row.name === 'ssh' && row.source !== 'computer');
  assert.equal(noRefuse?.kept, 'open', 'and half, where refuse does not run in this project');
  const env = view.rows.find((row) => row.name === 'env');
  assert.equal(env?.everywhere, undefined, 'a row the computer does not block keeps its switch');
  assert.notEqual(env?.switchTo, undefined);

  // Covered by name, not only by the same pattern: a computer-wide `*.csv` blocks the project's own `ledger.csv` rule.
  const own = settingsView(settings({ held: { local: ['**/ledger.csv'], shared: [] }, hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/ledger.csv': { rule: '**/ledger.csv', file: 'local', whole: true } } }), everywhere({ blocked: ['**/*.csv'] }));
  const ledger = own.rows.find((row) => row.source !== 'computer' && row.patterns[0] === '**/ledger.csv');
  assert.equal(ledger?.everywhere, true);
  assert.equal(ledger?.switchTo, undefined);
});

test('a computer list that cannot be read makes its rows still: nothing switched, nothing taken out of it', () => {
  const view = settingsView(settings(), everywhere({ told: 'unreadable' }), true);
  const computer = view.rows.filter((row) => row.source === 'computer');
  assert.deepEqual(computer.map((row) => [row.patterns[0], row.computer?.switchable, row.computer?.removable]), [
    ['**/.ssh/**', false, true], ['**/.aws/**', false, true], ['**/ledger.csv', false, true],
  ]);
});

test('the computer\u2019s page draws a computer row with its GD14 name, the "This computer" badge, its switch and its bin', () => {
  const row = /<li class="set-rule">(?:(?!<\/li>)[\s\S])*?Your Amazon Web Services login[\s\S]*?<\/li>/.exec(computerPage())?.[0] ?? '';
  assert.match(row, /<span class="chip set-rule-chip" title="\*\*\/\.aws\/\*\*">\.aws\/<\/span>/);
  assert.match(english(row), /This computer/);
  assert.match(row, /class="tag tag-grey[^"]*tag-outline/, 'outlined, apart from agentwhy’s own grey');
  assert.match(row, /<a class="set-mode-half" href="#set-ev-mode-\d+" data-popup-open="set-ev-mode-\d+">/);
  assert.match(row, /data-popup-open="set-ev-remove-\d+"/);
  assert.match(english(page()), /Blocked in every project on this computer too, so Track here would change nothing\./);
});

// GD33, asked for by the maintainer on 2026-10-07 ("jestem w projekcie i mam ustawienia globalne całego komputera, i to
// jest mylące"): a project's page lists its own rules; the computer's follow, folded and read-only, with the way to the
// computer's own page. Still shown - the page never says less than holds here (G6).
test('GD33: on a project\u2019s page the computer\u2019s rules are folded below its own, read-only, with the way to change them', () => {
  const html = page({ projects: { rows: [], unreadable: 0, switchable: true, choosable: false, removable: false } });
  const list = /<section class="set-list">[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
  assert.doesNotMatch(list, /Your Amazon Web Services login|This computer/, 'the project\u2019s list holds its own rules');
  const folded = /<details class="set-list set-elsewhere" data-set-elsewhere>[\s\S]*?<\/details>/.exec(html)?.[0] ?? '';
  assert.match(english(folded), /Also kept on this whole computer 4/);
  assert.match(english(folded), /These come from This computer and hold in every project, this one included\. They’re changed there, not here\./);
  assert.match(english(folded), /Your Amazon Web Services login/);
  assert.doesNotMatch(folded, /data-popup-open="set-ev-/, 'no switch and no bin: read-only here');
  assert.doesNotMatch(html, /id="set-ev-mode-|id="set-ev-remove-|id="set-ev-update-/, 'and none of their windows');
  assert.match(folded, /data-switch-words="[^"]+"><button type="button" class="pill pill-outline pill-sm" data-switch-project=":computer"/, 'the computer\u2019s own page, a switch away');
  assert.match(english(folded), /Change them in This computer →/);
  assert.match(english(page()), /Change them on This computer’s page: run agentwhy in your home folder\./, 'said, where the page cannot switch');
  assert.doesNotMatch(english(page({ everywhere: everywhere({ blocked: ['**/.aws/**'] }) })), /Update them/, 'the update is the computer\u2019s page\u2019s');
});

// The computer's rules change through the computer's route - the one they were written by - never a project's file.
test('a computer row’s windows post to the computer’s route: a switch is one request, out of one list and into the other', () => {
  const html = computerPage();
  const at = (pattern: string): number => computerAt(pattern);

  const toTrack = windowOf(html, 'set-ev-mode-' + at('**/.aws/**'));
  assert.match(toTrack, /data-set-url="api\/everywhere"/);
  // a-file-in-its-place IPD1: `.aws` here is in the old, anchored form - switched, it is written as its place.
  assert.deepEqual(writeOf(toTrack), { block: [], tell: ['~/.aws/**'], unblock: ['**/.aws/**'] });
  assert.match(english(toTrack), /Let your AI read it, in every project\?[\s\S]*Your AI will be able to read Your Amazon Web Services login in any project on this computer/);
  assert.match(toTrack, /class="pill pill-primary pill-lg"/, 'the risky way is coral');

  const toBlock = windowOf(html, 'set-ev-mode-' + at('**/Contracts/**'));
  assert.deepEqual(writeOf(toBlock), { block: ['**/Contracts/**'], tell: [], untell: ['**/Contracts/**'] });
  assert.match(english(toBlock), /in Claude Code and in Codex, and no project can turn that off\./, 'Codex is named where Codex is used (GD13)');
  assert.match(english(toBlock), /This stops the obvious tries/);

  const unblock = windowOf(html, 'set-ev-remove-' + at('**/ledger.csv'));
  assert.deepEqual(writeOf(unblock), { block: [], tell: [], unblock: ['**/ledger.csv'] });
  assert.match(unblock, /data-set-command-local="agentwhy protect --remove --unprotect &#39;\*\*\/ledger\.csv&#39;"/, 'as a file, the command that does it');
  const untell = windowOf(html, 'set-ev-remove-' + at('**/Contracts/**'));
  assert.deepEqual(writeOf(untell), { block: [], tell: [], untell: ['**/Contracts/**'] });

  assert.equal(windowOf(computerPage({ codex: false }), 'set-ev-mode-' + at('**/Contracts/**')).includes('Codex'), false);
});

test('a page that cannot write the project’s file still shows the computer’s rows, folded', () => {
  const { mine: _unread, ...unwritable } = settings();
  const html = page({ settings: unwritable });
  assert.match(html, /data-set-elsewhere/);
  assert.doesNotMatch(html, /id="set-watch-on"|id="set-watch-off"/, 'and nothing of the project’s');
});

test('the script posts a window to the route it names, and parses', () => {
  assert.match(SETTINGS_SCRIPT, /post\(button\.dataset\.setUrl \|\| 'api\/settings', body, dialog, \[button\]\)/);
  // The review of 2026-10-06: a part not written is a refusal said in the window, not a reload that says nothing.
  assert.match(SETTINGS_SCRIPT, /const failed = \(answer\.results \|\| \[\]\)\.some\(\(result\) => result\.written !== true\);/);
  assert.match(SETTINGS_SCRIPT, /ok: response\.ok && answer\.ok && !failed, message: failed \? word\('notWritten'\)/);
  assert.match(page(), /&quot;notWritten&quot;:&quot;not every change to this computer’s rules could be made\./, 'in the page\u2019s words for the script');
  assert.doesNotThrow(() => new Function(SETTINGS_SCRIPT));
});

// `2026-10-07-a-file-in-its-place.md` IP5, IPD1: a computer row says what it holds - one place, a folder with everything
// in it, or a name, which Claude Code matches only inside the folder the AI works in - and a row an older release wrote
// anchored says so, with one way to write it, or every such row, as its place.
test('IP5, IPD1: rows say what they hold, and the old ones are offered as their places', () => {
  const html = computerPage({ blocked: ['**/.aws/**', '~/Projects/my-app/package.json', '//Volumes/share/', '**/ledger.csv'], told: ['~/.kube/**', '~/Documents/Contracts/**'] });
  const text = english(html);
  assert.match(text, /~\/Projects\/my-app\/package\.json Only this file, wherever your AI works/);
  assert.match(text, /~\/Documents\/Contracts\/ This folder and everything in it, wherever your AI works/);
  assert.match(text, /ledger\.csv Matched by name, and only inside the folder your AI works in/);
  assert.match(text, /\.aws\/ Written the old way: it holds only inside the folder your AI works in\. Update/);
  assert.doesNotMatch(text, /\.kube\/ Written the old way/, 'a row in its place is not old');
  assert.match(text, /1 rule here is written the old way: Claude Code applies it only inside the folder your AI works in\. Update them/);

  const old = { blocked: ['**/.aws/**', '**/ledger.csv'], told: ['**/.kube/**'] };
  const at = computerAt('**/.aws/**', old);
  const markup = computerPage(old);
  assert.deepEqual(writeOf(windowOf(markup, 'set-ev-update-' + at)), { block: ['~/.aws/**'], tell: [], unblock: ['**/.aws/**'], untell: [] }, 'one row: its place in, the old rule out');
  assert.deepEqual(writeOf(windowOf(markup, 'set-ev-update-all')), { block: ['~/.aws/**'], tell: ['~/.kube/**'], unblock: ['**/.aws/**'], untell: ['**/.kube/**'] }, 'every old row at once; a name of the person’s own is not one');
  assert.match(windowOf(markup, 'set-ev-update-all'), /data-set-url="api\/everywhere"/);
});
