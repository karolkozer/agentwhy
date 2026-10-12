// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { heldInProject, withProjects } from '../../../src/core/policy/another-project.ts';
import { blockingOnly, protectionOf, protects, type Policy, type ProtectedPath } from '../../../src/core/policy/policy.ts';

const LESSONS = '/Users/someone/Projects/lessons';

function policyOf(entries: readonly ProtectedPath[], allowed: readonly string[] = []): Policy {
  return { level: 'no-read', protected: entries, allowed, origin: { kind: 'default' } };
}

/** The lessons project's own rules, as its `refuse` chooses them: a lesson's folder, the root's note, a tracked template. */
const LESSONS_POLICY = policyOf([
  { pattern: '**/templates/**', mode: 'tell', at: LESSONS },
  { pattern: '**/note.md', at: LESSONS },
  { pattern: '**/lessons/stage_03/**' },
  { pattern: '**/*.env' },
  { pattern: '**/demo.env', mode: 'tell' },
  { pattern: '/Users/someone/Documents/taxes.pdf' },
  { pattern: '**/.ssh/**', everywhere: true },
]);

// `2026-10-11-the-rules-where-the-file-is.md` RW3: another project's rules hold its own files alone, by the whole path.
test('RW3: a project read from outside it holds its own files by their whole path, and nothing outside its folder', () => {
  const held = heldInProject(LESSONS_POLICY, `${LESSONS}/`);

  assert.equal(held.folder, LESSONS);
  assert.deepEqual(held.protected.map((entry) => [entry.pattern, entry.mode ?? 'block', entry.project]), [
    [`${LESSONS}/templates/**`, 'tell', LESSONS],
    [`${LESSONS}/note.md`, 'block', LESSONS],
    [`${LESSONS}/**/lessons/stage_03/**`, 'block', LESSONS],
    [`${LESSONS}/**/*.env`, 'block', LESSONS],
    [`${LESSONS}/**/demo.env`, 'tell', LESSONS],
  ], 'a place outside the folder and the computer\'s entry are left out');

  const policy = withProjects(policyOf([]), [held]);
  for (const path of [`${LESSONS}/note.md`, `${LESSONS}/lessons/stage_03/a.py`, `${LESSONS}/app/local.env`, `${LESSONS}/x.env`]) {
    assert.equal(protects(policy, path), true, path);
  }
  for (const path of ['note.md', '/Users/someone/chat/note.md', `${LESSONS}/docs/note.md`, '/Users/someone/blog/x.env', 'x.env']) {
    assert.equal(protects(policy, path), false, `${path} is not the lessons project's file`);
  }
});

// RW4, RWD2: the told list of the project a line runs in was written about its own files.
test('RW4: this policy\'s told list does not lift another project\'s block, and that project\'s own does', () => {
  const here = policyOf([{ pattern: '**/note.md', mode: 'tell' }, { pattern: '**/*.env' }]);
  const policy = blockingOnly(withProjects(here, [heldInProject(LESSONS_POLICY, LESSONS)]));

  assert.equal(protectionOf(policy, `${LESSONS}/note.md`)?.project, LESSONS, 'blocked by the project it is in');
  assert.equal(protects(policy, '/Users/someone/chat/note.md'), false, 'this policy\'s own told file is still let through');
  assert.equal(protects(policy, `${LESSONS}/templates/a.py`), false, 'a file the other project tracks is let through');
  assert.equal(protectionOf(policy, `${LESSONS}/demo.env`)?.pattern, '**/*.env', 'unless this policy blocks it itself');
  assert.deepEqual(policy.allowedIn?.[LESSONS], [`${LESSONS}/templates/**`, `${LESSONS}/**/demo.env`], 'its told files are its own exceptions');

  const lessonsOnly = blockingOnly(withProjects(policyOf([]), [heldInProject(LESSONS_POLICY, LESSONS)]));
  assert.equal(protects(lessonsOnly, `${LESSONS}/demo.env`), false, 'its told file lifts its own broader block');
  assert.equal(protects(lessonsOnly, `${LESSONS}/other.env`), true);
});

// RW7: a report reads the whole policy, told entries in place; it says what the hook would do with the same file.
test('RW4: the whole policy answers as the hook does - told where the other project tracks it, blocked where it blocks', () => {
  const policy = withProjects(policyOf([]), [heldInProject(LESSONS_POLICY, LESSONS)]);
  assert.equal(protectionOf(policy, `${LESSONS}/demo.env`)?.mode, 'tell');
  assert.equal(protectionOf(policy, `${LESSONS}/templates/a.py`)?.mode, 'tell');
  assert.equal(protectionOf(policy, `${LESSONS}/other.env`)?.mode, undefined);
  assert.equal(protectionOf(policy, `${LESSONS}/other.env`)?.project, LESSONS);
});

// RW4: a policy file's exceptions are its project's, as its told files are.
test('RW4: another project\'s exceptions lift its own rules and none of this policy\'s', () => {
  const lessons = policyOf([{ pattern: '**/secret.txt' }, { pattern: '**/*.key' }], ['**/public.key']);
  const here = policyOf([{ pattern: '**/public.key' }]);

  const policy = withProjects(policyOf([]), [heldInProject(lessons, LESSONS)]);
  assert.equal(protects(policy, `${LESSONS}/public.key`), false);
  assert.equal(protects(policy, `${LESSONS}/private.key`), true);
  assert.equal(protects(withProjects(here, [heldInProject(lessons, LESSONS)]), `${LESSONS}/public.key`), true, 'this policy\'s block stands');
  assert.deepEqual(withProjects(policyOf([], ['**/secret.txt']), [heldInProject(lessons, LESSONS)]).allowed, ['**/secret.txt']);
  assert.equal(protects(withProjects(policyOf([], ['**/secret.txt']), [heldInProject(lessons, LESSONS)]), `${LESSONS}/secret.txt`), true, 'and this policy\'s exception does not lift the other\'s block');
});

test('RW3: no other project leaves a policy as it was', () => {
  const policy = policyOf([{ pattern: '**/.env*' }]);
  assert.equal(withProjects(policy, []), policy);
});
