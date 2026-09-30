import type { DoctorReport, SourceState } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class UnusableDirectoriesRule implements AttentionRule {
  findings({ sources }: DoctorReport): string[] {
    const directories: readonly (readonly [string, SourceState])[] = [
      ['subagents directory', sources.subagentsDirectory],
      ['tool-results directory', sources.toolResultsDirectory],
    ];
    // `not-found` is normal: a session without subagents or spilled results has no such directory.
    return directories
      .filter(([, state]) => state === 'unreadable' || state === 'wrong-kind')
      .map(([name, state]) => `${name}: ${state}`);
  }
}
