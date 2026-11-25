// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ClaudeCodeCallFinder } from '../../../../src/adapter/claude-code/discovery/claude-code-call-finder.ts';
import type { SessionSummary } from '../../../../src/core/session-catalogue.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CVB22, measured 2026-11-24 on 2.1.308: after `/clear` the plugin's server goes on with the
// conversation it was started in, so which one a call is in is read from the record that holds the call itself.

const session = (id: string, modifiedAt: number): SessionSummary => ({ id, path: `/stored/${id}`, modifiedAt, delegations: 0, provider: 'claude-code' });

function finder(records: Record<string, string>, sessions: SessionSummary[], later: { after: number; record: string; text: string } | undefined = undefined) {
  const read: string[] = [];
  let slept = 0;
  const made = new ClaudeCodeCallFinder({
    catalogue: { list: async () => ({ directory: '/stored', sessions }) as never },
    transcripts: {
      readTail: async (path) => {
        read.push(path);
        const text = records[path];
        if (text === undefined) throw new FileAccessError('not-found', path);
        return text;
      },
    },
    sleep: async () => { slept += 1; if (later !== undefined && slept === later.after) records[later.record] = later.text; },
  });
  return { made, read, slept: () => slept };
}
const CALL = 'toolu_01AbCdEfGh';

test('the conversation of a call is the one whose record holds it, whichever was touched last', async () => {
  const { made } = finder({ '/stored/new.jsonl': '{"id":"toolu_other"}', '/stored/old.jsonl': `{"type":"tool_use","id":"${CALL}"}` }, [session('old', 1), session('new', 2)]);
  assert.equal(await made.conversationOf(CALL, '/work/shop'), 'old');
});

test('a record still being written is waited for, and not for long', async () => {
  const soon = finder({ '/stored/a.jsonl': '' }, [session('a', 1)], { after: 2, record: '/stored/a.jsonl', text: CALL });
  assert.equal(await soon.made.conversationOf(CALL, '/work/shop'), 'a');
  const never = finder({ '/stored/a.jsonl': '' }, [session('a', 1)]);
  assert.equal(await never.made.conversationOf(CALL, '/work/shop'), undefined);
  assert.ok(never.slept() <= 12);
});

test('only the records touched last are looked into, and one that cannot be read is passed over', async () => {
  const sessions = Array.from({ length: 40 }, (_, n) => session(`s${n}`, n));
  const { made, read } = finder(Object.fromEntries(sessions.slice(1).map((one) => [`${one.path}.jsonl`, one.id === 's38' ? CALL : ''])), [...sessions, session('gone', 99)]);
  assert.equal(await made.conversationOf(CALL, '/work/shop'), 's38');
  assert.ok(new Set(read).size <= 8, String(read.length));
});

test('what is no call\'s id is looked for nowhere', async () => {
  const { made, read } = finder({}, [session('a', 1)]);
  for (const id of ['', 'x', 'a b', '"}', 'x'.repeat(300)]) assert.equal(await made.conversationOf(id, '/work/shop'), undefined);
  assert.deepEqual(read, []);
});
