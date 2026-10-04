// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport, TranscriptStats } from '../../../adapter/claude-code/probe/doctor-report.ts';

export type TranscriptScope = readonly [name: string, stats: TranscriptStats];

export function transcriptScopes({ main, subagents }: DoctorReport): readonly TranscriptScope[] {
  return [
    ['main session', main],
    ['subagents', subagents],
  ];
}
