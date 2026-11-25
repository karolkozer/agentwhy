// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { keysInMessage } from '../../../src/core/redaction/redactor.ts';
import { swapKeys } from '../../../src/core/redaction/swap-keys.ts';

// An OpenSSH private key that is not encrypted opens on a fixed header with nine `A` in a row, and so read as a sample: the
// check on a message let it through and a swap left it. Built here from its parts, with made-up bytes in place of a key.

const u32 = (n: number): Buffer => {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(n);
  return out;
};
const field = (value: string | Buffer): Buffer => Buffer.concat([u32(value.length), Buffer.from(value)]);
const bytes = (n: number, from: string): Buffer => {
  const parts: Buffer[] = [];
  for (let i = 0; i * 32 < n; i++) parts.push(createHash('sha256').update(`${from}:${i}`).digest());
  return Buffer.concat(parts).subarray(0, n);
};
const pem = (label: string, body: string): string =>
  [`-----BEGIN ${label}`, 'PRIVATE KEY-----'].join(' ') + `\n${(body.match(/.{1,70}/g) ?? []).join('\n')}\n` + [`-----END ${label}`, 'PRIVATE KEY-----'].join(' ');

const openssh = (publicBytes: number, privateBytes: number): string => {
  const raw = Buffer.concat([
    Buffer.from('openssh-key-v1\0'), field('none'), field('none'), field(''), u32(1), field(bytes(publicBytes, 'public')), field(bytes(privateBytes, 'private')),
  ]);
  return pem('OPENSSH', raw.toString('base64'));
};
const KEYS = { ed25519: openssh(51, 136), rsa: openssh(407, 1400) };
const body = bytes(600, 'body').toString('base64');

test('an unencrypted OpenSSH private key is a key, not a sample, and is hidden', () => {
  for (const [kind, key] of Object.entries(KEYS)) {
    assert.equal(/A{8}/.test(key), true, `${kind}: the fixed header's run`);
    assert.deepEqual(keysInMessage(`Use this:\n${key}\n`).map(({ kind: name, sample }) => [name, sample]), [['private-key', false]], kind);
    for (const text of [`${key}\n`, JSON.stringify({ key })]) assert.equal(swapKeys(text).count, 1, kind);
  }
});

test('four letters that fell together by chance in a private key do not make it a sample', () => {
  for (const run of ['fake', 'XxXx', 'AAAAAAAA']) {
    const key = pem('RSA', body.slice(0, 100) + run + body.slice(100));
    assert.deepEqual(keysInMessage(key).map(({ sample }) => sample), [false], run);
  }
});

test('the same for a private key in base64', () => {
  const opens = Buffer.from(['-----BEGIN RSA', 'PRIVATE KEY-----'].join(' ')).toString('base64').replace(/=+$/, '').slice(0, 40);
  for (const run of ['fake', 'xxxx', 'AAAAAAAA']) {
    const found = keysInMessage(`key: ${opens}${body.slice(0, 100)}${run}${body.slice(100)}`);
    assert.deepEqual(found.map(({ kind, sample }) => [kind, sample]), [['private-key-base64', false]], run);
  }
});

test('a private key a document elides, fills with one character or names an example stays a sample', () => {
  for (const written of [
    'MIIEpAIBAAKCAQEA...', '…', 'x'.repeat(64), 'A'.repeat(400), '***', `${body.slice(0, 64)}...`, `${body.slice(0, 100)}EXAMPLE${body.slice(100)}`, 'your-private-key-here',
  ]) {
    const key = pem('RSA', written);
    assert.deepEqual(keysInMessage(key).map(({ sample }) => sample), [true], written.slice(0, 24));
    assert.equal(swapKeys(key).count, 0, written.slice(0, 24));
  }
});
