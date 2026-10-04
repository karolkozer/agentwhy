// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IndexHooks, IndexNotices, IndexSettings } from '../../../../src/report/start/session-index.ts';
import { settingsView } from '../../../../src/report/start/settings/settings-view.ts';

// `.ai/plans/2026-09-23-settings-redesign.md`, step 1: what the Settings page shows, from what the files hold.

const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const HOOKS: IndexHooks = {
  watch: 'local',
  refuse: false,
  reads: { watch: 'default', refuse: 'default' },
  path: '.claude/settings.local.json',
  sharedPath: '.claude/settings.json',
};
const NOTICES: IndexNotices = {
  on: 'value',
  clean: 'once',
  say: 'agent',
  notify: ['chat'],
  from: { on: 'default', clean: 'default', say: 'default', notify: 'default' },
  path: '/Users/someone/.agentwhy/notices.json',
  unusable: false,
};

function settings(extra: Partial<IndexSettings> = {}): IndexSettings {
  return {
    level: 'no-read',
    protected: BUILT_IN,
    allowed: [],
    origin: { kind: 'default' },
    hooks: HOOKS,
    mine: {},
    held: { local: [], shared: [] },
    notices: NOTICES,
    ...extra,
  };
}

test('card 1 is watch, for whom it runs; cards 2 and 3 are the notice choices, locked while card 1 is off', () => {
  const on = settingsView(settings({ notices: { ...NOTICES, on: 'refused', clean: 'off' } }));
  assert.deepEqual(on.alerts, { on: true, who: 'local' });
  assert.deepEqual(on.stopped, { on: true, locked: false });
  assert.deepEqual(on.fine, { on: false, locked: false });

  const shared = settingsView(settings({ hooks: { ...HOOKS, watch: 'shared' } }));
  assert.deepEqual(shared.alerts, { on: true, who: 'shared' });

  const off = settingsView(settings({ hooks: { ...HOOKS, watch: false } }));
  assert.deepEqual(off.alerts, { on: false });
  assert.equal(off.stopped.locked, true);
  assert.equal(off.fine.locked, true);
});

test('a level of reached is not a refused attempt said, and every quiet turn is still the clean line on', () => {
  const view = settingsView(settings({ notices: { ...NOTICES, on: 'reached', clean: 'every-turn' } }));
  assert.equal(view.stopped.on, false, 'S2: card 2 is on only at refused');
  assert.equal(view.fine.on, true);
  assert.ok(view.developer.some((row) => row.key === 'set.dev.on' && row.value === 'reached'), 'the developer details name it');
});

test('with no preferences file, or one that cannot be read, the cards show the defaults and cannot be changed', () => {
  const { notices: _notices, ...withoutNotices } = settings();
  const none = settingsView(withoutNotices);
  assert.equal(none.noticesWritable, false);
  assert.equal(none.fine.on, true, 'the default clean line is once');
  assert.equal(none.stopped.on, false, 'the default level is value');
  assert.equal(settingsView(settings({ notices: { ...NOTICES, unusable: true } })).noticesWritable, false);
  assert.equal(settingsView(settings()).noticesWritable, true);
});

test('Stop the AI is refuse, for whom it runs', () => {
  assert.deepEqual(settingsView(settings()).stop, { on: false });
  assert.deepEqual(settingsView(settings({ hooks: { ...HOOKS, refuse: 'shared' } })).stop, { on: true, who: 'shared' });
});

test('hooks that read the built-in list watch it, named in words, and nothing can be removed', () => {
  const view = settingsView(settings());
  assert.deepEqual(view.rows.map((row) => [row.name, row.patterns, row.source, row.watched]), [
    ['env', ['**/.env*', '**/*.env'], 'agentwhy', true],
    ['npmrc', ['**/.npmrc'], 'agentwhy', true],
    ['secrets', ['**/secrets/**'], 'agentwhy', true],
    ['ssh', ['**/.ssh/**', '**/id_rsa*'], 'agentwhy', true],
  ]);
  assert.ok(view.rows.every((row) => row.remove === undefined));
  assert.deepEqual(view.withBuiltIn, BUILT_IN, 'an add writes the built-in list with it, so the hooks lose none of it');
  assert.equal(view.addTo, 'local');
});

