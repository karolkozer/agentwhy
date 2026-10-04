// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import { CODEX_REQUESTS } from '../../../../src/report/watch/render/codex-request-words.ts';

const files = (...paths: string[]): Redacted[] => paths as Redacted[];
const COMMAND = 'agentwhy start --no-serve --session codex-1 --quiet';

/*
 * `codex-says-it-too` CX3, amended 2026-10-02: Codex shows the request whole, and a person reads it first - so it is
 * written to them, short, in each language, with the agent's one ask in brackets and no command in it.
 */
test('every request is a few words for the person, then the agent\'s ask in brackets, in each language', () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    const requests = [
      CODEX_REQUESTS.stopped(['.env'], lang),
      CODEX_REQUESTS.keys(files('.env'), COMMAND, lang),
      CODEX_REQUESTS.template(files('.env.example', '.env.sample'), COMMAND, lang),
      CODEX_REQUESTS.data(files('data/customers.csv'), COMMAND, lang),
      CODEX_REQUESTS.told(files('fake-key.txt'), COMMAND, lang),
      CODEX_REQUESTS.told(files('fake-key.txt'), COMMAND, lang, true),
      CODEX_REQUESTS.quiet(lang),
      CODEX_REQUESTS.quiet(lang, true),
    ];
    for (const request of requests) {
      assert.ok(request.startsWith('**agentwhy**'), request);
      assert.ok(request.split(/\s+/).length <= 40, `${request.split(/\s+/).length} words: ${request}`);
      assert.match(request, /\((For the AI|Dla AI|Für die KI): [^()]+\)$/, 'the agent\'s ask comes last, in brackets, marked as the AI\'s');
      assert.ok(!request.includes('agentwhy start') && !request.includes('`'), 'no command a person cannot read');
    }
  }
  // The limits that keep a file safe stay: a key is never shown, a stopped file never read another way.
  assert.match(CODEX_REQUESTS.keys(files('.env'), COMMAND, 'en'), /don't show the key/);
  // "now": the limit holds for this attempt, never for a later turn after the person changed the file to Track.
  assert.match(CODEX_REQUESTS.stopped(['.env'], 'en'), /don't try to read it another way now\./);
  assert.match(CODEX_REQUESTS.stopped(['.env'], 'pl'), /nie próbuj teraz odczytać go inaczej\./);
  // Where the app folds the turn away (the desktop app), told and quiet ask the answer back; elsewhere one sentence,
  // so nothing is said twice where the answer is already in the open.
  assert.match(CODEX_REQUESTS.told(files('fake-key.txt'), COMMAND, 'pl', true), /powtórz całą swoją odpowiedź dla użytkownika/);
  assert.match(CODEX_REQUESTS.told(files('fake-key.txt'), COMMAND, 'en', true), /repeat your full answer for the user/);
  assert.match(CODEX_REQUESTS.told(files('fake-key.txt'), COMMAND, 'pl'), /odpowiedz jednym krótkim zdaniem/);
  assert.match(CODEX_REQUESTS.quiet('en', true), /repeat your full answer for the user/);
  assert.match(CODEX_REQUESTS.quiet('pl'), /odpowiedz jednym krótkim zdaniem/);
  assert.ok(!CODEX_REQUESTS.keys(files('.env'), COMMAND, 'en', true).includes('repeat your answer'), 'a key is never asked back');
  // S10: data is never asked to be made new.
  for (const lang of ['en', 'pl', 'de'] as const) {
    assert.ok(!/new key|nowy klucz|neuen Schlüssel|make a new|zrób nowy|erstelle/i.test(CODEX_REQUESTS.data(files('data/customers.csv'), COMMAND, lang)), lang);
  }
});

test('a request names three files and counts the rest', () => {
  assert.match(CODEX_REQUESTS.stopped(['a', 'b', 'c', 'd', 'e'], 'en'), /the private files a, b, c and 2 more\./);
  assert.match(CODEX_REQUESTS.stopped(['.env', '.env.local'], 'pl'), /prywatnych plików \.env i \.env\.local\./);
});
