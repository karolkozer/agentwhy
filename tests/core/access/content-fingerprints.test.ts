// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ContentFingerprints, shownLine } from '../../../src/core/access/content-fingerprints.ts';

// A course: a private lesson file, another lesson's file made from the same template, and the template's own line.
const LESSON = [
  'TEMPLATE: write each answer below its task',
  'colors = ["purple", "teal", "amber", "coral"]',
  'print("Last colour in the list:", colors[-1])',
  'x = 1',
];
const OTHER = ['TEMPLATE: write each answer below its task', 'numbers = [4, 8, 15, 16, 23, 42] # the lesson on slicing'];

const fingerprints = (): ContentFingerprints => ContentFingerprints.of([
  { path: '/p/lessons/01/exercise.py', lines: LESSON, private: true },
  { path: '/p/lessons/02/exercise.py', lines: OTHER, private: false },
], 'test');

// `2026-10-11-the-file-by-its-text.md` CT1, CT3: a private file's own lines in what a call showed say it was read; a line
// another file of the project holds - a lesson's template - says nothing, and neither does a short or unworded line.
test('a private file is known by the lines no other file holds', () => {
  const known = fingerprints();
  assert.equal(known.files, 1);
  assert.deepEqual(known.filesShown([LESSON.join('\n')]), ['/p/lessons/01/exercise.py']);
  assert.deepEqual(known.filesShown([`${LESSON[0]}\n${LESSON[3]}`]), [], 'the template\'s line and a short one are no file\'s own');
  assert.deepEqual(known.filesShown([LESSON[1]!]), [], 'one line of two is not enough');
  assert.deepEqual(known.filesShown([OTHER.join('\n')]), [], 'another lesson read is no read of this one');
  assert.deepEqual(known.filesShown([LESSON[1]!, LESSON[2]!]), ['/p/lessons/01/exercise.py'], 'across the outputs of one call');

  // Whichever file is read first: the template's line is still no file's own.
  const reversed = ContentFingerprints.of([
    { path: '/p/lessons/02/exercise.py', lines: OTHER, private: false },
    { path: '/p/lessons/01/exercise.py', lines: LESSON, private: true },
  ], 'test');
  assert.deepEqual(reversed.filesShown([`${LESSON[0]}\n${LESSON[1]}`]), [], 'the template\'s line and one line of its own are not two');
});

test('a short line, and a line of no words, are no file\'s own', () => {
  assert.equal(ContentFingerprints.of([{ path: '/p/a.py', lines: ['print(x) # go'], private: true }], 'test').files, 0);
  assert.equal(ContentFingerprints.of([{ path: '/p/a.md', lines: ['-------------------------------- 1 2'], private: true }], 'test').files, 0);
});

test('a private file with one line of its own is known by that line', () => {
  const known = ContentFingerprints.of([{ path: '/p/notes.md', lines: ['The launch moves to the second week of March.'], private: true }], 'test');
  assert.deepEqual(known.filesShown(['The launch moves to the second week of March.']), ['/p/notes.md']);
});

// CT4: a line as the AI was shown it - Read's numbers, `cat -n`'s, a search's place - is the file's line.
test('a line is read without the numbers a tool put before it', () => {
  assert.equal(shownLine('    12→colors = ["purple"]'), 'colors = ["purple"]');
  assert.equal(shownLine('     3\tcolors = ["purple"]'), 'colors = ["purple"]');
  assert.equal(shownLine('lessons/01/exercise.py:7:colors = ["purple"]'), 'colors = ["purple"]');
  assert.equal(shownLine('7:colors = ["purple"]'), 'colors = ["purple"]');
  assert.deepEqual(fingerprints().filesShown([LESSON.map((line, at) => `${String(at + 1).padStart(6)}\t${line}`).join('\n')]), ['/p/lessons/01/exercise.py']);
});

// CT6: a run's salt is its own - the same file hashed by another run holds nothing this one can match.
test('a hash means nothing outside its run', () => {
  const other = ContentFingerprints.of([{ path: '/p/lessons/01/exercise.py', lines: LESSON, private: true }], 'another run');
  assert.deepEqual(other.filesShown([LESSON.join('\n')]), ['/p/lessons/01/exercise.py']);
  assert.equal(JSON.stringify(other).includes('purple'), false, 'no line is kept');
});
