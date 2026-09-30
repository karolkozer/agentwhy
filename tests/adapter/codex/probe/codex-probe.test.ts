import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { CodexSessionDiscovery } from '../../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { CodexSessionSource } from '../../../../src/adapter/codex/events/codex-session-source.ts';
import type { CodexDoctorReport } from '../../../../src/adapter/codex/probe/codex-doctor-report.ts';
import { CodexProbe } from '../../../../src/adapter/codex/probe/codex-probe.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { JsonDoctorRenderer } from '../../../../src/doctor/render/json-doctor-renderer.ts';
import { CodexTextDoctorRenderer } from '../../../../src/doctor/render/codex-text-doctor-renderer.ts';
import { runCli } from '../../../helpers/cli.ts';
import {
  activity, CHILD, cell, cellOutput, command, functionCall, item, meta, REVIEWER, reviewerMeta, ROOT, rolloutPath, said, spawnedMeta, TURN, turnContext,
} from '../../../helpers/codex-session.ts';
import { CANARY, jsonl, SESSION_ID, syntheticSessionFiles, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const probe = new CodexProbe({ discovery: new CodexSessionDiscovery({ directories: files, files }), directories: files, files });

/** A tree, a reviewer, a file sharing the root's id, a stranger and every kind of unknown, each carrying the canary. */
function corpus(): Record<string, string> {
  return {
    [rolloutPath(ROOT)]: jsonl(
      meta(ROOT), turnContext(TURN), cell('call_a', CANARY), item(ROOT, command('exec_a', `cat ${CANARY}`, CANARY)),
      item(ROOT, { ...command('exec_b', CANARY, CANARY), command: [CANARY, '-x', CANARY] }),
      item(ROOT, { ...command('exec_c', 'ls', CANARY), status: CANARY }),
      item(ROOT, { type: `${CANARY}Item`, id: 'exec_d' }),
      functionCall('call_s', 'spawn_agent', { task_name: CANARY, message: CANARY }), item(ROOT, activity('call_s', 'started', CHILD, '/root/a')),
      cellOutput('call_a', CANARY), said('msg_1', 'final_answer', CANARY),
      { type: CANARY, ordinal: 5, payload: { type: CANARY } }, { type: 'event_msg', ordinal: 4, payload: { type: CANARY } },
      { type: 'response_item', payload: { type: CANARY } }, meta(CHILD), '{broken',
    ),
    [rolloutPath(CHILD, '30')]: jsonl(spawnedMeta(CHILD, ROOT, '/root/a', { cwd: `/Users/someone/${CANARY}` }), turnContext(TURN)),
    [rolloutPath(REVIEWER)]: jsonl(reviewerMeta(REVIEWER, ROOT)),
    [`copies/rollout-2026-09-29T12-00-00-${ROOT}.jsonl`]: jsonl(meta('01a0ec9c-0000-7000-8000-00000000ffff', { cli_version: CANARY, history_mode: CANARY })),
    [`strays/rollout-${CANARY}.jsonl`]: jsonl({ type: 'user', sessionId: CANARY }),
  };
}

test('the Codex report counts every kind and join with fixed labels, and names no value, key or path it read', async (t) => {
  const root = await writeSession(t, corpus());
  const report = await probe.probe(root);

  assert.deepEqual(report.files, { found: 5, recognised: 4, unknownFormat: 1, unreadable: 0 });
  assert.deepEqual(report.origins, { person: 2, reviewer: 1, spawned: 1 });
  assert.deepEqual(report.historyModes, { '<unknown>': 1, paginated: 3 });
  assert.deepEqual(report.versions, { '0.157.0': 3, '<unknown>': 1 });
  assert.equal(report.identity.fileNameDisagrees, 1, 'the copy is named after the root and holds another id');
  assert.equal(report.identity.laterMetadata, 1);
  assert.deepEqual(report.tree, { roots: 2, descendants: 2, unresolved: {} });
  assert.equal(report.workingDirectories.filesWithSeveral, 1);
  assert.equal(report.order.ordinalBackwards, 1);
  assert.equal(report.lineTypes['<unknown>'], 1);
  assert.equal(report.responseItems['<unknown>'], 1);
  assert.equal(report.events['<unknown>'], 1);
  assert.equal(report.items['<unknown>'], 1);
  assert.deepEqual(report.commandShapes, { other: 1, recognised: 2 });
  assert.equal(report.itemStatuses['CommandExecution <unknown>'], 1);
  assert.equal(report.lines.unparsable, 1);
  assert.ok((report.capabilities['actions unmeasured'] ?? 0) >= 1, 'an unknown record leaves the action stream unmeasured');

  for (const output of [new CodexTextDoctorRenderer().render(report), new JsonDoctorRenderer<CodexDoctorReport>().render(report)]) {
    assert.ok(!output.includes(CANARY), 'no value, key or path a record held is printed');
    assert.ok(!output.includes(root));
    for (const id of [ROOT, CHILD, REVIEWER]) assert.ok(!output.includes(id), 'no id is printed');
  }
});

test('the Codex report is a closed schema: its keys are exactly these', async (t) => {
  const report = await probe.probe(await writeSession(t, corpus()));
  assert.deepEqual(Object.keys(report), [
    'schemaVersion', 'provider', 'contractVersion', 'verifiedAgainst', 'files', 'lines', 'versions', 'historyModes', 'origins',
    'identity', 'tree', 'workingDirectories', 'order', 'lineTypes', 'responseItems', 'events', 'items', 'itemStatuses',
    'commandShapes', 'capabilities',
  ]);
  // Every count's label is a fixed word, a contract spelling or <unknown>: never free text.
  const labels = Object.values(report).filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value))
    .flatMap((group) => Object.entries(group as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null ? [key, ...Object.keys(value)] : [key]));
  for (const label of labels) assert.match(label, /^(?:<unknown>|[A-Za-z0-9_.:-]+)(?: [A-Za-z0-9_<>.()-]+)?$/, label);
});

