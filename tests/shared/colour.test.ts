// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseReportArguments } from '../../src/cli/commands/report-arguments.ts';
import { ESCAPES, colourWanted, paint } from '../../src/shared/colour.ts';

// findings-worth-reading R14, R15: colour needs a terminal, and anything that says no wins.
test('colour needs a terminal, and NO_COLOR set to anything but the empty string turns it off', () => {
  assert.equal(colourWanted(true, undefined), true);
  assert.equal(colourWanted(true, ''), true, 'an empty NO_COLOR counts as unset (no-color.org)');
  assert.equal(colourWanted(true, '1'), false);
  assert.equal(colourWanted(false, undefined), false, 'a redirected report is never coloured');
});

test('--no-color is a flag of its own, and the flags allow colour without it', () => {
  const colourOf = (args: readonly string[]): boolean | undefined => {
    const parsed = parseReportArguments(args);
    return parsed.kind === 'options' ? parsed.options.colour : undefined;
  };

  assert.equal(colourOf([]), true);
  assert.equal(colourOf(['--no-color']), false);
});

test('a painted word loses nothing when its escapes are removed', () => {
  assert.notEqual(paint('refused', 'green'), 'refused');
  assert.equal(paint('refused', 'green').replace(ESCAPES, ''), 'refused');
});
