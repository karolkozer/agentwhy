// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DirectoryEntry, DirectoryReader } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { refuseProjectAbove } from '../../src/adapter/claude-code/settings/refuse-project.ts';
import { FolderListings } from '../../src/report/folder-listings.ts';

// `2026-10-14-a-place-that-is-no-folder.md` WF2-WF4: a folder may hold `.claude/` unless a listing says it cannot, and
// whatever a listing cannot say is "may" - so nothing is ever answered "no" that opening the file could have found.

function listingOf(tree: Readonly<Record<string, readonly DirectoryEntry[]>>) {
  const listed: string[] = [];
  const directories: DirectoryReader = {
    list: async (path) => {
      listed.push(path);
      const entries = tree[path];
      if (entries === undefined) throw new FileAccessError('unreadable', path);
      return entries;
    },
    kindOf: async (path) => { throw new FileAccessError('not-found', path); },
    modifiedAt: async (path) => { throw new FileAccessError('not-found', path); },
  };
  return { listings: new FolderListings(directories), listed };
}

const dir = (name: string): DirectoryEntry => ({ name, kind: 'directory' });
const file = (name: string): DirectoryEntry => ({ name, kind: 'file' });
const link = (name: string): DirectoryEntry => ({ name, kind: 'other' });

test('WF2: a name its folder does not list, or lists as a file, cannot hold .claude; a folder says by its own listing', async () => {
  const { listings, listed } = listingOf({
    '/w': [dir('shop'), dir('blog'), file('notes.md')],
    '/w/shop': [dir('.claude'), dir('src')],
    '/w/blog': [file('index.md')],
  });
  assert.equal(await listings.mayHold('/w/shop', '.claude'), true, 'a folder holding one');
  assert.equal(await listings.mayHold('/w/blog', '.claude'), false, 'a folder holding none');
  assert.equal(await listings.mayHold('/w/notes.md', '.claude'), false, 'a file');
  assert.equal(await listings.mayHold('/w/fix:', '.claude'), false, 'a word that is no path');
  assert.equal(await listings.mayHold('/w/shop', '.claude'), true);
  assert.deepEqual(listed, ['/w', '/w/shop', '/w/blog'], 'each folder listed once, however often asked');
});

test('WF3: a link, another case, a name not in its shortest form, the root and a listing that fails are "may"', async () => {
  const { listings } = listingOf({
    '/w': [link('linked'), dir('Shop'), dir('Café')],
    '/w/Shop': [dir('.Claude')],
    '/w/Café': [dir('.claude')],
  });
  assert.equal(await listings.mayHold('/w/linked', '.claude'), true, 'a link is listed as neither: its own listing fails, so the file is opened');
  assert.equal(await listings.mayHold('/w/shop', '.claude'), true, 'a disk that does not tell Shop from shop finds it');
  assert.equal(await listings.mayHold('/w/Café', '.claude'), true, 'nor one Unicode form from another');
  assert.equal(await listings.mayHold('/w/shop/../shop', '.claude'), true);
  assert.equal(await listings.mayHold('/w/shop/', '.claude'), true);
  assert.equal(await listings.mayHold('/', '.claude'), true);
  assert.equal(await listings.mayHold('/elsewhere/project', '.claude'), true, 'a folder whose parent cannot be listed');
  assert.equal(await listings.mayHold('relative/project', '.claude'), true);
});

test('WF1, WF4: the walk asks only where leftAlone does not stop it, and answers as it did without the question', async (t: TestContext) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'agentwhy-wf-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const refuse = JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'agentwhy refuse' }] }] } });
  for (const folder of ['home/Projects/shop/.claude', 'home/Projects/shop/src/deep', 'home/Projects/blog/.claude', 'home/Projects/plain/docs', 'home/Desktop/diary/.claude']) {
    await mkdir(join(root, folder), { recursive: true });
  }
  await writeFile(join(home, 'Projects/shop/.claude/settings.local.json'), refuse);
  await writeFile(join(home, 'Projects/blog/.claude/settings.json'), JSON.stringify({ permissions: { deny: [] } }));
  await writeFile(join(home, 'Projects/diary.json'), refuse);
  await writeFile(join(home, 'Desktop/diary/.claude/settings.local.json'), refuse);
  await writeFile(join(home, 'Projects/shop/src/deep/app.ts'), 'export {}');
  await symlink(join(home, 'Projects/shop'), join(home, 'Projects/shop-link'));

  const files = new NodeFileSystem();
  const places = [
    'Projects/shop', 'Projects/shop/src/deep/app.ts', 'Projects/shop/src/deep/missing.ts', 'Projects/shop/fix:', 'Projects/blog',
    'Projects/blog/post.md', 'Projects/plain/docs', 'Projects/diary.json', 'Projects/shop-link/src', 'Projects/SHOP/src',
    'Projects/shop/src/../src/deep', 'Desktop/diary/entry.md', 'Elsewhere/nothing',
  ].map((place) => join(home, place));
  const guarded = (folder: string): boolean => folder.startsWith(join(home, 'Desktop'));
  const listings = new FolderListings(files);
  for (const place of places) {
    const without = await refuseProjectAbove(files, place, home, { leftAlone: guarded });
    const withIt = await refuseProjectAbove(files, place, home, { leftAlone: guarded, mayHold: listings.mayHold });
    assert.deepEqual(withIt, without, place);
  }
  assert.equal((await refuseProjectAbove(files, join(home, 'Projects/shop/src/deep/app.ts'), home, { mayHold: listings.mayHold }))?.project, join(home, 'Projects/shop'));
  assert.equal((await refuseProjectAbove(files, join(home, 'Projects/shop-link/src'), home, { mayHold: listings.mayHold }))?.project, join(home, 'Projects/shop-link'),
    'a link to a project is walked into, as before');

  // WF4: a folder leftAlone names is asked nothing - neither it nor its parent is listed.
  const asked: string[] = [];
  await refuseProjectAbove(files, join(home, 'Desktop/diary/entry.md'), home, {
    leftAlone: guarded,
    mayHold: async (folder, entry) => { asked.push(folder); return listings.mayHold(folder, entry); },
  });
  assert.deepEqual(asked.filter((folder) => folder.startsWith(join(home, 'Desktop'))), []);
});
