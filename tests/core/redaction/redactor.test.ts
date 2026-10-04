// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';

const SALT = 'test-salt';
const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmno';

test('a known key format is replaced and its surroundings are kept', () => {
  const out = new Redactor(SALT).scan(`AWS_ACCESS_KEY_ID=${AWS_KEY} in the deploy script`);

  assert.ok(!out.includes(AWS_KEY));
  assert.match(out, /AWS_ACCESS_KEY_ID=\[redacted: aws-access-key-id #1\] in the deploy script/);
});

// A prefix is leakage too (§5.4, mechanics rule 4). There is no "show the first four characters" affordance.
test('nothing of the value survives, not even a fragment', () => {
  const out = new Redactor(SALT).scan(`token ${JWT}`);

  for (const fragment of [JWT.slice(0, 8), JWT.slice(-8)]) assert.ok(!out.includes(fragment), fragment);
});

// So that "the same key is also in that other place" can be read off the report, without saying which key.
test('the same value gets the same pseudonym, a different one gets its own', () => {
  const redactor = new Redactor(SALT);

  const first = redactor.scan(`a ${AWS_KEY}`);
  const again = redactor.scan(`b ${AWS_KEY}`);
  const other = redactor.scan('c AKIA0000000000000000');

  assert.equal(first.replace('a ', ''), again.replace('b ', ''));
  assert.match(other, /#2\]/);
});

test('content from a protected resource keeps its key names and loses every value', () => {
  const out = new Redactor(SALT).content('SUPABASE_URL=https://x.supabase.co\nWEBHOOK_SECRET=an-arbitrary-in-house-string\n');

  assert.match(out, /^SUPABASE_URL=\[redacted: value from a protected resource #1\]$/m);
  assert.match(out, /^WEBHOOK_SECRET=\[redacted: value from a protected resource #2\]$/m);
  assert.ok(!out.includes('an-arbitrary-in-house-string'), 'a shapeless in-house secret goes too');
});

// The scanner recognises the minority of secrets, so where the text came from decides, not what it looks like.
// This is the motivating case's kind of value: it matches no pattern at all.
test('a grep line out of a protected file keeps the path and the key, and loses the value', () => {
  const out = new Redactor(SALT).content('apps/web/.env.development:12:ORDERS_DB_WEBHOOK_SECRET=9f3a-not-a-known-format');

  assert.match(out, /^apps\/web\/\.env\.development:12:ORDERS_DB_WEBHOOK_SECRET=\[redacted: value from a protected resource #1\]$/);
  assert.ok(!out.includes('9f3a-not-a-known-format'));
});

test('protected content of an unrecognised shape is replaced whole, leaving only its size', () => {
  const out = new Redactor(SALT).content('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----');

  assert.match(out, /^\[redacted: content of a protected resource — 3 lines, \d+ bytes\]$/);
  assert.ok(!out.includes('b3BlbnNzaC1rZXktdjEAAAAA'));
});

test('the header counts replacements and distinct values apart', () => {
  const redactor = new Redactor(SALT);
  redactor.scan(`one ${AWS_KEY}`);
  redactor.scan(`again ${AWS_KEY}`);
  redactor.content('KEY=value');

  const summary = redactor.summary();

  assert.equal(summary.rulesetVersion, 2, 'classes B and C arrived, so the ruleset moved with them');
  assert.equal(summary.redactions, 3, 'three occurrences went');
  assert.equal(summary.distinctValues, 2, 'of two different values');
  assert.equal(summary.protectedContents, 1);
});

// A path arrives from splitting untrusted result text, so it is not a safer kind of string than any other.
test('a value that reaches the path door is scanned like anything else', () => {
  const out = new Redactor(SALT).path(AWS_KEY);

  assert.ok(!out.includes(AWS_KEY));
  assert.match(out, /^\[redacted: aws-access-key-id #1\]$/);
  assert.equal(new Redactor(SALT).path('apps/web/.env'), 'apps/web/.env', 'an ordinary path is shown as written');
});

// Deciding once for the whole text let a single KEY=value anywhere hand the rest of the file through.
test('a protected file is judged line by line, not once for the whole of it', () => {
  const out = new Redactor(SALT).content('FOO=bar\n{ "db_password": "hunter2" }\nplain secret line');

  assert.match(out, /^FOO=\[redacted: value from a protected resource #1\]$/m);
  assert.ok(!out.includes('hunter2'), 'a JSON value goes too, and its key name stays');
  assert.match(out, /"db_password":\s*\[redacted: value from a protected resource #2\]/);
  assert.match(out, /^\[redacted: line of a protected resource — 17 characters\]$/m);
});

// `\s` crosses a newline, so an empty value used to swallow the line below it - and the next key's name with it.
test('a key with an empty value does not swallow the line below it', () => {
  const out = new Redactor(SALT).content('EMPTY=\nNEXT_KEY=value');

  assert.match(out, /^NEXT_KEY=/m, 'the following key name survives');
});

test('an npmrc auth token loses the token and keeps the position', () => {
  const out = new Redactor(SALT).scan('//registry.npmjs.org/:_authToken=ghp_000000000000000000000000000000000000');

  // Two patterns cover the same span here. The one naming the credential wins over the one naming the place it
  // sat in, which is the more useful of the two labels; either way the token itself is gone.
  assert.match(out, /:_authToken=\[redacted: github-token #1\]$/);
  assert.ok(!out.includes('ghp_0000'));
});

test('a token of no recognised format is still caught by the position it sits in', () => {
  const out = new Redactor(SALT).scan('//registry.internal/:_authToken=7f1c-an-in-house-token-of-no-known-shape');

  assert.match(out, /:_authToken=\[redacted: npmrc-auth-token #1\]$/);
  assert.ok(!out.includes('in-house-token'));
});

test('ordinary text passes through untouched', () => {
  const text = 'read apps/web/.env.development and reported the value to the main agent';

  assert.equal(new Redactor(SALT).scan(text), text);
});

const ROOT = { kind: 'known', path: '/Users/someone/Projects/Client Name/app' } as const;

test('the shared view keeps what is inside the project and drops what is above it', () => {
  const redactor = new Redactor('salt', ROOT, true);

  assert.equal(redactor.path(`${ROOT.path}/apps/web/.env`), 'apps/web/.env');
  assert.equal(redactor.path('/etc/passwd'), 'outside the project');
  assert.equal(redactor.path('/Users/someone/other-project/.env'), 'outside the project');
});

// Moving the absolute form out of a path field and into a sentence would be the same leak with a longer route.
test('the shared view scrubs an absolute path out of free text too', () => {
  const redactor = new Redactor('salt', ROOT, true);

  assert.equal(redactor.scan(`read ${ROOT.path}/apps/web/.env`), 'read apps/web/.env');
  assert.equal(redactor.scan('read /Users/someone/elsewhere/.env'), 'read outside the project');
});

test('the full view keeps the absolute form, relativised where the root contains it', () => {
  const redactor = new Redactor('salt', ROOT, false);

  assert.equal(redactor.path(`${ROOT.path}/apps/web/.env`), 'apps/web/.env');
  assert.equal(redactor.path('/etc/passwd'), '/etc/passwd');
});

// Without a root nothing can be said to be inside the project, so a shared report shows no path at all (R11).
test('with no project root the shared view can place nothing inside the project', () => {
  const redactor = new Redactor('salt', { kind: 'absent' }, true);

  assert.equal(redactor.path('/Users/someone/app/.env'), 'outside the project');
});

// Found by running `start --share` on a real project: a command taken for a path candidate does not start with a
// root, so it counted as inside the project - and the absolute path further along it was shown whole.
test('the shared view scrubs an absolute path sitting inside something that reached the path door', () => {
  const redactor = new Redactor('salt', ROOT, true);

  assert.equal(`${redactor.path('check /Users/someone/elsewhere/.env')}`, 'check outside the project');
  assert.ok(!`${redactor.path('input:{file_path:/Users/someone/app/.env')}`.includes('/Users/'));
});

// A transcript can quote another session's records, and a quoted uuid travels inside whatever text carried it.
test('the shared view shows no machine-issued identifier, in a path field or in a sentence', () => {
  const redactor = new Redactor('salt', ROOT, true);
  const uuid = '951c4f76-9d2a-40d2-9c76-1e57cf47ae4e';

  assert.ok(!`${redactor.path(`logs/${uuid}/.env`)}`.includes(uuid));
  assert.ok(!`${redactor.scan(`resumed session ${uuid}`)}`.includes(uuid));
});

test('the full view still shows the identifier it was given', () => {
  const redactor = new Redactor('salt', ROOT, false);
  const uuid = '951c4f76-9d2a-40d2-9c76-1e57cf47ae4e';

  assert.ok(`${redactor.scan(`resumed session ${uuid}`)}`.includes(uuid));
});

// `specs/2026-09-23-the-report-page.md` M2: the names on a protected file's keyed lines are the ones `content` keeps.
test('keysIn gives the names content keeps, and none of the values', () => {
  const redactor = new Redactor('test');
  const text = '   1→API_TOKEN=AGENTWHY_CANARY1\nEMPTY=\nNEXT=AGENTWHY_CANARY2\n# SKIPPED=AGENTWHY_CANARY3\n{"clientSecret": "AGENTWHY_CANARY4"}\nplain words';
  const names = redactor.keysIn(text);

  // `EMPTY=` holds no value, so `content` takes the line whole and keeps no name; `keysIn` agrees with it.
  assert.deepEqual(names, ['API_TOKEN', 'NEXT', 'clientSecret']);
  for (const name of names) assert.ok(redactor.content(text).includes(name), `${name} is also in the redacted text`);
  assert.ok(!names.join(' ').includes('AGENTWHY_CANARY'));
});

test('keysIn finds nothing in text with no keyed line', () => {
  assert.deepEqual(new Redactor('test').keysIn('just a sentence\nand another'), []);
});

// The report page spec M2a: of those names, the lines whose value is a key - with what it was recognised as - and not a
// setting beside them. Found 2026-09-24: `NODE_ENV` was listed as a key to change.
test('keyedIn names the lines whose value is a key, with its kind, and never a value', () => {
  const random = ['EPzLE4tu9Argh963', 'HgQ7dEAs6bCX9mf1'].join('');
  const text = [
    `   1→AWS_ACCESS_KEY_ID=${AWS_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${JWT}`,
    'NODE_ENV=development',
    'NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co',
    `BUILD_REF=${random}`,
    `# COMMENTED=${random}`,
    `{"CLIENT_SECRET": "AGENTWHY_CANARY-a-long-enough-secret"}`,
  ].join('\n');
  const keyed = new Redactor('test').keyedIn(text);

  assert.deepEqual(keyed.map((line) => [line.name, line.key]), [
    ['AWS_ACCESS_KEY_ID', 'aws-access-key-id'],
    ['SUPABASE_SERVICE_ROLE_KEY', 'jwt'],
    ['BUILD_REF', 'high-entropy value'],
    ['CLIENT_SECRET', 'value beside a sensitive name'],
  ]);
  const said = JSON.stringify(keyed);
  for (const value of [AWS_KEY, JWT, random, 'AGENTWHY_CANARY']) assert.ok(!said.includes(value), value);
});
