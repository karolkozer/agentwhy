// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { onboardingChanges, type InForce, type InForceRow, type OnboardingChoices } from '../../../../src/report/start/onboarding/onboarding-changes.ts';

// `.ai/plans/2026-09-24-onboarding.md`, steps 2 and 9: what Finish writes, from the choices and what is in force
// (W14-W16, W12a).

const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
// Settings' four groups, set up: watched, on Block, their rules in a settings file, each switchable (F57).
const PATTERNS: Readonly<Record<string, readonly string[]>> = { env: ['**/.env*', '**/*.env'], npmrc: ['**/.npmrc'], secrets: ['**/secrets/**'], ssh: ['**/.ssh/**', '**/id_rsa*'] };
const ROWS: readonly InForceRow[] = ['env', 'npmrc', 'secrets', 'ssh'].map((key) => ({ key, mode: 'block', watched: true, ruled: true, switchable: true, patterns: PATTERNS[key] ?? [] }));

// A new project: no hook, the built-in list and no rule for it, the product's notice defaults (N4: level `value`, clean `once`).
const NEW: InForce = {
  watch: false, refuse: false, stopped: false, fine: true, protected: BUILT_IN, rows: ROWS.map((row) => ({ ...row, ruled: false })),
  canWrite: true, canAdd: true, canTell: true, noticesWritable: true,
};
// The same project once watch, refuse and the rules are there: every row is blocked whole.
const SET_UP: InForce = { ...NEW, watch: 'local', refuse: 'local', rows: ROWS };
// After Uninstall, with a rule of the person's own left in the file the hooks would read: the groups are not watched.
const UNINSTALLED: InForce = { ...NEW, rows: ROWS.map((row) => ({ ...row, watched: false, ruled: false, switchable: false })) };
const EVERY_ROW = ['env', 'npmrc', 'secrets', 'ssh'];
const DEFAULTS: OnboardingChoices = { scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true };

test('a new project with the defaults installs watch, and blocks every file left on Block (KD2)', () => {
  assert.deepEqual(onboardingChanges(DEFAULTS, NEW), [{ change: 'watch', where: 'local' }, { change: 'protect', patterns: [], rows: EVERY_ROW }],
    'the add writes the rules and installs refuse with them, so no separate search change');
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, scope: 'shared' }, NEW), [{ change: 'watch', where: 'shared' }, { change: 'protect', patterns: [], rows: EVERY_ROW }]);
});

test('KD2: after Uninstall the groups not watched are written again - all but one switched to Tell me', () => {
  assert.deepEqual(onboardingChanges(DEFAULTS, UNINSTALLED), [{ change: 'watch', where: 'local' }, { change: 'protect', patterns: [], rows: EVERY_ROW }]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, watch: false }, UNINSTALLED), [{ change: 'protect', patterns: [], rows: EVERY_ROW }],
    'Block needs no alerts: the rules and refuse are the block');
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' } }, NEW)[1], { change: 'protect', patterns: [], rows: ['npmrc', 'secrets', 'ssh'] });
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, protect: ['**/contract.pdf'] }, UNINSTALLED)[1], { change: 'protect', patterns: ['**/contract.pdf'], rows: EVERY_ROW },
    'one add with the names');
  assert.deepEqual(onboardingChanges(DEFAULTS, { ...UNINSTALLED, canAdd: false }), [{ change: 'watch', where: 'local' }], 'hooks reading a policy take no rule');
});

test('KD2: a row not watched and switched to Tell me goes onto the told list, and is left out of the add', () => {
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' } }, UNINSTALLED), [
    { change: 'watch', where: 'local' },
    { change: 'protect', patterns: [], rows: ['npmrc', 'secrets', 'ssh'] },
    { change: 'tell', patterns: ['**/.env*', '**/*.env'] },
  ]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, tell: ['**/notes.txt'], modes: { env: 'tell', npmrc: 'tell', secrets: 'tell', ssh: 'tell' } }, UNINSTALLED), [
    { change: 'watch', where: 'local' },
    { change: 'tell', patterns: ['**/notes.txt', ...BUILT_IN] },
  ], 'nothing left on Block: no add, and nothing to keep from searches');
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' } }, { ...UNINSTALLED, canTell: false }), [
    { change: 'watch', where: 'local' },
    { change: 'protect', patterns: [], rows: ['npmrc', 'secrets', 'ssh'] },
  ], 'no told list to write: nothing is told');
});

test('nothing to write where every choice is already in force', () => {
  assert.deepEqual(onboardingChanges(DEFAULTS, SET_UP), []);
});

