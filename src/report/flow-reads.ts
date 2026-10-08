// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../core/redaction/redacted.ts';
import type { FlowReached } from './report-model.ts';

/**
 * The files a reached step showed the agent the text of (S3): every file it reached where a traced value came back - the
 * result does not say which one it came from - every file whose lines a search printed (`search-hits-are-reads` H5), and
 * every file whose text the call printed to its model (`shown`). The one answer every per-file surface asks - the Files
 * tab, a file's story, Helpers, Advanced - and the one the row's `filesRead` counts, so none of them can say "Only saw a
 * name" of a file another says was read (`2026-10-08-every-tab-says-read.md`, found when the row and the Files tab of one
 * conversation said both).
 */
export function filesRead(step: FlowReached): readonly Redacted[] {
  const printed = [...(step.lines ?? []).map((line) => line.path), ...(step.shown ?? [])];
  return step.carriedValue ? [...new Set([...step.files, ...printed])] : [...new Set(printed)];
}

/**
 * The files a reached step showed the agent a value of: a traced value, or lines a search printed (H7). What `rotate` -
 * To fix, `check`, the marks - and `contentsSeen` ask, narrower than `filesRead` on purpose: a file printed for ordinary
 * values was read, and has no keys to change, so it is an open route and not one to rotate (`worth-running-every-day`
 * R12; ER4, ER5).
 */
export function valuesRead(step: FlowReached): readonly Redacted[] {
  const printed = (step.lines ?? []).map((line) => line.path);
  return step.carriedValue ? [...new Set([...step.files, ...printed])] : printed;
}

/** Whether a reached step showed the agent the text of this file. */
export function readIn(step: FlowReached, path: string): boolean {
  return filesRead(step).some((file) => (file as string) === path);
}

/**
 * Whether a reached step opened this file and printed no text of it (2026-10-07): a count, a size, a checksum. Read
 * after `readIn`, never instead of it - a step that showed the agent the text read it, whatever else it ran.
 */
export function openedIn(step: FlowReached, path: string): boolean {
  return (step.opened ?? []).some((file) => (file as string) === path);
}

/** How many lines of this file a search in the step printed, or undefined where none. */
export function linesOf(step: FlowReached, path: string): number | undefined {
  return step.lines?.find((line) => (line.path as string) === path)?.count;
}
