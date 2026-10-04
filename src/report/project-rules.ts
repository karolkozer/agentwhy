// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { readDenyRules } from '../adapter/claude-code/policy/deny-rules.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import { parseJsonObject } from '../shared/json.ts';

/**
 * The patterns the project's own settings files deny - its local file and its committed one - read at the moment the
 * report is written (the report page spec M3, P36). A file one of these matches is *Protected*: Claude Code refuses the
 * tool before anything is opened. One matched only by the built-in list or a policy file is not.
 *
 * `undefined` where a settings file exists and cannot be read or parsed: what it denies is then not known, and the page
 * says so rather than calling a file unprotected. A file that is absent denies nothing, which is an answer.
 */
export async function projectDenyRules(files: FileReader, projectDirectory: string): Promise<readonly string[] | undefined> {
  const patterns: string[] = [];
  for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
    let text: string;
    try {
      text = await files.readText(join(projectDirectory, SETTINGS_FILES.directory, name));
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      if (error.failure === 'not-found') continue;
      return undefined;
    }
    if (parseJsonObject(text) === undefined) return undefined;
    patterns.push(...(readDenyRules(text)?.patterns ?? []));
  }
  return [...new Set(patterns)];
}
