import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class MissingMainTranscriptRule implements AttentionRule {
  findings({ sources }: DoctorReport): string[] {
    return sources.mainTranscript === 'present' ? [] : [`main transcript: ${sources.mainTranscript}`];
  }
}