test('W16: row 1 off removes nothing, and rows 2 and 3 do not move without it', () => {
  const off = { ...DEFAULTS, watch: false, stopped: true, fine: false };
  assert.deepEqual(onboardingChanges(off, SET_UP), [], 'an installed hook stays installed');
  assert.deepEqual(onboardingChanges(off, { ...SET_UP, watch: false }), []);
});

test('R4g: a hook running from the other file is moved to the one step 1 chose, and says where from', () => {
  assert.deepEqual(onboardingChanges(DEFAULTS, { ...SET_UP, watch: 'shared' }), [{ change: 'watch', where: 'local', from: 'shared' }]);
});

test('W12: only names not protected yet are added, each once - and an add brings search protection itself', () => {
  const choices = { ...DEFAULTS, protect: ['**/contract.pdf', ' **/contract.pdf ', '**/.env*', '**/data/**', ''] };
  assert.deepEqual(onboardingChanges(choices, { ...SET_UP, refuse: false }), [{ change: 'protect', patterns: ['**/contract.pdf', '**/data/**'], rows: [] }],
    'no separate search change: Settings’ add installs refuse with the rules (F38)');
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, protect: ['**/.npmrc'] }, SET_UP), [], 'already protected');
});

test('W12a: a row switched to Tell me is a mode change, found by its key; left on Block it writes nothing', () => {
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' } }, SET_UP), [{ change: 'mode', key: 'env', to: 'tell' }]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'block' } }, SET_UP), [], 'the mode in force is no change');
  const told = { ...SET_UP, rows: ROWS.map((row) => (row.key === 'env' ? { ...row, mode: 'tell' as const } : row)) };
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'block' } }, told), [{ change: 'mode', key: 'env', to: 'block' }]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { nothing: 'tell' } }, SET_UP), [], 'a key that is no row is nothing');
});

test('W12a: every file told means nothing is left to keep from searches; one switched back to Block brings refuse itself', () => {
  const allTold = Object.fromEntries(ROWS.map((row) => [row.key, 'tell' as const]));
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: allTold }, NEW).map((change) => change.change), ['watch', 'mode', 'mode', 'mode', 'mode']);
  const told = { ...NEW, rows: ROWS.map((row) => ({ ...row, mode: 'tell' as const })) };
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'block' } }, told).map((change) => change.change), ['watch', 'mode'],
    'Settings’ switch back to Block installs refuse (modeChange)');
});

test('W12a: a name added and switched to Tell me goes onto the told list alone; nothing is switched that cannot be', () => {
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, tell: ['**/notes.txt'], protect: ['**/notes.txt'] }, SET_UP), [{ change: 'tell', patterns: ['**/notes.txt'] }],
    'a name in both lists is told');
  const fixed = { ...SET_UP, rows: ROWS.map((row) => ({ ...row, switchable: false })) };
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' } }, fixed), [], 'a rule written by hand is not switched');
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { env: 'tell' }, tell: ['**/a.txt'] }, { ...SET_UP, canTell: false }), [], 'no told list to write');
});

test('R26a: only the notice fields that change, in the words the preferences file keeps', () => {
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, stopped: true }, SET_UP), [{ change: 'notices', on: 'refused' }]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, fine: false }, SET_UP), [{ change: 'notices', clean: 'off' }]);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, stopped: false, fine: true }, { ...SET_UP, stopped: true, fine: false }), [
    { change: 'notices', on: 'value', clean: 'once' },
  ]);
});

test("W15's order: the hook, the names, search, the switches, the told names, what is said", () => {
  const changes = onboardingChanges(
    { scope: 'shared', watch: true, protect: [], tell: ['**/notes.txt'], modes: { ssh: 'tell' }, stopped: true, fine: false },
    NEW,
  );
  assert.deepEqual(changes.map((change) => change.change), ['watch', 'protect', 'mode', 'tell', 'notices']);
  assert.deepEqual(onboardingChanges({ ...DEFAULTS, modes: { ssh: 'tell' } }, { ...SET_UP, refuse: false }).map((change) => change.change), ['search', 'mode'],
    'rules in place: search protection alone');
});

test('R62: nothing is given that cannot be written', () => {
  const choices = { ...DEFAULTS, protect: ['**/contract.pdf'], stopped: true, fine: false };
  assert.deepEqual(onboardingChanges(choices, { ...NEW, canWrite: false, canAdd: false, noticesWritable: false }), []);
  assert.deepEqual(onboardingChanges(choices, { ...NEW, canAdd: false }).map((change) => change.change), ['watch', 'search', 'notices'], 'hooks reading a policy take no name');
});
