// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileNames, nameOf } from '../../../../src/report/render/report-page/item-names.ts';

// `specs/2026-09-14-path-display-and-share.md` R5: a page names a file by its name, and by more only where it must.

test('a file no other file on the page shares a name with is named by its name alone', () => {
  const names = fileNames(['apps/web/.env', 'apps/web/.npmrc', 'secrets/']);

  assert.equal(names('apps/web/.env'), '.env');
  assert.equal(names('secrets/'), nameOf('secrets/'), 'a folder as the page names it everywhere else');
});

test('two files of one name are told apart by as little of their paths as it takes', () => {
  const names = fileNames(['apps/web/.env', 'packages/widget/.env', 'packages/api/config/.env', 'packages/web/config/.env']);

  assert.equal(names('apps/web/.env'), 'web/.env');
  assert.equal(names('packages/widget/.env'), 'widget/.env');
  assert.equal(names('packages/api/config/.env'), 'api/config/.env', 'config/.env is two files, so one folder more');
  assert.equal(names('packages/web/config/.env'), 'web/config/.env');
  assert.equal(new Set(['apps/web/.env', 'packages/widget/.env', 'packages/api/config/.env', 'packages/web/config/.env'].map(names)).size, 4);
});

test('where no part of a path tells two files apart, each is named by its whole path', () => {
  const names = fileNames(['.env', './.env', '/Users/someone/app/.env', 'Users/someone/app/.env']);

  assert.equal(names('.env'), '.env');
  assert.equal(names('./.env'), './.env');
  assert.equal(names('/Users/someone/app/.env'), '/Users/someone/app/.env');
  assert.equal(names('Users/someone/app/.env'), 'Users/someone/app/.env');
});

// Found by a review: a path of one segment was named by its name before its whole path was considered.
test('two paths of one segment that differ only by a slash are each named whole', () => {
  const names = fileNames(['.env', '/.env', 'secrets', 'secrets/']);

  assert.deepEqual(['.env', '/.env', 'secrets', 'secrets/'].map(names), ['.env', '/.env', 'secrets', 'secrets/']);
});

// Found by a review: a file a sentence names is one of the page's paths too, or a listed file keeps its bare name.
test('a listed file is lengthened for a file of its name that only a sentence names, once both are given', () => {
  assert.equal(fileNames(['apps/web/.env'])('apps/web/.env'), '.env', 'with the sentence\'s file left out, nothing to tell apart');

  const names = fileNames(['apps/web/.env', '.env']);
  assert.equal(names('apps/web/.env'), 'web/.env');
  assert.equal(names('.env'), '.env');
});

test('a path the page did not list is named against the ones it did, and one listed twice is one file', () => {
  const names = fileNames(['apps/web/.env', 'apps/web/.env']);

  assert.equal(names('apps/web/.env'), '.env', 'the same path twice is not two files');
  assert.equal(names('packages/widget/.env'), 'widget/.env');
  assert.equal(names('README.md'), 'README.md');
});
