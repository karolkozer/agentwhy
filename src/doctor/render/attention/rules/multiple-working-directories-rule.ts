import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

/**
 * A session is expected to carry one working directory. Two would mean the project root cannot be read from the
 * transcript, and every path a report makes relative to it would be relative to a guess.
 */
export class MultipleWorkingDirectoriesRule implements AttentionRule {
  findings(report: DoctorReport): string[] {
    const { distinct, invalid } = report.workingDirectories;
    const findings: string[] = [];

    if (distinct > 1) findings.push(`UNKNOWN variant: ${distinct} working directories in one session`);
    if (invalid > 0) findings.push(`INVALID cwd on ${invalid} lines: not a string`);
    return findings;
  }
}
