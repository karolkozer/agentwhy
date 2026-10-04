// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { inspect } from 'node:util';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { RUN_ANYWHERE, RUN_AT_EDGE } from '../../../src/core/redaction/value-trace.ts';
import { RETURNED_SECRET as SECRET } from '../../helpers/return-session.ts';

const trace = (values: readonly string[], salt = 'test') => new Redactor(salt).trace(values);
const everything = (value: unknown): string =>
  inspect(value, { depth: Infinity, showHidden: true, maxArrayLength: Infinity, maxStringLength: Infinity });

// what-came-back R3, R4 and spec §5.1: a whole value, a prefix, a suffix, or a long enough run from inside it.
test('a run anywhere, a prefix or a suffix is found, and names the value only by its position', () => {
  const traced = trace(['an-unrelated-value-000', SECRET]);

  assert.deepEqual([...traced.foundIn(`it is ${SECRET} here`)], [1]);
  assert.deepEqual([...traced.foundIn(`starts ${SECRET.slice(0, RUN_AT_EDGE)}...`)], [1]);
  assert.deepEqual([...traced.foundIn(`...ends ${SECRET.slice(-RUN_AT_EDGE)}`)], [1]);
  assert.deepEqual([...traced.foundIn(`inside ${SECRET.slice(2, 2 + RUN_ANYWHERE)} it`)], [1]);
  assert.equal(traced.foundIn('nothing of either').size, 0);
});

test('a run one character short of its threshold is not found, and nor is a value shorter than the edge', () => {
  const traced = trace([SECRET]);

  assert.equal(traced.foundIn(SECRET.slice(2, 2 + RUN_ANYWHERE - 1)).size, 0, 'an inside run one short');
  assert.equal(traced.foundIn(SECRET.slice(0, RUN_AT_EDGE - 1)).size, 0, 'a prefix one short');
  assert.equal(trace(['abcde']).foundIn('the value abcde itself').size, 0, 'a value shorter than the edge threshold');
});

// §5.4 rule 6: the model stores no values. A trace holds digests and positions, and this is everything it holds.
test('what a trace holds is digests and positions, and no run of a value', () => {
  const held = everything(trace([SECRET]));

  for (let start = 0; start + 4 <= SECRET.length; start += 1) {
    assert.ok(!held.includes(SECRET.slice(start, start + 4)), 'no 4-character run of the value');
  }
  assert.match(held, /[0-9a-f]{64}/, 'and it does hold digests, so this inspected something');
});

/*
 * The scan fingerprints each window before digesting it, and a fingerprint rolls from the one before it. That makes
 * the arithmetic depend on where a run sits, which a single example would never exercise: these are every run of
 * every value, at every offset, with the window landing on each alignment in turn.
 */
test('a run is found wherever it sits in the text', () => {
  const values = ['aaaaaaaaaaaaaaaa', 'zY9-xW8_vU7.tS6+', SECRET, 'ąęćłńóśźż-value-0'];
  const traced = trace(values);

  for (const [index, value] of values.entries()) {
    for (let start = 0; start + RUN_ANYWHERE <= value.length; start += 1) {
      const run = value.slice(start, start + RUN_ANYWHERE);
      for (const before of ['', 'x', 'padding ', 'a'.repeat(31)]) {
        const text = `${before}${run} and then some more text`;
        assert.ok(traced.foundIn(text).has(index), `run at ${start} of value ${index} after ${before.length} characters`);
      }
    }
  }
});

test('text that holds no run of any traced value finds nothing', () => {
  const traced = trace([SECRET, 'another-traced-value-here']);

  assert.equal(traced.foundIn('0123456789 '.repeat(500)).size, 0);
  assert.equal(traced.foundIn('the quick brown fox jumps over the lazy dog '.repeat(200)).size, 0);
});

/*
 * A digest per position meant one cryptographic hash per character of every message a session holds - 3.6 seconds of
 * a single run on a record-heavy transcript. The budget is generous: it fails on hashing every window and passes on
 * fingerprinting first, without asking a loaded machine to be quick.
 */
test('a megabyte of text is scanned in a moment', () => {
  const traced = trace([SECRET]);
  const text = 'ordinary text with no secret in it, just words and numbers 12345. '.repeat(16000);

  const started = performance.now();
  const found = traced.foundIn(text);
  const took = performance.now() - started;

  assert.equal(found.size, 0);
  assert.ok(took < 1000, `scanning ${Math.round(text.length / 1024)} KB took ${Math.round(took)} ms`);
});

test('a trace is salted per run: the same value gives different digests in two reports', () => {
  const digests = (salt: string): string[] => everything(trace([SECRET], salt)).match(/[0-9a-f]{64}/g) ?? [];
  const first = digests('run-one');
  const second = digests('run-two');

  assert.ok(first.length > 0);
  assert.ok(first.every((digest) => !second.includes(digest)));
});
