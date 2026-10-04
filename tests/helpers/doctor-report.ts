// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport, TranscriptStats } from '../../src/adapter/claude-code/probe/doctor-report.ts';

function emptyTranscriptStats(): TranscriptStats {
  return {
    files: 0,
    unreadableFiles: 0,
    lines: 0,
    unparsableLines: 0,
    lineTypes: {},
    unknownLineTypes: [],
    unknownLineTypeKeys: {},
    topLevelKeys: {},
    sidechain: { true: 0, false: 0, absent: 0, invalid: 0 },
    systemSubtypes: {},
    tools: {},
    agentToolUses: 0,
    deniedCalls: 0,
    uniqueToolUseIds: 0,
    uniqueUuids: 0,
  };
}

/** A report with nothing to flag. Tests spread over it and change only the part they are about. */
export function cleanDoctorReport(): DoctorReport {
  return {
    schemaVersion: 4,
    contractVersion: 1,
    verifiedAgainst: '2.1.268',
    sessionId: 'sess-clean',
    sources: {
      mainTranscript: 'present',
      subagentsDirectory: 'not-found',
      toolResultsDirectory: 'not-found',
      subagentFiles: { total: 0, withTranscript: 0, withMeta: 0, incompletePairs: 0 },
      toolResultFiles: 0,
      unrecognisedEntries: 0,
    },
    toolVersions: {},
    workingDirectories: { distinct: 1, invalid: 0 },
    main: emptyTranscriptStats(),
    subagents: emptyTranscriptStats(),
    meta: { files: 0, unreadableFiles: 0, unparsableFiles: 0, keys: {}, agentType: {}, spawnDepth: {}, requestShape: {} },
    agentToolInputKeys: {},
    denials: { byKind: {}, unknownKinds: [] },
    toolResultReferences: { referenced: 0, missing: 0 },
    taskNotifications: { delivered: 0, namingADelegation: 0, namingAnotherCall: 0, namingNoCall: 0, withoutCallId: 0 },
  };
}
