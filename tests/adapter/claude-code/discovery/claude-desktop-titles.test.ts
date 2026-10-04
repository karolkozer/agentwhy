// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeDesktopTitles } from '../../../../src/adapter/claude-code/discovery/claude-desktop-titles.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { CANARY, writeSession } from '../../../helpers/synthetic-session.ts';

// The folder as the app keeps it (contract DESKTOP_SESSIONS): two id levels, then local_<uuid>.json.
const at = (name: string) => join('claude-code-sessions', 'first-id', 'second-id', name);
const file = (cliSessionId: unknown, title: unknown, rest: object = {}) => JSON.stringify({ cliSessionId, title, ...rest });

function titlesIn(root: string): ClaudeDesktopTitles {
  const files = new NodeFileSystem();
  return new ClaudeDesktopTitles({ directories: files, files, folder: join(root, 'claude-code-sessions') });
}

test('a conversation is named by the title the app keeps for its session id', async (t) => {
  const root = await writeSession(t, {
    [at('local_a.json')]: file('sess-a', 'Start the page server'),
    [at('local_b.json')]: file('sess-b', 'Check the HTML file'),
  });

  const titles = titlesIn(root);
  assert.equal(await titles.titleOf('sess-a'), 'Start the page server');
  assert.equal(await titles.titleOf('sess-b'), 'Check the HTML file');
  assert.equal(await titles.titleOf('sess-c'), undefined, 'a session the app did not hold has no name here');
});

test('a file that is not the measured shape says nothing, never an error', async (t) => {
  const root = await writeSession(t, {
    [at('local_broken.json')]: '{ not json',
    [at('local_list.json')]: '[1, 2]',
    [at('local_number.json')]: file('sess-n', 42),
    [at('local_blank.json')]: file('sess-blank', '   '),
    [at('local_no-id.json')]: file(7, 'A title without a session'),
    [at('notes.txt')]: 'not a session file',
  });

  const titles = titlesIn(root);
  for (const id of ['sess-n', 'sess-blank', '7']) assert.equal(await titles.titleOf(id), undefined, id);
});

test('two files naming one id with different titles name none; with the same title, that title', async (t) => {
  const root = await writeSession(t, {
    [at('local_one.json')]: file('sess-twice', 'First name'),
    [at('local_two.json')]: file('sess-twice', 'Second name'),
    [join('claude-code-sessions', 'other-first', 'other-second', 'local_three.json')]: file('sess-agreed', 'Same name'),
    [join('claude-code-sessions', 'other-first', 'other-second', 'local_four.json')]: file('sess-agreed', 'Same name'),
  });

  const titles = titlesIn(root);
  assert.equal(await titles.titleOf('sess-twice'), undefined, 'never a guess between two different names');
  assert.equal(await titles.titleOf('sess-agreed'), 'Same name');
});

test('a file at the wrong depth is not read', async (t) => {
  const root = await writeSession(t, {
    [join('claude-code-sessions', 'local_shallow.json')]: file('sess-shallow', 'Too shallow'),
    [join('claude-code-sessions', 'a', 'b', 'c', 'local_deep.json')]: file('sess-deep', 'Too deep'),
  });

  const titles = titlesIn(root);
  assert.equal(await titles.titleOf('sess-shallow'), undefined);
  assert.equal(await titles.titleOf('sess-deep'), undefined);
});

test('no folder, or none given for this platform, is no names and no error', async (t) => {
  const root = await writeSession(t, {});
  assert.equal(await titlesIn(root).titleOf('sess-a'), undefined, 'the app is not installed here');

  const files = new NodeFileSystem();
  const elsewhere = new ClaudeDesktopTitles({ directories: files, files });
  assert.equal(await elsewhere.titleOf('sess-a'), undefined, 'a platform where the folder is not measured looks nowhere');
});

test('a name is one line, and what else the file holds is never handed out', async (t) => {
  const root = await writeSession(t, {
    [at('local_a.json')]: file('sess-a', 'Two\nlines\there', {
      remoteMcpServersConfig: [{ url: `https://${CANARY}.example`, instructions: CANARY }],
      postTurnSummary: { status_detail: CANARY },
      promptAppendSnapshot: { append: CANARY },
    }),
  });

  const named = await titlesIn(root).titleOf('sess-a');
  assert.equal(named, 'Two lines here');
  assert.ok(!String(named).includes(CANARY), 'nothing but the title leaves the file');
});

test('an unchanged file is not read again; a changed one is, and a name written later is found (CD5)', async (t) => {
  const root = await writeSession(t, { [at('local_a.json')]: file('sess-a', 'First name') });
  const path = join(root, at('local_a.json'));
  await utimes(path, 1_000, 1_000);
  const reads: string[] = [];
  const real = new NodeFileSystem();
  const counting: FileReader = {
    readText: (asked) => {
      reads.push(asked);
      return real.readText(asked);
    },
    readLines: (asked) => real.readLines(asked),
  };
  const titles = new ClaudeDesktopTitles({ directories: real, files: counting, folder: join(root, 'claude-code-sessions') });

  assert.equal(await titles.titleOf('sess-a'), 'First name');
  assert.equal(await titles.titleOf('sess-a'), 'First name');
  assert.equal(reads.length, 1, 'asked twice, read once');

  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, file('sess-a', 'Renamed later'));
  await utimes(path, 2_000, 2_000);
  assert.equal(await titles.titleOf('sess-a'), 'Renamed later');
  assert.equal(reads.length, 2, 'read again only where it changed');
});
