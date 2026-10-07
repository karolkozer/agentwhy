// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { readDenyRules } from '../adapter/claude-code/policy/deny-rules.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../ports/file-reader.ts';
import { parseJsonObject } from '../shared/json.ts';
import { readTellList } from './private-files/tell-lists.ts';

/**
 * The patterns that deny a file where this session ran - the project's own settings files, its local one and its
 * committed one, and the person's own computer-wide settings - read at the moment the report is written (the report
 * page spec M3, P36). A file one of these matches is *Protected*: Claude Code refuses the tool before anything is
 * opened. One matched only by the built-in list or a policy file is not.
 *
 * The home directory's file is read here for the same reason as the project's, and on the same measurement:
 * `2026-10-05-protected-everywhere.md` GB10 found that Claude Code reads `~/.claude/settings.json` by itself, in every
 * project. Leaving it out made the page call a file unprotected that Claude Code does refuse, which is the lie G6
 * exists to end.
 *
 * `undefined` where one of those files exists and cannot be read or parsed: what it denies is then not known, and the
 * page says so rather than calling a file unprotected. A file that is absent denies nothing, which is an answer.
 */
export async function projectDenyRules(files: FileReader, projectDirectory: string, home: string): Promise<readonly string[] | undefined> {
  const patterns: string[] = [];
  // The project's two files, then the one outside every project. A run in the home directory would name the same file
  // twice, which the set below answers; it is never a project either way (`which-project.md` V6).
  const paths = [
    ...[SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => join(projectDirectory, SETTINGS_FILES.directory, name)),
    join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared),
  ];
  for (const path of [...new Set(paths)]) {
    let text: string;
    try {
      text = await files.readText(path);
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

/**
 * G15 on the report page: what the person's computer-wide rules block and track, so a row they hold says it is theirs
 * to change in Settings rather than offering a project's change. A file that cannot be read or understood answers
 * nothing - `projectDenyRules` has already said what is not known of the blocks, and a told list nobody can read holds
 * nothing a row could be changed through.
 */
export async function computerRules(files: FileReader, home: string, toldListPath: string | undefined): Promise<{ readonly blocked: readonly string[]; readonly told: readonly string[] }> {
  const [settings, list] = await Promise.all([
    textOrUndefined(files, join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared)),
    toldListPath === undefined ? undefined : textOrUndefined(files, toldListPath),
  ]);
  const blocked = settings === undefined ? [] : readDenyRules(settings)?.patterns ?? [];
  const told = toldListPath === undefined ? [] : readTellList(list);
  return { blocked, told: told === 'unreadable' ? [] : told };
}
