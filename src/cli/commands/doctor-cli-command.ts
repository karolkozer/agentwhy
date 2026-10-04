// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorOutcome, DoctorUseCase } from '../../doctor/doctor-use-case.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';
import { parseDoctorArguments } from './doctor-arguments.ts';
import { DOCTOR_USAGE } from './doctor-usage.ts';

// A Record over the outcome union: a new outcome does not compile until it has an exit code.
const EXIT_CODE_BY_OUTCOME: Readonly<Record<DoctorOutcome, ExitCode>> = {
  complete: EXIT_CODE.ok,
  'main-transcript-missing': EXIT_CODE.mainTranscriptMissing,
  // No session found, for the same reason a missing transcript is: nothing here is a report on a session.
  'unknown-format': EXIT_CODE.mainTranscriptMissing,
};

export class DoctorCliCommand implements CliCommand {
  readonly name = 'doctor';
  readonly usage = DOCTOR_USAGE;
  readonly #doctor: DoctorUseCase;

  constructor(doctor: DoctorUseCase) {
    this.#doctor = doctor;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    const parsed = parseDoctorArguments(args);

    switch (parsed.kind) {
      case 'help':
        return { kind: 'help', usage: this.usage };
      case 'usage-error':
        return { kind: 'usage-error', message: parsed.message, usage: this.usage };
      case 'options': {
        const result = await this.#doctor.run(parsed.options);
        return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
      }
    }
  }
}
