// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import { listAnswer } from '../../../../src/report/answers/list-answer.ts';
import type { FileCount } from '../../../../src/report/file-counts.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import { oftenSection } from '../../../../src/report/start/conversations/often-section.ts';
import type { IndexEntry, SessionIndex } from '../../../../src/report/start/session-index.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV16: the list on the page is the chat's own.
const NOW = Date.UTC(2026, 10, 24, 12);
const count = (path: string, more: Partial<FileCount>): FileCount =>
  ({ path: path as Redacted, tracked: false, read: 0, changed: 0, opened: 0, named: 0, unknown: 0, stopped: 0, stoppedBy: {}, helpers: 0, agents: 1, ...more });
const entry = (counts: FileCount[]): IndexEntry => ({
  name: 'c', provider: 'claude-code', lastActive: NOW, delegations: 0,
  report: { kind: 'generated', file: 'r.html', incomplete: false, counts, tally: { contentsSeen: 1, filesReached: 0, onlyThroughResult: 0, refusedAttempts: 0, unknownAttempts: 0 } as unknown as Tally },
}) as IndexEntry;
const index = (entries: IndexEntry[]): SessionIndex => ({ now: NOW, since: NOW - 7 * 86_400_000, asked: '7d', entries }) as unknown as SessionIndex;

test('each row is the chat answer\'s row: its name, its total and its parts', () => {
  const made = index([entry([count('config/.env', { read: 12, stopped: 5, named: 3 }), count('a.pem', { named: 2 })])]);
  const html = oftenSection(made);
  const row = listAnswer(made, 'project').often[0];
  assert.equal(row?.wanted, 17);
  assert.match(html, /title="config\/\.env"/);
  assert.match(html, /17 times/);
  assert.match(html, /12 read/);
  assert.match(html, /5 stopped/);
  assert.match(html, /1 more file it only saw by name/);
  for (const lang of ['en', 'pl', 'de']) assert.ok(html.includes(`lang="${lang}"`));
});

test('where no AI wanted a private or tracked file there is no section', () => {
  assert.equal(oftenSection(index([])), '');
  assert.equal(oftenSection(index([entry([count('a.pem', { named: 2 })])])), '');
});

test('a path is set as text', () => {
  assert.ok(!oftenSection(index([entry([count('<img onerror=x>/.env', { read: 1 })])])).includes('<img'));
});
