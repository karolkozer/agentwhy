// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Script } from 'node:vm';
import { SWITCH_SCRIPT, SWITCH_STYLE } from '../../../../src/report/start/projects/project-switch.ts';

// `which-project.md` V14, amended 2026-10-07 - the maintainer: the switch said "Switching to…" in a line nobody saw. A
// loader: the button's spinner, and a veil over the window - or the page - saying where it goes, until that page opens.
test('a switch shows a loader until the page it goes to opens, and a refusal takes it away', () => {
  assert.doesNotThrow(() => new Script(SWITCH_SCRIPT), 'it parses');
  assert.match(SWITCH_SCRIPT, /switching\(button, button\.getAttribute\('data-switch-name'\)\);/);
  assert.match(SWITCH_SCRIPT, /button\.classList\.add\('pill-busy'\)/, 'the button spins');
  assert.match(SWITCH_SCRIPT, /const host = root\.closest\('dialog'\) \|\| document\.body;/, 'inside the window, which is above the page');
  assert.match(SWITCH_SCRIPT, /const refused = \(where, answer\) => \{\n      settled\(\);/, 'a refusal takes the loader away');
  // Found in Chrome: a helper named as the folder window's own `busy`, declared later in the same handler, threw.
  assert.equal((SWITCH_SCRIPT.match(/const busy = /g) ?? []).length, 1, 'one busy, the folder window’s');
  assert.match(SWITCH_STYLE, /\.pjw-veil\{position:absolute;inset:0/);
  assert.match(SWITCH_STYLE, /\.pjw-veil-page\{position:fixed/);
});
