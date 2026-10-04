// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeProbe } from '../../../../src/adapter/claude-code/probe/claude-code-probe.ts';
import type { DoctorReport } from '../../../../src/adapter/claude-code/probe/doctor-report.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { INVALID_LABEL } from '../../../../src/shared/label.ts';
import { FaultyFileSystem } from '../../../helpers/faulty-file-system.ts';
import { ONWARD_SESSION_ID, onwardSessionFiles } from '../../../helpers/onward-session.ts';
import { SESSION_ID, jsonl, syntheticSessionFiles, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const discovery = new ClaudeCodeSessionDiscovery(files);

async function inspect(input: string, probeFiles: FileReader = files): Promise<DoctorReport> {
  return new ClaudeCodeProbe(probeFiles).probe(await discovery.discover(input));
}

test('counts every structural fact of a session, known and unknown variants alike', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());

  const probe = await inspect(join(root, SESSION_ID));

  assert.deepEqual(probe, {
    schemaVersion: 4,
    contractVersion: 15,
    verifiedAgainst: '2.1.268',
    sessionId: SESSION_ID,
    sources: {
      mainTranscript: 'present',
      subagentsDirectory: 'present',
      toolResultsDirectory: 'present',
      subagentFiles: { total: 2, withTranscript: 1, withMeta: 2, incompletePairs: 1 },
      toolResultFiles: 1,
      unrecognisedEntries: 0,
    },
    toolVersions: { '2.1.268': 2 },
    // No line of this session carries a cwd, so it has no project root - the case a report must not paper over
    // by guessing one (specs/2026-09-14-path-display-and-share.md R11).
    workingDirectories: { distinct: 0, invalid: 0 },
    main: {
      files: 1,
      unreadableFiles: 0,
      lines: 7,
      unparsableLines: 1,
      lineTypes: { assistant: 1, attachment: 1, 'bridge-session': 1, system: 1, user: 2 },
      unknownLineTypes: [],
      unknownLineTypeKeys: {},
      topLevelKeys: {
        [INVALID_LABEL]: 1,
        bridgeSessionId: 1,
        isSidechain: 4,
        lastSequenceNum: 1,
        message: 2,
        ownerAccountUuid: 1,
        ownerOrganizationUuid: 1,
        sessionId: 1,
        sourceToolAssistantUUID: 1,
        subtype: 1,
        toolDenialKind: 1,
        toolUseResult: 1,
        type: 6,
        uuid: 2,
        version: 2,
      },
      sidechain: { true: 0, false: 4, absent: 2, invalid: 0 },
      systemSubtypes: { stop_hook_summary: 1 },
      tools: { Agent: 1, Bash: 1 },
      agentToolUses: 1,
      deniedCalls: 1,
      uniqueToolUseIds: 2,
      uniqueUuids: 2,
    },
    subagents: {
      files: 1,
      unreadableFiles: 0,
      lines: 4,
      unparsableLines: 0,
      lineTypes: { assistant: 1, 'brand-new-type': 1, user: 2 },
      unknownLineTypes: ['brand-new-type'],
      unknownLineTypeKeys: { 'brand-new-type': { isSidechain: 1, type: 1 } },
      topLevelKeys: { isSidechain: 4, message: 2, toolDenialKind: 1, toolUseResult: 1, type: 4 },
      sidechain: { true: 4, false: 0, absent: 0, invalid: 0 },
      systemSubtypes: {},
      tools: { Read: 1 },
      agentToolUses: 0,
      deniedCalls: 1,
      uniqueToolUseIds: 1,
      uniqueUuids: 0,
    },
    meta: {
      files: 2,
      unreadableFiles: 0,
      unparsableFiles: 0,
      keys: { agentType: 2, description: 2, requestNonInteractive: 2, requestShape: 2, spawnDepth: 2, toolUseId: 2 },
      agentType: { Explore: 1, 'general-purpose': 1 },
      spawnDepth: { '1': 1, '2': 1 },
      requestShape: { background: 1, foreground: 1 },
    },
    agentToolInputKeys: { description: 1, prompt: 1, subagent_type: 1 },
    denials: { byKind: { 'permission-rule': 1, 'sandbox-rule': 1 }, unknownKinds: ['sandbox-rule'] },
    // Two references from result positions: abc123.txt is missing, def456.txt exists. The paths mentioned in the
    // prompt, in the assistant text and in the Bash input are not references and do not count.
    toolResultReferences: { referenced: 2, missing: 1 },
    taskNotifications: { delivered: 0, namingADelegation: 0, namingAnotherCall: 0, namingNoCall: 0, withoutCallId: 0 },
  });
});

