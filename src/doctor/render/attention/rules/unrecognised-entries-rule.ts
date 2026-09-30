import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class UnrecognisedEntriesRule implements AttentionRule {
  findings({ sources }: DoctorReport): string[] {
    const { unrecognisedEntries } = sources;
    return unrecognisedEntries > 0 ? [`entries the format contract does not recognise: ${unrecognisedEntries}`] : [];
  }
}
