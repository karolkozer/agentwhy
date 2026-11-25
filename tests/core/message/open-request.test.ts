// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { openRequest } from '../../../src/core/message/open-request.ts';
import { APP_WORDS } from '../../../src/report/render/ui/words/app-words.ts';

const PAGE = [
  'agentwhy', 'open agentwhy', 'Open AgentWhy.', 'OPEN AGENTWHY!', 'open agent why', 'show me agentwhy', 'show me the agentwhy dashboard',
  'start agentwhy', 'run agentwhy', 'launch agentwhy', 'open agentwhy page', "open agentwhy's page", "open agentwhy's dashboard",
  'open agentwhy please', '$agentwhy', '/agentwhy', '  open   agentwhy  ',
  'otwórz agentwhy', 'otworz agentwhy', 'otwórz agentwhy', 'pokaż mi agentwhy', 'pokaz agentwhy', 'uruchom agentwhy',
  'włącz agentwhy', 'wlacz dashboard agentwhy', 'otwórz dashboard agentwhy', 'otwórz agentwhy dashboard', 'otwórz stronę agentwhy',
  'otwórz agentwhy proszę', 'öffne agentwhy', 'oeffne agentwhy', 'zeig mir agentwhy', 'zeige agentwhy', 'starte agentwhy',
  'otwórz agentwhy stronę', 'otwórz agentwhy panel', 'zeig mir das agentwhy Dashboard', 'öffne die agentwhy Seite',
  'öffne agentwhy bitte', 'öffne die Seite von agentwhy', 'öffne agentwhy Dashboard',
];

for (const text of PAGE) test(`RO1: "${text}" asks for the page`, () => assert.equal(openRequest(text, []), 'page'));

for (const text of ["open agentwhy's report", 'open agentwhy’s report', 'open agentwhy report', 'show me the agentwhy report', 'otwórz raport agentwhy', 'pokaż mi raport agentwhy', 'öffne den Bericht von agentwhy', 'öffne agentwhy Bericht', 'öffne den agentwhy Bericht', 'zeig mir den agentwhy Bericht']) {
  test(`RO1: "${text}" asks for the conversation's report`, () => assert.equal(openRequest(text, []), 'report'));
}

// Review focus 1: people copy the phrase from the line that says it, quotes and all.
for (const text of ['"open agentwhy"', '“open agentwhy”', '„otwórz agentwhy”', '„öffne agentwhy“', "'open agentwhy'", '«open agentwhy»', '"open agentwhy".', '`open agentwhy`', '„otwórz agentwhy"', '»öffne agentwhy«', '‚öffne agentwhy‘', '”otwórz agentwhy”']) {
  test(`RO1: ${text} is the phrase, quotes and all`, () => assert.equal(openRequest(text, []), 'page'));
}

for (const text of [
  '', ' ', 'open', 'what is agentwhy', 'agentwhy?x', 'open agentwhy and fix the bug', 'open agentwhy\nthanks', 'run agentwhy report on this branch',
  'open agentwhy-dev', 'agentwhy.dev', 'open my agentwhy', 'close agentwhy', 'uninstall agentwhy', 'report', '"open agentwhy', 'open agentwhy"', '"open" agentwhy', 'do not open agentwhy',
  'please run/install this npm package npx @agentwhy/cli and run agentwhy',
  'please run/install this npm package npx --yes @agentwhy/cli start --detach and run agentwhy',
]) {
  test(`RO1: ${JSON.stringify(text)} goes to the AI untouched`, () => assert.equal(openRequest(text, []), undefined));
}

test('RO1: a message the app says holds a paste is no request', () => {
  assert.equal(openRequest('open agentwhy', [{ first: 1, last: 1 }]), undefined);
});

test('RO1: a long message is refused without being searched', () => {
  assert.equal(openRequest(`open ${' '.repeat(200_000)}agentwhy`, []), undefined);
});

test('RO1: what the stopped page tells a person to write is the request, in every language', () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    const said = /[“„]([^”“]+)[”“]/.exec(APP_WORDS[lang]['live.stopped'] as string)?.[1];
    assert.ok(said !== undefined, lang);
    assert.notEqual(openRequest(said, []), undefined, said);
  }
});
