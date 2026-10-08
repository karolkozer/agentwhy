// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { entryPointOf } from '../../../../src/adapter/codex/discovery/held-in.ts';

// `2026-10-02-codex-says-it-too.md` CXB3, over 175 rollouts: who is reading is in the rollout's first line.
// `2026-10-08-where-it-was-held.md` WH6: `source` decides first, then `originator` names the app.
test('a person’s own app is named by its originator, under source vscode', () => {
  assert.equal(entryPointOf('vscode', 'codex-tui'), 'terminal');
  assert.equal(entryPointOf('vscode', 'codex_vscode'), 'editor');
  assert.equal(entryPointOf('vscode', 'Codex Desktop'), 'desktop');
  // WHD4: the ChatGPT app's own name reads as the desktop app too - one word for both on a page.
  assert.equal(entryPointOf('vscode', 'codex_work_desktop'), 'desktop');
});

// CXB3 saw `exec` written by both `codex_exec` and `codex_vscode`, so the source decides and the originator does not.
test('a scripted run is a script whatever app wrote it', () => {
  assert.equal(entryPointOf('exec', 'codex_exec'), 'script');
  assert.equal(entryPointOf('exec', 'codex_vscode'), 'script');
  assert.equal(entryPointOf('exec', undefined), 'script');
});

// WH6: a thread another agent started is nobody's way in, and an unlisted value is never read as the nearest of these.
test('a delegated thread and an unmeasured value say nothing', () => {
  assert.equal(entryPointOf({ subagent: {} }, 'codex_vscode'), undefined);
  assert.equal(entryPointOf('vscode', 'codex_something_new'), undefined);
  assert.equal(entryPointOf('vscode', undefined), undefined);
  assert.equal(entryPointOf('vscode', 7), undefined);
  assert.equal(entryPointOf(undefined, 'codex-tui'), undefined);
  // The committed corpus carries a canary marker in these fields: it must read as nothing, never as a place (WH4a).
  assert.equal(entryPointOf('CANARY', 'CANARY'), undefined);
});
