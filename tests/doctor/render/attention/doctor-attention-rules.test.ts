import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DoctorReport, SourceState } from '../../../../src/adapter/claude-code/probe/doctor-report.ts';
import { createDoctorAttentionRules } from '../../../../src/doctor/render/attention/doctor-attention-rules.ts';
import { cleanDoctorReport } from '../../../helpers/doctor-report.ts';

const rules = createDoctorAttentionRules();

function findings(report: DoctorReport): string[] {
  return rules.flatMap((rule) => rule.findings(report));
}

test('a clean report has no findings', () => {
  assert.deepEqual(findings(cleanDoctorReport()), []);
});

test('unknown variants come first, then problems', () => {
  const clean = cleanDoctorReport();
  const report = {
    ...clean,
    main: { ...clean.main, lineTypes: { mode: 3 }, unknownLineTypes: ['mode'] },
    subagents: { ...clean.subagents, unparsableLines: 2 },
    denials: { byKind: { 'sandbox-rule': 1 }, unknownKinds: ['sandbox-rule'] },
    toolResultReferences: { referenced: 1, missing: 1 },
  };

  assert.deepEqual(findings(report), [
    'UNKNOWN line type in main session: mode (3)',
    'UNKNOWN toolDenialKind: sandbox-rule (1)',
    'unparsable lines in subagents: 2',
    'referenced spilled results missing: 1',
  ]);
});

test('an unreadable or wrong-kind directory is a finding, a missing one is not', () => {
  const clean = cleanDoctorReport();
  const withDirectories = (subagentsDirectory: SourceState, toolResultsDirectory: SourceState): string[] =>
    findings({ ...clean, sources: { ...clean.sources, subagentsDirectory, toolResultsDirectory } });

  assert.deepEqual(withDirectories('unreadable', 'wrong-kind'), [
    'subagents directory: unreadable',
    'tool-results directory: wrong-kind',
  ]);
  assert.deepEqual(withDirectories('not-found', 'present'), []);
});

test('every missing or unreadable source is named', () => {
  const clean = cleanDoctorReport();
  const report = {
    ...clean,
    sources: {
      ...clean.sources,
      mainTranscript: 'not-found' as const,
      subagentFiles: { ...clean.sources.subagentFiles, incompletePairs: 1 },
      unrecognisedEntries: 2,
    },
    main: { ...clean.main, unreadableFiles: 1 },
    meta: { ...clean.meta, unparsableFiles: 1, unreadableFiles: 1 },
  };

  assert.deepEqual(findings(report), [
    'main transcript: not-found',
    'unreadable transcript files in main session: 1',
    'subagents with an incomplete file pair: 1',
    'unparsable meta.json files: 1',
    'unreadable meta.json files: 1',
    'entries the format contract does not recognise: 2',
  ]);
});
