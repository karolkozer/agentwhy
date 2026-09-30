import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class IncompleteSubagentPairsRule implements AttentionRule {
  findings({ sources }: DoctorReport): string[] {
    const { incompletePairs } = sources.subagentFiles;
    return incompletePairs > 0 ? [`subagents with an incomplete file pair: ${incompletePairs}`] : [];
  }
}
