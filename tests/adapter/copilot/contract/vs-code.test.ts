// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CALL_ID, CHAT_LOG, CONFIRMATION, VS_CODE_LOG_TOOLS } from '../../../../src/adapter/copilot/contract/vs-code.ts';
import { VS_CODE_TOOLS } from '../../../../src/adapter/copilot/contract/hooks.ts';
import { TOOLS } from '../../../../src/adapter/copilot/contract/actions.ts';

// That every label of the VS Code chat log's contract is one the probe measured is held beside the probe, among the research
// scripts' own tests, which stay out of the public repository.

// VCB-M6: the log names a tool, and its arguments, as a `PreToolUse` hook is handed them - so the report reads a call by
// the profile `refuse --copilot` judged it with.
test("the chat log's tools are the hook's and the runtime's, under the same names and argument keys", () => {
  assert.deepEqual(VS_CODE_LOG_TOOLS.terminal, VS_CODE_TOOLS.terminal);
  assert.deepEqual(VS_CODE_LOG_TOOLS.patch, VS_CODE_TOOLS.patch);
  assert.deepEqual(VS_CODE_LOG_TOOLS.readFile, TOOLS.readFile);
  assert.deepEqual(VS_CODE_LOG_TOOLS.fileSearch, TOOLS.fileSearch);
  const names = Object.values(VS_CODE_LOG_TOOLS).map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
});

// VCB-M7, VCB-M12, VCB-M17: a call's id is the key of its result; a part refused before its call ran carries a UUID.
test("a call's id is a model's call id with VS Code's suffix, never a part's own UUID", () => {
  assert.match('call_AAAAAAAAAAAAAAAAAAAAAAAA__vscode-1791885173915', CALL_ID);
  assert.match('toolu_AAAAAAAAAAAAAAAAAAAAAAAA__vscode-1791885173915', CALL_ID);
  for (const other of ['call_AAAAAAAAAAAAAAAAAAAAAAAA', '33333333-3333-4333-8333-333333333333', 'fc_A__vscode-1', 'call___vscode-1']) {
    assert.doesNotMatch(other, CALL_ID);
  }
});

test("a log's line kinds and a call's confirmations are each told apart", () => {
  assert.equal(new Set([CHAT_LOG.snapshot, CHAT_LOG.set, CHAT_LOG.append]).size, 3);
  assert.equal(new Set(Object.values(CONFIRMATION)).size, Object.keys(CONFIRMATION).length);
});
