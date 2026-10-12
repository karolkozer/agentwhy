// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { pendingCommandPlace } from '../../../../src/adapter/codex/hooks/pending-command.ts';

const cellLine = (code: string) => JSON.stringify({ timestamp: 't', type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'c', input: code } });
const usage = JSON.stringify({ timestamp: 't', type: 'token_usage_record', payload: {} });

// `2026-10-11-the-rules-where-the-file-is.md` RW15, RWB7: the cell running the command is the rollout's newest, and it
// names the folder the command runs in, which the hook is not told.
test('RW15: the newest cell says where the command runs, for the command handed over and no other', () => {
  const tail = ['{"cut":', cellLine('await tools.exec_command({cmd:"ls"});'), cellLine([
    'const r = await Promise.allSettled([',
    '  tools.exec_command({cmd:"rg --files .",workdir:"/Users/someone/Projects/lessons"}),',
    '  tools.exec_command({cmd:"cat note.md",workdir:"/Users/someone/Projects/lessons"}),',
    ']);',
  ].join('\n')), usage].join('\n');

  assert.deepEqual(pendingCommandPlace(tail, 'cat note.md'), { workdirs: ['/Users/someone/Projects/lessons'], inSessionFolder: false, unread: false });
  assert.equal(pendingCommandPlace(tail, 'ls'), undefined, 'a command of an older cell is not this one');
  assert.equal(pendingCommandPlace(tail, 'cat other.md'), undefined);
  assert.equal(pendingCommandPlace(usage, 'cat note.md'), undefined, 'no cell, nothing said');
});

test('RW15: a call with no workdir runs in the session’s folder, and one whose workdir is built is not known', () => {
  const tail = cellLine('await tools.exec_command({cmd:"cat note.md"}); const d = "docs"; await tools.exec_command({cmd:"cat note.md", workdir: d});');
  assert.deepEqual(pendingCommandPlace(tail, 'cat note.md'), { workdirs: [], inSessionFolder: true, unread: true });
  assert.deepEqual(pendingCommandPlace(cellLine('await tools.exec_command({workdir:"docs", cmd:"cat a"});'), 'cat a'), { workdirs: ['docs'], inSessionFolder: false, unread: false }, 'in either order, relative as written');
});
