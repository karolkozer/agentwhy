// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseDoctorArguments } from '../../../src/cli/commands/doctor-arguments.ts';

const MISSING_INPUT = 'doctor needs --input <session-dir | session.jsonl>';

test('asks for help with --help or -h', () => {
  assert.deepEqual(parseDoctorArguments(['--help']), { kind: 'help' });
  assert.deepEqual(parseDoctorArguments(['-h']), { kind: 'help' });
});

test('takes an input, and renders text unless --json is given', () => {
  assert.deepEqual(parseDoctorArguments(['--input', 's']), { kind: 'options', options: { input: 's', format: 'text' } });
  assert.deepEqual(parseDoctorArguments(['--input', 's', '--json']), {
    kind: 'options',
    options: { input: 's', format: 'json' },
  });
});

test('bad input is a usage error that says what is wrong', () => {
  assert.deepEqual(parseDoctorArguments([]), { kind: 'usage-error', message: MISSING_INPUT });
  assert.deepEqual(parseDoctorArguments(['--input', '']), { kind: 'usage-error', message: MISSING_INPUT });

  const unknownFlag = parseDoctorArguments(['--input', 's', '--verbose']);
  assert.ok(unknownFlag.kind === 'usage-error' && unknownFlag.message.includes('--verbose'));
  assert.equal(parseDoctorArguments(['session-path']).kind, 'usage-error');
});
