import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class DamagedMetaFilesRule implements AttentionRule {
  findings({ meta }: DoctorReport): string[] {
    return [
      ...(meta.unparsableFiles > 0 ? [`unparsable meta.json files: ${meta.unparsableFiles}`] : []),
      ...(meta.unreadableFiles > 0 ? [`unreadable meta.json files: ${meta.unreadableFiles}`] : []),
    ];
  }
}
