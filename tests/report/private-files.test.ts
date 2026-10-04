// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { NAMES_PER_FILE } from '../../src/report/report-model.ts';

// `specs/2026-09-23-the-report-page.md` M1, M2, M6: what reading a file left behind, and every everyday file a file tool
// worked on. Every value below carries the canary, and none of them may reach the model.
const CANARY = 'AGENTWHY_CANARY';
// A key format has no room for the canary's underscore, so this value is checked for by itself.
const STRIPE = 'sk_live_' + 'Zq8vN2kLp4Rt7Wx1';
const ENV = [
  `STRIPE_SECRET_KEY=${STRIPE}`,
  `SUPABASE_URL=https://${CANARY}.example.test`,
  '# a comment names nothing',
  '',
  `"clientSecret": "${CANARY}-json"`,
].join('\n');

function session(events: ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [], events, completeness: 'complete', messages: [], gaps: [],
  };
}

let sequence = 0;
function call(toolName: string, shape: ToolEvent['resultShape'], targets: string[], content: string, extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'agent' as const, agentId: 'main' }, record: sequence };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName, input: {}, targets, commands: [], resultShape: shape,
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

const report = (events: ToolEvent[]) => buildReport(session(events), DEFAULT_POLICY, new Redactor('test'));

test('a file read on its own names its key formats and its variables, never a value', () => {
  const model = report([call('Read', 'content', ['apps/web/.env'], ENV)]);
  const [file] = model.privateFiles;

  assert.equal(file?.path, 'apps/web/.env');
  assert.ok(file?.keys.includes('stripe-key' as never), 'the Stripe key is known by its format');
  assert.deepEqual(file?.names, ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']);
  assert.deepEqual(file?.keyed.map((line) => [line.name, line.key]), [['STRIPE_SECRET_KEY', 'stripe-key']], 'M2a: an address is no key, and a name no configuration would carry is held to the report’s threshold');
  assert.equal(file?.mixed, undefined);
  assert.ok(!JSON.stringify(model).includes(CANARY), 'no value from the file is anywhere in the model');
  assert.ok(!JSON.stringify(model).includes(STRIPE), 'the key itself is not either');
});

test('a shell line that only prints a file counts as reading it', () => {
  const model = report([call('Bash', 'listing', [], ENV, { commands: ['cat apps/web/.env'] })]);
  assert.deepEqual(model.privateFiles[0]?.names, ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']);
});

// said-where-the-person-is SWO1: `cd` prints nothing, and beside `ls` the file's KEY=value lines are its, the names not.
test('a file printed after cd, or beside a directory listing, is read for its names, and the listing is not', () => {
  const listing = ['total 8', '-rw-r--r--  1 someone  staff  42 Oct  2 10:00 .env', 'README.md'].join('\n');
  const cd = report([call('Bash', 'listing', [], ENV, { commands: ['cd apps/web && cat .env'] })]);
  const beside = report([call('Bash', 'listing', [], `${listing}\n${ENV}`, { commands: ['cd apps/web && ls -la && cat .env'] })]);

  assert.deepEqual(cd.privateFiles.map((file) => [file.path, file.names]), [['.env', ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']]]);
  assert.deepEqual(beside.privateFiles.map((file) => [file.path, file.names]), [['.env', ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']]]);
  assert.deepEqual(beside.secretShapes.map((finding) => finding.inPrivateFile), [true], 'the key is the file\'s');
  assert.ok(!JSON.stringify(beside).includes(CANARY) && !JSON.stringify(beside).includes(STRIPE), 'no value');
});

// search-hits-are-reads H6, H11: a search's hit lines are read as the file is, through the redactor and nowhere else.
test('the lines a search printed of a file are read for its names, and none of their values reach the model', () => {
  const printed = ENV.split('\n').map((line, at) => `apps/web/.env:${at + 1}:${line}`).join('\n');
  const model = report([call('Bash', 'listing', [], printed, { commands: ['grep -rn -e KEY -e URL -e Secret apps'] })]);

  assert.deepEqual(model.privateFiles[0]?.names, ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']);
  assert.ok(!JSON.stringify(model).includes(CANARY), 'no value from the lines is anywhere in the model');
  assert.ok(!JSON.stringify(model).includes(STRIPE), 'the key itself is not either');
});

test('a read of two protected files at once is given to neither, and both say so', () => {
  const model = report([call('Bash', 'listing', [], ENV, { commands: ['cat apps/web/.env apps/api/.env'] })]);

  assert.deepEqual(model.privateFiles.map((file) => [file.path, file.names.length, file.keys.length, file.mixed]), [
    ['apps/web/.env', 0, 0, true],
    ['apps/api/.env', 0, 0, true],
  ]);
});

/*
 * Seen by the maintainer on 2026-10-02: `ls` printed a private file's name relative to the project, the Read tool then
 * named the same file by its absolute path, and the to-do list drew it twice. Both are shown the same, so they are one.
 */
test('one file is one private file, whether its path was written relative or absolute', () => {
  const root = { kind: 'known' as const, path: '/work/the-app' };
  const events = [
    call('Bash', 'listing', [], 'apps/web/.env\nREADME.md', { commands: ['ls -a apps/web'] }),
    call('Read', 'content', ['/work/the-app/apps/web/.env'], ENV),
  ];
  const model = buildReport({ ...session(events), projectRoot: root }, DEFAULT_POLICY, new Redactor('test', root));

  assert.deepEqual(model.privateFiles.map((file) => [file.path, file.names]), [['apps/web/.env', ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'clientSecret']]]);
  assert.ok(!JSON.stringify(model).includes(CANARY) && !JSON.stringify(model).includes(STRIPE), 'no value, merged or not');
});

// Found by review: the shared view shows every file outside the project in the same words, and merging by them made two
// files one - one row holding the names of both.
test('a shared report keeps two files outside the project apart, though it shows them alike', () => {
  const root = { kind: 'known' as const, path: '/Users/someone/demo-shop' };
  const events = [
    call('Read', 'content', ['/Users/someone/other-shop/.env'], 'STRIPE_SECRET_KEY=x'),
    call('Read', 'content', ['/Users/someone/third-shop/.env'], 'SUPABASE_URL=y'),
    call('Read', 'content', ['/Users/someone/demo-shop/.env'], 'DATABASE_URL=z'),
    call('Bash', 'listing', [], '.env', { commands: ['ls -a'] }),
  ];
  const shared = buildReport({ ...session(events), projectRoot: root }, DEFAULT_POLICY, new Redactor('test', root, true));

  assert.deepEqual(shared.privateFiles.map((file) => [file.path, file.names]), [
    ['outside the project', ['STRIPE_SECRET_KEY']],
    ['outside the project', ['SUPABASE_URL']],
    ['.env', ['DATABASE_URL']],
  ]);
});

test('what only listed a protected file, or a refused read, leaves no keys or names behind', () => {
  const listed = report([call('Bash', 'listing', [], 'apps/web/.env\nREADME.md', { commands: ['ls -a apps/web'] })]);
  assert.deepEqual(listed.privateFiles.map((file) => [file.path, file.names, file.keys]), [['apps/web/.env', [], []]]);

  const refused = report([call('Read', 'content', ['apps/web/.env'], 'Permission denied: ' + ENV, { outcome: 'blocked' })]);
  assert.deepEqual(refused.privateFiles.map((file) => [file.names, file.keys]), [[[], []]]);
});

test('variables are kept once each, in the order first read, and no more than the cap', () => {
  const many = Array.from({ length: NAMES_PER_FILE + 5 }, (_unused, at) => `KEY_${at}=${CANARY}${at}`).join('\n');
  const model = report([
    call('Read', 'content', ['apps/web/.env'], 'KEY_0=' + CANARY),
    call('Read', 'content', ['apps/web/.env'], many),
  ]);
  const names = model.privateFiles[0]?.names ?? [];
  assert.equal(names.length, NAMES_PER_FILE);
  assert.equal(names[0], 'KEY_0');
  assert.equal(new Set(names).size, names.length);
});

test('a variable name that is itself a key is redacted like any other text', () => {
  const model = report([call('Read', 'content', ['apps/web/.env'], `${STRIPE}=1`)]);
  assert.ok(!JSON.stringify(model).includes(STRIPE));
});

// M6: the files a file tool worked on, other than protected ones, and how.
test('every everyday file a file tool read or wrote is listed once, with its strongest use', () => {
  const model = report([
    call('Read', 'content', ['src/app/route.ts'], 'export const x = 1'),
    call('Read', 'content', ['src/app/route.ts'], 'export const x = 1'),
    call('Edit', 'none', ['src/app/route.ts'], 'done', { written: ['export const x = 2'] }),
    call('Read', 'content', ['README.md'], '# hello'),
    call('Read', 'content', ['notes.txt'], '', { outcome: 'blocked' }),
    call('Read', 'content', ['maybe.ts'], '', { outcome: 'unknown' }),
    call('Read', 'content', ['apps/web/.env'], ENV),
    call('Grep', 'listing', ['src'], 'src/app/route.ts'),
    call('Bash', 'listing', [], 'x', { commands: ['cat package.json'] }),
    call('Mystery', 'listing', ['anything at all'], 'x', { toolKnown: false }),
  ]);

  assert.deepEqual(model.everydayFiles.map((file) => [file.path, file.calls, file.how]), [
    ['src/app/route.ts', 3, 'changed'],
    ['README.md', 1, 'read'],
    ['notes.txt', 1, 'stopped'],
  ]);
});

test('a shared report lists everyday files the way it shows every other path', () => {
  const shared = buildReport(session([call('Read', 'content', ['/Users/someone/elsewhere/notes.md'], 'x')]), DEFAULT_POLICY,
    new Redactor('test', { kind: 'known', path: '/Users/someone/demo-shop' }, true));
  assert.ok(!JSON.stringify(shared.everydayFiles).includes('/Users/someone'), 'a path outside the project is not shown');
});
