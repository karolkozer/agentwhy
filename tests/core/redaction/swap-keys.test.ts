// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { codexKeySwapNotice, holdsCodexKeySwapNotice, KEY_PLACEHOLDER, keysHiddenIn, keysSwappedIn, keySwapNotice, swapKeys, withoutKeyPlaceholders } from '../../../src/core/redaction/swap-keys.ts';

// Values joined at run time (the export's P9): no secret-shaped text is committed.
const GITHUB = ['ghp', 'Q7mZp2Lx9TaV4cBn8RwE3yKu1SdF6gHj0PoI'].join('_');
const STRIPE = ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_');
const NPM = ['npm', 'a1B2c3D4e5a1B2c3D4e5a1B2c3D4e5a1B2c3'].join('_');
const PASSWORD = ['S3cret', 'Passw0rd', 'Value'].join('');
const PEM_BODY = ['MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7', 'Vb4xQ2mZp9Lk3TnYw8RcE1uJfH6sD0aKoI5gPqN7tXyM2bWvCe'];
const PEM = [['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' '), ...PEM_BODY, ['-----END', 'PRIVATE', 'KEY-----'].join(' ')].join('\n');

test('KR3: only the key changes, and the rest of the text stays', () => {
  const { value, count } = swapKeys(`mode: dev\ntoken: ${GITHUB}\nregion: eu\n`);
  assert.equal(value, `mode: dev\ntoken: ${KEY_PLACEHOLDER}\nregion: eu\n`);
  assert.equal(count, 1);
});

test('KR3: every string of each measured shape, with the shape kept', () => {
  const shapes: readonly (readonly [string, (key: string) => unknown])[] = [
    ['Bash', (key) => ({ stdout: `token: ${key}`, stderr: `token: ${key}`, interrupted: false, isImage: false })],
    ['Read', (key) => ({ type: 'text', file: { filePath: '/Users/someone/shop/notes.yml', content: `token: ${key}`, numLines: 1, startLine: 1, totalLines: 1 } })],
    ['an MCP tool', (key) => [{ type: 'text', text: `token: ${key}` }]],
    ['Edit', (key) => ({ filePath: 'notes.yml', originalFile: `token: ${key}`, structuredPatch: [{ lines: [` token: ${key}`] }], userModified: false })],
    ['Agent', (key) => ({ status: 'completed', content: [{ type: 'text', text: `token: ${key}` }], totalTokens: 12 })],
  ];
  for (const [tool, shape] of shapes) {
    const { value, count } = swapKeys(shape(GITHUB));
    assert.deepEqual(value, shape(KEY_PLACEHOLDER), tool);
    assert.ok(count >= 1, tool);
    assert.ok(!JSON.stringify(value).includes(GITHUB), tool);
  }
});

test('a result with no key comes back the same object, so nothing is answered for it', () => {
  const result = { stdout: 'mode: dev\n', stderr: '', interrupted: false, isImage: false };
  const { value, count } = swapKeys(result);
  assert.equal(value, result);
  assert.equal(count, 0);
});

test('a result swapped once is not swapped again', () => {
  const once = swapKeys(`token: ${GITHUB}`);
  assert.deepEqual(swapKeys(once.value), { value: once.value, count: 0 });
});

test('a whole private key is one key, its lines and all', () => {
  const { value, count } = swapKeys(`private_key: |\n${PEM}\nmode: dev\n`);
  assert.equal(value, `private_key: |\n${KEY_PLACEHOLDER}\nmode: dev\n`);
  assert.equal(count, 1);
});

test('a private key printed as JSON is one key too, its lines joined by a written line break', () => {
  const { value, count } = swapKeys(`{"key": ${JSON.stringify(PEM)}, "mode": "dev"}`);
  assert.equal(value, `{"key": "${KEY_PLACEHOLDER}", "mode": "dev"}`);
  assert.equal(count, 1);
});

test('KRB10: the pattern for a private key, read as source, is code', () => {
  const source = '{ name: \'private-key\', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },';
  assert.deepEqual(swapKeys(source), { value: source, count: 0 });
});

test('a URL keeps everything but its password', () => {
  const { value } = swapKeys(`postgres://app:${PASSWORD}@db.fictional-shop.example:5432/app`);
  assert.equal(value, `postgres://app:${KEY_PLACEHOLDER}@db.fictional-shop.example:5432/app`);
});

test('a short password is still a password', () => {
  const short = ['s3', 'Kr7'].join('');
  assert.equal(swapKeys(`postgres://app:${short}@db.fictional-shop.example/app`).value, `postgres://app:${KEY_PLACEHOLDER}@db.fictional-shop.example/app`);
});

test('KR2: a key in a sample passes', () => {
  const sample = `example_token: ${['ghp', 'x'.repeat(36)].join('_')}`;
  assert.deepEqual(swapKeys(sample), { value: sample, count: 0 });
  const reference = '//registry.npmjs.org/:_authToken=${NPM_TOKEN}';
  assert.deepEqual(swapKeys(reference), { value: reference, count: 0 });
});

test('KRB10: code that only looks like a key stays as it was', () => {
  for (const code of [
    "{ name: 'npmrc-auth-token', pattern: /(:_authToken=)\\S+/g },",
    'const url = f"postgres://{user}:{password}@{host}"',
  ]) assert.deepEqual(swapKeys(code), { value: code, count: 0 }, code);
});

test('KRB10: a key standing in code is still a key, and what follows it stays', () => {
  const line = `{"registry": "//registry.npmjs.org/:_authToken=${NPM}", "x": 1}`;
  const { value, count } = swapKeys(line);
  assert.equal(value, `{"registry": "//registry.npmjs.org/:_authToken=${KEY_PLACEHOLDER}", "x": 1}`);
  assert.equal(count, 1);
});

test('several keys in one text, each in its place', () => {
  const { value, count } = swapKeys(`a: ${GITHUB}\nb: ${STRIPE}\nc: ${GITHUB}\n`);
  assert.equal(value, `a: ${KEY_PLACEHOLDER}\nb: ${KEY_PLACEHOLDER}\nc: ${KEY_PLACEHOLDER}\n`);
  assert.equal(count, 3);
});

test('KRB8: an image is never walked, whatever its data happens to spell', () => {
  const data = `${'A'.repeat(64)}${GITHUB}`;
  for (const image of [
    { type: 'image', file: { base64: data, type: 'image/png' } },
    [{ type: 'image', data, mimeType: 'image/png' }],
    { stdout: data, stderr: '', interrupted: false, isImage: true },
  ]) assert.deepEqual(swapKeys(image), { value: image, count: 0 });
});

test('KRB8: one long word of encoded data is left alone, and the same key among words is not', () => {
  const encoded = `${'Q'.repeat(2048)}${GITHUB}`;
  assert.deepEqual(swapKeys(encoded), { value: encoded, count: 0 });
  assert.equal(swapKeys(`${'word '.repeat(600)}${GITHUB}`).count, 1);
});

test('numbers, booleans and nothing come back as they are', () => {
  const result = { a: 1, b: true, c: null, d: [2, false] };
  assert.deepEqual(swapKeys(result), { value: result, count: 0 });
  assert.deepEqual(swapKeys(undefined), { value: undefined, count: 0 });
});

test('a private key however its lines are joined: JSON inside JSON, a language\'s strings', () => {
  const inJson = JSON.stringify(PEM);
  for (const held of [
    JSON.stringify({ inner: inJson }),
    PEM.split('\n').map((line) => `'${line}\\n'`).join(' + '),
    PEM.split('\n').map((line) => `"${line}\\n"`).join('\n'),
  ]) {
    const { value, count } = swapKeys(held);
    assert.equal(count, 1, held);
    for (const line of PEM_BODY) assert.ok(!String(value).includes(line), held);
  }
});

test('a value in quotes: the key goes and the quotes stay', () => {
  for (const quote of ['"', "'"]) {
    const { value, count } = swapKeys(`//registry.npmjs.org/:_authToken=${quote}${NPM}${quote}`);
    assert.equal(value, `//registry.npmjs.org/:_authToken=${quote}${KEY_PLACEHOLDER}${quote}`);
    assert.equal(count, 1);
  }
});

test('a URL\'s password is hidden whole, whatever a URL allows in it, and never in part', () => {
  for (const password of [`abc*${PASSWORD}`, `${PASSWORD}(tail)end`, `${PASSWORD},more`]) {
    const { value, count } = swapKeys(`postgres://app:${password}@db.fictional-shop.example/app`);
    assert.equal(value, `postgres://app:${KEY_PLACEHOLDER}@db.fictional-shop.example/app`, password);
    assert.equal(count, 1);
  }
  for (const template of ['{password}', '%(password)s']) {
    const line = `postgres://app:${template}@db.fictional-shop.example/app`;
    assert.deepEqual(swapKeys(line), { value: line, count: 0 }, template);
  }
});

test('KR6: a placeholder is no value in a report\'s scan, on the last line or any other', () => {
  const redactor = new Redactor('test');
  for (const text of [
    `API_KEY=${KEY_PLACEHOLDER}\nDB_HOST=localhost\n`,
    `API_KEY=${KEY_PLACEHOLDER}`,
    `API_KEY: ${KEY_PLACEHOLDER}\nDB_HOST: localhost\n`,
    `postgres://app:${KEY_PLACEHOLDER}@db.fictional-shop.example/app\n`,
    `a ${KEY_PLACEHOLDER} here\n`,
  ]) assert.deepEqual(redactor.classesIn(withoutKeyPlaceholders(text)), [], text);
});

test('KR6: a real key beside a placeholder is still found', () => {
  assert.notDeepEqual(new Redactor('test').classesIn(withoutKeyPlaceholders(`a: ${KEY_PLACEHOLDER}\nb: ${GITHUB}\n`)), []);
});

test('CH3: Codex\'s notice is the one CHB1 measured - the probe\'s `codex-tell` - and a report knows it by its opening', () => {
  assert.equal(codexKeySwapNotice(2), `[agentwhy: the command ran; this is its output. ${keySwapNotice(2)}]`);
  assert.ok(holdsCodexKeySwapNotice(`Script error:\ntoken: ${KEY_PLACEHOLDER}\n\n\n${codexKeySwapNotice(1)}`));
  assert.ok(!holdsCodexKeySwapNotice(keySwapNotice(1)), 'Claude Code\'s alone is not Codex\'s');
  assert.ok(!holdsCodexKeySwapNotice('[agentwhy: the command ran; this is its output. ]'));
});

test('CH6: the texts swapKeys replaces, and nothing it leaves', () => {
  const text = `a: ${GITHUB}\nb: "${STRIPE}"\nmode: dev\n`;
  assert.deepEqual(keysSwappedIn(text).sort(), [GITHUB, STRIPE].sort());
  assert.deepEqual(keysSwappedIn('mode: dev\n'), []);
});

test('KR11, CHO4: the keys a swapped text holds hidden, the placeholder in Codex\'s own notice left out', () => {
  assert.equal(keysHiddenIn(`a: ${KEY_PLACEHOLDER}\nb: ${KEY_PLACEHOLDER}\n`), 2);
  assert.equal(keysHiddenIn(`Script error:\na: ${KEY_PLACEHOLDER}\n\n${codexKeySwapNotice(1)}`), 1);
  assert.equal(keysHiddenIn('nothing here'), 0);
});
