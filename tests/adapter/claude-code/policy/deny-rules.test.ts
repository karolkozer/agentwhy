// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { heldAtRoot, heldPlaces, placeOfProjectPath, policyFromDenyRules, projectPathOfPlace, readDenyRules } from '../../../../src/adapter/claude-code/policy/deny-rules.ts';
import { protects } from '../../../../src/core/policy/policy.ts';

// `2026-10-09-the-file-not-its-name.md` FN5: a project's file and its place, both ways. Found by the review of 2026-10-09:
// a name that only starts with two dots was taken for a climb out of the project, and got no place.
test('a project file has its place and back; a climb out of the project, a name, a glob and a Windows home have none', () => {
  const project = '/Users/someone/course';
  const home = '/Users/someone';
  assert.equal(placeOfProjectPath('./lessons/a/exercise.py', project, home), '~/course/lessons/a/exercise.py');
  assert.equal(placeOfProjectPath('./..env.backup', project, home), '~/course/..env.backup', 'a name that starts with two dots');
  assert.equal(placeOfProjectPath('./lessons/**', project, home), '~/course/lessons/**');
  assert.equal(placeOfProjectPath('./x.txt', '/work/app', home), '//work/app/x.txt', 'outside the home: from the root');
  for (const pattern of ['./../other/x.txt', './..', '**/exercise.py', 'exercise.py', '~/course/x.txt']) {
    assert.equal(placeOfProjectPath(pattern, project, home), undefined, pattern);
  }
  assert.equal(placeOfProjectPath('./x.txt', 'C:\\Users\\someone\\course', 'C:\\Users\\someone'), undefined, 'Windows is unmeasured (FNO1)');
  assert.equal(projectPathOfPlace('~/course/..env.backup', project, home), './..env.backup');
  assert.equal(projectPathOfPlace('//Users/someone/course/lessons/a/exercise.py', project, home), './lessons/a/exercise.py');
  assert.equal(projectPathOfPlace('~/other/x.txt', project, home), undefined, 'a place outside the project');
});

const SETTINGS = JSON.stringify({
  permissions: {
    deny: [
      'Read(./.env*)',
      'Read(./**/.npmrc)',
      'Edit(~/.claude/projects/**)',
      'Bash(cat:*.env*)',
      'Bash(strings:*.env*)',
      'WebFetch(domain:example.com)',
    ],
  },
});

// Test A7 from the other side: a deny rule names a tool and a route, not a resource. Reading the command
// patterns as paths would hand the reader a policy the tool never applied.
test('file rules become path patterns and command rules are counted as ignored', () => {
  const rules = readDenyRules(SETTINGS);

  assert.deepEqual(rules?.patterns, ['**/.env*', '**/.npmrc', '**/.claude/projects/**']);
  assert.equal(rules?.used, 3);
  assert.equal(rules?.ignored, 3, 'two Bash patterns and one WebFetch rule');
});

test('the resulting policy protects what the file rules named, and says where it came from', () => {
  const rules = readDenyRules(SETTINGS);
  assert.ok(rules !== undefined);

  const policy = policyFromDenyRules(rules, '/work/.claude/settings.json');

  assert.equal(protects(policy, 'apps/web/.env.development'), true);
  assert.equal(protects(policy, '/Users/someone/.claude/projects/x/y.jsonl'), true);
  assert.deepEqual(policy.origin, { kind: 'settings', path: '/work/.claude/settings.json', used: 3, ignored: 3 });
});

test('settings without a deny list yield nothing at all, rather than an empty policy', () => {
  assert.equal(readDenyRules('{}'), undefined);
  assert.equal(readDenyRules('{"permissions":{}}'), undefined);
  assert.equal(readDenyRules('not json'), undefined);
});

// FN15, FNB30: Claude Code's Read and Edit hold every notes.md under `./notes.md`, the started folder's under `/notes.md`, and
// the one file under its place. A place inside a known project is read as its path there and held to the project; a rule of
// one name is every file of the name, as Claude Code applies it.
test('FN15: a place inside the project is that path alone; a rule of one name holds every file of it', () => {
  const home = '/Users/someone';
  const project = '/Users/someone/shop';
  const text = JSON.stringify({ permissions: { deny: [
    'Read(./notes.md)', 'Read(~/shop/plan.md)', 'Read(//Users/someone/shop/drafts/**)', 'Read(./docs/guide.md)', 'Read(~/shop/docs/guide.md)', 'Read(**/.npmrc)',
  ] } });
  const rules = readDenyRules(text, { home, project });
  assert.deepEqual(rules?.at, { '**/plan.md': project, '**/drafts/**': project }, 'a pair\'s place holds where its ./ half does - everywhere');
  const policy = policyFromDenyRules(rules!, `${project}/.claude/settings.local.json`);
  assert.equal(protects(policy, 'docs/notes.md'), true, 'every notes.md, as Claude Code holds it');
  for (const path of ['plan.md', `${project}/plan.md`, 'drafts/a.md']) assert.equal(protects(policy, path), true, path);
  for (const path of ['docs/plan.md', `${project}/docs/plan.md`, 'old/drafts/a.md']) assert.equal(protects(policy, path), false, path);

  assert.equal(readDenyRules(text, { home })?.at, undefined, 'no project known: read as before');
  assert.deepEqual(heldPlaces(['~/shop/plan.md', '**/plan.md'], project, home), {}, 'a rule for every plan.md holds everywhere');
  assert.deepEqual(heldPlaces(['~/shop/plan.md'], project, 'C:\\Users\\someone'), {}, 'a home that is no POSIX path: nothing held (FNO1)');
  assert.deepEqual(heldAtRoot(['./notes.md'], project, home), { '**/notes.md': project }, 'a told ./notes.md is still the root file alone (FN14)');
});
