// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import type { FileReader } from '../../src/ports/file-reader.ts';
import { computerRules, heldDenyRules, projectDenyRules } from '../../src/report/project-rules.ts';

function filesOf(texts: Readonly<Record<string, string>>): FileReader {
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => {
      throw new Error('a settings file is read whole');
    },
  };
}

const deny = (...entries: readonly string[]): string => JSON.stringify({ permissions: { deny: entries } });

// `2026-10-09-the-file-not-its-name.md` FN5: a report row's window names the rules that hold its file. The place half of
// a project file's pair is that same file, already named by its `./` rule, so it is not listed as a second rule; a place
// nothing in the same file pairs with is a rule of its own, and so is the computer's.
test('a project file\'s place, paired with its path in the same file, is not a second rule; a place alone is', async () => {
  const files = filesOf({
    '/work/project/.claude/settings.local.json': deny(
      'Read(./lessons/a/exercise.py)', 'Edit(./lessons/a/exercise.py)',
      'Read(~/project/lessons/a/exercise.py)', 'Edit(~/project/lessons/a/exercise.py)',
      'Read(~/project/notes/plan.md)', 'Edit(~/project/notes/plan.md)',
    ),
    '/work/.claude/settings.json': deny('Read(~/project/lessons/b/exercise.py)'),
  });

  assert.deepEqual(await projectDenyRules(files, '/work/project', '/work'), [
    // FN15: a place inside the project is its path there - the row Settings lists it as - the computer's too (G6).
    '**/lessons/a/exercise.py', '**/notes/plan.md', '**/lessons/b/exercise.py',
  ]);
});

// G6, found 2026-10-10: a file blocked on the whole computer by its whole path said "Not blocked" on its report's row,
// beside the refusal naming the computer's policy - the computer's rule was read as a pattern no project path matches.
test('the computer\'s rule for a place inside the project holds that file there, and is known to be the computer\'s', async () => {
  const files = filesOf({
    '/work/project/.claude/settings.local.json': deny('Read(**/.env*)'),
    '/work/.claude/settings.json': deny('Read(~/project/plan_nauki.md)', 'Edit(~/project/plan_nauki.md)', 'Read(~/.ssh/**)'),
  });
  const held = await heldDenyRules(files, '/work/project', '/work');
  assert.deepEqual(held?.patterns, ['**/.env*', '**/plan_nauki.md', '**/.ssh/**']);
  assert.deepEqual(held?.at, { '**/plan_nauki.md': '/work/project' }, 'that file, not every file of its name');
  assert.deepEqual((await computerRules(files, '/work', undefined, '/work/project')).blocked, ['**/plan_nauki.md', '**/.ssh/**'], 'read as the row reads it');
  assert.deepEqual((await computerRules(files, '/work', undefined)).blocked, ['**/project/plan_nauki.md', '**/.ssh/**'], 'no project named: as before');
});

// FN15: the patterns the project denies, with the folder a place inside it holds in - a rule of one name and the computer's never.
test('FN15: a place inside the project is held at the project; a rule of one name, a broader one and the computer\'s are not', async () => {
  const files = filesOf({
    '/work/project/.claude/settings.local.json': deny('Read(~/project/notes.md)', 'Read(./plan.md)', 'Read(~/project/drafts/**)', 'Read(./docs/a.md)'),
    '/work/project/.claude/settings.json': deny('Read(**/drafts/**)'),
    '/work/.claude/settings.json': deny('Read(~/project/plan.md)'),
  });
  const held = await heldDenyRules(files, '/work/project', '/work');
  assert.deepEqual(held?.at, { '**/notes.md': '/work/project' });
  assert.deepEqual(held?.patterns, await projectDenyRules(files, '/work/project', '/work'), 'the same patterns either way');
});
