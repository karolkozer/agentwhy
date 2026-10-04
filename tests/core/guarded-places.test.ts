// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { guardedPlaceOf, leftAlone } from '../../src/core/guarded-places.ts';

const HOME = '/Users/someone';

// which-project V10b: where macOS asks the person before an app reads, under the home directory and on other disks.
test('a folder in a place the system guards is named by that place, and one elsewhere by none', () => {
  assert.equal(guardedPlaceOf('/Users/someone/Documents/Codex/2026-10-01/chat', HOME), '/Users/someone/Documents');
  assert.equal(guardedPlaceOf('/Users/someone/Desktop/shop', HOME), '/Users/someone/Desktop');
  assert.equal(guardedPlaceOf('/Users/someone/Downloads/app', HOME), '/Users/someone/Downloads');
  assert.equal(guardedPlaceOf('/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/app', HOME), '/Users/someone/Library/Mobile Documents');
  assert.equal(guardedPlaceOf('/Users/someone/Library/CloudStorage/Dropbox/app', HOME), '/Users/someone/Library/CloudStorage');
  assert.equal(guardedPlaceOf('/Volumes/Backup/projects/app', HOME), '/Volumes/Backup');
  assert.equal(guardedPlaceOf('/Users/someone/documents/app', HOME), '/Users/someone/Documents', 'names compared as the file system compares them');
  assert.equal(guardedPlaceOf('/volumes/Backup/app', HOME), '/Volumes/Backup', 'and so are other disks');

  assert.equal(guardedPlaceOf('/Users/someone/Projects/shop', HOME), undefined);
  assert.equal(guardedPlaceOf('/Users/someone/DocumentsArchive/app', HOME), undefined, 'a name that only starts the same is another folder');
  assert.equal(guardedPlaceOf('/Volumes', HOME), undefined);
});

test('another project is left alone where it lies in a guarded place the run does not work in', () => {
  assert.equal(leftAlone('/Users/someone/Documents/blog', '/Users/someone/Projects/shop', HOME), true);
  assert.equal(leftAlone('/Users/someone/Projects/blog', '/Users/someone/Projects/shop', HOME), false, 'not guarded');
  assert.equal(leftAlone('/Users/someone/Documents/blog', '/Users/someone/Documents/shop', HOME), false, 'the app reads that place already');
  assert.equal(leftAlone('/Users/someone/Documents/shop', '/Users/someone/Documents/shop', HOME), false, 'the project shown');
  assert.equal(leftAlone('/Users/someone/Desktop/blog', '/Users/someone/Documents/shop', HOME), true, 'each place is asked about on its own');
  assert.equal(leftAlone('/Volumes/Other/app', '/Volumes/Backup/shop', HOME), true, 'and so is each disk');
  assert.equal(leftAlone('/volumes/Other/app', '/volumes/Backup/shop', HOME), true, 'whatever the case it was recorded in');
});
