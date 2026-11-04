// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { guardedPlaceOf, leftAlone, onAnotherShare, shareOf } from '../../src/core/guarded-places.ts';
import { projectsHolding } from '../../src/report/rules-elsewhere.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';

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

// `2026-10-12-windows-paths.md` WP8, found 2026-11-01: a pattern a command held, `'\\r\|^  - '`, resolved on Windows to the
// share `\\r\|^  - `, and the walk for another project's rules opened a file on a host named `r` - 2.7 s to fail, and a
// network request agentwhy never makes. A share is a place of its own, left alone unless the run works on it.
test('WP8: a Windows network share is one place, left alone unless the run works on it', () => {
  const BS = String.fromCharCode(92);
  const share = [BS + BS + 'nas', 'work'].join(BS);
  assert.equal(shareOf(share + BS + 'shop' + BS + '.claude'), share);
  assert.equal(shareOf(BS + BS + 'r' + BS + '|^  - ' + BS + '.claude'), BS + BS + 'r' + BS + '|^  - ');
  assert.equal(shareOf(BS + BS + '?' + BS + 'C:' + BS + 'Users'), undefined, 'a local path written long');
  assert.equal(shareOf(BS + BS + '.' + BS + 'pipe' + BS + 'x'), undefined, 'a device');
  assert.equal(shareOf('//nas/work/shop'), undefined, 'a POSIX path');
  assert.equal(shareOf('C:' + BS + 'Users' + BS + 'someone'), undefined);
  assert.equal(guardedPlaceOf(share + BS + 'shop', HOME), share);

  assert.equal(onAnotherShare(share + BS + 'shop', 'C:' + BS + 'Users' + BS + 'someone' + BS + 'shop'), true);
  assert.equal(onAnotherShare(share.toUpperCase() + BS + 'blog', share + BS + 'shop'), false, 'the share the run works on, in any case');
  assert.equal(onAnotherShare('/Users/someone/Documents/blog', '/Users/someone/Projects/shop'), false, 'only a share');
});

test('WP8: the walk for another project\'s rules opens nothing on a share the run does not work on', async () => {
  const BS = String.fromCharCode(92);
  const opened: string[] = [];
  const files = {
    readText: async (path: string): Promise<string> => {
      opened.push(path);
      throw new FileAccessError('not-found', path);
    },
    readLines: (): AsyncIterable<string> => { throw new Error('not read'); },
  };
  const word = BS + BS + 'r' + BS + '|^  - ';
  await projectsHolding(files, '/Users/someone', [word], undefined, { most: 4, leftAlone: (folder) => onAnotherShare(folder, '/Users/someone/shop') });
  assert.deepEqual(opened.filter((path) => path.startsWith(BS + BS)), []);
});
