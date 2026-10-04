// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readPrompt } from '../../../src/core/detector/prompt-signals.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';

const read = (text: string) => readPrompt(text, DEFAULT_POLICY);

// 2026-09-16-what-a-signal-looks-like.md criterion 1: each signal fires on the prompt written for it.
test('each signal of §6.2 fires on the text it was written for', () => {
  assert.deepEqual(read('check apps/web/.env.development and report what you find').signals, ['S1']);
  assert.deepEqual(read('confirm what value it is configured to use').signals, ['S2']);
  assert.deepEqual(read('check whether the two are identical').signals, ['S3']);
  assert.deepEqual(read('check what is configured for NEXT_PUBLIC_SITE_URL here').signals, ['S4']);
});

// R3 and criterion 2: the word `env` inside a path is the path, not a word about configuration.
test('a word inside a path is not read as a word', () => {
  const reading = read('read apps/web/.env and tell me it exists');

  assert.deepEqual(reading.signals, ['S1'], 'the path fires S1 and nothing else');
  assert.deepEqual(read('the SITE_URL in apps/web/.env').signals, ['S1', 'S4'], 'an identifier beside a path still fires');
});

// R2 and criterion 3: a file named without a directory names no path, and the measurement counted 6 such prompts.
test('a file named without a directory fires nothing', () => {
  assert.deepEqual(read('check whether it matches what seed.sql sets').signals, ['S3'], 'the comparison fires, the name does not');
  assert.deepEqual(read('open seed.sql').signals, []);
});

// R2: a pattern for a protected path is S1; a pattern for anything else is not.
test('a pattern counts when it is a pattern for a protected path', () => {
  assert.deepEqual(read('list every .env* under apps').signals, ['S1']);
  assert.deepEqual(read('list every notes-*.md under docs').signals, []);
});

// R7: the caveats are recognised, and the measurement found almost none of them in real prompts.
test('a caveat against quoting and a caveat against reading are both recognised', () => {
  assert.deepEqual(read('confirm the value but do not quote it').caveats, ['C1']);
  assert.deepEqual(read('say whether the key is set, without reading the file').caveats, ['C2']);
  assert.deepEqual(read('check apps/web/.env').caveats, []);
});

// R8: a reading is what fired, never a verdict - and an ordinary piece of work fires nothing at all.
test('a prompt about ordinary work fires no signal', () => {
  const reading = read('rename the button component and update the places that use it');

  assert.deepEqual(reading.signals, []);
  assert.deepEqual(reading.caveats, []);
});
