// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DirectoryEntry, DirectoryReader } from '../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import { CommandRefusal } from '../../src/refuse/command-refusal.ts';

const shell = (command: string) =>
  JSON.stringify({ session_id: 's', cwd: '/work/app', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });

/** A project too large to walk: its folder holds more entries than one command may cost. */
const huge: DirectoryReader = {
  kindOf: async (path) => { throw new FileAccessError('not-found', path); },
  list: async (path): Promise<readonly DirectoryEntry[]> =>
    path === '/work/app' ? Array.from({ length: 50_001 }, (_, at) => ({ name: `f${at}.txt`, kind: 'file' as const })) : [],
  modifiedAt: async () => 0,
};

// `2026-10-11-a-folder-found-while-it-runs.md` FW3 with R20: a folder found while the line runs, in a project past the
// walk's allowance, is a command not checked - said so - never a refusal by guess and never a silent pass.
test('FW3: a folder found while the line runs, in a project too large to walk, is a command not checked', async () => {
  const refusal = new CommandRefusal({
    input: { readAll: async () => shell('d=$(find . -type d -name secrets | head -1); cat "$d"/*') },
    files: { readText: async (path) => { throw new FileAccessError('not-found', path); }, readLines: () => { throw new FileAccessError('not-found', 'x'); } },
    directories: huge,
    workingDirectory: '/work/app',
    home: '/Users/someone',
  });
  assert.deepEqual(await refusal.decide({}), { kind: 'not-checked', reason: 'search' });
});

/** A home too large to walk, as a Mac's is with `~/Library` in it, and a project folder small enough to walk whole. */
const homeTooLarge: DirectoryReader = {
  kindOf: async (path) => {
    if (path === '/Users/someone' || path === '/work/app/docs') return 'directory';
    throw new FileAccessError('not-found', path);
  },
  list: async (path): Promise<readonly DirectoryEntry[]> =>
    path === '/Users/someone' ? Array.from({ length: 50_001 }, (_, at) => ({ name: `f${at}.txt`, kind: 'file' as const }))
      : path === '/work/app/docs' ? [{ name: 'readme.md', kind: 'file' }]
        : [],
  modifiedAt: async () => 0,
};

const refusalOf = (command: string): CommandRefusal => new CommandRefusal({
  input: { readAll: async () => shell(command) },
  files: { readText: async (path) => { throw new FileAccessError('not-found', path); }, readLines: () => { throw new FileAccessError('not-found', 'x'); } },
  directories: homeTooLarge,
  workingDirectory: '/work/app',
  home: '/Users/someone',
});

// `2026-10-12-windows-paths.md` WPB13: FND9 as amended let a reading `find` from written folders be judged by its walk
// alone, and a walk past its allowance lets a command run (R20) - `find ~ -name .env | xargs cat` was refused before the
// amendment and ran after it, on a Mac's home. A walk that ran out meets the `-name` by name again.
test('WPB13: a reading find whose walk runs out is refused by the name it looks for, as before FND9 was amended', async () => {
  for (const command of ['find ~ -name .env | xargs cat', 'find ~ -name .env -exec cat {} +', 'for f in $(find ~ -name .env); do cat "$f"; done']) {
    const decision = await refusalOf(command).decide({});
    assert.equal(decision.kind, 'refuse', command);
    assert.equal(decision.kind === 'refuse' ? decision.path : undefined, '.env', command);
    assert.deepEqual(decision.kind === 'refuse' ? decision.route : undefined, { kind: 'named' }, command);
  }
});

test('WPB13: a reading find whose walk finishes is still judged as its search - a folder with no blocked file runs', async () => {
  assert.deepEqual(await refusalOf('find docs -name .env | xargs cat').decide({}), { kind: 'allow' });
});
