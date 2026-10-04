// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { isJsonObject, type JsonObject } from '../../src/shared/json.ts';
import { CANARY_MARKER } from '../helpers/canary.ts';
import { runCli } from '../helpers/cli.ts';

// The committed cases from tests/fixtures/synthetic/: what the redacted corpus does not contain, so these paths
// would otherwise stay untested. See that directory's README.md.

const CASES = {
  truncated: 'truncated-transcript/synthetic-truncated',
  unknownDenial: 'unknown-denial-kind/synthetic-unknown-denial',
  stoppedByAutoMode: 'stopped-by-auto-mode/synthetic-stopped-by-auto-mode',
  nested: 'nested-delegation/synthetic-nested',
  missingTranscript: 'missing-subagent-transcript/synthetic-missing-transcript',
  missingSpill: 'missing-spilled-result/synthetic-missing-spill',
} as const;

function pathOf(fixture: string): string {
  return fileURLToPath(new URL(`../fixtures/synthetic/${fixture}`, import.meta.url));
}

async function reportOf(fixture: string): Promise<JsonObject> {
  const { code, stdout } = await runCli(['doctor', '--input', pathOf(fixture), '--json']);
  const report: unknown = JSON.parse(stdout);

  assert.equal(code, 0);
  assert.ok(isJsonObject(report));
  return report;
}

test('a truncated record is counted as unparsable, and doctor still reports', async () => {
  const report = await reportOf(CASES.truncated);
  const { stdout } = await runCli(['doctor', '--input', pathOf(CASES.truncated)]);

  assert.ok(isJsonObject(report.main));
  assert.equal(report.main.lines, 3);
  assert.equal(report.main.unparsableLines, 1);
  assert.match(stdout, /unparsable lines in main session: 1/);
});

test('an unknown toolDenialKind is reported as unknown, never as permission-rule', async () => {
  const report = await reportOf(CASES.unknownDenial);
  const { stdout } = await runCli(['doctor', '--input', pathOf(CASES.unknownDenial)]);

  assert.ok(isJsonObject(report.denials));
  assert.deepEqual(report.denials.byKind, { 'sandbox-rule': 1 });
  assert.deepEqual(report.denials.unknownKinds, ['sandbox-rule']);
  assert.match(stdout, /UNKNOWN toolDenialKind: sandbox-rule \(1\)/);
});

// who-stopped-it WS1, WS7, WS8: contract v14 knows `automode-blocked`; `user-rejected` has been seen and stays unknown.
test('a call auto mode refused is a known denial, and one the person turned down is still flagged', async () => {
  const report = await reportOf(CASES.stoppedByAutoMode);
  const { stdout } = await runCli(['doctor', '--input', pathOf(CASES.stoppedByAutoMode)]);

  assert.ok(isJsonObject(report.denials));
  assert.deepEqual(report.denials.byKind, { 'automode-blocked': 1, 'user-rejected': 1 });
  assert.deepEqual(report.denials.unknownKinds, ['user-rejected']);
  assert.match(stdout, /UNKNOWN toolDenialKind: user-rejected \(1\)/);
  assert.doesNotMatch(stdout, /UNKNOWN toolDenialKind: automode-blocked/);
  // WS8: the classifier's own words sit beside the marker and are read by nothing.
  assert.ok(!stdout.includes(CANARY_MARKER), 'nothing of the fixture\'s free text reaches the output');
});

test('a nested delegation is counted at its own depth', async () => {
  const report = await reportOf(CASES.nested);

  assert.ok(isJsonObject(report.meta) && isJsonObject(report.main) && isJsonObject(report.subagents));
  assert.deepEqual(report.meta.spawnDepth, { '2': 1 });
  assert.equal(report.main.agentToolUses, 1);
  assert.equal(report.subagents.agentToolUses, 1, 'the subagent delegates again');
  assert.deepEqual(report.agentToolInputKeys, { description: 2, prompt: 2, subagent_type: 2 });
});

test('a meta file with no transcript beside it is an incomplete pair, not a missing delegation', async () => {
  const report = await reportOf(CASES.missingTranscript);
  const { stdout } = await runCli(['doctor', '--input', pathOf(CASES.missingTranscript)]);

  assert.ok(isJsonObject(report.sources));
  assert.deepEqual(report.sources.subagentFiles, { total: 1, withTranscript: 0, withMeta: 1, incompletePairs: 1 });
  assert.match(stdout, /subagents with an incomplete file pair: 1/);
});

test('a reference to a spilled result that is not there is counted as missing', async () => {
  const report = await reportOf(CASES.missingSpill);
  const { stdout } = await runCli(['doctor', '--input', pathOf(CASES.missingSpill)]);

  assert.ok(isJsonObject(report.sources));
  assert.deepEqual(report.toolResultReferences, { referenced: 1, missing: 1 });
  assert.equal(report.sources.toolResultFiles, 1, 'the unreferenced file is still counted as present');
  assert.match(stdout, /referenced spilled results missing: 1/);
});

test('no committed fixture reaches the output, in either format', async () => {
  for (const fixture of Object.values(CASES)) {
    for (const args of [['doctor', '--input', pathOf(fixture)], ['doctor', '--input', pathOf(fixture), '--json']]) {
      const { stdout, stderr } = await runCli(args);

      assert.ok(!stdout.includes(CANARY_MARKER), `${fixture}: stdout carries fixture content`);
      assert.ok(!stderr.includes(CANARY_MARKER), `${fixture}: stderr carries fixture content`);
    }
  }
});
