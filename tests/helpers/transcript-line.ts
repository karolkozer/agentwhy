// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { TranscriptLine } from '../../src/adapter/claude-code/probe/transcript-line.ts';

export function lineOf(json: Record<string, unknown>): TranscriptLine {
  return { raw: JSON.stringify(json), json };
}

export function unparsableLine(raw: string): TranscriptLine {
  return { raw, json: undefined };
}