test('F34: the project rules the hooks do not read are counted, as the file writes them, and not listed as watched', () => {
  const view = settingsView(settings({
    mine: {
      '**/.env.local': { file: 'local', rule: './.env.local', whole: true },
      '**/.env*': { file: 'local', rule: '**/.env*', whole: true },
    },
    held: { local: ['**/.env.local', '**/.env*'], shared: [] },
  }));
  assert.deepEqual(view.unread, [{ rule: './.env.local', file: 'local' }], 'a built-in pattern is watched anyway');
  assert.ok(!view.rows.some((row) => row.patterns.includes('**/.env.local')));
});

test('hooks that read a file: its own whole rules are the person\'s, half a pair the project\'s, the other file unread', () => {
  const view = settingsView(settings({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: {
      '**/.env*': { file: 'local', rule: '**/.env*', whole: true },
      '**/contract.pdf': { file: 'local', rule: '**/contract.pdf', whole: true },
      '**/half.key': { file: 'local', rule: 'half.key', whole: false },
      '**/vault/**': { file: 'shared', rule: './vault/**', whole: true },
    },
    held: { local: ['**/.env*', '**/contract.pdf', '**/half.key'], shared: ['**/vault/**'] },
  }));

  const env = view.rows.find((row) => row.name === 'env');
  assert.deepEqual(env, { name: 'env', patterns: ['**/.env*'], source: 'agentwhy', watched: true, mode: 'block', kept: 'open' },
    'refuse is not installed, so the rules are half a block');
  assert.deepEqual(view.rows.filter((row) => row.name !== undefined && !row.watched).map((row) => row.name), ['npmrc', 'secrets', 'ssh'],
    'a built-in pattern the file lacks is not watched, and the page must not say it is');
  assert.deepEqual(view.withBuiltIn, ['**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*']);

  const own = view.rows.filter((row) => row.name === undefined);
  assert.deepEqual(own, [
    { patterns: ['**/contract.pdf'], source: 'you', watched: true, mode: 'block', remove: { rule: '**/contract.pdf', file: 'local' }, kept: 'open' },
    { patterns: ['**/half.key'], source: 'project', watched: true, mode: 'block', kept: 'open' },
  ]);
  assert.deepEqual(view.unread, [{ rule: './vault/**', file: 'shared' }]);
  assert.equal(view.addTo, 'local');
});

test('a pattern both files deny is read where the hooks read it, whichever file `mine` names', () => {
  const view = settingsView(settings({
    hooks: { ...HOOKS, reads: { watch: 'shared', refuse: 'shared' } },
    mine: { '**/vault/**': { file: 'local', rule: './vault/**', whole: true } },
    held: { local: ['**/vault/**'], shared: ['**/vault/**'] },
  }));
  assert.deepEqual(view.unread, []);
  const row = view.rows.find((each) => each.patterns.includes('**/vault/**'));
  assert.equal(row?.source, 'project', 'held by the file the hooks read, but not removable from it by name');
  assert.equal(view.addTo, 'shared');
});

test('hooks given a policy: the list this run read, nothing to add and nothing unread', () => {
  const view = settingsView(settings({ hooks: { ...HOOKS, reads: { watch: 'policy', refuse: 'policy' } }, protected: ['**/*.pem'] }));
  assert.deepEqual(view.rows, [{ patterns: ['**/*.pem'], source: 'project', watched: true, mode: 'block' }]);
  assert.equal(view.canAdd, false);
  assert.deepEqual(view.unread, []);
});

test('an add goes where watch runs when the hooks read the built-in list, and nothing is offered without the file', () => {
  assert.equal(settingsView(settings({ hooks: { ...HOOKS, watch: 'shared' } })).addTo, 'shared');
  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = settings();
  const unreadable = settingsView(rest);
  assert.equal(unreadable.canWrite, false);
  assert.equal(unreadable.canAdd, false);
  assert.deepEqual(unreadable.alerts, { on: false });
});

test('the developer details name the files, the rules read and the notice choices, and nothing else', () => {
  const view = settingsView(settings({ allowed: ['.env.example'] }));
  assert.deepEqual(view.developer.map((row) => row.key), [
    'set.dev.watch', 'set.dev.refuse', 'set.dev.reads', 'set.dev.rules', 'set.dev.unread', 'set.dev.exceptions',
    'set.dev.notices', 'set.dev.on', 'set.dev.clean', 'set.dev.said',
  ]);
  const value = (key: string): unknown => view.developer.find((row) => row.key === key)?.value;
  assert.equal(value('set.dev.watch'), '.claude/settings.local.json');
  assert.deepEqual(value('set.dev.refuse'), { word: 'set.dev.notInstalled' });
  assert.deepEqual(value('set.dev.reads'), { word: 'set.dev.reads.default' });
  assert.equal(value('set.dev.exceptions'), '.env.example');
  assert.equal(value('set.dev.said'), 'agent · chat');
});

