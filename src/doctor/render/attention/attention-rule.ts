// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../../adapter/claude-code/probe/doctor-report.ts';

/** Strategy for one kind of finding under "Needs attention". Returns nothing when the report is clean for it. */
export interface AttentionRule {
  findings(report: DoctorReport): readonly string[];
}
