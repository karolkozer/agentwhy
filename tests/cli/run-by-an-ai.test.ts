// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runByAnAi } from '../../src/cli/run-by-an-ai.ts';

// it-runs-by-itself RB7, RBB1-RBB3: the variable each AI put in the environment of the commands it ran.
test('a command with an AI\'s own variable and no terminal was run by that AI', () => {
  for (const name of ['CLAUDECODE', 'CODEX_THREAD_ID', 'CODEX_TOOL_CALL_ID', 'COPILOT_AGENT_SESSION_ID']) {
    assert.equal(runByAnAi({ [name]: '1' }, false), true, name);
  }
});

// RBD6: a person at a terminal is never taken for an AI, whatever the terminal inherited - nothing they do today stops.
test('a person at a terminal is never taken for an AI, whatever the terminal inherited', () => {
  assert.equal(runByAnAi({ CLAUDECODE: '1', CODEX_THREAD_ID: 'thread', COPILOT_AGENT_SESSION_ID: 'session' }, true), false);
});

// RBD6: a script or CI with no AI's variable marks as it always has.
test('no AI\'s variable is no AI: a script, CI, an empty value, a name not measured', () => {
  assert.equal(runByAnAi({ PATH: '/usr/bin', CI: 'true' }, false), false);
  assert.equal(runByAnAi({ CLAUDECODE: '' }, false), false);
  // RBB1: the Claude desktop app set AI_AGENT and a terminal session did not, so it is not read.
  assert.equal(runByAnAi({ AI_AGENT: 'claude-code' }, false), false);
  assert.equal(runByAnAi(undefined, false), false);
});
