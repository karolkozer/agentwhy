// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runHideKeys, type HideKeysIo } from '../../src/cli/hide-keys.ts';

// `2026-11-23-a-write-over-the-key.md` WK4 under `2026-11-05-a-key-in-what-it-read.md` KR8: the write check fails on its own,
// and whatever goes wrong in it never costs the swap after a call. Values joined at run time (the export's P9).
const GITHUB = ['ghp', 'Q7mZp2Lx9TaV4cBn8RwE3yKu1SdF6gHj0PoI'].join('_');
const PLACEHOLDER = '[redacted by agentwhy]';

function io(input: string): HideKeysIo & { readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    input: (async function* () {
      yield input;
    })(),
    output: { write: (text: string) => out.push(text) },
    errorOutput: { write: (text: string) => err.push(text) },
    inputIsTerminal: false,
    args: [],
    locale: 'en_US.UTF-8',
    // Throws before any promise exists, so no `.catch` on the read itself can hold it.
    readText: () => {
      throw new Error('unreadable');
    },
    out,
    err,
  };
}

test('KR8: a write check whose read throws lets the write through and says nothing', async () => {
  const run = io(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: '/Users/someone/shop', tool_input: { file_path: 'settings.yml', content: `token: ${PLACEHOLDER}\n` } }));
  assert.equal(await runHideKeys(run), 0);
  assert.deepEqual(run.out, []);
  assert.deepEqual(run.err, []);
});

test('KR8: a result holding the placeholder and a key is still swapped where the read throws', async () => {
  const run = io(JSON.stringify({
    hook_event_name: 'PostToolUse',
    tool_name: 'Write',
    tool_input: { file_path: 'settings.yml', content: `token: ${PLACEHOLDER}\n` },
    tool_response: { stdout: `token: ${GITHUB}\n`, stderr: '', interrupted: false, isImage: false },
  }));
  assert.equal(await runHideKeys(run), 0);
  const written = run.out.join('');
  assert.ok(!written.includes(GITHUB), 'the key never reaches the AI');
  assert.match(written, /redacted by agentwhy/);
});
