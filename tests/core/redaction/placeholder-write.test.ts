// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { addsPlaceholder, keysWrittenOver, writesOverKey } from '../../../src/core/redaction/placeholder-write.ts';
import { KEY_PLACEHOLDER } from '../../../src/core/redaction/swap-keys.ts';

const GITHUB = ['ghp', 'Q7mZp2Lx9TaV4cBn8RwE3yKu1SdF6gHj0PoI'].join('_');

test('a text with more placeholders than the one it replaces adds one', () => {
  assert.equal(addsPlaceholder(`a ${KEY_PLACEHOLDER}`, 'a'), true);
});

test('equal or fewer placeholders add none', () => {
  assert.equal(addsPlaceholder(`a ${KEY_PLACEHOLDER}`, `b ${KEY_PLACEHOLDER}`), false);
  assert.equal(addsPlaceholder('a', `b ${KEY_PLACEHOLDER}`), false);
});

test('a Write of the placeholder over a file holding a key writes over the key', () => {
  const write = { newText: `token: ${KEY_PLACEHOLDER}`, replaced: undefined };
  assert.equal(writesOverKey(write, `token: ${GITHUB}`), true);
});

test('the same Write over a file with no key does not', () => {
  const write = { newText: `token: ${KEY_PLACEHOLDER}`, replaced: undefined };
  assert.equal(writesOverKey(write, 'token: none'), false);
});

test('a new file holds no key to lose', () => {
  const write = { newText: `token: ${KEY_PLACEHOLDER}`, replaced: undefined };
  assert.equal(writesOverKey(write, undefined), false);
});

test('a rewrite keeping both placeholders of a file with no key does not', () => {
  const text = `${KEY_PLACEHOLDER} and ${KEY_PLACEHOLDER}`;
  assert.equal(writesOverKey({ newText: text, replaced: undefined }, text), false);
});

test('an Edit whose new text adds a placeholder where the file holds a key does', () => {
  const write = { newText: KEY_PLACEHOLDER, replaced: GITHUB };
  assert.equal(writesOverKey(write, `token: ${GITHUB}`), true);
});

test('an Edit whose old and new text hold one each does not', () => {
  const write = { newText: `x ${KEY_PLACEHOLDER}`, replaced: `y ${KEY_PLACEHOLDER}` };
  assert.equal(writesOverKey(write, `y ${KEY_PLACEHOLDER} ${GITHUB}`), false);
});

// WK7: what a report says of a write the record shows - the file before it, and the file after it.
test('WK7: a Write that put the placeholder where a key was took that key out of the file', () => {
  const before = `token: ${GITHUB}\nmode: dev\n`;
  const after = `token: ${KEY_PLACEHOLDER}\nmode: dev\n`;
  assert.equal(keysWrittenOver({ newText: after, replaced: undefined }, before, after), 1);
});

test('WK7: an Edit that added the placeholder elsewhere left the key where it was, so no key was written over', () => {
  const before = `token: ${GITHUB}\nnote: x\n`;
  const after = `token: ${GITHUB}\nnote: ${KEY_PLACEHOLDER}\n`;
  assert.equal(keysWrittenOver({ newText: `note: ${KEY_PLACEHOLDER}`, replaced: 'note: x' }, before, after), 0);
});

test('WK7, WKB4: a file the record keeps already swapped says nothing, since the key it held is not in the record', () => {
  const before = `token: ${KEY_PLACEHOLDER}\n`;
  const after = `token: ${KEY_PLACEHOLDER}\nmode: dev ${KEY_PLACEHOLDER}\n`;
  assert.equal(keysWrittenOver({ newText: after, replaced: undefined }, before, after), 0);
});

test('WK7: a write that adds no placeholder, or a file with no key, is no key written over', () => {
  assert.equal(keysWrittenOver({ newText: 'token: none', replaced: undefined }, `token: ${GITHUB}`, 'token: none'), 0);
  assert.equal(keysWrittenOver({ newText: `token: ${KEY_PLACEHOLDER}`, replaced: undefined }, 'token: none', `token: ${KEY_PLACEHOLDER}`), 0);
});

const SECOND = ['ghp', 'R8nAq3My0UbW5dCo9SxF4zLv2TeG7hIk1QpJ'].join('_');

test('WK7: a second write over a key, in a file an earlier write already left the placeholder in, is said', () => {
  const before = `token: ${KEY_PLACEHOLDER}\nother: ${SECOND}\n`;
  const after = `token: ${KEY_PLACEHOLDER}\nother: ${KEY_PLACEHOLDER}\n`;
  assert.equal(keysWrittenOver({ newText: after, replaced: undefined }, before, after), 1);
});

test('WK7: one value written over in two places is one key', () => {
  const before = `token: ${GITHUB}\nagain: ${GITHUB}\n`;
  const after = `token: ${KEY_PLACEHOLDER}\nagain: ${KEY_PLACEHOLDER}\n`;
  assert.equal(keysWrittenOver({ newText: after, replaced: undefined }, before, after), 1);
});
