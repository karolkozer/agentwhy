// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeProbe } from '../../src/adapter/claude-code/probe/claude-code-probe.ts';
import type { DoctorReport } from '../../src/adapter/claude-code/probe/doctor-report.ts';
import { NodeFileSystem } from '../../src/infrastructure/node-file-system.ts';
import { isJsonObject } from '../../src/shared/json.ts';
import { runCli } from '../helpers/cli.ts';
import { assertDoctorShape } from '../helpers/doctor-schema.ts';
import { assertProbeMatchesOracle, loadOracle } from '../helpers/oracle.ts';
import { CANARY, SESSION_ID, syntheticSessionFiles, writeSession } from '../helpers/synthetic-session.ts';

// End to end: the CLI runs in a child process against sessions on disk, the way a user runs it.

function attentionOf(report: string): string {
  return report.slice(report.indexOf('Needs attention'), report.indexOf('\nSources'));
}

test('usage errors exit 2, and --help exits 0', async () => {
  assert.equal((await runCli([])).code, 2);
  assert.equal((await runCli(['explain'])).code, 2);
  assert.equal((await runCli(['doctor', '--input', 'x', '--verbose'])).code, 2);

  const missingInput = await runCli(['doctor']);
  assert.equal(missingInput.code, 2);
  assert.match(missingInput.stderr, /--input/);

  const help = await runCli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: agentwhy doctor/);
});

test('flags unknown variants and gaps at the top of the text report', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());

  const { code, stdout } = await runCli(['doctor', '--input', join(root, SESSION_ID)]);
  const attention = attentionOf(stdout);

  assert.equal(code, 0);
  assert.match(attention, /UNKNOWN line type in subagents: brand-new-type \(1\)/);
  assert.match(attention, /UNKNOWN toolDenialKind: sandbox-rule \(1\)/);
  assert.match(attention, /unparsable lines in main session: 1/);
  assert.match(attention, /subagents with an incomplete file pair: 1/);
  assert.match(attention, /referenced spilled results missing: 1/);
  assert.ok(attention.indexOf('UNKNOWN') < attention.indexOf('unparsable'), 'unknown variants are listed first');
});

test('never prints transcript content, in text or in JSON', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());
  const input = join(root, SESSION_ID);

  for (const result of [await runCli(['doctor', '--input', input]), await runCli(['doctor', '--input', input, '--json'])]) {
    assert.equal(result.code, 0);
    assert.ok(!result.stdout.includes(CANARY), 'stdout must not carry transcript content');
    assert.ok(!result.stderr.includes(CANARY), 'stderr must not carry transcript content');
  }
});

test('--json output conforms to the closed schema', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());

  const { code, stdout } = await runCli(['doctor', '--input', join(root, SESSION_ID), '--json']);

  assert.equal(code, 0);
  assertDoctorShape(JSON.parse(stdout));
});

test('output is identical across runs, in both formats', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());
  const input = join(root, SESSION_ID);

  for (const args of [['doctor', '--input', input, '--json'], ['doctor', '--input', input]]) {
    assert.equal((await runCli(args)).stdout, (await runCli(args)).stdout);
  }
});

test('a session whose main transcript is missing exits 1 and still says why', async (t) => {
  const root = await writeSession(t, {});

  const { code, stdout } = await runCli(['doctor', '--input', join(root, 'missing'), '--json']);
  const report: unknown = JSON.parse(stdout);

  assert.equal(code, 1);
  assertDoctorShape(report);
  assert.ok(isJsonObject(report) && isJsonObject(report.sources) && report.sources.mainTranscript === 'not-found');
});

async function probeOf(input: string): Promise<DoctorReport> {
  const files = new NodeFileSystem();
  return new ClaudeCodeProbe(files).probe(await new ClaudeCodeSessionDiscovery(files).discover(input));
}

// The committed corpus: a redacted copy of the session the oracle was measured on, so it must satisfy
// the same oracle. This is the assertion that survives without access to the unredacted session.
test('matches oracle.json on the redacted fixture', async () => {
  const oracle = loadOracle();
  const fixture = fileURLToPath(new URL(`../fixtures/redacted/${oracle.source.sessionId}`, import.meta.url));

  assertProbeMatchesOracle(await probeOf(fixture), oracle);
});

// Runs only when pointed at that session unredacted (spec §4.0), because it holds live secrets and
// is never committed. See ".ai/plans/2026-09-13-M0-doctor.md — Working with the real session".
const REFERENCE_SESSION = process.env.AGENTWHY_REFERENCE_SESSION;

test(
  'matches oracle.json on the session the corpus was made from',
  { skip: REFERENCE_SESSION === undefined && 'set AGENTWHY_REFERENCE_SESSION to that session\'s path' },
  async () => {
    assert.ok(REFERENCE_SESSION);

    assertProbeMatchesOracle(await probeOf(REFERENCE_SESSION), loadOracle());
  },
);
