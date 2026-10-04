// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SessionSummary } from '../../src/core/session-catalogue.ts';
import { recogniseAll, type SessionRecognition, type SessionTitles } from '../../src/core/session-titles.ts';

const session = (at: number): SessionSummary => ({
  id: `session-${at}`,
  path: `/Users/someone/.claude/projects/-Users-someone-Projects-shop/session-${at}.jsonl`,
  modifiedAt: at,
  delegations: 0,
  provider: 'claude-code',
});

// Found by a review: `sessions` asked for every title at once, and one read that failed failed the whole list.
test('titles are read a few at a time, in the order given, and a read that fails is recognised by nothing', async () => {
  const sessions = Array.from({ length: 30 }, (_, at) => session(at));
  let open = 0;
  let most = 0;
  const titles: SessionTitles = {
    recognise: async (summary) => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setImmediate(resolve));
      open -= 1;
      // A descriptor limit is no failure the file system port translates: it arrives as it was thrown.
      if (summary.id === 'session-7') throw Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' });
      return { entryPoint: summary.modifiedAt % 2 === 0 ? 'terminal' : 'editor' };
    },
  };

  const recognised = await recogniseAll(titles, sessions);

  assert.ok(most <= 8, `${most} read at once`);
  assert.equal(recognised.length, 30);
  assert.deepEqual(recognised[7], {});
  assert.deepEqual(
    recognised.filter((_, at) => at !== 7),
    sessions.filter((_, at) => at !== 7).map((each): SessionRecognition => ({ entryPoint: each.modifiedAt % 2 === 0 ? 'terminal' : 'editor' })),
  );
});
