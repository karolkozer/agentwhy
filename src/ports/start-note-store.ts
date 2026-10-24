// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * When the plugin's `session-start` last told the agent about a project whose setup is not finished
 * (`2026-10-15-agentwhy-as-a-plugin.md` AP6, APD8): a project's name and a moment, nothing else.
 */
export interface StartNoteStore {
  /** The latest moment this project was told, `undefined` where it never was, `failed` where the record was not read. */
  lastToldAt(project: string): Promise<number | undefined | 'failed'>;
  /** `false` where the line could not be written. */
  add(project: string, at: number): Promise<boolean>;
}
