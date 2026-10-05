// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SetupOptions, SetupResult, SetupUseCase } from '../../../../src/setup/project-setup.ts';
import { modeChange, onlyTakesOut, settingsChangeToSetup } from '../../../../src/report/start/serve/settings-setup.ts';
import type { SettingsChange } from '../../../../src/report/start/serve/settings-request.ts';

/**
 * R58: a change from the served Settings view becomes exactly the `SetupOptions` the equivalent `init` flags would
 * build, and runs through the same `ProjectSetup` a terminal runs. What is asserted here is the flags, because
 * that is all this module decides; what they then write is `project-setup.test.ts`.
 */
function optionsOf(change: SettingsChange): SetupOptions {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = {
    run: async (options): Promise<SetupResult> => {
      seen.push(options);
      return { outcome: 'written', output: 'Wrote it.\n' };
    },
  };
  void settingsChangeToSetup(setup, change);
  const options = seen[0];
  assert.ok(options !== undefined, 'the setup is run once, with one set of options');
  return options;
}

// which-project V8, found by a review: where no project is, the setup refuses every write but a removal, and a change
// that took something out before it wrote left the file neither blocked nor told. Only a removal passes before it runs.
test('only a change that takes something out and writes nothing is a removal', () => {
  const removals: SettingsChange[] = [
    { change: 'uninstall', rules: { local: ['Read(./.env)'] } },
    { change: 'unprotect', pattern: '.env' },
    { change: 'hooks', hooks: ['watch'], on: false },
  ];
  const writes: SettingsChange[] = [
    { change: 'hooks', hooks: ['watch'], on: true },
    { change: 'protect', pattern: '.env' },
    { change: 'edit', from: '.env', pattern: '.env.local' },
    { change: 'move', pattern: '.env', from: 'local', where: 'shared' },
    { change: 'adopt', patterns: ['.env'], where: 'local' },
    { change: 'scope', patterns: ['.env'], hooks: [], where: 'shared' },
    { change: 'mode', to: 'block', patterns: ['.env'], rules: [], where: 'local' },
    { change: 'mode', to: 'tell', patterns: ['.env'], rules: ['Read(./.env)'], where: 'local' },
    { change: 'mode', to: 'none', patterns: ['.env'], rules: [], where: 'local' },
    { change: 'update' },
  ];

  for (const change of removals) assert.equal(onlyTakesOut(change), true, JSON.stringify(change));
  for (const change of writes) assert.equal(onlyTakesOut(change), false, JSON.stringify(change));
});

test('a switch turned on installs that hook and leaves the other as the file has it', () => {
  const options = optionsOf({ change: 'hooks', hooks: ['refuse'], on: true });

  assert.deepEqual(options.hooks, ['refuse']);
  assert.equal(options.keep, true, 'the other hook stays as the file has it');
  assert.equal(options.remove, false);
  assert.deepEqual(options.protect, [], 'a hook change protects nothing');
  // R58: the page's own confirm step is the consent, and nothing here ever opens a question.
  assert.equal(options.yes, true);
  assert.equal(options.target, 'local');
});

// The first version sent the whole set of hooks the confirm step showed and installed it. `init` has no flag for
// "make the file hold exactly these", so turning a switch off installed the other hook and left the first running.
test('a switch turned off takes that hook out, and takes no deny rule with it', () => {
  const options = optionsOf({ change: 'hooks', hooks: ['watch'], on: false });

  assert.equal(options.remove, true);
  assert.deepEqual(options.hooks, ['watch'], 'named, so `--remove` takes out that one hook rather than every hook');
  assert.equal(options.unprotect, undefined, 'and no rule is named, so every deny rule stays');
});

// `init --protect x --yes` off a terminal installs `watch` as well, which the confirm step never offered. What it did
// offer, since 2026-09-24 (F38), is a file the agent can neither open nor search through: `refuse`, and nothing else.
test('adding a pattern writes the deny rule and search protection, and leaves alerts as they are', () => {
  const options = optionsOf({ change: 'protect', pattern: 'config/*.pem' });

  assert.deepEqual(options.protect, ['config/*.pem']);
  assert.deepEqual(options.hooks, ['refuse'], 'named, not silence: silence means `watch`');
  assert.equal(options.keep, true, 'the other hook stays as the file has it');
  assert.equal(options.remove, false);
});

// F56: General moves the rules first, one by one, then the hooks - and turns nothing on that was off on the way.
test('switching who it is for moves each rule, then the hooks, into the one file', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'written', output: 'Ran.\n' }; } };

  const answer = await settingsChangeToSetup(setup, { change: 'scope', patterns: ['**/.env*', 'customers.csv'], hooks: ['watch'], where: 'shared' });

  assert.deepEqual(seen.map((options) => [options.target, options.remove, options.unprotect ?? options.protect, options.hooks]), [
    ['local', true, ['**/.env*'], []],
    ['shared', false, ['**/.env*'], []],
    ['local', true, ['customers.csv'], []],
    ['shared', false, ['customers.csv'], []],
    ['shared', false, [], ['watch']],
  ]);
  assert.equal(seen.at(-1)?.keep, true, 'a moved hook leaves the other as the file has it');
  assert.equal(answer.outcome, 'written');
});

