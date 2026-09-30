import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { runNode } from '../helpers/cli.ts';

const SCRIPT = fileURLToPath(new URL('../../scripts/check-canary.mjs', import.meta.url));

// The guardrail's own failure paths were exercised by planting a fixture without a marker and a synthetic
// AKIA-shaped key; both were reported and the exit code was 1. This pins the green state, so a corpus change that
// breaks a check fails the suite rather than waiting for someone to run the script.
test('the canary guardrail passes on the committed corpus', async () => {
  const { code, stdout } = await runNode(SCRIPT, []);

  assert.equal(code, 0, stdout);
  assert.ok(!stdout.includes('FAIL'), stdout);
  assert.equal(stdout.split('\n').filter((line) => line.startsWith('ok: ')).length, 6, 'all six checks report');
});
