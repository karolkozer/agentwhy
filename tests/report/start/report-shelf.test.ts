// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ReportShelf } from '../../../src/report/start/report-shelf.ts';

// `which-project.md` V14, amended 2026-10-07: a report is found by exactly what it was drawn from, one a conversation.
test('a report is found by its conversation and exactly what it was drawn from, and a newer one replaces it', () => {
  const shelf = new ReportShelf<string>();
  assert.equal(shelf.find('/stored/a.jsonl', 'drawn-1'), undefined);
  shelf.keep('/stored/a.jsonl', 'drawn-1', '/out/one/a.html', 'report one');
  assert.deepEqual(shelf.find('/stored/a.jsonl', 'drawn-1'), { drawnFrom: 'drawn-1', page: '/out/one/a.html', report: 'report one' });
  assert.equal(shelf.find('/stored/a.jsonl', 'drawn-2'), undefined, 'drawn from anything else is not it');
  assert.equal(shelf.find('/stored/b.jsonl', 'drawn-1'), undefined);
  shelf.keep('/stored/a.jsonl', 'drawn-2', '/out/two/a.html', 'report two');
  assert.equal(shelf.find('/stored/a.jsonl', 'drawn-1'), undefined, 'one a conversation: the grown one replaced it');
  assert.equal(shelf.find('/stored/a.jsonl', 'drawn-2')?.report, 'report two');
});
