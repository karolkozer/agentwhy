import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DOCTOR_USAGE } from '../../../src/cli/commands/doctor-usage.ts';
import { EXIT_CODE } from '../../../src/cli/exit-codes.ts';

test('the doctor usage documents every exit code', () => {
  for (const code of Object.values(EXIT_CODE)) {
    assert.match(DOCTOR_USAGE, new RegExp(`^ {2}${code} {2}\\S`, 'm'), `exit code ${code}`);
  }
});
