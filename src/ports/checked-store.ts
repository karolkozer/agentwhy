// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The conversations a person asked to be checked although they were older than a run (`for-people-who-build-with-ai.md`
 * F55): once asked, every later run reads them as if they were in its range, so the question is never asked twice.
 * Session ids and moments - never a title, a path or a line of a transcript.
 */
export interface CheckedReading {
  readonly ids: ReadonlySet<string>;
  /** The record exists and could not be read. Nothing is guessed: the run reads its range, as before. */
  readonly failed: boolean;
}

/** One project's list, for one person, kept outside the repository beside the marks (R33). Appended to, never rewritten. */
export interface CheckedStore {
  read(): Promise<CheckedReading>;
  /** `false` where the line could not be written; the caller says so. */
  add(id: string, at: number): Promise<boolean>;
}
