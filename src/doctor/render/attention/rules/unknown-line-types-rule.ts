// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';
import { transcriptScopes } from '../transcript-scopes.ts';

export class UnknownLineTypesRule implements AttentionRule {
  findings(report: DoctorReport): string[] {
    return transcriptScopes(report).flatMap(([scope, stats]) =>
      stats.unknownLineTypes.map((type) => `UNKNOWN line type in ${scope}: ${type} (${stats.lineTypes[type] ?? 0})`),
    );
  }
}
