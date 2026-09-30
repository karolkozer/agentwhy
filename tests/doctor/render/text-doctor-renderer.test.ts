import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AttentionRule } from '../../../src/doctor/render/attention/attention-rule.ts';
import { TextDoctorRenderer } from '../../../src/doctor/render/text-doctor-renderer.ts';
import { cleanDoctorReport } from '../../helpers/doctor-report.ts';

test('opens with the session and the contract, and says none when no rule has a finding', () => {
  const lines = new TextDoctorRenderer([]).render(cleanDoctorReport()).split('\n');

  assert.deepEqual(lines.slice(0, 7), [
    'agentwhy doctor · session sess-clean',
    'format contract v1, verified against Claude Code 2.1.268',
    '',
    'Needs attention',
    '  none',
    '',
    'Sources',
  ]);
});

test('lists the findings of the injected rules, in rule order', () => {
  const rules: AttentionRule[] = [{ findings: () => ['first'] }, { findings: () => [] }, { findings: () => ['second', 'third'] }];

  const lines = new TextDoctorRenderer(rules).render(cleanDoctorReport()).split('\n');

  assert.deepEqual(lines.slice(3, 8), ['Needs attention', '  first', '  second', '  third', '']);
});

test('lists the keys of each unknown line type under the transcript that carries them', () => {
  const report = cleanDoctorReport();

  const output = new TextDoctorRenderer([]).render({
    ...report,
    main: { ...report.main, unknownLineTypeKeys: { mode: { mode: 2, type: 2 } } },
  });

  assert.match(output, /^ {2}keys on unknown line types\n {4}mode\n {6}mode {2}2\n {6}type {2}2$/m);
  assert.match(output, /^ {2}keys on unknown line types\n {4}\(none\)$/m);
});

test('renders every section, with empty counts shown as (none)', () => {
  const output = new TextDoctorRenderer([]).render(cleanDoctorReport());

  for (const heading of [
    'Claude Code versions (lines)',
    'Main session',
    'Subagents',
    'meta.json',
    'Agent tool input keys',
    'Denials by toolDenialKind',
    'Spilled result references',
    'Task notifications delivered',
  ]) {
    assert.match(output, new RegExp(`^${heading.replace(/[().]/g, '\\$&')}$`, 'm'), heading);
  }
  assert.match(output, /^Claude Code versions \(lines\)\n {2}\(none\)$/m);
});
