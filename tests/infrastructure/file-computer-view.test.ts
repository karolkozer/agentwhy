// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FileComputerView } from '../../src/infrastructure/file-computer-view.ts';
import { writeSession } from '../helpers/synthetic-session.ts';

// `protected-everywhere` GD21: the computer's page's choice, kept in the person's own agentwhy folder.
test('GD21: a choice is kept and read back; none, or one that cannot be read, is no choice', async (t) => {
  const root = await writeSession(t, {});
  const path = join(root, '.agentwhy', 'computer-view.json');
  const view = new FileComputerView(path);
  assert.equal(await view.read(), undefined, 'nothing chosen yet');
  assert.equal(await view.write('projects'), true);
  assert.equal(await view.read(), 'projects');
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1, scope: 'projects' });
  for (const text of ['{ not json', JSON.stringify({ version: 1, scope: 'everything' }), JSON.stringify({ version: 1, scope: 'all' }), JSON.stringify({ version: 2, scope: 'projects' })]) {
    await writeFile(path, text);
    assert.equal(await view.read(), undefined, text);
  }
  assert.equal(await new FileComputerView(join(path, 'inside-a-file.json')).write('outside'), false, 'a record that cannot be written says so');
});
