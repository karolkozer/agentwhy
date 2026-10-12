// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { placesNamedIn } from '../../../src/core/access/places-named.ts';

const CHAT = '/Users/someone/Documents/Codex/2026-10-11/a-chat';
const LESSONS = '/Users/someone/Projects/lessons';
const place = { workingDirectory: CHAT, home: '/Users/someone' };

// `2026-10-11-the-rules-where-the-file-is.md` RW3, RWB3: Codex's app runs a conversation in a folder of its own, and the
// line names the project's file by its whole path.
test('RW3: a whole path a line names is a place, wherever the line runs', () => {
  assert.ok(placesNamedIn(`cat '${LESSONS}/note.md'`, place).includes(`${LESSONS}/note.md`));
  assert.ok(placesNamedIn('head -5 ~/Projects/lessons/stage_01/exercise.py', place).includes(`${LESSONS}/stage_01/exercise.py`));
});

test('RW3: a relative word is read where the line starts and where its cd moves it', () => {
  const named = placesNamedIn(`cd ${LESSONS} && cat note.md`, place);
  assert.ok(named.includes(`${LESSONS}/note.md`), 'after the cd');
  assert.ok(named.includes(`${CHAT}/note.md`), 'and where the line started, as every word is tried (IP3)');
});

test('RW3: a search\'s folder and a glob up to its first wildcard are places too', () => {
  assert.ok(placesNamedIn(`grep -rn KEY ${LESSONS}/stage_03`, place).includes(`${LESSONS}/stage_03`));
  assert.ok(placesNamedIn(`cat ${LESSONS}/stage_*/note.md`, place).includes(LESSONS));
  assert.ok(placesNamedIn(`rg --files ${LESSONS}`, place).includes(LESSONS));
});

test('RW3: an option, a variable nobody knows, and ~ with no home name no place', () => {
  assert.deepEqual(placesNamedIn('cat "$f"', place).filter((path) => path.includes('$')), []);
  assert.deepEqual(placesNamedIn('ls -la', place).filter((path) => path.endsWith('-la')), []);
  assert.deepEqual(placesNamedIn('cat ~/notes.md', { workingDirectory: CHAT }).filter((path) => path.endsWith('notes.md')), []);
});
