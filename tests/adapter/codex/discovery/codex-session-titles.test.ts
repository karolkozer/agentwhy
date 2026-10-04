// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { appendFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { CodexSessionTitles } from '../../../../src/adapter/codex/discovery/codex-session-titles.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionSummary } from '../../../../src/core/session-catalogue.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { given, meta, turnContext } from '../../../helpers/codex-session.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const session = (id: string): SessionSummary => ({ id, path: `/Users/someone/.codex/sessions/rollout-${id}.jsonl`, modifiedAt: 0, delegations: 0, provider: 'codex' });
const line = (id: string, name: unknown) => JSON.stringify({ id, thread_name: name, updated_at: '2026-09-30T11:34:00.000000Z' });

async function titlesFrom(t: Parameters<typeof writeSession>[0], text: string | undefined) {
  const root = await writeSession(t, text === undefined ? {} : { 'session_index.jsonl': text });
  return new CodexSessionTitles({ files: new NodeFileSystem(), directories: new NodeFileSystem(), path: join(root, 'session_index.jsonl'), redactor: new Redactor('test') });
}

// THREAD_NAMES: the name Codex shows in its own list, and the last one given to an id.
test('a thread is recognised by the name Codex gave it, the latest where it was named twice', async (t) => {
  const titles = await titlesFrom(t, [line('a', 'Find where the anon key is used'), line('b', 'Fix the webhook'), line('a', 'Anon key usage')].join('\n') + '\n');

  assert.equal(String((await titles.recognise(session('a'))).title), 'Anon key usage');
  assert.equal(String((await titles.recognise(session('b'))).title), 'Fix the webhook');
  assert.deepEqual(await titles.recognise(session('c')), {}, 'a `codex exec` thread has no line, and no title');
});

// The free-text door: a name is what Codex wrote from what the person typed, and a key in it is never shown.
test('a name passes the redactor and is one line of plain words', async (t) => {
  const key = ['sk_', 'live_', 'Test0000000000000000000'].join('');
  const titles = await titlesFrom(t, [line('a', `Rotate ${key}`), line('b', 'Two\nlines‮ here'), line('c', 3), '{ broken', line('d', `  ${CANARY}  `)].join('\n'));

  const withKey = String((await titles.recognise(session('a'))).title);
  assert.ok(!withKey.includes(key), 'the value never reaches a title');
  assert.equal(String((await titles.recognise(session('b'))).title), 'Two lines here');
  assert.deepEqual(await titles.recognise(session('c')), {}, 'a name that is not text is none');
});

test('no file is no titles, never an error', async (t) => {
  const titles = await titlesFrom(t, undefined);
  assert.deepEqual(await titles.recognise(session('a')), {});
});

test('an exec conversation without an index name uses its prompt after the injected environment context', async (t) => {
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta('a'), turnContext('turn'), given('user', 'AGENTS.md instructions\n<environment_context>local</environment_context>'),
      given('user', 'Locate SUPABASE_ANON_KEY usage')),
  });
  const titles = new CodexSessionTitles({ files: new NodeFileSystem(), directories: new NodeFileSystem(), path: join(root, 'absent-index.jsonl'), redactor: new Redactor('test') });

  assert.equal(String((await titles.recognise({ ...session('a'), path: join(root, 'rollout.jsonl') })).title), 'Locate SUPABASE_ANON_KEY usage');
});

test('an unfamiliar exec message shape does not turn injected context into a title', async (t) => {
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta('a'), given('user', 'Locate the key'), given('user', 'Another message')),
    'new-build.jsonl': jsonl(meta('b', { cli_version: '0.999.0' }), given('user', '<environment_context>local</environment_context>'), given('user', 'Locate the key')),
  });
  const titles = new CodexSessionTitles({ files: new NodeFileSystem(), directories: new NodeFileSystem(), path: join(root, 'absent-index.jsonl'), redactor: new Redactor('test') });

  assert.deepEqual(await titles.recognise({ ...session('a'), path: join(root, 'rollout.jsonl') }), {});
  assert.deepEqual(await titles.recognise({ ...session('b'), path: join(root, 'new-build.jsonl') }), {});
});

test('an exec prompt is redacted before its displayed title is shortened', async (t) => {
  const key = ['sk_', 'live_', 'Test0000000000000000000'].join('');
  const root = await writeSession(t, {
    'rollout.jsonl': jsonl(meta('a'), given('user', '<environment_context>local</environment_context>'),
      given('user', 'x'.repeat(150) + key)),
  });
  const titles = new CodexSessionTitles({ files: new NodeFileSystem(), directories: new NodeFileSystem(), path: join(root, 'absent-index.jsonl'), redactor: new Redactor('test') });
  const shown = String((await titles.recognise({ ...session('a'), path: join(root, 'rollout.jsonl') })).title);

  assert.ok(shown.length <= 160);
  assert.ok(!shown.includes(key));
  assert.ok(!shown.includes(key.slice(0, 10)), 'cutting the title must not show even a piece of the key');
});

// Found by the maintainer: Codex names a thread seconds after it starts (§2.9), and a served page draws a conversation
// started since. A name written after the first list is found on the next, and a file that did not change is not read again.
test('a name Codex writes after the list was first drawn is found when it is drawn again', async (t) => {
  const root = await writeSession(t, { 'session_index.jsonl': line('a', 'Fix the webhook') + '\n' });
  const path = join(root, 'session_index.jsonl');
  const titles = new CodexSessionTitles({ files: new NodeFileSystem(), directories: new NodeFileSystem(), path, redactor: new Redactor('test') });

  assert.deepEqual(await titles.recognise(session('b')), {}, 'not named yet');
  await appendFile(path, line('b', 'Read SUPABASE_URL') + '\n');
  await utimes(path, new Date('2026-09-30T12:45:39Z'), new Date('2026-09-30T12:45:39Z'));
  assert.equal(String((await titles.recognise(session('b'))).title), 'Read SUPABASE_URL');
  assert.equal(String((await titles.recognise(session('a'))).title), 'Fix the webhook');
});
