// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ANSWERS } from '../../../../src/report/answers/answer-kinds.ts';
import { cardPage } from '../../../../src/report/render/card/card-page.ts';
import { CARD_SCRIPT } from '../../../../src/report/render/card/card-script.ts';
import { CARD_STYLE } from '../../../../src/report/render/card/card-styles.ts';
import { LANGS, TABLES } from '../../../../src/report/render/report-copy.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV3, CV4, CVD12: the card an app draws in the message.

test('one page in each language, with no address, no request and no markup set from data', () => {
  for (const lang of LANGS) {
    const page = cardPage(lang);
    assert.ok(page.startsWith(`<!doctype html><html lang="${lang}">`));
    assert.ok(!/https?:\/\//.test(page) && !/\bfetch\(|XMLHttpRequest|eval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(page));
    assert.ok(!/<link|<img|src=|@import/.test(page));
    assert.ok(page.length < 120_000);
  }
});

test('colours come from the tokens alone', () => {
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(CARD_STYLE + CARD_SCRIPT));
});

test('the card has its own background, reports its own height, and takes messages from its frame alone', () => {
  assert.match(CARD_STYLE, /html,body\{background:var\(--card\)\}/);
  assert.match(CARD_SCRIPT, /getBoundingClientRect\(\)/);
  assert.ok(!/scrollHeight/.test(CARD_SCRIPT));
  assert.match(CARD_SCRIPT, /event\.source !== parent/);
});

test('every word the script asks for is in every language, and every answer is drawn', () => {
  const keys = [...CARD_SCRIPT.matchAll(/\bt\('([a-z][\w.]*)'/g)].map((found) => found[1] as string).filter((key) => !key.endsWith('.'));
  assert.ok(keys.length > 30);
  for (const lang of LANGS) for (const key of keys) {
    assert.ok(key in TABLES[lang] || `${key}.other` in TABLES[lang] || `${key}.many` in TABLES[lang], `${lang}: ${key}`);
    assert.ok(cardPage(lang).includes(`"${key}`), `${lang}: ${key} is not handed to the card`);
  }
  for (const kind of ANSWERS) assert.match(CARD_SCRIPT, new RegExp(`\\n  ${kind}: function`));
});

test('a script that closes its own tag cannot be made from a word', () => {
  assert.equal(cardPage('en').split('</script>').length - 1, 2);
});

// The review of 2026-11-24: 80 steps were wider than the card at 390px, 400 at any width.
test('the strip is as wide as its card, however many steps it stands for', () => {
  assert.match(CARD_STYLE, /\.strip\{display:flex;flex-wrap:wrap;/);
  assert.match(CARD_SCRIPT, /Math\.ceil\(all\.length \/ STRIP\)/);
  assert.match(CARD_STYLE, /\.tabs\[hidden\]\{display:none\}/);
});

test('a square says its step\'s own look, and one with no private file is never called clean', () => {
  assert.match(CARD_SCRIPT, /step\.tone === 'grey' \? t\('ch\.strip\.grey'\) : t\(step\.label\)/);
  for (const lang of LANGS) assert.ok(cardPage(lang).includes('"ch.strip.grey"') && cardPage(lang).includes('"sb.tag.keyWritten"'), lang);
});

// "i pusto jest?", 2026-11-24.
test('the summary lists its private files, and opens on the step that matters', () => {
  const summary = CARD_SCRIPT.slice(CARD_SCRIPT.indexOf('  summary: function'), CARD_SCRIPT.indexOf('  steps: function'));
  assert.match(summary, /fileRows\(c\)/);
  assert.match(summary, /an\.row\.steps/);
  assert.match(CARD_SCRIPT, /first\.click\(\)/);
});

test('squares that all say the same are one sentence, and a tab with nothing in it is not offered', () => {
  assert.match(CARD_SCRIPT, /an\.strip\.none/);
  assert.match(CARD_SCRIPT, /filter\(function \(one\) \{ return holds\(one\); \}\)/);
});

test('a link is opened while its page can be running, and past that the AI is asked to open it', () => {
  assert.match(CARD_SCRIPT, /Date\.now\(\) - answer\.at > GOOD_FOR/);
  assert.match(CARD_SCRIPT, /an\.ask\.reportOf/);
});