// End to end: `doctor` tells the format by content, and says so for an input that is neither.
test('doctor diagnoses a rollout and a folder as Codex, a transcript as Claude Code, and refuses anything else', async (t) => {
  const root = await writeSession(t, { ...corpus(), ...syntheticSessionFiles(), 'neither.jsonl': jsonl({ type: CANARY }) });

  const rollout = await runCli(['doctor', '--input', join(root, rolloutPath(ROOT))]);
  assert.equal(rollout.code, 0);
  assert.match(rollout.stdout, /^agentwhy doctor · Codex/);
  assert.ok(!rollout.stdout.includes(CANARY) && !rollout.stderr.includes(CANARY));

  const folder = await runCli(['doctor', '--input', join(root, '2026'), '--json']);
  assert.equal(folder.code, 0);
  assert.equal(JSON.parse(folder.stdout).provider, 'codex');

  const claude = await runCli(['doctor', '--input', join(root, SESSION_ID)]);
  assert.match(claude.stdout, /format contract v13, verified against Claude Code/);

  const neither = await runCli(['doctor', '--input', join(root, 'neither.jsonl')]);
  assert.equal(neither.code, 1);
  assert.match(neither.stdout, /neither a Claude Code session nor a Codex session/);
  assert.ok(!neither.stdout.includes(CANARY));
  const neitherJson = await runCli(['doctor', '--input', join(root, 'neither.jsonl'), '--json']);
  assert.equal(neitherJson.code, 1);
  assert.deepEqual(JSON.parse(neitherJson.stdout), { schemaVersion: 1, provider: 'unknown' });
});

// Two paths over one file must agree (conventions, "a differential invariant"): what `doctor` says a file can answer is
// what a report read from it says, so a record the reader cannot map is unrecognised to both.
test('the probe and the reader say the same of what a file can answer', async (t) => {
  const cases = {
    legacy: [meta(ROOT, { history_mode: 'legacy' }), turnContext(TURN), { type: 'event_msg', payload: { type: 'patch_apply_end', stdout: CANARY } }],
    'no item': [meta(ROOT), turnContext(TURN), { type: 'event_msg', payload: { type: 'item_completed', item: CANARY } }],
    interrupted: [meta(ROOT), turnContext(TURN), { type: 'event_msg', payload: { type: 'turn_aborted', turn_id: TURN, reason: 'interrupted' } }],
  };
  for (const [name, lines] of Object.entries(cases)) {
    const root = await writeSession(t, { [rolloutPath(ROOT)]: jsonl(...lines) });
    const path = join(root, rolloutPath(ROOT));
    const model = await new CodexSessionSource({ discovery: new CodexSessionDiscovery({ directories: files, files }), files, sessionsRoot: root }).read(path);
    const read = [...new Set(model.gaps.flatMap((gap) => (gap.question === undefined ? [] : [`${gap.question} ${gap.kind.replace('capability-', '')}`])))].sort();
    // A question the file answers is no gap in the model, so only what it cannot answer is compared.
    const probed = Object.keys((await probe.probe(path)).capabilities).filter((key) => !key.endsWith(' supported')).sort();
    assert.deepEqual(probed, read, name);
  }
});
