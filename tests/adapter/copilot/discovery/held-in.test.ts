// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { entryPointOf } from '../../../../src/adapter/copilot/discovery/held-in.ts';

test('the CLI is the terminal and the desktop app the desktop app; any other client says nothing', () => {
  assert.equal(entryPointOf('github/cli'), 'terminal');
  assert.equal(entryPointOf('github/autopilot'), 'desktop');
  for (const other of [undefined, '', 'github/vscode', 'GitHub/CLI']) assert.equal(entryPointOf(other), undefined, String(other));
});
