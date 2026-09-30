import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ASSUMPTIONS } from '../../../src/adapter/claude-code/contract/assumptions.ts';
import { KNOWN_DENIAL_KINDS, isKnownDenialKind } from '../../../src/adapter/claude-code/contract/denials.ts';
import { AGENT_TOOL, FIELDS, META_KEYS } from '../../../src/adapter/claude-code/contract/fields.ts';
import { identifierMatches } from '../../../src/adapter/claude-code/contract/identifiers.ts';
import {
  LAYOUT,
  parseSubagentFileName,
  subagentFileName,
  toolResultReferences,
} from '../../../src/adapter/claude-code/contract/layout.ts';
import {
  CONVERSATION_LINE_TYPES,
  SKIPPED_LINE_TYPES,
  classifyLineType,
} from '../../../src/adapter/claude-code/contract/line-types.ts';
import { VERIFIED_AGAINST } from '../../../src/adapter/claude-code/contract/version.ts';
import { loadOracle } from '../../helpers/oracle.ts';

const oracle = loadOracle();

const sorted = (values: readonly string[]): string[] => [...values].sort();

test('the contract encodes exactly what the oracle measured', () => {
  assert.equal(VERIFIED_AGAINST.claudeCode, oracle.source.claudeCodeVersion);
  assert.equal(VERIFIED_AGAINST.session, oracle.source.sessionId);
  assert.equal(VERIFIED_AGAINST.date, oracle.source.capturedAt);
  assert.deepEqual(sorted(META_KEYS), sorted(oracle.schema.subagentMetaKeys));
  assert.deepEqual(sorted(AGENT_TOOL.inputKeys), sorted(oracle.schema.agentToolUseInputKeys));
  assert.deepEqual(sorted(AGENT_TOOL.optionalInputKeys), sorted(oracle.schema.agentToolUseOptionalInputKeys));
  assert.equal(FIELDS.denialKind, oracle.schema.denialMarkerField);
  assert.deepEqual(sorted(KNOWN_DENIAL_KINDS), sorted(oracle.schema.denialMarkerKnownValues));
  assert.equal(FIELDS.sidechain, oracle.schema.sidechainDiscriminator);
  assert.deepEqual(sorted([FIELDS.toolUseResult, FIELDS.resultSourceAssistant]), sorted(oracle.schema.resultJoinFields));
});

test('the layout matches the paths recorded in the oracle', () => {
  const { layout } = oracle.source;

  assert.ok(layout.mainTranscript.endsWith(`<session-id>${LAYOUT.transcriptSuffix}`));
  assert.ok(layout.subagentTranscripts.endsWith(`/${LAYOUT.subagentsDir}/${subagentFileName('<id>', 'transcript')}`));
  assert.ok(layout.subagentMeta.endsWith(`/${LAYOUT.subagentsDir}/${subagentFileName('<id>', 'meta')}`));
  assert.ok(layout.spilledToolResults.endsWith(`/${LAYOUT.toolResultsDir}/<id>${LAYOUT.toolResultSuffix}`));
});

test('every line type the oracle observed is classified, and nothing more', () => {
  const observed = new Set([
    ...Object.keys(oracle.distributions.mainLineTypes),
    ...Object.keys(oracle.distributions.subagentLineTypes),
  ]);

  for (const type of observed) assert.notEqual(classifyLineType(type), 'unknown', type);
  assert.equal(CONVERSATION_LINE_TYPES.length + SKIPPED_LINE_TYPES.length, observed.size);
});

test('unrecognised variants come back as unknown, never as a known value', () => {
  assert.equal(classifyLineType('some-future-type'), 'unknown');
  assert.equal(classifyLineType(undefined), 'unknown');
  assert.equal(classifyLineType(42), 'unknown');

  assert.equal(isKnownDenialKind('permission-rule'), true);
  assert.equal(isKnownDenialKind('sandbox-rule'), false);
  assert.equal(isKnownDenialKind(undefined), false);
});

test('subagent file names parse, and anything else is rejected', () => {
  assert.deepEqual(parseSubagentFileName('agent-a68274ca30b769747.jsonl'), {
    fileId: 'a68274ca30b769747',
    kind: 'transcript',
  });
  assert.deepEqual(parseSubagentFileName('agent-a68274ca30b769747.meta.json'), {
    fileId: 'a68274ca30b769747',
    kind: 'meta',
  });
  for (const name of ['agent-.jsonl', 'agent-x.json', 'notes.md', 'agent-x.jsonl.bak', 'xagent-a1.jsonl']) {
    assert.equal(parseSubagentFileName(name), undefined, name);
  }
  assert.equal(subagentFileName('a1', 'meta'), 'agent-a1.meta.json');
});

test('identifier shapes and spilled-result references are recognised in text', () => {
  const text =
    'call toolu_01AAAAAAAAAAAAAAAAAAAAAAAA from 11111111-1111-4111-8111-111111111111, ' +
    'saved to /work/s/tool-results/abc123.txt and tool-results/def456.txt';

  assert.deepEqual(identifierMatches(text), {
    toolUseIds: ['toolu_01AAAAAAAAAAAAAAAAAAAAAAAA'],
    uuids: ['11111111-1111-4111-8111-111111111111'],
  });
  assert.deepEqual(toolResultReferences(text), ['abc123.txt', 'def456.txt']);
  assert.deepEqual(identifierMatches('no identifiers here'), { toolUseIds: [], uuids: [] });
});

test('every assumption states its evidence, and ids are unique', () => {
  const ids = ASSUMPTIONS.map((assumption) => assumption.id);

  assert.equal(new Set(ids).size, ids.length);
  for (const assumption of ASSUMPTIONS) {
    assert.ok(assumption.statement.length > 0 && assumption.evidence.length > 0, assumption.id);
  }
});
