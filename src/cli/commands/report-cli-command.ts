// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ReportOutcome, ReportUseCase } from '../../report/report-use-case.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';
import { parseReportArguments } from './report-arguments.ts';
import { REPORT_USAGE } from './report-usage.ts';

// A Record over the outcome union: a new outcome does not compile until it has an exit code. An incomplete
// report still exits 0 - it said what was missing, which is the report doing its job.
export const EXIT_CODE_BY_OUTCOME: Readonly<Record<ReportOutcome, ExitCode>> = {
  complete: EXIT_CODE.ok,
  incomplete: EXIT_CODE.ok,
  'policy-refused': EXIT_CODE.usage,
  'session-unreadable': EXIT_CODE.mainTranscriptMissing,
  'no-session': EXIT_CODE.mainTranscriptMissing,
};

export class ReportCliCommand implements CliCommand {
  readonly name = 'report';
  readonly usage = REPORT_USAGE;
  readonly #report: ReportUseCase;
  /** The terminal's width, read once in the shell. `undefined` where there is no terminal to read. */
  readonly #columns: number | undefined;

  constructor(report: ReportUseCase, columns?: number) {
    this.#report = report;
    this.#columns = columns;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    const parsed = parseReportArguments(args, this.#columns);

    switch (parsed.kind) {
      case 'help':
        return { kind: 'help', usage: this.usage };
      case 'usage-error':
        return { kind: 'usage-error', message: parsed.message, usage: this.usage };
      case 'options': {
        const result = await this.#report.run(parsed.options);
        return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
      }
    }
  }
}
