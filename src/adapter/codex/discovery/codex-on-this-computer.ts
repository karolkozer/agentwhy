// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { isDirectory, type DirectoryReader } from '../../../ports/directory-reader.ts';
import { CODEX_FOLDER } from '../contract/session.ts';

/**
 * `codex-blocks-too` CK6, amended 2026-10-01: Codex is used on this computer where its own folder is in the home
 * directory. A project set up before its first conversation has none to tell which AI will work in it; the computer
 * does. A folder that cannot be looked at is not taken as Codex.
 */
export async function codexOnThisComputer(directories: DirectoryReader, home: string): Promise<boolean> {
  return isDirectory(directories, join(home, ...CODEX_FOLDER));
}
