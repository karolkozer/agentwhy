// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { fileRulePathOf, heldPlaces, pairedPlace, projectRead, readDenyRules, toldPattern, toPattern } from '../adapter/claude-code/policy/deny-rules.ts';
import { fileRulesIn } from '../adapter/claude-code/settings/deny-entries.ts';
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
  return (await heldDenyRules(files, projectDirectory, home))?.patterns;
}

/**
 * `projectDenyRules`, with the folder each pattern holds in alone (`2026-10-09-the-file-not-its-name.md` FN15): a place
 * inside the project protects that path and no other file of its name, as Claude Code applies it (FNB30) and `refuse` and
 * the findings read it - only where every file naming the pattern holds it there, the computer's own never.
 */
export async function heldDenyRules(
  files: FileReader,
  projectDirectory: string,
  home: string,
): Promise<{ readonly patterns: readonly string[]; readonly at: Readonly<Record<string, string>> } | undefined> {
  const patterns: string[] = [];
  const held = new Map<string, Set<string | undefined>>();
  // The project's two files, then the one outside every project. A run in the home directory would name the same file
  // twice, which the set below answers; it is never a project either way (`which-project.md` V6).
  const homeSettings = join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared);
  const paths = [
    ...[SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => join(projectDirectory, SETTINGS_FILES.directory, name)),
    homeSettings,
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
    const settings = parseJsonObject(text);
    if (settings === undefined) return undefined;
    // `2026-10-09-the-file-not-its-name.md` FN5: the place half of a project file's pair is that file, already named by
    // its `./` rule - not a second rule a row's window would list as holding it.
    const written = new Set(fileRulesIn(settings).flatMap((entry) => fileRulePathOf(entry) ?? []));
    const paired = new Set([...written].filter((rule) => path !== homeSettings && pairedPlace(rule, written, projectDirectory, home)).map(toPattern));
    // FN15: a place inside the project is read as its path there, as `choosePolicy` reads it, so a row finds its rule -
    // the computer's own too (G6, 2026-10-10): a whole path written outside every project names that one file, as
    // Claude Code applies it (FNB30), and read as a pattern it held no row, so a file the computer blocks said "Not
    // blocked" beside the refusal that named the computer's policy.
    const read = [...new Set([...written].map((rule) => projectRead(rule, projectDirectory, home) ?? toPattern(rule)))];
    const atRoot = heldPlaces([...written], projectDirectory, home);
    for (const pattern of read) held.set(pattern, (held.get(pattern) ?? new Set()).add(atRoot[pattern]));
    patterns.push(...read);
  }
  const at = Object.fromEntries([...held].flatMap(([pattern, folders]) => {
    const [folder] = [...folders];
    return folders.size === 1 && folder !== undefined ? [[pattern, folder]] : [];
  }));
  return { patterns: [...new Set(patterns)], at };
}

/**
 * G15 on the report page: what the person's computer-wide rules block and track, so a row they hold says it is theirs
 * to change in Settings rather than offering a project's change. A file that cannot be read or understood answers
 * nothing - `projectDenyRules` has already said what is not known of the blocks, and a told list nobody can read holds
 * nothing a row could be changed through.
 */
export async function computerRules(
  files: FileReader,
  home: string,
  toldListPath: string | undefined,
  projectDirectory?: string,
): Promise<{ readonly blocked: readonly string[]; readonly told: readonly string[] }> {
  const [settings, list] = await Promise.all([
    textOrUndefined(files, join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared)),
    toldListPath === undefined ? undefined : textOrUndefined(files, toldListPath),
  ]);
  // A place inside the project the session ran in is read as its path there, as `heldDenyRules` reads it, so the row a
  // computer's rule holds is known to be the computer's (G6, 2026-10-10).
  const parsed = settings === undefined ? undefined : parseJsonObject(settings);
  const blocked = settings === undefined ? []
    : projectDirectory === undefined || parsed === undefined ? readDenyRules(settings)?.patterns ?? []
      : [...new Set(fileRulesIn(parsed).flatMap((entry) => fileRulePathOf(entry) ?? []).map((rule) => projectRead(rule, projectDirectory, home) ?? toPattern(rule)))];
  const told = toldListPath === undefined ? [] : readTellList(list);
  // PB3: as the policy reads a told entry (FN1, IP1) - a place as its path - so a row it holds is known to be the computer's.
  return { blocked, told: told === 'unreadable' ? [] : told.map((entry) => toldPattern(entry, home)) };
}
