// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The computer's own window for choosing the files and folders a computer rule is for
 * (`.ai/specs/2026-10-07-a-file-in-its-place.md` IP2): a browser gives a page a name and never a place (F36), and a rule
 * for the whole computer has to name a place (IP1), so the server asks the system, as the projects window does for a
 * folder (`which-project.md` V12). What it answers is the system's, never the page's.
 */
export interface ChosenPlace {
  /** The absolute path, with every link followed. */
  readonly path: string;
  readonly folder: boolean;
}

/** What one window can choose: files and folders together (the Mac's, IPB12), or one of the two (Windows'). */
export type PlaceKind = 'both' | 'files' | 'folder';

export interface PlaceChooser {
  /** What this computer's window can choose; absent where it has none this code knows (only typing a place then). */
  readonly kinds?: 'both' | 'separate';
  /** Opens the window headed `prompt`, choosing `kind`, and answers once the person has chosen or cancelled. Never throws. */
  choose(prompt: string, kind: PlaceKind, startIn?: string): Promise<{ readonly chosen: readonly ChosenPlace[] } | { readonly cancelled: true } | { readonly failed: string }>;
}
