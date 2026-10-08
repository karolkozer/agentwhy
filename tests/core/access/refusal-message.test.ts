// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { refusedReach } from '../../../src/core/access/refusal-message.ts';
import { refusalReason } from '../../../src/refuse/render/refusal-words.ts';
import type { RefusalRoute } from '../../../src/refuse/command-refusal.ts';

// A differential invariant (conventions.md: "two independently written paths over the same data must agree"):
// `refusedReach` is read back against the real `refusalReason`, never a copy of its words, so the two cannot drift
// apart unnoticed. `correlate.ts` has no path of its own for a call blocked through a glob or a search - this
// message is the only place that path survives once the call is read back from the transcript alone.
for (const route of [{ kind: 'named' }, { kind: 'glob', word: '.env*' }, { kind: 'search' }] as const satisfies readonly RefusalRoute[]) {
  test(`a ${route.kind} refusal's own words name the path and the pattern back out`, () => {
    const message = refusalReason('config/.env.local', '**/.env*', 0, route);

    assert.deepEqual(refusedReach(message), { path: 'config/.env.local', pattern: '**/.env*' });
  });
}

test('a count of further protected paths does not reach into the pattern', () => {
  const message = refusalReason('customers.csv', '**/customers.csv', 2, { kind: 'search' });

  assert.deepEqual(refusedReach(message), { path: 'customers.csv', pattern: '**/customers.csv' });
});

test('the computer-wide wording is read the same as a project\'s', () => {
  const message = refusalReason('~/.ssh/id_rsa', '~/.ssh/id_rsa', 0, { kind: 'named' }, true);

  assert.deepEqual(refusedReach(message), { path: '~/.ssh/id_rsa', pattern: '~/.ssh/id_rsa' });
});

test('a path with spaces, as a glob or a search can both carry, is read whole', () => {
  const message = refusalReason('Codex Destop/customers.csv', '**/customers.csv', 0, { kind: 'search' });

  assert.deepEqual(refusedReach(message), { path: 'Codex Destop/customers.csv', pattern: '**/customers.csv' });
});

// Found live, on a real session: Claude Code frames a blocking PreToolUse hook's stderr with its own notice first
// ("PreToolUse:Bash hook error: [<command>] "), so a check anchored at the start of the content missed every real
// refusal while every test here, built from the bare message alone, kept passing.
test('the message is still read inside Claude Code\'s own PreToolUse frame around it', () => {
  const message = refusalReason('customers.csv', '**/customers.csv', 0, { kind: 'search' });
  const framed = `PreToolUse:Bash hook error: [agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"] ${message}`;

  assert.deepEqual(refusedReach(framed), { path: 'customers.csv', pattern: '**/customers.csv' });
});

// Never a guess: another hook's refusal, Claude Code's own denial text, or an ordinary error answers undefined.
test('text that is not this message at all is never mistaken for it', () => {
  assert.equal(refusedReach('File is in a directory that is denied by your permission settings.'), undefined);
  assert.equal(refusedReach('agentwhy refused this command, but not in these words.'), undefined);
  assert.equal(refusedReach(''), undefined);
});
