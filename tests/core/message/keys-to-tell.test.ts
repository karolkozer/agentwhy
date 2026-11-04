// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { keysToTell } from '../../../src/core/message/keys-to-tell.ts';

// Joined at run time, so that no literal here reads as a key to a scanner (the export's P9).
const STRIPE = ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_');
const GITHUB = ['ghp', 'R8vT2mQ9xL4zN7pK3wB6yC1dF5hJ0sA2'].join('_');

test('a key on a line the person typed is told by the message\'s line', () => {
  const keys = keysToTell({ text: `wire this up\nconst s = new Stripe("${STRIPE}");`, pastes: [] });
  assert.deepEqual(keys, [{ kind: 'stripe-key', line: 2 }]);
});

test('a key inside a paste is told by the paste\'s own line, and which paste where there are two (PK3 as amended)', () => {
  const text = ['wire these up', '', '<tag>', 'one', `x = "${STRIPE}"`, '</tag>', '<tag>', `GITHUB_TOKEN="${GITHUB}"`, '</tag>'].join('\n');
  const keys = keysToTell({ text, pastes: [{ first: 4, last: 5 }, { first: 8, last: 8 }] });
  assert.deepEqual(keys, [
    { kind: 'stripe-key', line: 2, paste: 1 },
    { kind: 'github-token', line: 1, paste: 2, name: 'GITHUB_TOKEN' },
  ]);
});

test('a sample, a value already cut out and a value beside a sensitive name stop nothing (PKD2, PKD4)', () => {
  const text = ['AKIA' + 'IOSFODNN7EXAMPLE', 'postgres://app:…@db.example.test/main', 'WEBHOOK_SECRET=9f3a-an-arbitrary-in-house-string', 'DATABASE_URL=postgres://app:${DB_PASSWORD}@db/main'].join('\n');
  assert.deepEqual(keysToTell({ text, pastes: [] }), []);
});
