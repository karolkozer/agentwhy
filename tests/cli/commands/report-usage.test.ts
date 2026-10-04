// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseReportArguments } from '../../../src/cli/commands/report-arguments.ts';
import { DEFAULT_WIDTH, widthFor } from '../../../src/cli/commands/report-usage.ts';

// R8 of getting-to-a-report: what a script reads must not depend on the window someone happened to run it in.
test('the width follows the terminal inside bounds, and is fixed where there is no terminal', () => {
  assert.equal(widthFor(undefined), DEFAULT_WIDTH, 'piped, redirected, in CI');
  assert.equal(widthFor(96), 96, 'an ordinary window is used as it is');
  assert.equal(widthFor(220), 120, 'a very wide one is capped: a 220-column line is not read, it is scanned back');
  assert.equal(widthFor(40), 60, 'and a very narrow one is floored, below which the layout stops being one');
  assert.equal(widthFor(Number.NaN), DEFAULT_WIDTH, 'a terminal that reports nothing usable is no terminal');
});

test('--width wins over the terminal, and without it the terminal decides', () => {
  const given = parseReportArguments(['--width', '80'], 200);
  const fromTerminal = parseReportArguments([], 110);
  const piped = parseReportArguments([]);

  assert.equal(given.kind === 'options' ? given.options.width : undefined, 80);
  assert.equal(fromTerminal.kind === 'options' ? fromTerminal.options.width : undefined, 110);
  assert.equal(piped.kind === 'options' ? piped.options.width : undefined, DEFAULT_WIDTH);
});
