import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import type { DoctorReport } from '../../src/adapter/claude-code/probe/doctor-report.ts';
import type { Counts } from '../../src/shared/counter.ts';

export interface Oracle {
  readonly source: {
    readonly sessionId: string;
    readonly claudeCodeVersion: string;
    readonly capturedAt: string;
    readonly layout: {
      readonly mainTranscript: string;
      readonly subagentTranscripts: string;
      readonly subagentMeta: string;
      readonly spilledToolResults: string;
    };
  };
  /** Numbers, plus `$comment…` entries; drop keys starting with `$` before comparing. */
  readonly counts: Readonly<Record<string, unknown>>;
  readonly distributions: {
    readonly mainLineTypes: Counts;
    readonly subagentLineTypes: Counts;
    readonly systemSubtypes: Counts;
    readonly agentType: Counts;
    readonly spawnDepth: Counts;
    readonly requestShape: Counts;
    readonly toolDenialKind: Counts;
  };
  readonly tools: { readonly main: Counts; readonly subagents: Counts };
  /** The join measurements of M1 step 1; `$comment` entries are dropped before comparing, as in `counts`. */
  readonly relations: Readonly<Record<string, unknown>>;
  readonly schema: {
    readonly agentToolUseInputKeys: readonly string[];
    readonly agentToolUseOptionalInputKeys: readonly string[];
    readonly subagentMetaKeys: readonly string[];
    readonly denialMarkerField: string;
    readonly denialMarkerKnownValues: readonly string[];
    readonly resultJoinFields: readonly string[];
    readonly sidechainDiscriminator: string;
  };
}

export function loadOracle(): Oracle {
  return JSON.parse(readFileSync(new URL('../fixtures/oracle.json', import.meta.url), 'utf8'));
}

/**
 * The assertion table of spec §4.0, applied to one probe. The redacted fixture preserves the structure and the
 * identifiers of the session it came from, so the same numbers must hold for both - which is what makes the
 * fixture a valid stand-in for a session nobody may commit.
 */
export function assertProbeMatchesOracle(probe: DoctorReport, oracle: Oracle): void {
  const { main, subagents, meta } = probe;

  assert.equal(probe.sessionId, oracle.source.sessionId);
  assert.deepEqual(
    {
      mainLines: main.lines,
      mainUnparsableLines: main.unparsableLines,
      mainLinesWithIsSidechainFalse: main.sidechain.false,
      agentToolUses: main.agentToolUses,
      subagentMetaFiles: meta.files,
      subagentTranscriptFiles: subagents.files,
      subagentLines: subagents.lines,
      subagentLinesWithIsSidechainTrue: subagents.sidechain.true,
      spilledToolResultFiles: probe.sources.toolResultFiles,
      deniedCallsMain: main.deniedCalls,
      deniedCallsSubagents: subagents.deniedCalls,
      deniedCallsTotal: main.deniedCalls + subagents.deniedCalls,
      uniqueToolUseIdsMain: main.uniqueToolUseIds,
      uniqueToolUseIdsSubagents: subagents.uniqueToolUseIds,
      uniqueUuidsMain: main.uniqueUuids,
    },
    Object.fromEntries(Object.entries(oracle.counts).filter(([key]) => !key.startsWith('$'))),
  );
  assert.deepEqual(
    {
      mainLineTypes: main.lineTypes,
      subagentLineTypes: subagents.lineTypes,
      systemSubtypes: main.systemSubtypes,
      agentType: meta.agentType,
      spawnDepth: meta.spawnDepth,
      requestShape: meta.requestShape,
      toolDenialKind: probe.denials.byKind,
    },
    oracle.distributions,
  );
  assert.deepEqual({ main: main.tools, subagents: subagents.tools }, oracle.tools);

  const agentCalls = main.agentToolUses + subagents.agentToolUses;
  const keysOnEveryCall = Object.keys(probe.agentToolInputKeys).filter((key) => probe.agentToolInputKeys[key] === agentCalls);
  const keysOnSomeCalls = Object.keys(probe.agentToolInputKeys).filter((key) => probe.agentToolInputKeys[key] !== agentCalls);

  assert.deepEqual(keysOnEveryCall.sort(), [...oracle.schema.agentToolUseInputKeys].sort());
  assert.deepEqual(keysOnSomeCalls.sort(), [...oracle.schema.agentToolUseOptionalInputKeys].sort());

  assert.deepEqual(Object.keys(meta.keys).sort(), [...oracle.schema.subagentMetaKeys].sort());
  for (const [key, count] of Object.entries(meta.keys)) assert.equal(count, meta.files, `meta key ${key} in every file`);

  assert.deepEqual(Object.keys(probe.denials.byKind).sort(), [...oracle.schema.denialMarkerKnownValues].sort());
  for (const field of [
    oracle.schema.denialMarkerField,
    oracle.schema.sidechainDiscriminator,
    ...oracle.schema.resultJoinFields,
  ]) {
    assert.ok(field in main.topLevelKeys || field in subagents.topLevelKeys, `field ${field} observed`);
  }
}
