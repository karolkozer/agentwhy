// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The computer's own window for choosing a folder (`.ai/specs/2026-09-27-which-project.md` V12): a browser gives a page a
 * folder's name and never its path (F36), so the server asks the system instead. The path it answers is the system's, and
 * never the page's.
 */
export interface FolderChooser {
  /** Whether this computer has a window this code knows how to open (VD3: macOS first). */
  readonly available: boolean;
  /**
   * Opens the window headed `prompt`, showing the folder `startIn` where one is given, and answers once the person has
   * chosen or cancelled. Never throws.
   */
  choose(prompt: string, startIn?: string): Promise<{ readonly chosen: string } | { readonly cancelled: true } | { readonly failed: string }>;
}
