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
