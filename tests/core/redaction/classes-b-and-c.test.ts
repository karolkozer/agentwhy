// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { shannonBits, looksRandom } from '../../../src/core/redaction/entropy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { isExcludedValue, isOrdinaryShape, isSensitiveName } from '../../../src/core/redaction/value-shapes.ts';

const SALT = 'test-salt';
const scan = (text: string): string => new Redactor(SALT).scan(text);

// Class B — a value beside a sensitive name.

test('a value beside a sensitive name is replaced, and the name is kept', () => {
  const out = scan('WEBHOOK_SECRET=9f3a-an-arbitrary-in-house-string');

  assert.match(out, /^WEBHOOK_SECRET=\[redacted: value beside a sensitive name #1\]$/);
  assert.ok(!out.includes('arbitrary-in-house'), 'the value of no recognised format goes too');
});

test('the same shape is read in JSON and in YAML', () => {
  const json = scan('{ "api_token": "8f2c-not-a-known-format-value" }');
  const yaml = scan('db_password: 7a91-another-arbitrary-value');

  assert.match(json, /"api_token": "\[redacted: value beside a sensitive name #1\]"/);
  assert.match(yaml, /^db_password: \[redacted: value beside a sensitive name #1\]$/);
});

// The exclusions are the real work (§5.4). Each of these is a false positive the class would produce without
// them, and a real `.env` holds more entries like these than actual secrets.
test('a sensitive name beside a harmless value is left alone', () => {
  for (const entry of [
    'SECRET_ENABLED=true',
    'TOKEN_EXPIRY=3600',
    'API_KEY_HEADER=X-Api-Key',
    'PASSWORD_MIN_LENGTH=8',
    'AUTH_PROVIDER=google',
    'SESSION_COOKIE_NAME=sid',
    'PRIVATE_ROUTES=/admin,/settings',
    'TOKEN_TTL=30m',
    'SIGNING_ALGO=HS256',
    'DSN=https://sentry.example.com/1234',
    'CREDENTIAL_FILE=./config/creds.json',
    'AUTH_STRATEGY=oauth2',
  ]) {
    assert.equal(scan(entry), entry, entry);
  }
});

test('a name that only describes or publishes is not a sensitive name', () => {
  for (const name of ['NEXT_PUBLIC_API_KEY', 'PUBLIC_KEY', 'PRIMARY_KEY', 'IDEMPOTENCY_KEY', 'KEYWORDS', 'TOKEN_PATH']) {
    assert.equal(isSensitiveName(name), false, name);
  }
  for (const name of ['WEBHOOK_SECRET', 'api_token', 'db_password', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.equal(isSensitiveName(name), true, name);
  }
});

test('a value shorter than eight characters, or prose, is not a secret', () => {
  assert.equal(isExcludedValue('abc123'), true, 'a real secret of that length does not exist');
  assert.equal(isExcludedValue('My cool app for tracking things'), true, 'a sentence is not a secret');
  assert.equal(isExcludedValue('9f3a-an-arbitrary-in-house-string'), false);
});

// Step 1 before step 3: a known format ignores every exclusion, because that is the case we most want to see.
test('a real key in a name that looks public is still redacted', () => {
  const out = scan('NEXT_PUBLIC_FOO=ghp_000000000000000000000000000000000000');

  assert.match(out, /^NEXT_PUBLIC_FOO=\[redacted: github-token #1\]$/);
});

test('only the password of a URL goes, so the rest stays readable as a finding', () => {
  const out = scan('postgres://app:s3cret-p4ssw0rd-value@db.internal:5432/main');

  assert.match(out, /^postgres:\/\/app:\[redacted: url-password #1\]@db\.internal:5432\/main$/);
});

// The scheme boundary check must exclude only letters, not every \w - a scheme glued to a digit (a timestamp, a
// line number pasted just before it) still starts right there, and the password after it is still a secret.
test('a URL glued to a digit before its scheme still has its password redacted', () => {
  const out = scan('1postgres://app:s3cret-p4ssw0rd-value@db.internal:5432/main');

  assert.match(out, /^1postgres:\/\/app:\[redacted: url-password #1\]@db\.internal:5432\/main$/);
});

/*
 * A line of a real transcript is long - about 31 KB, measured - and one holding a URL and no credentials used to
 * cost more than everything else a run did: the scheme's own run was retried from every position, so the line was
 * quadratic. A CPU profile of a 65 MB session found 3.7 of 4.4 seconds inside that one pattern.
 *
 * The budget here is generous on purpose: it fails on the quadratic reading (seconds, and worse as lines grow) and
 * passes on the bounded one (a millisecond or two), without asking a loaded machine to be quick.
 */
test('a long line with a URL and no credentials is scanned in a moment', () => {
  const line = `fetched https://api.example.com:8443/v1/objects?cursor=${'A1b2C3d4'.repeat(16000)} ok`;

  const started = performance.now();
  const out = scan(line);
  const took = performance.now() - started;

  assert.equal(out, line, 'nothing in it is a secret, and nothing in it is replaced');
  assert.ok(took < 500, `scanning ${Math.round(line.length / 1024)} KB took ${Math.round(took)} ms`);
});

// Class C — entropy. It redacts and never reports.

test('entropy redacts a random-looking value', () => {
  const out = scan('the build wrote xJ9vQ2mR7pL4nT8wZ5yB3kH6 into the log');

  assert.match(out, /\[redacted: high-entropy value #1\]/);
  assert.ok(!out.includes('xJ9vQ2mR7pL4nT8wZ5yB3kH6'));
});

// Lesson L001, as a test: one session held 385 toolu_ ids and 1264 UUIDs, every one above this threshold. An
// unguarded class C would have reported over 1600 findings, none of them real.
test('the tool\'s own identifiers are excluded, which is what makes the class usable', () => {
  const identifiers = [
    'toolu_01RgawYgp9TufN6eZYdByZHE',
    'msg_01ABCDEFGHIJKLMNOPQRST',
    'agent-a68274ca30b769747',
    '951c4f76-9d2a-40d2-9c76-1e57cf47ae4e',
    'da39a3ee5e6b4b0d3255bfef95601890afd80709',
    'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
  ];

  for (const identifier of identifiers) {
    assert.equal(looksRandom(identifier), false, identifier);
    assert.equal(scan(`id ${identifier}`), `id ${identifier}`, identifier);
  }
  assert.ok(shannonBits('toolu_01RgawYgp9TufN6eZYdByZHE') > 4, 'and it is not that they fall below the threshold');
});

test('entropy alone never issues a finding, while a recognised shape does', () => {
  const redactor = new Redactor(SALT);

  assert.deepEqual(redactor.classesIn('a value xJ9vQ2mR7pL4nT8wZ5yB3kH6 appeared'), [], 'entropy redacts, not reports');
  assert.deepEqual(redactor.classesIn('WEBHOOK_SECRET=9f3a-an-arbitrary-in-house-string'), [
    'value beside a sensitive name',
  ]);
  assert.deepEqual(redactor.classesIn('AKIAIOSFODNN7EXAMPLE'), ['aws-access-key-id']);
});

// The motivating case, through the shape rather than through the path: a second, independent route to it.
test('the incident is caught by the name beside the value, without knowing where it came from', () => {
  const out = scan('apps/web/.env.development:12:ORDERS_DB_WEBHOOK_SECRET=9f3a-arbitrary-in-house-value');

  assert.match(out, /ORDERS_DB_WEBHOOK_SECRET=\[redacted: value beside a sensitive name #1\]$/);
  assert.match(out, /^apps\/web\/\.env\.development:12:/, 'the path and the key name are the finding, and stay');
});

// what-came-back §5.2: which values are too ordinary to trace is the shape rule without its length floor, because a
// real secret may be short. The floor itself stays in isExcludedValue, which redaction and class B still use.
test('an ordinary shape is decided without the length floor', () => {
  assert.equal(isOrdinaryShape('EPzLE4'), false, 'a short arbitrary string is not ordinary');
  assert.equal(isExcludedValue('EPzLE4'), true, 'while class B still passes over it');
  assert.equal(isOrdinaryShape('3000'), true);
  assert.equal(isOrdinaryShape('true'), true);
  assert.equal(isOrdinaryShape('development'), true);
  assert.equal(isOrdinaryShape('9f3a-an-arbitrary-in-house-string'), false);
});
