// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { choosePolicy } from '../../../src/report/choose-policy.ts';
import { readTellList, TellLists, tellListPaths, writtenTellList } from '../../../src/report/private-files/tell-lists.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

// for-people-who-build-with-ai F57: the files a person asked only to be told about, kept by agentwhy.
test('a told list is read as written, and one nobody can read is not guessed at', () => {
  assert.deepEqual(readTellList(undefined), [], 'no file is an empty list');
  assert.deepEqual(readTellList(writtenTellList(['**/customers.csv', '**/customers.csv'])), ['**/customers.csv']);
  for (const text of ['not json', '{"version":2,"tell":[]}', '{"version":1,"tell":"x"}', '{"version":1,"tell":[1]}']) {
    assert.equal(readTellList(text), 'unreadable', text);
  }
});

test('everyone’s list is in the project, and just-me’s is outside it, where git cannot pick it up', () => {
  const paths = tellListPaths('/Users/someone', '/work/the-app').pathsFor('/work/the-app/.claude/settings.local.json');
  assert.equal(paths.shared, '/work/the-app/.claude/agentwhy.json');
  assert.equal(paths.local, '/Users/someone/.agentwhy/projects/-work-the-app/private-files.json');
});

test('a told file is private and told; a blocked one stays blocked; the built-in list gives way to a choice', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./.env)', 'Edit(./.env)'] } }),
    '.claude/agentwhy.json': writtenTellList(['**/customers.csv', '**/.env']),
  });
  const tell = tellListPaths(join(root, 'home'), root);

  const fromRules = await choosePolicy({ settingsPath: join(root, '.claude', 'settings.json') }, files, tell);
  assert.ok('policy' in fromRules);
  // Told first: a file tracked by name under a broader blocking pattern is told however its path is written.
  assert.deepEqual(fromRules.policy.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']), [['**/customers.csv', 'tell'], ['**/.env', 'block']]);

  const builtIn = await choosePolicy({}, files, tellListPaths(join(root, 'home'), root));
  assert.ok('policy' in builtIn);
  assert.equal(builtIn.policy.protected.find((entry) => entry.pattern === '**/customers.csv')?.mode, 'tell');

  const chosen = await choosePolicy({ policyPath: join(root, 'missing.json') }, files, tell);
  assert.ok('errors' in chosen, 'a policy file is the whole of what was chosen, and nothing is added to it');
});

test('the lists are written one change at a time, and one that cannot be read is not written over', async (t) => {
  const root = await writeSession(t, { '.claude/agentwhy.json': 'not json' });
  const lists = new TellLists({ files, writer: files, paths: tellListPaths(join(root, 'home'), root) });

  assert.equal(await lists.change('local', ['**/customers.csv'], []), true);
  assert.deepEqual(await lists.read(), { local: ['**/customers.csv'], shared: 'unreadable', computer: [] });
  assert.equal(await lists.change('shared', ['**/x.csv'], []), false);
  assert.equal(await files.readText(join(root, '.claude', 'agentwhy.json')), 'not json', 'what somebody wrote is kept');
  assert.equal(await lists.change('local', [], ['**/customers.csv']), true);
  assert.deepEqual((await lists.read()).local, []);
});

// `2026-10-05-protected-everywhere.md` GD11: the computer's list is the person's own, and the same for every project.
test('the computer\'s list is in the person\'s own agentwhy directory, whichever project asks', () => {
  const lists = tellListPaths('/Users/someone', '/work/the-app');
  assert.equal(lists.pathsFor('/work/the-app/.claude/settings.local.json').computer, '/Users/someone/.agentwhy/private-files.json');
  assert.equal(lists.pathsFor('/work/other/.claude/settings.json').computer, '/Users/someone/.agentwhy/private-files.json');
  assert.equal(lists.pathsFor(undefined).computer, '/Users/someone/.agentwhy/private-files.json');
});

