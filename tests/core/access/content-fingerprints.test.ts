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

// `2026-10-19-what-it-did-next.md` DND4, DND5: a private table's own fields are those no other text file of the project
// holds, from 6 characters, header left out - taken from the rows a call showed, never from the file on disk.
const TABLE = [
  'id,company,contact,email',
  '1,Brightwater Gallery Ltd,Ilse Varnholt,ilse.varnholt@brightwater.example',
  '2,Hotel Aurora Seaside,Teo,teodor.quillam@aurora-seaside.example',
];
const tables = (): ContentFingerprints => ContentFingerprints.of([
  { path: '/p/Clients/customers.csv', lines: TABLE, private: true },
  { path: '/p/Orders/invoice-0912.md', lines: ['Billed to Hotel Aurora Seaside for the gala flowers.'], private: false },
  { path: '/p/src/report.py', lines: ['name, total, owed = row', 'print(name, total, owed, sep=", ")'], private: true },
], 'test');

test('a private table gives the fields of its own a call showed, and no field another file holds', () => {
  const known = tables();
  assert.equal(known.isTable('/p/Clients/customers.csv'), true);
  assert.deepEqual(known.fieldsShown('/p/Clients/customers.csv', [`=== Clients/customers.csv\n${TABLE.join('\n')}`]).sort(),
    ['Brightwater Gallery Ltd', 'Ilse Varnholt', 'ilse.varnholt@brightwater.example', 'teodor.quillam@aurora-seaside.example'],
    'the invoice\'s client, the short contact and the header are none of its own');
  assert.deepEqual(known.fieldsShown('/p/Clients/customers.csv', [TABLE[2]!]), ['teodor.quillam@aurora-seaside.example'], 'only the rows shown');
  assert.deepEqual(known.fieldsShown('/p/Clients/customers.csv', ['ilse.varnholt@brightwater.example']), [], 'a field alone is no row of the table');
  assert.deepEqual(known.fieldsShown('/p/Orders/invoice-0912.md', [TABLE.join('\n')]), [], 'an everyday file is no table');
  assert.equal(known.isTable('/p/src/report.py'), false, 'code splits on commas and is no table');
  assert.equal(JSON.stringify(known).includes('Varnholt'), false, 'no field is kept');
});

test('a table whose every field another file holds has none of its own', () => {
  const known = ContentFingerprints.of([
    { path: '/p/a.csv', lines: ['name,city', 'Brightwater Gallery,Seaside Town', 'Hotel Aurora Group,Seaside Town'], private: true },
    { path: '/p/b.md', lines: ['Brightwater Gallery and Hotel Aurora Group, both in Seaside Town.'], private: false },
  ], 'test');
  assert.equal(known.isTable('/p/a.csv'), false);
});
