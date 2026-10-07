// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, isAbsolute, join } from 'node:path';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { SETTINGS_FILES } from '../contract/settings.ts';
import { refuseCommandIn } from './hook-entries.ts';

/** How far up from where a hook ran a project is looked for. */
const MOST_FOLDERS_UP = 64;

/** A project found by the rules that block in it: the folder, the settings file running `refuse`, and its command. */
export interface RefuseProject {
  readonly project: string;
  readonly settingsPath: string;
  readonly command: string;
}

/**
 * `2026-10-02-codex-approves-its-own-hook.md` AO5: the project for a Codex command or turn is the nearest folder, at or
 * above `folder`, whose `.claude/settings.local.json` or `settings.json` runs agentwhy's `refuse` - the local file
 * first, as `init` reads them. Codex runs agentwhy's check in the session's folder, which can lie below the project and
 * names it nowhere (CKB6); the rules that block there are the project's own, so the project is the folder that holds
 * them. A folder with a `.claude` of its own and no `refuse` does not stop the walk.
 *
 * The walk ends at the home directory, which is never a project (`which-project` V8; `codex-says-it-too` CXB6): a
 * `refuse` in the person's own `~/.claude/settings.json` would otherwise make every folder under home a project. One
 * lookup for `refuse --codex`, the turn's rules (CX5) and whether a turn is watched (CX9), so the three never disagree.
 */
export async function refuseProjectAbove(files: FileReader, folder: string, home: string): Promise<RefuseProject | undefined> {
  for (let at = folder, depth = 0; depth < MOST_FOLDERS_UP; depth += 1) {
    if (at === home) return undefined;
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const settingsPath = join(at, SETTINGS_FILES.directory, file);
      const settings = parseJsonObject((await textOrUndefined(files, settingsPath)) ?? '');
      const command = settings === undefined ? undefined : refuseCommandIn(settings);
      if (command !== undefined) return { project: at, settingsPath, command };
    }
    const up = dirname(at);
    if (up === at) return undefined;
    at = up;
  }
  return undefined;
}

const PROJECT_DIR = /^\$(?:\{CLAUDE_PROJECT_DIR\}|CLAUDE_PROJECT_DIR)/;
/**
 * One whole shell word, as a shell reads the value of a flag: quoted parts, escapes and bare characters joined into a
 * single path. A command quotes only the part it has to - `--settings "$CLAUDE_PROJECT_DIR"/.claude/settings.json` -
 * and reading the first quoted part alone would name the project's folder as the file to read.
 */
const WORD = '(?:"(?:[^"\\\\]|\\\\.)*"|\'[^\']*\'|\\\\.|[^\\s"\'])+';
const SETTINGS_FLAG = new RegExp(`\\s--settings(?:\\s+|=)(${WORD})`);
const POLICY_FLAG = new RegExp(`\\s--policy(?:\\s+|=)(${WORD})`);

/**
 * AO6: the rules the project's `refuse` reads, as its own command names them - a policy file, else a settings file,
 * `$CLAUDE_PROJECT_DIR` and a relative path resolved against the project - or neither, which is the built-in list.
 */
export function refuseRulesOf(found: RefuseProject): { readonly settingsPath?: string; readonly policyPath?: string } {
  const policy = flagValue(found, POLICY_FLAG);
  if (policy !== undefined) return { policyPath: policy };
  const settings = flagValue(found, SETTINGS_FLAG);
  return settings === undefined ? {} : { settingsPath: settings };
}

function flagValue(found: RefuseProject, flag: RegExp): string | undefined {
  const word = flag.exec(found.command)?.[1];
  if (word === undefined) return undefined;
  const raw = unquoted(word);
  const resolved = PROJECT_DIR.test(raw) ? join(found.project, raw.replace(PROJECT_DIR, '.')) : raw;
  return isAbsolute(resolved) ? resolved : join(found.project, resolved);
}

/** The word as the shell hands it to `refuse`: its quotes taken off and its `\` escapes resolved. */
function unquoted(word: string): string {
  let out = '';
  let quote: '"' | '\'' | undefined;
  for (let at = 0; at < word.length; at += 1) {
    const char = word[at];
    if (quote !== '\'' && char === '\\' && at + 1 < word.length) {
      out += word[at + 1];
      at += 1;
      continue;
    }
    if (quote === undefined && (char === '"' || char === '\'')) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = undefined;
      continue;
    }
    out += char;
  }
  return out;
}
