// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { envNameOf, messageRefusalReason, refusedNote } from '../../../src/message-check/render/message-check-words.ts';

test('two lines: blocked before the AI read it and which keys on which lines, then what to do', () => {
  assert.deepEqual(messageRefusalReason([{ kind: 'stripe-key', line: 6, paste: 1 }], 1, 'en', true).split('\n'), [
    'agentwhy blocked this message before your AI read it: it holds a Stripe key (line 6).',
    'Put it in .env as STRIPE_SECRET_KEY, and send the name instead.',
  ]);
});

test('several keys are listed with their lines and every name, and an open .env is to be blocked first (PK4)', () => {
  const keys = [{ kind: 'stripe-key', line: 1, paste: 1 }, { kind: 'aws-access-key-id', line: 4, paste: 1 }, { kind: 'url-password', line: 5, paste: 1 }];
  assert.deepEqual(messageRefusalReason(keys, 1, 'en', false).split('\n'), [
    'agentwhy blocked this message before your AI read it: it holds a Stripe key (line 1), an AWS key (line 4) and a password in a URL (line 5).',
    'Put them in .env as STRIPE_SECRET_KEY, AWS_ACCESS_KEY_ID and DATABASE_URL, and send the names instead. Block .env in agentwhy first.',
  ]);
});

test('.env is spoken of only where it is open: blocked or not asked, nothing is said of it', () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    for (const blocked of [true, undefined]) {
      const reason = messageRefusalReason([{ kind: 'github-token', line: 2 }], 0, lang, blocked);
      assert.equal(reason.split('\n').length, 2, lang);
      assert.ok(!/agentwhy\.$|in agentwhy\.$|zuerst in agentwhy/.test(reason), `${lang} ${String(blocked)}`);
    }
  }
});

test('a key in a second paste says which paste; the same name twice is given once', () => {
  const reason = messageRefusalReason([{ kind: 'stripe-key', line: 2, paste: 1 }, { kind: 'stripe-key', line: 3, paste: 2 }], 2, 'pl', undefined);
  assert.deepEqual(reason.split('\n'), [
    'agentwhy zablokował tę wiadomość, zanim twoje AI ją przeczytało: zawiera klucz Stripe (wklejka 1, linia 2) i klucz Stripe (wklejka 2, linia 3).',
    'Wpisz je do .env jako STRIPE_SECRET_KEY i wyślij zamiast nich te nazwy.',
  ]);
});

test('German takes the accusative and the pronoun of the noun; English says an', () => {
  assert.match(messageRefusalReason([{ kind: 'jwt', line: 9 }], 0, 'de', undefined), /Sie enthält ein Anmelde-Token \(Zeile 9\)\.\nTrag es in \.env als AUTH_TOKEN ein/);
  assert.match(messageRefusalReason([{ kind: 'private-key', line: 3 }], 0, 'de', undefined), /einen privaten Schlüssel \(Zeile 3\)\.\nSpeicher ihn in einer Datei/);
  assert.match(messageRefusalReason([{ kind: 'openai-key', line: 1 }], 0, 'en', undefined), /holds an OpenAI key \(line 1\)/);
  assert.match(messageRefusalReason([{ kind: 'npm-token', line: 1 }], 0, 'en', undefined), /holds an npm key \(line 1\)/);
});

test('the name to put a key under: the code\'s own configuration name, else the usual one for its kind', () => {
  assert.equal(envNameOf({ kind: 'stripe-key', line: 1, name: 'PAYMENTS_KEY' }), 'PAYMENTS_KEY');
  assert.equal(envNameOf({ kind: 'openai-key', line: 1 }), 'OPENAI_API_KEY');
  assert.equal(envNameOf({ kind: 'some-new-kind', line: 1 }), 'API_KEY');
});

test('no line says the message stayed on the computer (PKD8 (b)), and a URL is put in whole', () => {
  for (const lang of ['en', 'pl', 'de'] as const) {
    assert.ok(!/computer|komputer|Computer|never left|nie opuści/.test(messageRefusalReason([{ kind: 'url-password', line: 1 }], 0, lang, false)), lang);
  }
  assert.match(messageRefusalReason([{ kind: 'url-password', line: 1 }], 0, 'en', undefined), /Put the URL in \.env as DATABASE_URL/);
});

test('PK10: the note for the AI names the kinds, lines and names, asks it to say so first, and forbids nothing', () => {
  const note = refusedNote([{ kind: 'stripe-key', line: 1, paste: 1 }, { kind: 'url-password', line: 5, paste: 1 }], 1, false);
  assert.equal(note, 'agentwhy, the local tool this user runs, blocked their previous message before you saw it: it held a Stripe key (line 1) and a password in a URL (line 5). '
    + 'Before you answer this message, tell the user in one or two short sentences, in the language of this conversation and in plain words, starting with **agentwhy**: '
    + 'that agentwhy blocked their previous message because it held keys, so you never saw them; and that they can put them in .env as STRIPE_SECRET_KEY and DATABASE_URL '
    + 'and give you those names instead, after blocking .env in agentwhy. Then answer their message.');
  assert.ok(!/\b(do not|don't|never ask|must not)\b/i.test(note));
});

test('PK11: the may-have-been-named line in three languages, and the AI asked to say to make new keys', () => {
  const key = [{ kind: 'stripe-key', line: 1 }];
  assert.equal(messageRefusalReason(key, 0, 'en', true, true).split('\n')[2], 'This app may already have sent the message to name the chat: change these keys as well.');
  assert.equal(messageRefusalReason(key, 0, 'pl', true, true).split('\n')[2], 'Ta aplikacja mogła już wysłać tę wiadomość, żeby nazwać rozmowę: zmień też te klucze.');
  assert.equal(messageRefusalReason(key, 0, 'de', true, true).split('\n').length, 3);
  assert.match(refusedNote(key, 0, true, true), /This app may have sent that first message to name the chat, so also tell them to make a new key where it was issued\. Then answer their message\.$/);
  assert.ok(!refusedNote(key, 0, true, false).includes('name the chat'));
});
