// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runCli } from '../helpers/cli.ts';
import { loadOracle } from '../helpers/oracle.ts';

// The drift detector of lesson L005: the committed report of the committed corpus. If a Claude Code update, a
// contract change or a new measurement moves the output, this test says so before anything downstream is built on
// the new shape. To accept a change on purpose: npm run snapshot:doctor, then read the diff before committing it.
const SNAPSHOT = fileURLToPath(new URL('../fixtures/doctor-report.snapshot.json', import.meta.url));

test('doctor --json on the corpus still matches the committed snapshot', async () => {
  const fixture = fileURLToPath(new URL(`../fixtures/redacted/${loadOracle().source.sessionId}`, import.meta.url));

  const { code, stdout } = await runCli(['doctor', '--input', fixture, '--json']);

  assert.equal(code, 0);
  assert.equal(stdout, await readFile(SNAPSHOT, 'utf8'), 'the report moved; regenerate with npm run snapshot:doctor');
});