test('a session without subagents yields empty subagent tallies and absent sources', async (t) => {
  const root = await writeSession(t, { 'solo.jsonl': jsonl({ type: 'user', isSidechain: false }) });

  const probe = await inspect(join(root, 'solo.jsonl'));

  assert.equal(probe.sources.mainTranscript, 'present');
  assert.equal(probe.sources.subagentsDirectory, 'not-found');
  assert.equal(probe.sources.toolResultsDirectory, 'not-found');
  assert.deepEqual(probe.sources.subagentFiles, { total: 0, withTranscript: 0, withMeta: 0, incompletePairs: 0 });
  assert.equal(probe.main.lines, 1);
  assert.equal(probe.subagents.files, 0);
  assert.equal(probe.meta.files, 0);
});

test('a missing main transcript is reported, not thrown', async (t) => {
  const root = await writeSession(t, {});

  const probe = await inspect(join(root, 'missing'));

  assert.equal(probe.sources.mainTranscript, 'not-found');
  assert.equal(probe.main.files, 0);
  assert.equal(probe.main.lines, 0);
});

test('a transcript or meta file that cannot be read is counted as unreadable, and probing continues', async (t) => {
  const root = await writeSession(t, syntheticSessionFiles());
  const subagents = join(root, SESSION_ID, 'subagents');
  const faulty = new FaultyFileSystem(files, [join(subagents, 'agent-a1.jsonl'), join(subagents, 'agent-b2.meta.json')]);

  const report = await inspect(join(root, SESSION_ID), faulty);

  assert.equal(report.subagents.files, 1);
  assert.equal(report.subagents.unreadableFiles, 1);
  assert.equal(report.subagents.lines, 0);
  assert.equal(report.meta.files, 2);
  assert.equal(report.meta.unreadableFiles, 1);
  assert.equal(report.main.lines, 7);
});

// where-the-value-went R4: only a notification naming a delegating call is read as a report, so the rest are counted.
test('delivered task notifications are counted by what the call they name is', async (t) => {
  const root = await writeSession(t, onwardSessionFiles('background'));

  const probe = await inspect(join(root, `${ONWARD_SESSION_ID}.jsonl`));

  assert.deepEqual(probe.taskNotifications, {
    delivered: 3,
    namingADelegation: 2,
    namingAnotherCall: 1,
    namingNoCall: 0,
    withoutCallId: 0,
  });
});

test('a notification naming no call of the session, or nothing, is counted as such, and a queued one not at all', async (t) => {
  const gone = '<task-notification><tool-use-id>toolu_01GONEAAAAAAAAAAAAAAAAAA</tool-use-id></task-notification>';
  const root = await writeSession(t, {
    'notes.jsonl': jsonl(
      { type: 'queue-operation', operation: 'enqueue', content: gone },
      { type: 'user', isSidechain: false, message: { role: 'user', content: gone } },
      {
        type: 'user',
        isSidechain: false,
        message: { role: 'user', content: [{ type: 'text', text: '<task-notification><status>completed</status></task-notification>' }] },
      },
    ),
  });

  const probe = await inspect(join(root, 'notes.jsonl'));

  assert.deepEqual(probe.taskNotifications, {
    delivered: 2,
    namingADelegation: 0,
    namingAnotherCall: 0,
    namingNoCall: 1,
    withoutCallId: 1,
  });
});
