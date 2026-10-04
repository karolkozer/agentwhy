// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../../../adapter/claude-code/probe/doctor-report.ts';
import type { AttentionRule } from '../attention-rule.ts';

export class MissingMainTranscriptRule implements AttentionRule {
  findings({ sources }: DoctorReport): string[] {
    return sources.mainTranscript === 'present' ? [] : [`main transcript: ${sources.mainTranscript}`];
  }
}
