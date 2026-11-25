// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * Asks a page server of this computer for an answer as data (`2026-11-24-talking-about-agentwhy.md` CV17): what it sent, or
 * `undefined` where nothing answered. Never asked of an address that is not the computer's own.
 */
export interface AnswerSource {
  ask(url: string): Promise<unknown>;
}
