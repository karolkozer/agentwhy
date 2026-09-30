import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SessionFormats, type Recognition } from '../../src/core/session-format.ts';
import type { DoctorUseCase } from '../../src/doctor/doctor-use-case.ts';
import { FormatSelectingDoctor } from '../../src/doctor/format-selecting-doctor.ts';

const doctor = (name: string): DoctorUseCase => ({ async run() { return { outcome: 'complete', output: name }; } });

// XD7: one rule chooses, by content; no format's reader runs as a fallback for an input it does not recognise.
test('Codex is chosen by its own rule, Claude Code by its own or by a missing transcript, and anything else by neither', async () => {
  const run = async (codex: Recognition, claudeCode: Recognition, format: 'text' | 'json' = 'text') => new FormatSelectingDoctor({
    formats: new SessionFormats([
      { provider: 'codex', recognise: async () => codex },
      { provider: 'claude-code', recognise: async () => claudeCode },
    ]),
    doctors: { codex: doctor('codex'), 'claude-code': doctor('claude-code') },
    whenUnavailable: 'claude-code',
  }).run({ input: '/Users/someone/input', format });

  assert.equal((await run('recognised', 'unknown')).output, 'codex');
  assert.equal((await run('unknown', 'recognised')).output, 'claude-code');
  assert.equal((await run('unknown', 'unavailable')).output, 'claude-code', 'a missing transcript is still reported on, as before');
  const neither = await run('unknown', 'unknown');
  assert.equal(neither.outcome, 'unknown-format');
  assert.match(neither.output, /neither a Claude Code session nor a Codex session/);
  // With --json the refusal is a closed report of its own, naming no provider it guessed.
  assert.deepEqual(JSON.parse((await run('unknown', 'unknown', 'json')).output), { schemaVersion: 1, provider: 'unknown' });
});