// GD11: it composes as a project's lists do (`withTold`) - told, a project's own block of the same file kept, the
// built-in list giving way - and joins the project's two rather than replacing them.
test('a file the computer tracks is told in every project, and a project that blocks it keeps it blocked', async (t) => {
  const home = await writeSession(t, { '.agentwhy/private-files.json': writtenTellList(['**/ledger.csv', '**/.env']) });
  const root = await writeSession(t, {
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(./.env)', 'Edit(./.env)'] } }),
    '.claude/agentwhy.json': writtenTellList(['**/customers.csv']),
  });
  const tell = tellListPaths(home, root);

  const fromRules = await choosePolicy({ settingsPath: join(root, '.claude', 'settings.json') }, files, tell);
  assert.ok('policy' in fromRules);
  assert.deepEqual(
    fromRules.policy.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']),
    [['**/customers.csv', 'tell'], ['**/ledger.csv', 'tell'], ['**/.env', 'block']],
  );

  const builtIn = await choosePolicy({}, files, tellListPaths(home, await writeSession(t, {})));
  assert.ok('policy' in builtIn);
  assert.equal(builtIn.policy.protected.find((entry) => entry.pattern === '**/ledger.csv')?.mode, 'tell', 'in a project with no list of its own');
});

test('the computer\'s list is written on its own, and one that cannot be read is neither guessed at nor written over', async (t) => {
  const home = await writeSession(t, {});
  const root = await writeSession(t, {});
  const lists = new TellLists({ files, writer: files, paths: tellListPaths(home, root) });

  assert.equal(await lists.change('computer', ['**/.aws/**'], []), true);
  assert.deepEqual(await lists.read(), { local: [], shared: [], computer: ['**/.aws/**'] }, 'and neither of the project\'s lists');
  assert.deepEqual(readTellList(await files.readText(join(home, '.agentwhy', 'private-files.json'))), ['**/.aws/**']);

  await files.writeText(join(home, '.agentwhy', 'private-files.json'), 'not json');
  assert.equal(await lists.change('computer', ['**/.kube/**'], []), false);
  assert.equal(await files.readText(join(home, '.agentwhy', 'private-files.json')), 'not json', 'what somebody wrote is kept');
  const policy = await choosePolicy({}, files, tellListPaths(home, root));
  assert.ok('policy' in policy);
  assert.equal(policy.policy.protected.some((entry) => entry.mode === 'tell'), false, 'nothing is told from a list nobody can read');
});

// `2026-10-07-a-file-in-its-place.md` IP1, IPD3: where the home is known, a rule naming a place - `~/…` or `//…` - is read
// as that place, a told one as much as a blocked one; without it, every rule is read as it always was.
test('IP1: given the home, a rule naming a place is that place; without it, as before', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.json': JSON.stringify({ permissions: { deny: ['Read(~/.ssh/**)', 'Read(//Volumes/share/ledger.csv)', 'Read(**/.env)'] } }),
    '.claude/agentwhy.json': JSON.stringify({ version: 1, tell: ['~/Documents/contract.pdf', '**/customers.csv'] }),
  });
  const tell = tellListPaths(join(root, 'home'), root);
  const settingsPath = join(root, '.claude', 'settings.json');
  const placed = await choosePolicy({ settingsPath }, files, tell, '/Users/someone');
  assert.ok('policy' in placed);
  assert.deepEqual(placed.policy.protected.map((entry) => entry.pattern), [
    '/Users/someone/Documents/contract.pdf', '**/customers.csv', '/Users/someone/.ssh/**', '/Volumes/share/ledger.csv', '**/.env',
  ]);
  const asBefore = await choosePolicy({ settingsPath }, files, tell);
  assert.ok('policy' in asBefore);
  assert.deepEqual(asBefore.policy.protected.map((entry) => entry.pattern), ['~/Documents/contract.pdf', '**/customers.csv', '**/.ssh/**', '//Volumes/share/ledger.csv', '**/.env']);
});
