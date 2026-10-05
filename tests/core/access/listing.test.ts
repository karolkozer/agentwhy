// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { listingPathCandidates } from '../../../src/core/access/listing.ts';

const firstOffered = (line: string) => listingPathCandidates(line)[0]?.[0];

// A real report listed `…/Web Portal/app/apps/web/.env` as `Portal/app/apps/web/.env`, beside `apps/web/.env`:
// `find` had printed the whole path, and the last field of the line was taken for it.
test('a line that is one path written out in full is offered whole, space and all', () => {
  assert.deepEqual(firstOffered('/Users/someone/Projects/Acme/Web Portal/app/apps/web/.env'), {
    text: '/Users/someone/Projects/Acme/Web Portal/app/apps/web/.env',
    positional: true,
  });
  assert.equal(firstOffered('./Web Portal/apps/web/.env')?.text, './Web Portal/apps/web/.env');
  assert.equal(firstOffered('../Web Portal/apps/web/.env')?.text, '../Web Portal/apps/web/.env');
  assert.equal(firstOffered('~/Web Portal/.npmrc')?.text, '~/Web Portal/.npmrc');
});

test('a search hit still offers the field before its first colon first', () => {
  assert.deepEqual(firstOffered('/Users/someone/Web Portal/apps/web/.env.test:3:API_URL=x'), {
    text: '/Users/someone/Web Portal/apps/web/.env.test',
    positional: true,
  });
});

// `ls -l` writes columns before the name, and a line that starts with them does not start where a path does. The name
// is a path by where it sits (R2); a time of day in the columns is no search hit's colon (found 2026-10-05).
test('a long listing offers its last field by position, and nothing whole or before a colon', () => {
  assert.deepEqual(firstOffered('-rw-r--r--  1 someone  staff  120 Sep 14  2025 .env'), { text: '.env', positional: true, listed: 'file' });
  assert.deepEqual(listingPathCandidates('-rw-r--r--@  1 someone  staff  120 Oct  5 12:26 demo.env'), [[{ text: 'demo.env', positional: true, listed: 'file' }]]);
  assert.deepEqual(listingPathCandidates('drwxr-xr-x   4 someone  staff  128 Oct  5 12:26 app'), [[{ text: 'app', positional: true, listed: 'directory' }]],
    'and says a folder is one');
});

// 2026-09-15-paths-not-fragments.md R2 and criteria 3 and 4: position says where a path would sit, not that a
// program wrote one there. Every line here sits where a path sits, and four of them are prose or an expression.
test('a line taken whole names a file only when the whole line is a path', () => {
  for (const line of [
    '/Users/someone/.ssh/id_rsa in a result · succeeded · 2×',
    '/Users/someone/.ssh/id_rsa -> outside the project',
    '[apps/web/.env,',
    '{file_path:/a/app/.env}',
  ]) {
    assert.equal(firstOffered(line), undefined, line);
  }
  assert.equal(firstOffered('app/[locale]/secrets/key')?.text, 'app/[locale]/secrets/key');
  assert.equal(firstOffered('apps/web/.env.test')?.text, 'apps/web/.env.test');
});

// A field keeps its words: no line with words before its path was measured, and a search hit under a directory
// whose name holds a space is one path by position (L011).
test('a field before a colon keeps its words and loses punctuation of code', () => {
  assert.equal(firstOffered('Client Name/app/.env:3:PORT=1')?.text, 'Client Name/app/.env');
  assert.equal(firstOffered('{file_path:/a/app/.env}:3:x'), undefined);
});
