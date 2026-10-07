// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { denyEntriesFor } from '../../../src/adapter/claude-code/settings/deny-entries.ts';
import { FileAccessError } from '../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../src/ports/file-reader.ts';
import { uninstallableIn } from '../../../src/report/start/settings-files.ts';

const PROJECT = '/Users/someone/Projects/blog';
const LOCAL = `${PROJECT}/.claude/settings.local.json`;
const SHARED = `${PROJECT}/.claude/settings.json`;

const WATCH = {
  hooks: {
    SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }],
  },
};

const denying = (...patterns: readonly string[]): object => ({ permissions: { deny: patterns.flatMap((pattern) => denyEntriesFor(pattern)) } });

function filesOf(texts: Readonly<Record<string, string>>): FileReader {
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => { throw new Error('read whole'); },
  };
}

// `remove-a-project-from-the-list` RM8: what Settings' Uninstall would take out of a project that is not this run's.
test('a file is named where it runs a hook or holds a rule agentwhy wrote, with that file\'s rules', async () => {
  const answer = await uninstallableIn(filesOf({
    [LOCAL]: JSON.stringify({ ...WATCH, ...denying('.env') }),
    [SHARED]: JSON.stringify(denying('secrets/**')),
  }), PROJECT);

  assert.deepEqual(answer, { local: ['.env'], shared: ['secrets/**'] });
});

test('a file that runs a hook and holds no rule is named with no rules at all', async () => {
  assert.deepEqual(await uninstallableIn(filesOf({ [LOCAL]: JSON.stringify(WATCH) }), PROJECT), { local: [] });
});

// Nothing to take out is an empty answer, so the removal writes its record and nothing else.
test('a project with nothing of agentwhy\'s in it names no file', async () => {
  assert.deepEqual(await uninstallableIn(filesOf({}), PROJECT), {});
  assert.deepEqual(await uninstallableIn(filesOf({ [LOCAL]: JSON.stringify({ model: 'opus' }) }), PROJECT), {});
});

// Half a pair is a rule somebody wrote by hand: `--unprotect` must not be given it (the rule `settings-view` keeps).
test('a rule denied for only one tool is not agentwhy\'s to take out', async () => {
  const half = { permissions: { deny: ['Read(./.env)'] } };
  assert.deepEqual(await uninstallableIn(filesOf({ [LOCAL]: JSON.stringify(half) }), PROJECT), {});
  assert.deepEqual(await uninstallableIn(filesOf({ [LOCAL]: JSON.stringify({ ...WATCH, ...half }) }), PROJECT), { local: [] }, 'the hook still goes');
});

// A file that is not a JSON object says nothing, and nothing is guessed from it.
test('a settings file that cannot be read is left alone', async () => {
  assert.deepEqual(await uninstallableIn(filesOf({ [LOCAL]: 'not json', [SHARED]: JSON.stringify(WATCH) }), PROJECT), { shared: [] });
});
