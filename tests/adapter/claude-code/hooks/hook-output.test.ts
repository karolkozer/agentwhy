// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { terminalNotice } from '../../../../src/adapter/claude-code/hooks/hook-output.ts';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

test('no words print nothing', () => {
  assert.equal(terminalNotice('agentwhy', ''), '');
});

// R15 and the reference's allowlist: OSC 9 and OSC 777, each closed by BEL, and nothing else.
test('the words become an OSC 9 and an OSC 777 notification, closed by BEL', () => {
  const { terminalSequence } = JSON.parse(terminalNotice('agentwhy', 'An agent wrote a value.')) as { terminalSequence: string };

  assert.equal(terminalSequence, `${ESC}]9;agentwhy: An agent wrote a value.${BEL}${ESC}]777;notify;agentwhy;An agent wrote a value.${BEL}`);
});

// A control character in the words would take the sequence outside the allowlist, and Claude Code ignores the field.
test('control characters in the words cannot end or extend the sequence', () => {
  const { terminalSequence } = JSON.parse(terminalNotice('agent;why', `An ${ESC}]52;evil${BEL} agent\nfinished.`)) as { terminalSequence: string };

  const controls = [...terminalSequence].filter((character) => character === ESC || character === BEL).length;
  assert.equal(controls, 4, 'two openings and two closings, all our own');
  assert.ok(terminalSequence.includes(`${ESC}]777;notify;agent why;`), 'a `;` in the title would end it early');
});
