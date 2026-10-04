// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { strict as assert } from 'node:assert';
import { isJsonObject } from '../../src/shared/json.ts';
import { ABSENT_LABEL, INVALID_LABEL, toLabel } from '../../src/shared/label.ts';

type Shape = 'count' | 'counts' | 'countsByLabel' | 'label' | 'labels' | 'state' | { readonly [key: string]: Shape };

const TRANSCRIPT_SHAPE: Shape = {
  files: 'count',
  unreadableFiles: 'count',
  lines: 'count',
  unparsableLines: 'count',
  lineTypes: 'counts',
  unknownLineTypes: 'labels',
  unknownLineTypeKeys: 'countsByLabel',
  topLevelKeys: 'counts',
  sidechain: { true: 'count', false: 'count', absent: 'count', invalid: 'count' },
  systemSubtypes: 'counts',
  tools: 'counts',
  agentToolUses: 'count',
  deniedCalls: 'count',
  uniqueToolUseIds: 'count',
  uniqueUuids: 'count',
};

// The closed output schema from the M0 Definition of Done. A new field fails this check until it is added here
// on purpose, so the output cannot quietly start carrying free text.
const DOCTOR_SHAPE: Shape = {
  schemaVersion: 'count',
  contractVersion: 'count',
  verifiedAgainst: 'label',
  sessionId: 'label',
  sources: {
    mainTranscript: 'state',
    subagentsDirectory: 'state',
    toolResultsDirectory: 'state',
    subagentFiles: { total: 'count', withTranscript: 'count', withMeta: 'count', incompletePairs: 'count' },
    toolResultFiles: 'count',
    unrecognisedEntries: 'count',
  },
  toolVersions: 'counts',
  workingDirectories: { distinct: 'count', invalid: 'count' },
  main: TRANSCRIPT_SHAPE,
  subagents: TRANSCRIPT_SHAPE,
  meta: {
    files: 'count',
    unreadableFiles: 'count',
    unparsableFiles: 'count',
    keys: 'counts',
    agentType: 'counts',
    spawnDepth: 'counts',
    requestShape: 'counts',
  },
  agentToolInputKeys: 'counts',
  denials: { byKind: 'counts', unknownKinds: 'labels' },
  toolResultReferences: { referenced: 'count', missing: 'count' },
  taskNotifications: {
    delivered: 'count',
    namingADelegation: 'count',
    namingAnotherCall: 'count',
    namingNoCall: 'count',
    withoutCallId: 'count',
  },
};

const SOURCE_STATES = new Set(['present', 'not-found', 'wrong-kind', 'unreadable']);

export function assertDoctorShape(value: unknown): void {
  assertShape(DOCTOR_SHAPE, value, 'doctor');
}

function isLabel(value: unknown): boolean {
  return typeof value === 'string' && (value === ABSENT_LABEL || value === INVALID_LABEL || toLabel(value) === value);
}

function assertShape(shape: Shape, value: unknown, path: string): void {
  switch (shape) {
    case 'count':
      assert.ok(typeof value === 'number' && Number.isInteger(value) && value >= 0, `${path} is a count`);
      return;
    case 'label':
      assert.ok(isLabel(value), `${path} is a label`);
      return;
    case 'labels':
      assert.ok(Array.isArray(value) && value.every(isLabel), `${path} is a list of labels`);
      return;
    case 'state':
      assert.ok(typeof value === 'string' && SOURCE_STATES.has(value), `${path} is a source state`);
      return;
    case 'counts':
      assert.ok(isJsonObject(value), `${path} is an object`);
      for (const [key, count] of Object.entries(value)) {
        assert.ok(isLabel(key), `${path} has label keys`);
        assertShape('count', count, `${path}.${key}`);
      }
      return;
    case 'countsByLabel':
      assert.ok(isJsonObject(value), `${path} is an object`);
      for (const [key, counts] of Object.entries(value)) {
        assert.ok(isLabel(key), `${path} has label keys`);
        assertShape('counts', counts, `${path}.${key}`);
      }
      return;
    default:
      assert.ok(isJsonObject(value), `${path} is an object`);
      assert.deepEqual(Object.keys(value).sort(), Object.keys(shape).sort(), `${path} has exactly the schema keys`);
      for (const [key, child] of Object.entries(shape)) assertShape(child, value[key], `${path}.${key}`);
  }
}
