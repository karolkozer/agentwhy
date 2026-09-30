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
  assert.deepEqual(fromRules.policy.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']), [['**/.env', 'block'], ['**/customers.csv', 'tell']]);

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
  assert.deepEqual(await lists.read(), { local: ['**/customers.csv'], shared: 'unreadable' });
  assert.equal(await lists.change('shared', ['**/x.csv'], []), false);
  assert.equal(await files.readText(join(root, '.claude', 'agentwhy.json')), 'not json', 'what somebody wrote is kept');
  assert.equal(await lists.change('local', [], ['**/customers.csv']), true);
  assert.deepEqual((await lists.read()).local, []);
});