test('toWatch counts every pattern Watch it too writes, and an unreadable file leaves the hooks unknown', () => {
  const view = settingsView(settings({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/vault/**': { file: 'shared', rule: './vault/**', whole: true } },
    held: { local: ['**/.env*'], shared: ['**/vault/**'] },
  }));
  assert.equal(view.toWatch, 6, 'five built-in patterns the file lacks, and one project rule');
  assert.equal(view.known, true);

  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = settings();
  const unknown = settingsView(rest);
  assert.equal(unknown.known, false);
  assert.equal(unknown.stopped.locked, false, 'not "turn on message 1 first": whether it is on is not known');
  assert.ok(unknown.rows.every((row) => row.watched), 'no row is said to be unwatched on a guess');
  assert.deepEqual(unknown.developer.find((row) => row.key === 'set.dev.watch')?.value, { word: 'set.dev.unknown' });
});

// F56: where agentwhy's own rules and hooks are decides who the settings are for; a rule written by hand splits nothing.
test('General is where agentwhy wrote: one file, both, or nothing yet', () => {
  const none = settingsView(settings({ hooks: { ...HOOKS, watch: false, refuse: false } }));
  assert.equal(none.scope, undefined);
  assert.equal(settingsView(settings({ hooks: { ...HOOKS, watch: 'local', refuse: false } })).scope, 'local');

  const split = settingsView(settings({
    hooks: { ...HOOKS, watch: 'local', refuse: 'shared' },
    mine: { '**/a.key': { file: 'local', rule: '**/a.key', whole: true }, '**/b.csv': { file: 'shared', rule: 'b.csv', whole: false } },
    held: { local: ['**/a.key'], shared: ['**/b.csv'] },
  }));
  assert.equal(split.scope, 'mixed');
  assert.deepEqual(split.moves.shared, { patterns: ['**/a.key'], hooks: ['watch'] });
  assert.deepEqual(split.moves.local, { patterns: [], hooks: ['refuse'] }, 'half a rule is somebody’s own work, and stays');
  assert.equal(settingsView(settings({ hooks: { ...HOOKS, watch: 'shared', refuse: 'shared' } })).writeTo, 'shared');
});

// F59: Uninstall takes out of each file what agentwhy put there - its hooks and its whole rules - and nothing written by hand.
test('Uninstall names each file holding anything of agentwhy, with its own rules only', () => {
  assert.deepEqual(settingsView(settings({ hooks: { ...HOOKS, watch: false, refuse: false } })).uninstall, {});

  const split = settingsView(settings({
    hooks: { ...HOOKS, watch: 'local', refuse: false },
    mine: { '**/a.key': { file: 'shared', rule: '**/a.key', whole: true }, '**/b.csv': { file: 'shared', rule: 'b.csv', whole: false } },
    held: { local: [], shared: ['**/a.key', '**/b.csv'] },
  }));
  assert.deepEqual(split.uninstall, { local: [], shared: ['**/a.key'] }, 'half a rule is somebody’s own work, and stays');

  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = settings();
  assert.deepEqual(settingsView(rest).uninstall, {}, 'where nothing could be read, nothing is offered');
});

// `.ai/specs/2026-09-25-block-means-blocked.md` K1, K2, K9: a row says Block whole only where both halves hold.
const LOCAL_RULES = { local: ['**/.env*', '**/*.env', '**/contract.pdf'], shared: [] };
const READING_LOCAL: IndexHooks = { ...HOOKS, reads: { watch: 'local', refuse: 'local' } };
const kept = (view: ReturnType<typeof settingsView>): unknown[] => view.rows.filter((row) => row.watched).map((row) => [row.name ?? row.patterns[0], row.kept]);

test('K2: with no rule in any file, the built-in rows are watched and not blocked at all, and Finish writes the list', () => {
  const view = settingsView(settings());
  assert.ok(view.rows.every((row) => row.watched && row.mode === 'block'), 'what §1 found by reading: every row says Block');
  assert.ok(view.rows.every((row) => row.kept === 'none'), 'and nothing stops the Read tool, so none of them is blocked');
  assert.deepEqual(view.unfinished, { rows: 4, patterns: BUILT_IN, refuse: false });
});

