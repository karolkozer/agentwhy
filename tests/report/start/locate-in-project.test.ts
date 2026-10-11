// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { locateInProject } from '../../../src/report/start/locate-in-project.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const disk = new NodeFileSystem();
const TOKEN = 'AW-LOCATE-NEVER-READ';

/** The layout the reported project had: one `exercise.py` per lesson, a virtual environment beside them. */
const COURSE = {
  'lessons/stage_01/01_variables/exercise.py': `TOKEN = "${TOKEN}"\n`,
  'lessons/stage_02/02_tuples/exercise.py': `TOKEN = "${TOKEN}"\n`,
  'lessons/stage_02/03_dicts/exercise.py': `TOKEN = "${TOKEN}"\n`,
  '.venv/lib/site/exercise.py': 'x\n',
  'main.py': 'x\n',
};

// `2026-10-09-the-file-not-its-name.md` FN3, FND3: the browser gives the page a name and nothing more (F36), so the server
// finds the files of that name - by listing folders, names and kinds, and never by opening a file.
test('a picked file is found by its name in every folder, the project\'s own first, and no file is opened', async (t) => {
  const root = await writeSession(t, COURSE);
  await symlink(join(root, 'lessons'), join(root, 'linked'));

  const [found] = await locateInProject(disk, root, [{ name: 'exercise.py', kind: 'file' }]);

  assert.deepEqual(found, {
    name: 'exercise.py',
    kind: 'file',
    complete: true,
    paths: [
      { path: 'lessons/stage_01/01_variables/exercise.py', tool: false },
      { path: 'lessons/stage_02/02_tuples/exercise.py', tool: false },
      { path: 'lessons/stage_02/03_dicts/exercise.py', tool: false },
      { path: '.venv/lib/site/exercise.py', tool: true },
    ],
  }, 'a folder reached through a link is not walked, so nothing is found twice');
  assert.ok(!JSON.stringify(found).includes(TOKEN), 'what a file holds is never part of the answer');

  const [none] = await locateInProject(disk, root, [{ name: 'notes.md', kind: 'file' }]);
  assert.deepEqual(none, { name: 'notes.md', kind: 'file', complete: true, paths: [] });
});

// FN4: a picked folder gives its name and the names inside it (`webkitRelativePath`), which tell two folders of one name apart.
test('a picked folder is found by its name, and the names inside it narrow folders that share it', async (t) => {
  const root = await writeSession(t, { ...COURSE, 'archive/02_tuples/old.txt': 'x\n' });

  const [all] = await locateInProject(disk, root, [{ name: '02_tuples', kind: 'folder' }]);
  assert.deepEqual(all?.paths.map((one) => one.path), ['archive/02_tuples', 'lessons/stage_02/02_tuples']);

  const [narrowed] = await locateInProject(disk, root, [{ name: '02_tuples', kind: 'folder', inside: ['exercise.py'] }]);
  assert.deepEqual(narrowed?.paths.map((one) => one.path), ['lessons/stage_02/02_tuples']);
});

// FND4: past the bound the answer says it did not look everywhere, and the page offers the every-file rule or a typed path.
test('a project larger than the bound is said to be looked through in part', async (t) => {
  const root = await writeSession(t, COURSE);

  const [found] = await locateInProject(disk, root, [{ name: 'exercise.py', kind: 'file' }], 3);

  assert.equal(found?.complete, false);
});

// FND3, found by the review of 2026-10-09: walked breadth first through everything, a tool's folders ran the bound out
// before the project's own deeper folders were reached - so the person's own file was missing from the list.
test('the project\'s own folders are looked through before a tool\'s, so a bound spent on node_modules spares them', async (t) => {
  const tool = Object.fromEntries(Array.from({ length: 40 }, (_, at) => [`node_modules/pkg/${at}.js`, 'x\n']));
  const root = await writeSession(t, { ...tool, 'node_modules/pkg/config.json': 'x\n', 'src/lib/a/b/config.json': 'x\n' });

  const [found] = await locateInProject(disk, root, [{ name: 'config.json', kind: 'file' }], 20);

  assert.equal(found?.complete, false, 'the tool’s folder was not looked through in full');
  assert.deepEqual(found?.paths, [{ path: 'src/lib/a/b/config.json', tool: false }], 'the project’s own file was found all the same');
});
