// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { isDirectory, type DirectoryReader } from '../../../ports/directory-reader.ts';
import { COPILOT_FOLDER } from '../contract/session.ts';

/**
 * `copilot-blocks-too` CB9, as Codex's CK6: Copilot is used on this computer where its own folder is in the home
 * directory - the CLI and the desktop app both keep it (CPB43). A folder that cannot be looked at is not taken as Copilot.
 */
export async function copilotOnThisComputer(directories: DirectoryReader, home: string): Promise<boolean> {
  return isDirectory(directories, join(home, ...COPILOT_FOLDER));
}