test('K2: rules without refuse are half a block; Finish installs refuse alone', () => {
  const view = settingsView(settings({ hooks: READING_LOCAL, held: LOCAL_RULES }));
  assert.deepEqual(kept(view), [['env', 'open'], ['**/contract.pdf', 'open']]);
  assert.deepEqual(view.unfinished, { rows: 2, patterns: [], refuse: true });
});

test('K2: rules and refuse over them are a whole block, and nothing is said', () => {
  const view = settingsView(settings({ hooks: { ...READING_LOCAL, refuse: 'local' }, held: LOCAL_RULES }));
  assert.deepEqual(kept(view), [['env', undefined], ['**/contract.pdf', undefined]]);
  assert.deepEqual(view.unfinished, { rows: 0, patterns: [], refuse: false });
});

test('K2: refuse over the built-in list does not keep a file of the person\'s own from shell commands', () => {
  const view = settingsView(settings({ hooks: { ...READING_LOCAL, refuse: 'local', reads: { watch: 'local', refuse: 'default' } }, held: LOCAL_RULES }));
  assert.deepEqual(kept(view), [['env', undefined], ['**/contract.pdf', 'open']]);
  assert.deepEqual(view.unfinished, { rows: 1, patterns: [], refuse: false }, 'init points a running hook again only when it writes a rule (R4d)');
});

test('K2: refuse reading shared does not cover a rule held only in local', () => {
  const view = settingsView(settings({
    hooks: { ...HOOKS, refuse: 'shared', reads: { watch: 'local', refuse: 'shared' } },
    held: { local: ['**/.env*', '**/*.env', '**/vault/**'], shared: ['**/.env*', '**/*.env'] },
  }));
  assert.deepEqual(kept(view), [['env', undefined], ['**/vault/**', 'open']]);
});

test('K2: where refuse reads a policy, only the rules are claimed', () => {
  const view = settingsView(settings({ hooks: { ...READING_LOCAL, refuse: 'local', reads: { watch: 'local', refuse: 'policy' } }, held: LOCAL_RULES }));
  assert.ok(view.rows.every((row) => row.kept === undefined));
});

test('K14: a told row is never counted, and Finish never blocks what the person chose to be told about', () => {
  const view = settingsView(settings({ told: { local: ['**/.npmrc'], shared: [] } }));
  const npmrc = view.rows.find((row) => row.name === 'npmrc');
  assert.equal(npmrc?.mode, 'tell');
  assert.equal(npmrc?.kept, undefined);
  assert.equal(view.unfinished.rows, 3);
  assert.ok(!view.unfinished.patterns.includes('**/.npmrc'));
});

/*
 * SW19, the maintainer's day of 2026-10-02: `demo.env` on Track, and Claude Code still refused every read - its own
 * deny rule for every `.env` file covers that name, and deny rules know no exceptions. The row says so; a tracked
 * file no written rule covers says nothing, and a rule that is itself told never covers.
 */
test('SW19: a tracked file a written Block rule still matches carries that rule', () => {
  const view = settingsView(settings({
    told: { local: ['**/demo.env', '**/customers.csv'], shared: [] },
    held: { local: ['**/.env*', '**/*.env'], shared: [] },
  }));
  const rows = view.rows.filter((row) => row.mode === 'tell');

  assert.deepEqual(rows.map((row) => [row.patterns[0], row.covered]), [
    ['**/demo.env', '**/*.env'],
    ['**/customers.csv', undefined],
  ]);

  const toldRule = settingsView(settings({ told: { local: ['**/.npmrc'], shared: [] }, held: { local: ['**/.npmrc'], shared: [] } }));
  assert.equal(toldRule.rows.find((row) => row.name === 'npmrc')?.covered, undefined, 'a rule that is itself told never covers');
});

test('K2: a policy\'s rows claim nothing, and an unreadable project claims nothing', () => {
  const policy = settingsView(settings({ hooks: { ...HOOKS, reads: { watch: 'policy', refuse: 'policy' } }, protected: ['**/*.pem'] }));
  assert.equal(policy.rows[0]?.kept, undefined);
  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = settings();
  assert.ok(settingsView(rest).rows.every((row) => row.kept === undefined));
  assert.equal(settingsView(rest).unfinished.rows, 0);
});
