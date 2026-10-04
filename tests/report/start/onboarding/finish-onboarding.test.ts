// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { OnboardingStore } from '../../../../src/ports/onboarding-store.ts';
import type { SetupOutcome } from '../../../../src/setup/project-setup.ts';
import { finishOnboarding } from '../../../../src/report/start/onboarding/finish-onboarding.ts';
import type { OnboardingChoices } from '../../../../src/report/start/onboarding/onboarding-changes.ts';
import type { SettingsChange } from '../../../../src/report/start/serve/settings-request.ts';
import type { IndexHooks, IndexNotices, IndexSettings } from '../../../../src/report/start/session-index.ts';
import type { NoticeChange } from '../../../../src/report/watch/notice-settings.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 3: Finish writes through Settings' routes, then keeps the record (W15, W22).

const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const HOOKS: IndexHooks = {
  watch: false,
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
  return { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES, ...extra };
}

const DEFAULTS: OnboardingChoices = { scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true };
// Search protection in force, so a test about something else does not also install it.
const GUARDED: Partial<IndexHooks> = { refuse: 'local' };
// The built-in rules in the local file, so a test about something else does not also write them (KD2).
const RULED: Partial<IndexSettings> = { held: { local: BUILT_IN, shared: [] } };
// Both told lists read, so a row can be switched (F57).
const LISTS: Partial<IndexSettings> = { told: { local: [], shared: [] } };

/** Fakes for every writer. `reads` is what the files hold at each read, the last one repeated. */
function finishIn(reads: readonly IndexSettings[], options: { setup?: (change: SettingsChange) => SetupOutcome | Error; recorded?: boolean; noLists?: boolean } = {}) {
  const written: SettingsChange[] = [];
  const switched: SettingsChange[] = [];
  const told: NoticeChange[] = [];
  const records: number[] = [];
  let read = 0;
  const store: OnboardingStore = {
    read: async () => ({ here: false, anywhere: false, failed: false }),
    add: async (at) => {
      records.push(at);
      return options.recorded ?? true;
    },
    reset: async () => true,
    doneFor: async () => new Set<string>(),
  };
  const finish = (choices: OnboardingChoices) => finishOnboarding({
    settingsNow: async () => reads[Math.min(read++, reads.length - 1)] as IndexSettings,
    settings: async (change) => {
      written.push(change);
      const outcome = options.setup?.(change) ?? 'written';
      if (outcome instanceof Error) throw outcome;
      return { outcome, output: outcome === 'written' ? 'Written.\n' : 'Could not write .claude/settings.local.json.\n' };
    },
    notify: async (change) => {
      told.push(change);
      return { written: true, said: 'Saved.\n' };
    },
    ...(options.noLists === true ? {} : {
      mode: async (change: Extract<SettingsChange, { readonly change: 'mode' }>) => {
        switched.push(change);
        return { outcome: 'written' as const, output: 'Switched.\n' };
      },
    }),
    store,
    clock: () => 42,
  }, choices);
  return { finish, written, told, switched, records, reads: () => read };
}

test('a new project with the defaults: watch installed and every file blocked for this computer, then the record', async () => {
  const { finish, written, told, records } = finishIn([settings()]);
  assert.deepEqual(await finish(DEFAULTS), {
    outcome: 'finished',
    results: [{ change: 'watch', written: true, message: 'Written.' }, { change: 'protect', written: true, message: 'Written.' }],
    recorded: true,
  });
  assert.deepEqual(written, [{ change: 'hooks', hooks: ['watch'], on: true, where: 'local' }, { change: 'adopt', patterns: BUILT_IN, where: 'local' }],
    'KD2: every row starts on Block, and Block is the rules with refuse - Settings\u2019 add');
  assert.deepEqual(told, []);
  assert.deepEqual(records, [42]);
});

test('W15.2: names are added as Settings adds them, from the files read again after the hook', async () => {
  // Before: nothing installed. After: `watch` runs for everyone and reads the built-in list, so the add goes to the
  // shared file with the whole built-in list beside it (S4.3), as Settings' own add would send it.
  const before = settings();
  const after = settings({ hooks: { ...HOOKS, watch: 'shared' } });
  const { finish, written, reads } = finishIn([before, after]);
  await finish({ ...DEFAULTS, scope: 'shared', protect: ['**/contract.pdf'] });
  assert.equal(reads(), 3, 'read before anything, again after the hook, and once more for Done\u2019s line about Codex (W20a)');
  assert.deepEqual(written, [
    { change: 'hooks', hooks: ['watch'], on: true, where: 'shared' },
    { change: 'adopt', patterns: [...BUILT_IN, '**/contract.pdf'], where: 'shared' },
  ]);

  // Hooks that read a project file already holding the built-in list: only the name goes, to that file.
  const own = settings({ hooks: { ...HOOKS, watch: 'local', reads: { watch: 'local', refuse: 'local' } }, held: { local: BUILT_IN, shared: [] } });
  const second = finishIn([own]);
  await second.finish({ ...DEFAULTS, protect: ['**/contract.pdf'] });
  assert.deepEqual(second.written, [{ change: 'adopt', patterns: ['**/contract.pdf'], where: 'local' }]);
});

