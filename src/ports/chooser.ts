// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** One row a person can choose: what it is, and what a reader needs beside it to tell it from the others. */
export interface Choice {
  readonly label: string;
  readonly detail: string;
}

/**
 * Choosing one of a list at the terminal.
 *
 * The caller supplies the words and gets back a position: the keys, the cursor, the screen and the instructions for
 * using them belong to the implementation for as long as the choice is being made. That division is what keeps this
 * a one-shot chooser rather than the browsing interface `2026-09-13-agentwhy-spec.md` §2 declines to build - there is nothing
 * here to browse **to**, only a list to pick from and leave.
 */
export interface Chooser {
  /** The position chosen, or `undefined` when the person left without choosing. */
  choose(heading: string, choices: readonly Choice[]): Promise<number | undefined>;
}
