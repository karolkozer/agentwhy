// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { placed, policyFromDenyRules, readDenyRules, type DenyRules } from '../adapter/claude-code/policy/deny-rules.ts';
import { parsePolicy } from '../core/policy/parse-policy.ts';
import type { Policy } from '../core/policy/policy.ts';
import { readTellLists, tellPatterns, type TellListPaths } from './private-files/tell-lists.ts';
import { resolvePolicy } from '../core/policy/resolve-policy.ts';
import { textOrUndefined, type FileReader } from '../ports/file-reader.ts';

export interface PolicyChoice {
  /** An explicit policy file. Nothing is discovered by magic: a security policy is chosen, not found. */
  readonly policyPath?: string;
  /** A settings file whose deny rules stand in for a policy when no policy file was given. */
  readonly settingsPath?: string;
}

/**
 * Which policy a session is read under: the policy file, else the settings file's deny rules, else the project's
 * own two settings files, else the built-in default. `report`, `start`, `check` and `watch` all ask this, so an
 * alert and the report it points to cannot be read under different rules (`specs/2026-09-16-when-an-agent-finishes.md`
 * R10). A file that was named and cannot be read refuses the run rather than falling back to rules nobody chose.
 *
 * `projectDirectory`, amended: a run named neither `--policy` nor `--settings` - `agentwhy start`/`report`/`check`
 * off a terminal, the documented way to run this tool - used to mean "the built-in list and nothing else", so a
 * custom Block pattern (not one of the handful built in) was invisible to the report's own findings however it was
 * protected, even though the very same rule already drew the per-row *Blocked* badge (`project-rules.ts`,
 * read with no flag at all). The project's own two files - the ones `init`/Settings write into - are read here too
 * now, the way Claude Code applies them both (`block-means-blocked` K1: "either file"). An explicit `--settings`
 * still names one file exactly, as it always has; this only fills the gap a run left empty.
 */
export async function choosePolicy(
  choice: PolicyChoice,
  files: FileReader,
  tell?: TellListPaths,
  home?: string,
  projectDirectory?: string,
): Promise<{ readonly policy: Policy } | { readonly errors: readonly string[] }> {
  const file = choice.policyPath;
  if (file !== undefined) {
    const text = await textOrUndefined(files, file);
    if (text === undefined) return { errors: [`${file} could not be read`] };
    // A policy file is the whole of what was chosen: nothing is added to it.
    return resolvePolicy({ file: parsePolicy(text, file) });
  }

  const settingsPath = choice.settingsPath;
  const places = home === undefined ? undefined : { home };
  // IP1, IP3: where the home is known, a rule naming a place is read as that place, and so is a told one.
  const { rules, originPath } = settingsPath !== undefined
    ? { rules: await singleFileDenyRules(files, settingsPath, places), originPath: settingsPath }
    : projectDirectory === undefined
      ? { rules: undefined, originPath: undefined }
      : { rules: await projectDenyRulesMerged(files, projectDirectory, places), originPath: join(projectDirectory, SETTINGS_FILES.directory, SETTINGS_FILES.local) };
  if (rules === 'unreadable') return { errors: [`${settingsPath} could not be read`] };
  // A settings file with no deny list is not a policy; it falls through to the default, which says so.
  const resolved = resolvePolicy(rules === undefined || originPath === undefined ? {} : { settings: policyFromDenyRules(rules, originPath) });
  if ('errors' in resolved || tell === undefined) return resolved;
  const told = tellPatterns(await readTellLists(files, tell.pathsFor(originPath)));
  return { policy: withTold(resolved.policy, home === undefined ? told : told.map((pattern) => (/^(?:~\/|\/\/)/.test(pattern) ? placed(pattern, home) : pattern))) };
}

/** An explicit `--settings <file>`: read once, and a file that cannot be read refuses the whole run. */
async function singleFileDenyRules(
  files: FileReader,
  settingsPath: string,
  places: { readonly home: string } | undefined,
): Promise<DenyRules | 'unreadable' | undefined> {
  const text = await textOrUndefined(files, settingsPath);
  if (text === undefined) return 'unreadable';
  return readDenyRules(text, places);
}

/**
 * The project's own deny rules where no `--settings` named one: the two files `init`/Settings write into, read and
 * merged the way Claude Code applies them both (`block-means-blocked` K1). A file that is absent contributes
 * nothing, as does one that cannot be parsed - a broken settings file here is the same "not a policy" case a readable
 * one with no deny list already is, never a reason to stop `start`/`report`/`check` from running at all.
 */
async function projectDenyRulesMerged(
  files: FileReader,
  projectDirectory: string,
  places: { readonly home: string } | undefined,
): Promise<DenyRules | undefined> {
  const paths = [SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => join(projectDirectory, SETTINGS_FILES.directory, name));
  const texts = await Promise.all(paths.map((path) => textOrUndefined(files, path)));
  const read = texts.flatMap((text) => (text === undefined ? [] : [readDenyRules(text, places)])).flatMap((one) => (one === undefined ? [] : [one]));
  if (read.length === 0) return undefined;
  return {
    patterns: [...new Set(read.flatMap((one) => one.patterns))],
    used: read.reduce((sum, one) => sum + one.used, 0),
    ignored: read.reduce((sum, one) => sum + one.ignored, 0),
  };
}

/**
 * F57: the files a person asked only to be told about, added as private and `tell`. A pattern the rules block stays
 * blocked - both lists naming it is a file kept from the agent, which is the safer of the two - and one the built-in
 * list blocks is told instead, since the built-in list is nobody's choice and the told list is somebody's.
 */
function withTold(policy: Policy, told: readonly string[]): Policy {
  if (told.length === 0) return policy;
  const builtIn = policy.origin.kind === 'default';
  const kept = policy.protected.filter((entry) => !(builtIn && told.includes(entry.pattern)));
  const blocked = new Set(kept.map((entry) => entry.pattern));
  // The told patterns answer first: a file tracked by its name (`**/demo.env`) under a broader blocking pattern
  // (`**/*.env`) is told however its path was written. Appended last, the Read tool's absolute path was answered by
  // the broad pattern and called a key to change, while the same file read by its bare name was told (found by the
  // maintainer, 2026-10-02). A pattern on both lists is still blocked - it is never given a told entry at all.
  return {
    ...policy,
    protected: [...told.filter((pattern) => !blocked.has(pattern)).map((pattern) => ({ pattern, mode: 'tell' as const })), ...kept],
  };
}

/** The words a refused policy is reported in, the same for every command that reads one. */
export function policyRefusal(errors: readonly string[]): string {
  return `${['The policy file was refused, so nothing was analysed:', ...errors.map((error) => `  - ${error}`)].join('\n')}\n`;
}