// F59: Uninstall is `init --remove --watch --refuse --unprotect …` for each file named, the local one first.
test('uninstalling takes both hooks and the rules named out of each file named, and no other', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'written', output: 'Ran.\n' }; } };

  const answer = await settingsChangeToSetup(setup, { change: 'uninstall', rules: { shared: ['customers.csv'], local: ['**/.env*'] } });

  assert.deepEqual(seen.map((options) => [options.target, options.remove, options.hooks, options.unprotect, options.protect]), [
    ['local', true, ['watch', 'refuse'], ['**/.env*'], []],
    ['shared', true, ['watch', 'refuse'], ['customers.csv'], []],
  ]);
  assert.ok(seen.every((options) => options.yes), 'the page\'s confirmation is the consent');
  assert.equal(answer.outcome, 'written');
});

// AO17, found by a review: the ticked Codex run is Codex's alone. Naming the two hooks there took them out of the
// local file as well, so unticking Everyone here's rules alone stopped the hooks for just me too.
test('the ticked Codex run names no hook, so it takes nothing out of the file the window did not name', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'written', output: 'Ran.\n' }; } };

  const answer = await settingsChangeToSetup(setup, { change: 'uninstall', rules: { shared: ['customers.csv'] }, codex: true });

  assert.deepEqual(seen.map((options) => [options.target, options.codex, options.hooks]), [
    ['shared', undefined, ['watch', 'refuse']],
    [undefined, true, []],
  ], 'the file named, then Codex alone - no target, and the empty set of hooks');
  assert.equal(answer.outcome, 'written');
});

test('an uninstall whose first file fails does not go on to the second, and says why', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'unwritable', output: 'Could not be written.\n' }; } };

  const answer = await settingsChangeToSetup(setup, { change: 'uninstall', rules: { local: [], shared: [] } });

  assert.equal(seen.length, 1);
  assert.deepEqual(answer, { outcome: 'unwritable', output: 'Could not be written.' });
});

// `init --remove --unprotect x --yes` off a terminal takes every hook out along with the rule.
test('removing a pattern takes that rule out and leaves both hooks running', () => {
  const options = optionsOf({ change: 'unprotect', pattern: '.npmrc' });

  assert.equal(options.remove, true);
  assert.deepEqual(options.unprotect, ['.npmrc']);
  assert.deepEqual(options.hooks, [], 'the empty set, not silence: silence means every hook');
  assert.deepEqual(options.protect, []);
});

// `nothing-updates-by-itself` U7: the notice's Update is `init --update`, exactly.
test('an update runs the setup as init --update does, naming nothing else', () => {
  assert.deepEqual(optionsOf({ change: 'update' }), { protect: [], remove: false, yes: true, target: 'local', update: true });
});

// `a-hook-runs-what-you-ran` J1: the page names no command, so the setup settles it as it does for `init`.
test('the hooks it writes name no command, and the setup settles it as it does for init', () => {
  assert.equal('invoke' in optionsOf({ change: 'hooks', hooks: ['watch'], on: true }), false);
});

// `init` has no flag that rewrites a rule in place, so changing a pattern is the two runs a terminal would do.
test('changing a pattern takes the old rule out, then writes the new one', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = {
    run: async (options): Promise<SetupResult> => {
      seen.push(options);
      return { outcome: 'written', output: `Ran ${seen.length}.\n` };
    },
  };

  const answer = await settingsChangeToSetup(setup, { change: 'edit', from: '.npmrc', pattern: 'config/*.pem' });

  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0]?.unprotect, ['.npmrc']);
  assert.equal(seen[0]?.remove, true);
  assert.deepEqual(seen[0]?.hooks, [], 'and no hook goes with it');
  assert.deepEqual(seen[1]?.protect, ['config/*.pem']);
  assert.equal(seen[1]?.remove, false);
  assert.deepEqual(seen[1]?.hooks, [], 'and no hook comes with it');
  assert.equal(answer.outcome, 'written');
  assert.equal(answer.output, 'Ran 1.\nRan 2.', 'both runs said something, and the page is told both');
});

// If the old rule cannot come out, writing the new one would leave both patterns protected and neither asked for.
test('a change whose first run fails does not go on to write the new pattern', async () => {
  const seen: SetupOptions[] = [];
  const setup: SetupUseCase = {
    run: async (options): Promise<SetupResult> => {
      seen.push(options);
      return { outcome: 'refused', output: '.claude/settings.local.json is not a JSON object.\n' };
    },
  };

  const answer = await settingsChangeToSetup(setup, { change: 'edit', from: '.npmrc', pattern: 'config/*.pem' });

  assert.equal(seen.length, 1, 'the second run never happens');
  assert.equal(answer.outcome, 'refused');
  assert.match(answer.output, /is not a JSON object/);
});

