// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DoctorReport } from '../../adapter/claude-code/probe/doctor-report.ts';
import type { Renderer } from '../../shared/renderer.ts';

const JSON_INDENT = 2;

/** Either provider's closed report, as JSON: its schema is its type, and nothing else is written. */
export class JsonDoctorRenderer<Report = DoctorReport> implements Renderer<Report> {
  render(report: Report): string {
    return `${JSON.stringify(report, null, JSON_INDENT)}\n`;
  }
}
