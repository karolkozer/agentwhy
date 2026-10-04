// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Replacing a file a person owns, whole (`2026-10-02-codex-approves-its-own-hook.md` AO15): the new text is complete on
 * disk before it takes the old one's place, so an interrupted write never leaves a cut file - Codex does not start on a
 * `config.toml` it cannot read. A file reached through a symbolic link stays a link: its target is replaced. The file's
 * mode is kept; a new file is the owner's alone.
 */
export interface FileReplacer {
  /** Throws FileAccessError when the file or its folder cannot be written. */
  replaceText(path: string, text: string): Promise<void>;
}
