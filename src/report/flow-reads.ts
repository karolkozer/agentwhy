// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../core/redaction/redacted.ts';
import type { FlowReached } from './report-model.ts';

/**
 * The files a reached step showed the agent the text of (`search-hits-are-reads` H5): every file it reached where a
 * traced value came back - the result does not say which one it came from - and every file whose lines a search
 * printed, which it does say. The one answer every reader of "read" asks, so the page, `check`, To fix and the terminal
 * cannot drift apart.
 */
export function filesRead(step: FlowReached): readonly Redacted[] {
  const printed = (step.lines ?? []).map((line) => line.path);
  return step.carriedValue ? [...new Set([...step.files, ...printed])] : printed;
}

/** Whether a reached step showed the agent the text of this file. */
export function readIn(step: FlowReached, path: string): boolean {
  return filesRead(step).some((file) => (file as string) === path);
}

/** How many lines of this file a search in the step printed, or undefined where none. */
export function linesOf(step: FlowReached, path: string): number | undefined {
  return step.lines?.find((line) => (line.path as string) === path)?.count;
}
