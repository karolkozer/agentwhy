// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { tellListPaths, TellLists, writtenTellList } from '../../../../src/report/private-files/tell-lists.ts';
import { Everywhere } from '../../../../src/report/start/onboarding/everywhere.ts';
import { everywhereOf } from '../../../../src/report/start/onboarding/onboarding-view.ts';
import { globalDefaults } from '../../../../src/setup/global-defaults.ts';
import type { GlobalProtection, GlobalSetupOptions } from '../../../../src/setup/global-setup.ts';
import type { SetupOutcome } from '../../../../src/setup/project-setup.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';

// `.ai/specs/2026-10-05-protected-everywhere.md` G7-G10, GD11-GD14: the onboarding's computer-wide path, from the
// files a home directory holds - one the test names, never the person's own.

const files = new NodeFileSystem();

function everywhereIn(home: string, world: { readonly codex?: boolean; readonly outcome?: SetupOutcome } = {}) {
  const asked: GlobalSetupOptions[] = [];
  const protect: GlobalProtection = {
    run: async (options) => {
      asked.push(options);
      return { outcome: world.outcome ?? 'written', output: 'written' };
    },
    list: async () => assert.fail('the page lists nothing through the command line\'s words'),
  };
  const tellLists = new TellLists({ files, writer: files, paths: tellListPaths(home, join(home, 'no-project')) });
  const everywhere = new Everywhere({ files, home, platform: 'darwin', tellLists, protect, codexOnThisComputer: async () => world.codex ?? false });
  return { everywhere, asked };
}

const settingsWith = (deny: readonly string[]) => JSON.stringify({ model: 'a-model', permissions: { deny } });

test('what the path starts from: GD14\'s rows as this computer holds them, the rules, the told list, and Codex', async (t) => {
  const home = await writeSession(t, {
    '.ssh/id_ed25519': 'not read',
    '.aws/credentials': 'not read',
    '.claude/settings.json': settingsWith(['Read(**/.ssh/**)', 'Edit(**/.ssh/**)', 'Read(**/ledger.csv)', 'Bash(rm -rf *)']),
    '.agentwhy/private-files.json': writtenTellList(['**/.kube/**']),
  });

  const now = await everywhereIn(home, { codex: true }).everywhere.now();
  assert.deepEqual(now.rows.filter((row) => row.present).map((row) => row.id), ['ssh', 'aws']);
  assert.deepEqual(now.blocked, ['**/.ssh/**', '**/ledger.csv'], 'file rules only, a name anchored as refuse reads it');
  assert.deepEqual(now.told, ['**/.kube/**']);
  assert.equal(now.codex, true);

  const view = everywhereOf(now);
  assert.deepEqual(view.rows.map((row) => [row.id ?? row.pattern, row.present, row.now ?? '-']), [
    ['ssh', true, 'block'],
    ['aws', true, '-'],
    ['kube', false, 'tell'],
    ['**/ledger.csv', true, 'block'],
    ['azure', false, '-'], ['gcloud', false, '-'], ['github', false, '-'], ['git-credentials', false, '-'],
    ['gnupg', false, '-'], ['docker', false, '-'], ['netrc', false, '-'],
  ], 'what holds something or is here first, then the person\'s own, then what is folded');
  assert.equal(view.rows.find((row) => row.pattern === '**/ledger.csv')?.path, 'ledger.csv');
  // a-file-in-its-place IPD1: `.ssh` is held by the anchored form an older release wrote - the same row, known as stale.
  assert.equal(view.rows.find((row) => row.id === 'ssh')?.stale, true);
  assert.equal(view.rows.find((row) => row.id === 'kube')?.stale, true, 'a told one too');
  assert.equal(view.writable, true);
  // G7a: and that this computer is set up, from these rows alone - no reading of its own, and no record (GD26).
  assert.equal(view.setUp, true);
});