test('KD2: after Uninstall, the groups no longer watched are written again, as Watch them too writes them', async () => {
  // Uninstall took agentwhy's rules and hooks out; a rule of the person's own stays, so the hooks would read that file.
  const uninstalled = settings({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/own.txt': { file: 'local', rule: 'Read(**/own.txt)', whole: false } },
    held: { local: ['**/own.txt'], shared: [] },
    ...LISTS,
  });
  const whole = finishIn([uninstalled]);
  await whole.finish(DEFAULTS);
  assert.deepEqual(whole.written, [{ change: 'hooks', hooks: ['watch'], on: true, where: 'local' }, { change: 'adopt', patterns: BUILT_IN, where: 'local' }],
    'the built-in list whole, so the file the hooks read drops nothing (S4.3)');

  // A group not watched and switched to Tell me goes onto step 1's told list, and the add writes no rule for it.
  const { finish, written, switched } = finishIn([uninstalled]);
  await finish({ ...DEFAULTS, modes: { env: 'tell' } });
  assert.deepEqual(written, [{ change: 'hooks', hooks: ['watch'], on: true, where: 'local' },
    { change: 'adopt', patterns: BUILT_IN.filter((pattern) => pattern !== '**/.env*' && pattern !== '**/*.env'), where: 'local' }]);
  assert.deepEqual(switched, [{ change: 'mode', to: 'tell', patterns: ['**/.env*', '**/*.env'], rules: [], where: 'local' }]);

  // A file already told about keeps no rule (F57), whatever the built-in list says.
  const told = finishIn([settings({ told: { local: ['**/.npmrc'], shared: [] } })]);
  await told.finish(DEFAULTS);
  assert.deepEqual(told.written.at(-1), { change: 'adopt', patterns: BUILT_IN.filter((pattern) => pattern !== '**/.npmrc'), where: 'local' });
});

