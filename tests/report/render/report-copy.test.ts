// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { LANGS, TABLES, translator } from '../../../src/report/render/report-copy.ts';

/**
 * Criterion 7. A missing translation is not a type error and not a broken page: `translator` falls back to the
 * English table, so the words appear - in the wrong language, on a page whose whole point is being read. Only the
 * tables themselves can say a key is missing, so this asks them.
 */
test('every word the sidebar needs exists in each language, not only in English', () => {
  const keys = Object.keys(TABLES.en).filter((key) => /^(rail|side)\./.test(key));

  assert.ok(keys.length >= 5, 'the sidebar has words to translate');
  for (const lang of LANGS) {
    const missing = keys.filter((key) => !(key in TABLES[lang]));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.join(', ')}`);
  }
});

// The fallback is real, and this is what it does: a key nobody wrote in Polish still renders, in English.
test('a key absent from a table falls back to English rather than failing', () => {
  assert.equal(translator('pl')('rail.sessions'), 'Sesje');
  assert.equal(translator('pl')('no.such.key.here'), 'no.such.key.here');
});

test('every answer, row and next action has its own translation and matching placeholders', () => {
  // Plural forms differ by language, so only keys without one are compared here.
  const keys = Object.keys(TABLES.en).filter((key) =>
    /^(seen|yn|lead\.seen|graph\.seen|tier|target|story)\./.test(key) && !/\.(one|few|many|other)$/.test(key));
  const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
  for (const lang of LANGS) {
    for (const key of keys) {
      assert.ok(key in TABLES[lang], `${lang}: ${key}`);
      assert.deepEqual(placeholders(TABLES[lang][key]!), placeholders(TABLES.en[key]!), `${lang}: ${key}`);
    }
  }
});