// Found by review: `init` answers a pattern it will not write with "Not written" and goes on, so the page saw success,
// reloaded, and the file it had picked was simply not in the list.
test('a pattern init would not write is refused with its reason, and nothing is run', async () => {
  let ran = 0;
  const setup = { run: async () => { ran += 1; return { outcome: 'written' as const, output: '' }; } };

  const answer = await settingsChangeToSetup(setup, { change: 'adopt', patterns: ['**/.env*', '**/contract (1).pdf'], where: 'local' });

  assert.equal(answer.outcome, 'refused');
  assert.match(answer.output, /"\*\*\/contract \(1\)\.pdf" was not written: a deny rule is written as Read\(\.\.\.\)/);
  assert.equal(ran, 0);
});

// F57: a row's switch. To Tell me, the rules come out of both files, then the pattern goes on the list General names;
// to Block, it comes off both lists, then is protected as an add is.
test('switching a file to Tell me takes its rules out of both files and lists it; back to Block reverses it', async () => {
  const seen: SetupOptions[] = [];
  const listed: [string, readonly string[], readonly string[]][] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'written', output: '' }; } };
  const lists = { change: async (file: 'local' | 'shared', add: readonly string[], remove: readonly string[]) => { listed.push([file, add, remove]); return true; } };

  await modeChange(setup, lists, { change: 'mode', to: 'tell', patterns: ['**/.env.local'], rules: ['./.env.local'], where: 'local' });
  assert.deepEqual(seen.map((options) => [options.target, options.unprotect, options.hooks]), [['local', ['./.env.local'], []], ['shared', ['./.env.local'], []]]);
  assert.deepEqual(listed, [['local', ['**/.env.local'], []]]);

  seen.length = 0;
  listed.length = 0;
  await modeChange(setup, lists, { change: 'mode', to: 'block', patterns: ['**/.env.local'], rules: [], where: 'shared' });
  assert.deepEqual(listed, [['local', [], ['**/.env.local']], ['shared', [], ['**/.env.local']]]);
  assert.deepEqual(seen.map((options) => [options.target, options.protect, options.hooks, options.keep]), [['shared', ['**/.env.local'], ['refuse'], true]]);
});

// `block-or-track-from-the-report` BT6: the report's own window tracks a file no rule holds - an everyday file, or a
// private one the project denies nowhere. There is nothing to take out, so the whole change is the told list, and no
// settings file is touched at all.
test('tracking a file no rule holds writes the told list alone and runs no setup', async () => {
  const seen: SetupOptions[] = [];
  const listed: [string, readonly string[], readonly string[]][] = [];
  const setup: SetupUseCase = { run: async (options): Promise<SetupResult> => { seen.push(options); return { outcome: 'written', output: '' }; } };
  const lists = { change: async (file: 'local' | 'shared', add: readonly string[], remove: readonly string[]) => { listed.push([file, add, remove]); return true; } };

  const answer = await modeChange(setup, lists, { change: 'mode', to: 'tell', patterns: ['./README.md'], rules: [], where: 'local' });

  assert.equal(answer.outcome, 'written');
  assert.deepEqual(seen, [], 'no settings file is written');
  assert.deepEqual(listed, [['local', ['./README.md'], []]]);
});

// `block-means-blocked` K3: a deny rule the page writes is half a block without `refuse`, so every route that blocks a
// file names it, keeping the other hook. Only a rule changed or moved names none: it stays the block it was, and a
// row that was not whole says so (K7).
test('K3: every change that blocks a file installs refuse with its rules, and only edit and move do not', async () => {
  const runs: [string, SetupOptions][] = [];
  const recording = (name: string): SetupUseCase => ({
    run: async (options): Promise<SetupResult> => { runs.push([name, options]); return { outcome: 'written', output: '' }; },
  });
  const lists = { change: async () => true };
  const blocking: [string, SettingsChange][] = [
    ['protect', { change: 'protect', pattern: 'config/*.pem' }],
    ['adopt', { change: 'adopt', patterns: ['**/.env*', '**/*.env'], where: 'local' }],
    ['edit', { change: 'edit', from: '**/a.key', pattern: '**/b.key', where: 'local' }],
    ['move', { change: 'move', pattern: '**/a.key', from: 'local', where: 'shared' }],
  ];
  for (const [name, change] of blocking) await settingsChangeToSetup(recording(name), change);
  await modeChange(recording('mode'), lists, { change: 'mode', to: 'block', patterns: ['**/.env.local'], rules: [], where: 'local' });

  const writing = runs.filter(([, options]) => !options.remove && options.protect.length > 0);
  assert.deepEqual([...new Set(writing.map(([name]) => name))], ['protect', 'adopt', 'edit', 'move', 'mode']);
  for (const [name, options] of writing) {
    if (name === 'edit' || name === 'move') assert.deepEqual(options.hooks, [], `${name} names no hook`);
    else assert.deepEqual([options.hooks, options.keep], [['refuse'], true], `${name} installs refuse and keeps the other hook`);
  }
});

// `codex-blocks-too` CK5: Block in Codex too is `init --codex`, exactly: the setup reads what Claude Code runs.
test('Block in Codex too runs the setup as init --codex does, naming nothing else', () => {
  assert.deepEqual(optionsOf({ change: 'codex' }), { protect: [], remove: false, yes: true, target: 'local', codex: true });
});
