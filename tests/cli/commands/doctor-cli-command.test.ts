import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DoctorCliCommand } from '../../../src/cli/commands/doctor-cli-command.ts';
import { DOCTOR_USAGE } from '../../../src/cli/commands/doctor-usage.ts';
import { EXIT_CODE } from '../../../src/cli/exit-codes.ts';
import type { DoctorOptions, DoctorOutcome, DoctorResult, DoctorUseCase } from '../../../src/doctor/doctor-use-case.ts';

class FakeDoctor implements DoctorUseCase {
  readonly runs: DoctorOptions[] = [];
  readonly #outcome: DoctorOutcome;

  constructor(outcome: DoctorOutcome) {
    this.#outcome = outcome;
  }

  async run(options: DoctorOptions): Promise<DoctorResult> {
    this.runs.push(options);
    return { outcome: this.#outcome, output: 'the report' };
  }
}

test('runs the doctor with the parsed options and maps its outcome to an exit code', async () => {
  const complete = new FakeDoctor('complete');
  assert.deepEqual(await new DoctorCliCommand(complete).execute(['--input', 's', '--json']), {
    kind: 'completed',
    output: 'the report',
    exitCode: EXIT_CODE.ok,
  });
  assert.deepEqual(complete.runs, [{ input: 's', format: 'json' }]);

  const missing = new FakeDoctor('main-transcript-missing');
  assert.deepEqual(await new DoctorCliCommand(missing).execute(['--input', 's']), {
    kind: 'completed',
    output: 'the report',
    exitCode: EXIT_CODE.mainTranscriptMissing,
  });
});

test('answers help and usage errors with its own usage, without running the doctor', async () => {
  const doctor = new FakeDoctor('complete');
  const command = new DoctorCliCommand(doctor);

  assert.deepEqual(await command.execute(['--help']), { kind: 'help', usage: DOCTOR_USAGE });
  assert.deepEqual(await command.execute([]), {
    kind: 'usage-error',
    message: 'doctor needs --input <session-dir | session.jsonl>',
    usage: DOCTOR_USAGE,
  });
  assert.deepEqual(doctor.runs, []);
});
