// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';
import { checkOf } from '../../../src/report/check/check-lines.ts';

const redactor = new Redactor('test');
const path = (text: string) => redactor.path(text);

const actions = (partial: Partial<SessionActions>): SessionActions => ({
  policy: redactor.term('BUILT-IN DEFAULT'),
  rotate: [],
  openRoutes: [],
  onlyInResults: [],
  unknown: [],
  refusedAttempts: 0,
  secretShapes: [],
  mentions: 0,
  ...partial,
});

// A file is one line, under the strongest thing known about it in any session - never three lines about one file.
test('a file is listed once, under the strongest thing any session knew about it', () => {
  const check = checkOf([
    { name: 'a', actions: actions({ onlyInResults: [path('.env')], openRoutes: [{ path: path('config/db.json'), did: redactor.term('Read'), occurrences: 1 }] }) },
    { name: 'b', actions: actions({ rotate: [{ path: path('.env'), template: false }], unknown: [path('config/db.json')] }) },
    { name: 'c', actions: actions({ rotate: [{ path: path('.env.example'), template: true }], refusedAttempts: 2 }) },
  ]);

  assert.deepEqual(check.rows, [
    { label: 'rotate', path: '.env', sessions: ['a', 'b'] },
    { label: 'template', path: '.env.example', sessions: ['c'] },
    { label: 'unknown', path: 'config/db.json', sessions: ['a', 'b'] },
  ]);
  assert.equal(check.refusedAttempts, 2);
});

// who-stopped-it WS6, amended 2026-10-01: "Your protection worked" counts what a rule refused, never what auto mode stopped.
test('the attempts it counts as refused are the ones a rule refused', () => {
  const check = checkOf([
    { name: 'a', actions: actions({ refusedAttempts: 3, refusedByOthers: { reviewer: 2, person: 0 } }) },
    { name: 'b', actions: actions({ refusedAttempts: 1 }) },
    { name: 'c', actions: actions({ refusedAttempts: 1, refusedByOthers: { reviewer: 1, person: 0 } }) },
  ]);

  assert.equal(check.refusedAttempts, 2, "a's one and b's one");
});

test('within one label, the file more sessions reached comes first', () => {
  const route = (text: string) => ({ path: path(text), did: redactor.term('Read'), occurrences: 1 });
  const check = checkOf([
    { name: 'a', actions: actions({ openRoutes: [route('b.key'), route('a.key')] }) },
    { name: 'b', actions: actions({ openRoutes: [route('b.key')] }) },
  ]);

  assert.deepEqual(check.rows.map((row) => row.path), ['b.key', 'a.key']);
});

test('what each session read from one file is merged: every key kind and line, each once, in the order first seen', () => {
  const name = (text: string) => text as ReturnType<typeof path>;
  const check = checkOf([
    { name: 'a', actions: actions({ rotate: [{ path: path('.env'), template: false, keyed: true, read: {
      keys: [name('stripe-key')], names: [name('STRIPE_SECRET_KEY'), name('NODE_ENV')], keyed: [{ name: name('STRIPE_SECRET_KEY'), key: name('stripe-key') }],
    } }] }) },
    { name: 'b', actions: actions({ rotate: [{ path: path('.env'), template: false, read: {
      keys: [name('stripe-key'), name('jwt')], names: [name('NODE_ENV'), name('SUPABASE_KEY')], keyed: [{ name: name('SUPABASE_KEY'), key: name('jwt') }], mixed: true,
    } }] }) },
    { name: 'c', actions: actions({ rotate: [{ path: path('.env'), template: false }] }) },
  ]);
  assert.deepEqual(check.rows[0]?.read, {
    keys: ['stripe-key', 'jwt'],
    names: ['STRIPE_SECRET_KEY', 'NODE_ENV', 'SUPABASE_KEY'],
    keyed: [{ name: 'STRIPE_SECRET_KEY', key: 'stripe-key' }, { name: 'SUPABASE_KEY', key: 'jwt' }],
    mixed: true,
  });
  assert.deepEqual(check.rows[0]?.sessions, ['a', 'b', 'c']);
});