test('G7a: a computer holds nothing until a rule, a tracked file or the alerts of every project are there', async (t) => {
  const empty = await everywhereIn(await writeSession(t, {})).everywhere.now();
  assert.equal(everywhereOf(empty).setUp, false);
  assert.equal(everywhereOf({ ...empty, alerts: true }).setUp, true, 'alerts in every project are a setup too');
  assert.equal(everywhereOf({ ...empty, alerts: false }).setUp, false);
  assert.equal(everywhereOf({ ...empty, alerts: 'unreadable' }).setUp, false, 'unread is no guess either way');
});

test('a home with nothing set up offers every row, and a file it cannot read cannot be written from the page', async (t) => {
  const empty = await everywhereIn(await writeSession(t, {})).everywhere.now();
  assert.deepEqual(empty.blocked, []);
  assert.deepEqual(empty.told, []);
  assert.equal(everywhereOf(empty).rows.length, globalDefaults('darwin').length);

  const broken = await everywhereIn(await writeSession(t, { '.claude/settings.json': '{ not json' })).everywhere.now();
  assert.equal(broken.blocked, 'unreadable');
  assert.equal(everywhereOf(broken).writable, false);
});

// G1-G3 and G17 through `GlobalProtect`, GD11 through the told list: the confirmation is the consent (R58).
test('a confirmation blocks through GlobalProtect with consent given, and tracks onto the computer\'s told list', async (t) => {
  const home = await writeSession(t, {});
  const { everywhere, asked } = everywhereIn(home);

  const answer = await everywhere.protect({ block: ['**/.aws/**', '**/.ssh/**'], tell: ['Northwind contracts/**'] });
  assert.deepEqual(answer, { outcome: 'finished', results: [{ change: 'block', written: true }, { change: 'tell', written: true }] });
  assert.deepEqual(asked, [{ protect: ['**/.aws/**', '**/.ssh/**'], remove: false, yes: true }]);
  assert.deepEqual(JSON.parse(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8')).tell, ['**/Northwind contracts/**'], 'anchored, as a block is');
});

// GD13: "in Codex" is said only where the check runs there now, read from Codex's own files after the write.
test('Codex is named only where it is used and something was blocked, and only as on where its check holds', async (t) => {
  const withCodex = await writeSession(t, { '.codex/config.toml': '' });
  const blocked = await everywhereIn(withCodex, { codex: true }).everywhere.protect({ block: ['**/.aws/**'], tell: [] });
  assert.equal(blocked.outcome === 'finished' ? blocked.codex : 'refused', 'off', 'the fake writer installed nothing, and nothing is assumed');

  const tracked = await everywhereIn(withCodex, { codex: true }).everywhere.protect({ block: [], tell: ['**/.aws/**'] });
  assert.equal(tracked.outcome === 'finished' ? tracked.codex : 'refused', undefined, 'Track needs no check in Codex');

  const none = await everywhereIn(await writeSession(t, {}), { codex: false }).everywhere.protect({ block: ['**/.aws/**'], tell: [] });
  assert.equal(none.outcome === 'finished' ? none.codex : 'refused', undefined);
});

test('a failed write is said as not written, and the other half is still tried', async (t) => {
  const { everywhere } = everywhereIn(await writeSession(t, {}), { outcome: 'unwritable' });
  const answer = await everywhere.protect({ block: ['**/.aws/**'], tell: ['**/.kube/**'] });
  assert.deepEqual(answer, { outcome: 'finished', results: [{ change: 'block', written: false }, { change: 'tell', written: true }] });
});

// Refused whole, before anything is written: each is a page out of date or a request it did not send.
test('a request the page could not have sent is refused whole, and nothing is written', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': settingsWith(['Read(**/.ssh/**)', 'Edit(**/.ssh/**)']) });
  const { everywhere, asked } = everywhereIn(home);
  for (const [choices, said] of [
    [{ block: [], tell: [] }, /Nothing was chosen/],
    [{ block: ['Read(x)'], tell: [] }, /a bracket cannot be part of the path/],
    // a-file-in-its-place IP1: a path from / is a place now, written //; a Windows path is still not measured (IPB13).
    [{ block: ['C:\\Users\\someone\\.ssh\\**'], tell: [] }, /is a Windows path or names a variable/],
    [{ block: [], tell: ['C:/Users/someone/Contracts/**'] }, /is a Windows path or names a variable/],
    [{ block: ['**/.aws/**'], tell: ['**/.aws/**'] }, /blocked and tracked at once/],
    [{ block: [], tell: ['**/.ssh/**'] }, /is blocked on this computer already/],
  ] as const) {
    const answer = await everywhere.protect(choices);
    assert.equal(answer.outcome, 'refused', JSON.stringify(choices));
    assert.match(answer.outcome === 'refused' ? answer.message : '', said);
  }
  assert.deepEqual(asked, []);
  assert.equal(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8').catch(() => 'none'), 'none');

  const broken = everywhereIn(await writeSession(t, { '.claude/settings.json': '{ not json' }));
  const answer = await broken.everywhere.protect({ block: ['**/.aws/**'], tell: [] });
  assert.match(answer.outcome === 'refused' ? answer.message : '', /could not be read, so nothing was written/);
  assert.doesNotMatch(answer.outcome === 'refused' ? answer.message : '', /settings\.json/, 'GD13: never the file\'s name');
});

// Step 3: Settings takes a computer row out, or switches it - what is taken out first, in one request.
test('a computer block is taken out through GlobalProtect’s removal, and a Track off the computer’s list', async (t) => {
  const home = await writeSession(t, {
    '.claude/settings.json': settingsWith(['Read(**/.aws/**)', 'Edit(**/.aws/**)']),
    '.agentwhy/private-files.json': writtenTellList(['**/Contracts/**']),
  });
  const { everywhere, asked } = everywhereIn(home);

  assert.deepEqual(await everywhere.protect({ block: [], tell: [], unblock: ['**/.aws/**'] }), { outcome: 'finished', results: [{ change: 'unblock', written: true }] });
  assert.deepEqual(asked, [{ protect: [], unprotect: ['**/.aws/**'], remove: true, yes: true }]);

  assert.deepEqual(await everywhere.protect({ block: [], tell: [], untell: ['**/Contracts/**'] }), { outcome: 'finished', results: [{ change: 'untell', written: true }] });
  assert.deepEqual(JSON.parse(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8')).tell, []);
});

test('a switch to Track takes the block out first, and tracks what the computer blocked a moment before', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': settingsWith(['Read(**/.aws/**)', 'Edit(**/.aws/**)']) });
  const { everywhere, asked } = everywhereIn(home);

  const answer = await everywhere.protect({ block: [], tell: ['**/.aws/**'], unblock: ['**/.aws/**'] });
  assert.deepEqual(answer, { outcome: 'finished', results: [{ change: 'unblock', written: true }, { change: 'tell', written: true }] }, 'not refused as blocked already');
  assert.equal(asked[0]?.remove, true);
  assert.deepEqual(JSON.parse(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8')).tell, ['**/.aws/**']);
});

// A switch whose first half fails stops there: the block a person was moving away from stays, and no Track is written.
test('a block that could not be taken out leaves the switch undone, and writes no Track', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': settingsWith(['Read(**/.aws/**)', 'Edit(**/.aws/**)']) });
  const { everywhere } = everywhereIn(home, { outcome: 'unwritable' });
  const answer = await everywhere.protect({ block: [], tell: ['**/.aws/**'], unblock: ['**/.aws/**'] });
  assert.deepEqual(answer, { outcome: 'finished', results: [{ change: 'unblock', written: false }] });
  assert.equal(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8').catch(() => 'none'), 'none');
});

test('a request that writes and takes out the same pattern is refused whole', async (t) => {
  const { everywhere, asked } = everywhereIn(await writeSession(t, {}));
  for (const choices of [{ block: ['**/.aws/**'], tell: [], unblock: ['**/.aws/**'] }, { block: [], tell: ['**/x/**'], untell: ['**/x/**'] }]) {
    const answer = await everywhere.protect(choices);
    assert.match(answer.outcome === 'refused' ? answer.message : '', /written and taken out at once/);
  }
  assert.deepEqual(asked, []);
});

// The review of 2026-10-06: to Block, the Track came off first, so a block that could not be written left the file on
// neither list. The block goes in first now, and the Track comes off only once it is in.
test('a switch to Block writes the block first, and a block that fails leaves the Track where it was', async (t) => {
  const home = await writeSession(t, { '.agentwhy/private-files.json': writtenTellList(['**/Contracts/**']) });
  const failing = everywhereIn(home, { outcome: 'unwritable' });
  assert.deepEqual(await failing.everywhere.protect({ block: ['**/Contracts/**'], tell: [], untell: ['**/Contracts/**'] }),
    { outcome: 'finished', results: [{ change: 'block', written: false }] }, 'the Track is not taken off');
  assert.deepEqual(JSON.parse(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8')).tell, ['**/Contracts/**']);

  const working = everywhereIn(home);
  assert.deepEqual(await working.everywhere.protect({ block: ['**/Contracts/**'], tell: [], untell: ['**/Contracts/**'] }),
    { outcome: 'finished', results: [{ change: 'block', written: true }, { change: 'untell', written: true }] });
  assert.deepEqual(JSON.parse(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8')).tell, []);
});

// A rule written by hand as an absolute path is shown by that path, and its bin sends it: a removal is not a write.
test('a block written by hand as a Windows path can be taken out, though none can be written', async (t) => {
  const { everywhere, asked } = everywhereIn(await writeSession(t, {}));
  assert.equal((await everywhere.protect({ block: [], tell: [], unblock: ['C:/Users/someone/.aws/credentials'] })).outcome, 'finished');
  assert.deepEqual(asked[0]?.unprotect, ['C:/Users/someone/.aws/credentials']);
  assert.equal((await everywhere.protect({ block: ['C:/Users/someone/.aws/credentials'], tell: [] })).outcome, 'refused');
});

// a-file-in-its-place IP1: a place is written as its place - a block through `protect`, a Track on the computer's list -
// so Block and Track name the same file, and only it.
test('IP1: a place is blocked or tracked as its place, ~/ and // alike', async (t) => {
  const home = await writeSession(t, {});
  const { everywhere, asked } = everywhereIn(home);
  assert.equal((await everywhere.protect({ block: ['~/Projects/my-app/package.json', '//Volumes/share/ledger.csv'], tell: [] })).outcome, 'finished');
  assert.deepEqual(asked[0]?.protect, ['~/Projects/my-app/package.json', '//Volumes/share/ledger.csv']);
  assert.equal((await everywhere.protect({ block: [], tell: ['~/Documents/contract.pdf'] })).outcome, 'finished');
  assert.match(await readFile(join(home, '.agentwhy', 'private-files.json'), 'utf8'), /"~\/Documents\/contract\.pdf"/, 'told as its place, not anchored');
});

// `protected-everywhere` GD23: the computer's alerts, read with the rest and written on their own - never with a rule.
test('GD23: alerts in every project are read with the rest, and turned on or off on their own', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': settingsWith([]) });
  const set: boolean[] = [];
  const tellLists = new TellLists({ files, writer: files, paths: tellListPaths(home, join(home, 'no-project')) });
  const protect: GlobalProtection = { run: async () => assert.fail('no rule is written for alerts'), list: async () => assert.fail('nothing listed') };
  const everywhere = new Everywhere({
    files, home, platform: 'darwin', tellLists, protect, codexOnThisComputer: async () => false,
    alerts: { on: async () => false, set: async (on) => { set.push(on); return { outcome: 'written', output: '' }; } },
  });
  assert.equal((await everywhere.now()).alerts, false);
  assert.deepEqual(await everywhere.protect({ block: [], tell: [], alerts: true }), { outcome: 'finished', results: [{ change: 'alerts', written: true }] });
  assert.deepEqual(set, [true]);

  const without = everywhereIn(home).everywhere;
  assert.equal((await without.now()).alerts, undefined, 'a run that cannot turn them on says nothing of them');
  assert.equal((await without.protect({ block: [], tell: [], alerts: true })).outcome, 'refused');
});

// `protected-everywhere` GD24: Uninstall takes out what the computer setup wrote - its Read and Edit pairs, the told list,
// the alerts - and leaves a rule written by hand. Codex's check is no part of it.
test('GD24: Uninstall takes out agentwhy’s pairs, the told list and the alerts, and leaves a rule written by hand', async (t) => {
  const home = await writeSession(t, {
    '.claude/settings.json': settingsWith(['Read(**/.ssh/**)', 'Edit(**/.ssh/**)', 'Read(~/.aws/credentials)']),
    '.agentwhy/private-files.json': writtenTellList(['**/Contracts/**']),
  });
  const asked: GlobalSetupOptions[] = [];
  const set: boolean[] = [];
  const tellLists = new TellLists({ files, writer: files, paths: tellListPaths(home, join(home, 'no-project')) });
  const protect: GlobalProtection = {
    run: async (options) => { asked.push(options); return { outcome: 'written', output: '' }; },
    list: async () => assert.fail('nothing listed'),
  };
  const everywhere = new Everywhere({
    files, home, platform: 'darwin', tellLists, protect, codexOnThisComputer: async () => true,
    alerts: { on: async () => true, set: async (on) => { set.push(on); return { outcome: 'written', output: '' }; } },
  });

  const answer = await everywhere.protect({ block: [], tell: [], uninstall: true });
  assert.deepEqual(answer, { outcome: 'finished', results: [{ change: 'unblock', written: true }, { change: 'untell', written: true }, { change: 'alerts', written: true }] });
  assert.deepEqual(asked, [{ protect: [], unprotect: ['**/.ssh/**'], remove: true, yes: true }], 'the pair alone - not the rule written by hand');
  assert.deepEqual((await tellLists.read()).computer, []);
  assert.deepEqual(set, [false]);
});

test('GD24: Uninstall with nothing there takes nothing out, and an unreadable file is not guessed past', async (t) => {
  const empty = everywhereIn(await writeSession(t, { '.claude/settings.json': settingsWith([]) }));
  assert.deepEqual(await empty.everywhere.protect({ block: [], tell: [], uninstall: true }), { outcome: 'finished', results: [] });
  assert.deepEqual(empty.asked, []);
  const broken = everywhereIn(await writeSession(t, { '.claude/settings.json': '{ not json' }));
  assert.equal((await broken.everywhere.protect({ block: [], tell: [], uninstall: true })).outcome, 'refused');
  assert.deepEqual(broken.asked, []);
});

// GD23, GD26: the onboarding's step writes the alerts with its files, and a step with no file new is finished all the
// same - nothing written but what is ticked. Whether the computer is set up is read from what is there.
test('GD23, GD26: alerts come with the files, a step finished with nothing new writes nothing, and set-up is read', async (t) => {
  const home = await writeSession(t, { '.claude/settings.json': settingsWith([]) });
  const set: boolean[] = [];
  let on = false;
  const asked: GlobalSetupOptions[] = [];
  const tellLists = new TellLists({ files, writer: files, paths: tellListPaths(home, join(home, 'no-project')) });
  const protect: GlobalProtection = { run: async (options) => { asked.push(options); return { outcome: 'written', output: '' }; }, list: async () => assert.fail('nothing listed') };
  const everywhere = new Everywhere({
    files, home, platform: 'darwin', tellLists, protect, codexOnThisComputer: async () => false,
    alerts: { on: async () => on, set: async (value) => { set.push(value); on = value; return { outcome: 'written', output: '' }; } },
  });

  assert.equal(await everywhere.setUp(), false, 'nothing of the computer’s there');
  assert.deepEqual(await everywhere.protect({ block: [], tell: [], finish: true }), { outcome: 'finished', results: [] });
  assert.deepEqual([asked, set], [[], []], 'finished, nothing written');
  const both = await everywhere.protect({ block: ['**/.aws/**'], tell: [], alerts: true });
  assert.deepEqual(both, { outcome: 'finished', results: [{ change: 'block', written: true }, { change: 'alerts', written: true }] });
  assert.deepEqual(set, [true]);
  assert.equal(await everywhere.setUp(), true, 'the alerts alone are the computer set up');
  assert.equal((await everywhere.protect({ block: [], tell: [] })).outcome, 'refused', 'nothing at all is still nothing chosen');
});
