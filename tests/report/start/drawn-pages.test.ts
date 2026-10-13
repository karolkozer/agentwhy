// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DrawnPages } from '../../../src/report/start/drawn-pages.ts';

// `.ai/specs/2026-10-13-drawn-when-it-changed.md` DC3, DC4.
const pages = (text: string): ReadonlyMap<string, string> => new Map([['index.html', text], ['month.html', text + ' month']]);

test('DC3: the pages on disk are one model’s once every one of them was written, and no model’s before that', () => {
  const drawn = new DrawnPages();
  assert.equal(drawn.onDisk('{"a":1}'), false, 'nothing was drawn yet');
  drawn.writing();
  drawn.wrote('{"a":1}', pages('one'));
  assert.equal(drawn.onDisk('{"a":1}'), true);
  assert.equal(drawn.onDisk('{"a":2}'), false, 'compared whole: another model is another');

  // A write that began and did not end leaves pages of two models on disk: the next refresh has to draw.
  drawn.writing();
  assert.equal(drawn.onDisk('{"a":1}'), false);
  assert.deepEqual(drawn.keptFor('{"a":1}'), pages('one'), 'what was drawn is still kept, to be written again whole');
});

test('DC4: what was drawn for a model is kept while two are, and the one drawn longest ago gives way', () => {
  const drawn = new DrawnPages();
  drawn.wrote('outside', pages('o'));
  drawn.wrote('projects', pages('p'));
  assert.deepEqual(drawn.keptFor('outside'), pages('o'), 'the choice not shown is kept');
  assert.equal(drawn.onDisk('projects'), true);

  // Shown again, it is the newest; a third model then takes the place of the other.
  drawn.wrote('outside', pages('o'));
  drawn.wrote('outside, a conversation more', pages('o2'));
  assert.equal(drawn.keptFor('projects'), undefined);
  assert.deepEqual(drawn.keptFor('outside'), pages('o'));
  assert.deepEqual(drawn.keptFor('outside, a conversation more'), pages('o2'));
  assert.equal(DrawnPages.KEPT, 2);
});