test('R26a: rows 2 and 3 are written for this project, only the fields that changed', async () => {
  const { finish, told } = finishIn([settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' } })]);
  await finish({ ...DEFAULTS, stopped: true, fine: false });
  assert.deepEqual(told, [{ scope: 'project', choices: { on: 'refused', clean: 'off' } }]);
});

test('W15, W22: a write that fails does not stop the next one, nor the record', async () => {
  const { finish, told, records } = finishIn([settings({ hooks: { ...HOOKS, ...GUARDED }, ...RULED })], { setup: () => 'unwritable' });
  const answer = await finish({ ...DEFAULTS, stopped: true });
  assert.equal(answer.outcome, 'finished');
  assert.deepEqual(answer.outcome === 'finished' ? answer.results : [], [
    { change: 'watch', written: false, message: 'Could not write .claude/settings.local.json.' },
    { change: 'notices', written: true, message: 'Saved.' },
  ]);
  assert.equal(told.length, 1);
  assert.deepEqual(records, [42]);

  const thrown = finishIn([settings({ hooks: { ...HOOKS, ...GUARDED }, ...RULED })], { setup: () => new Error('The settings file changed while it was written.') });
  const second = await thrown.finish(DEFAULTS);
  assert.deepEqual(second.outcome === 'finished' ? second.results : [], [{ change: 'watch', written: false, message: 'The settings file changed while it was written.' }]);
  assert.deepEqual(thrown.records, [42]);
});

test('a change already made is a success, as in Settings', async () => {
  const { finish } = finishIn([settings()], { setup: () => 'unchanged' });
  const answer = await finish(DEFAULTS);
  assert.equal(answer.outcome === 'finished' && answer.results[0]?.written, true);
});

test('R46: a name that cannot be written refuses the whole request, before anything is written or recorded', async () => {
  const { finish, written, told, records } = finishIn([settings()]);
  const answer = await finish({ ...DEFAULTS, stopped: true, protect: ['**/fine.pdf', 'Read(x)'] });
  assert.equal(answer.outcome, 'refused');
  assert.match(answer.outcome === 'refused' ? answer.message : '', /"Read\(x\)" was not written: a deny rule is written as Read/);
  assert.deepEqual([written, told, records], [[], [], []]);
});

test('nothing to write is still a finish: the record is kept', async () => {
  const { finish, written, records } = finishIn([settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' }, ...RULED })]);
  assert.deepEqual(await finish(DEFAULTS), { outcome: 'finished', results: [], recorded: true });
  assert.deepEqual(written, []);
  assert.deepEqual(records, [42]);
});

test('W26: a record that cannot be written is said, and nothing else changes', async () => {
  const { finish } = finishIn([settings()], { recorded: false });
  const answer = await finish(DEFAULTS);
  assert.equal(answer.outcome === 'finished' && answer.recorded, false);
  assert.equal(answer.outcome === 'finished' && answer.results[0]?.written, true);
});

test('names the hooks can no longer take, once the hook is installed, are said and not written', async () => {
  const after = settings({ hooks: { ...HOOKS, watch: 'local', reads: { watch: 'policy', refuse: 'policy' } } });
  const { finish, written } = finishIn([settings(), after]);
  const answer = await finish({ ...DEFAULTS, protect: ['**/contract.pdf'] });
  assert.deepEqual(written.map((change) => change.change), ['hooks']);
  assert.deepEqual(answer.outcome === 'finished' ? answer.results.map((result) => [result.change, result.written]) : [], [['watch', true], ['protect', false]]);
});

// W12a: Block | Tell me, written as Settings' own switch writes it.

test('W12a: a row switched to Tell me is Settings\u2019 switch, its patterns read from the files at Finish', async () => {
  const set = settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' }, ...LISTS, ...RULED });
  const { finish, switched } = finishIn([set]);
  const answer = await finish({ ...DEFAULTS, modes: { env: 'tell' } });
  assert.deepEqual(switched, [{ change: 'mode', to: 'tell', patterns: ['**/.env*', '**/*.env'], rules: [], where: 'local' }],
    'the built-in list holds no rule to take out, so only the told list is written');
  assert.deepEqual(answer.outcome === 'finished' ? answer.results : [], [{ change: 'mode', written: true, message: 'Switched.' }]);
});

test('W12a: a name added on Tell me goes onto step 1\u2019s told list with no rule; left on Block it is Settings\u2019 add', async () => {
  const set = settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' }, ...LISTS });
  const { finish, switched, written } = finishIn([set]);
  await finish({ ...DEFAULTS, scope: 'shared', tell: ['**/notes.txt'], protect: ['**/contract.pdf'] });
  assert.deepEqual(switched, [{ change: 'mode', to: 'tell', patterns: ['**/notes.txt'], rules: [], where: 'shared' }]);
  assert.deepEqual(written.map((change) => change.change), ['hooks', 'adopt'], 'the hook moves to the shared file, then the add');
});

test('W12a: a switch the files no longer offer, or a run with no told lists, writes nothing and says so', async () => {
  const withoutLists = settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' }, ...RULED });
  const drawn = settings({ hooks: { ...HOOKS, ...GUARDED, watch: 'local' }, ...LISTS, ...RULED });
  // Drawn with lists, read at Finish without: the switch is no longer there, and nothing is guessed.
  const gone = finishIn([drawn, withoutLists]);
  const answer = await gone.finish({ ...DEFAULTS, modes: { env: 'tell' } });
  assert.deepEqual(gone.switched, []);
  assert.equal(answer.outcome === 'finished' && answer.results[0]?.written, false);

  const none = finishIn([drawn], { noLists: true });
  const second = await none.finish({ ...DEFAULTS, modes: { env: 'tell' } });
  assert.match(second.outcome === 'finished' ? second.results[0]?.message ?? '' : '', /keeps no list/);
});

// W20a, `codex-blocks-too` CK8: Done says what Codex needs, read from the files as Finish left them.
test('W20a: where Claude Code\u2019s block runs in a project that uses Codex, the answer says whether Codex\u2019s hook runs too', async () => {
  const before = settings({ hooks: { ...HOOKS, ...GUARDED }, ...RULED });
  const on = settings({ hooks: { ...HOOKS, ...GUARDED, codex: 'on' }, ...RULED });
  const off = settings({ hooks: { ...HOOKS, ...GUARDED, codex: 'off' }, ...RULED });

  const written = await finishIn([before, on]).finish(DEFAULTS);
  assert.equal(written.outcome === 'finished' ? written.codex : undefined, 'on');
  const missing = await finishIn([before, off]).finish(DEFAULTS);
  assert.equal(missing.outcome === 'finished' ? missing.codex : undefined, 'off');
});

test('W20a: nothing about Codex where the project does not use it, or where Claude Code blocks nothing', async () => {
  const claudeOnly = await finishIn([settings({ hooks: { ...HOOKS, ...GUARDED }, ...RULED })]).finish(DEFAULTS);
  assert.ok(claudeOnly.outcome === 'finished' && !('codex' in claudeOnly));
  const blocksNothing = await finishIn([settings({ hooks: { ...HOOKS, codex: 'off' } })]).finish({ ...DEFAULTS, watch: false });
  assert.ok(blocksNothing.outcome === 'finished' && !('codex' in blocksNothing), 'refuse does not run: nothing to say of Codex');
});
