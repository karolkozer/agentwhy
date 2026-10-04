// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** One row of a list with boxes: what it is, what it costs, and whether it starts ticked. */
export interface MultiChoice {
  readonly label: string;
  /** Read beside the label. It says what the choice costs as well as what it gives. */
  readonly detail: string;
  readonly selected: boolean;
}

/**
 * Choosing any number of a list at the terminal (`specs/2026-09-16-worth-running-every-day.md` R4a). Separate from
 * `Chooser` because the two are different questions: one picks a thing to open, this one settles a set. A client of
 * either depends on the one it asks.
 */
export interface MultiChooser {
  /** The positions chosen - possibly none - or `undefined` when the person left without answering. */
  chooseMany(heading: string, choices: readonly MultiChoice[]): Promise<readonly number[] | undefined>;
}
