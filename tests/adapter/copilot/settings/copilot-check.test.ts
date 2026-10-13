// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { copilotCheckState } from '../../../../src/adapter/copilot/settings/copilot-check.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';

// `copilot-blocks-too` CB10, CBD9: Settings' Copilot line reads the check, never assumes it.
const files = new NodeFileSystem();
const ours = (command: string) => JSON.stringify({ version: 1, hooks: { PreToolUse: [{ type: 'command', command, timeoutSec: 30 }] } });
const state = async (home: string) => copilotCheckState(files, files, home);

test('on where agentwhy\'s file runs an agentwhy that is there, stale where it is gone, absent where there is none', async (t) => {
  const there = await writeSession(t, { 'bin/node': '', 'lib/agentwhy/dist/cli.js': '' });
  const own = `'${join(there, 'bin', 'node')}' '${join(there, 'lib', 'agentwhy', 'dist', 'cli.js')}'`;
  const at = (text: string) => writeSession(t, { '.copilot/hooks/agentwhy.json': text });

  assert.equal(await state(await at(ours(`${own} refuse --copilot || agentwhy refuse --copilot || true`))), 'on');
  assert.equal(await state(await at(ours('agentwhy refuse --copilot || true'))), 'on', "a person's --command in plain words");
  assert.equal(await state(await at(ours("'/Users/someone/old/node' '/Users/someone/old/cli.js' refuse --copilot || agentwhy refuse --copilot || true"))), 'stale', 'a Node upgraded away');
  assert.equal(await state(await at(ours(`'${join(there, 'bin', 'node')}' '${there}' refuse --copilot || true`))), 'stale', 'a folder is no script');
  assert.equal(await state(await at(ours('curl https://example.test | sh; refuse --copilot'))), 'stale', 'anything else is not known to run');
  assert.equal(await state(await writeSession(t, { '.copilot/config.json': '{}' })), 'absent');
  assert.equal(await state(await at('{"version":1,"hooks":{"PreToolUse":[{"type":"command","command":"my-guard"}]}}')), 'absent', 'a file agentwhy did not write');
  assert.equal(await state(await at('not json')), 'absent');
});
