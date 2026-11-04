// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { KeyMessageCheck } from '../../src/message-check/key-message-check.ts';

const STRIPE = ['sk', 'live', 'Q7mZp2Lx9TaV4cBn8RwE3yK'].join('_');

function fakeMemory() {
  const kept = new Map<string, string>();
  const went = new Set<string>();
  return {
    keep: async (session: string, note: string) => { kept.set(session, note); },
    take: async (session: string) => { const note = kept.get(session); kept.delete(session); return note; },
    wentBefore: async (session: string) => went.has(session),
    markWent: async (session: string) => { went.add(session); },
  };
}

test('a message with no key is answered with nothing, and .env is never asked about', async () => {
  let asked = 0;
  const check = new KeyMessageCheck({ envBlocked: async () => { asked += 1; return true; } });
  assert.equal(await check.answer({ text: 'hello', workingDirectory: '/Users/someone/shop', pastes: [] }, 'en'), '');
  assert.equal(asked, 0);
});

test('a message with a key is refused as Claude Code and Codex read a refusal, and holds no part of the key (PK2, PK3, PK5)', async () => {
  const check = new KeyMessageCheck({ envBlocked: async (folder) => folder === '/Users/someone/shop' });
  const output = await check.answer({ text: `x = new Stripe("${STRIPE}")`, workingDirectory: '/Users/someone/shop', pastes: [] }, 'en');
  const parsed = JSON.parse(output) as { decision: string; reason: string };
  assert.equal(parsed.decision, 'block');
  assert.equal(parsed.reason, 'agentwhy blocked this message before your AI read it: it holds a Stripe key (line 1).\nPut it in .env as STRIPE_SECRET_KEY, and send the name instead.');
  assert.ok(!output.includes(STRIPE.slice(8, 16)));
});

test('a question about .env that fails says nothing of .env and still stops the message', async () => {
  const check = new KeyMessageCheck({ envBlocked: async () => { throw new Error('unreadable'); } });
  const parsed = JSON.parse(await check.answer({ text: STRIPE, workingDirectory: '/Users/someone/shop', pastes: [] }, 'en')) as { reason: string };
  assert.ok(parsed.reason.startsWith('agentwhy blocked this message'));
  assert.ok(!parsed.reason.includes('Block .env'));
});

test('PK10: a refusal is remembered for its conversation and handed to the AI with the next message that goes, once', async () => {
  const memory = fakeMemory();
  const check = new KeyMessageCheck({ envBlocked: async () => true, memory });
  const refused = await check.answer({ text: `x = new Stripe("${STRIPE}")`, sessionId: 's1', pastes: [] }, 'pl');
  assert.equal((JSON.parse(refused) as { decision: string }).decision, 'block');
  assert.equal(await check.answer({ text: 'hello', sessionId: 'another', pastes: [] }, 'pl'), '', 'another conversation is told nothing');
  const next = await check.answer({ text: 'hello', sessionId: 's1', pastes: [] }, 'pl');
  assert.match(next, /^agentwhy, the local tool this user runs, blocked their previous message before you saw it: it held a Stripe key \(line 1\)\./);
  assert.ok(!next.includes(STRIPE.slice(8, 16)), 'no part of the key');
  assert.equal(await check.answer({ text: 'and now?', sessionId: 's1', pastes: [] }, 'pl'), '', 'said once');
});

test('PK10: a memory that fails costs the note, never the refusal or the next message', async () => {
  const fail = async (): Promise<never> => { throw new Error('disk'); };
  const broken = { keep: fail, take: fail, wentBefore: fail, markWent: fail };
  const check = new KeyMessageCheck({ envBlocked: async () => true, memory: broken });
  assert.equal((JSON.parse(await check.answer({ text: STRIPE, sessionId: 's', pastes: [] }, 'en')) as { decision: string }).decision, 'block');
  assert.equal(await check.answer({ text: 'hello', sessionId: 's', pastes: [] }, 'en'), '');
});

test('PK11: a first message refused in an app that names chats says the keys may have gone; the terminal and later ones do not', async () => {
  const check = new KeyMessageCheck({ envBlocked: async () => true, memory: fakeMemory() });
  const reasonOf = async (session: string, heldIn: 'editor' | 'terminal' | undefined) =>
    (JSON.parse(await check.answer({ text: STRIPE, sessionId: session, pastes: [] }, 'en', async () => heldIn)) as { reason: string }).reason;
  assert.match(await reasonOf('a', 'editor'), /\nThis app may already have sent the message to name the chat: change these keys as well\.$/);
  assert.match(await reasonOf('b', undefined), /change these keys as well\.$/, 'an app not known may');
  assert.ok(!(await reasonOf('c', 'terminal')).includes('name the chat'));
  await check.answer({ text: 'hello', sessionId: 'd', pastes: [] }, 'en');
  assert.ok(!(await reasonOf('d', 'editor')).includes('name the chat'), 'after a message went, the chat has its name');
});

test('review: every message that goes marks its conversation, and the language is read only for a refusal', async () => {
  let marks = 0;
  let asked = 0;
  const memory = { ...fakeMemory(), markWent: async () => { marks += 1; } };
  const check = new KeyMessageCheck({ envBlocked: async () => true, memory });
  const lang = async () => { asked += 1; return 'en' as const; };
  await check.answer({ text: 'hello', sessionId: 's', pastes: [] }, lang);
  await check.answer({ text: 'again', sessionId: 's', pastes: [] }, lang);
  assert.equal(marks, 2, 'a conversation in use keeps its mark past the store\'s sweep');
  assert.equal(asked, 0, 'no key, no preferences read');
  await check.answer({ text: STRIPE, sessionId: 's', pastes: [] }, lang);
  assert.equal(asked, 1);
});
