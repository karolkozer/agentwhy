// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { patternsIn, patternsOf } from '../../src/setup/protected-patterns.ts';

// R4c: what a person types is split on commas, trimmed, and deduplicated.
test('commas separate patterns, and blanks and repeats fall away', () => {
  assert.deepEqual(patternsIn(' *.pem , config/creds.json ,, *.pem '), {
    patterns: ['*.pem', 'config/creds.json'],
    refused: [],
  });
  assert.deepEqual(patternsIn('   '), { patterns: [], refused: [] });
});

// A pattern is written into `Read(<pattern>)`, so what would break that rule is refused by name, never silently fixed.
test('a bracket, a control character and a very long pattern are refused with a reason', () => {
  const { patterns, refused } = patternsOf(['ok/**', 'bad(1)', `line${String.fromCharCode(10)}break`, 'x'.repeat(201)]);

  assert.deepEqual(patterns, ['ok/**']);
  assert.deepEqual(refused.map(({ pattern }) => pattern.slice(0, 6)), ['bad(1)', 'line\nb', 'xxxxxx']);
  assert.match(refused[0]?.reason ?? '', /a deny rule is written as Read\(\.\.\.\)/);
  assert.match(refused[1]?.reason ?? '', /cannot be in a file name/);
  assert.match(refused[2]?.reason ?? '', /longer than 200 characters/);
});
