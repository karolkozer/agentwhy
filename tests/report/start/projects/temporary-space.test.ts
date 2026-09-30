import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inTemporarySpace } from '../../../../src/report/start/projects/temporary-space.ts';

// `.ai/specs/2026-09-27-which-project.md` V10: "Hidden: 1 temporary folder" - where a quick try is started, nobody keeps a project.
test('a folder under /tmp, or under the run\'s temporary directory - reached through /private too - is temporary', () => {
  const tmp = '/var/folders/ab/xyz/T';
  for (const path of ['/tmp/try', '/private/tmp/try', '/var/folders/ab/xyz/T/scratch', '/private/var/folders/ab/xyz/T/scratch']) {
    assert.equal(inTemporarySpace(path, tmp, '/Users/someone'), true, path);
  }
  for (const path of ['/Users/someone/Projects/shop', '/tmp', '/var/folders', '/srv/app']) {
    assert.equal(inTemporarySpace(path, tmp, '/Users/someone'), false, path);
  }
});

test('a home directory that itself lies in temporary space keeps its folders: they are its projects', () => {
  const home = '/private/tmp/sandbox/home';
  assert.equal(inTemporarySpace(`${home}/Projects/shop`, '/tmp', home), false);
  assert.equal(inTemporarySpace('/private/tmp/elsewhere', '/tmp', home), true);
});
