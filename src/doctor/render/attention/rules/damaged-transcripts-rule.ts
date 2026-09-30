import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';
import { transcriptScopes } from '../transcript-scopes.ts';

export class DamagedTranscriptsRule implements AttentionRule {
  findings(report: DoctorReport): string[] {
    return transcriptScopes(report).flatMap(([scope, stats]) => [
      ...(stats.unparsableLines > 0 ? [`unparsable lines in ${scope}: ${stats.unparsableLines}`] : []),
      ...(stats.unreadableFiles > 0 ? [`unreadable transcript files in ${scope}: ${stats.unreadableFiles}`] : []),
    ]);
  }
}
