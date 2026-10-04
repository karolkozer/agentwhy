// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class UnknownDenialKindsRule implements AttentionRule {
  findings({ denials }: DoctorReport): string[] {
    return denials.unknownKinds.map((kind) => `UNKNOWN toolDenialKind: ${kind} (${denials.byKind[kind] ?? 0})`);
  }
}
