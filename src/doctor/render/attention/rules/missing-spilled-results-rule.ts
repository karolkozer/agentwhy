// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class MissingSpilledResultsRule implements AttentionRule {
  findings({ toolResultReferences }: DoctorReport): string[] {
    const { missing } = toolResultReferences;
    return missing > 0 ? [`referenced spilled results missing: ${missing}`] : [];
  }
}
