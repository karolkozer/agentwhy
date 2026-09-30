import { policyFromDenyRules, readDenyRules } from '../adapter/claude-code/policy/deny-rules.ts';
import { parsePolicy } from '../core/policy/parse-policy.ts';
import type { Policy } from '../core/policy/policy.ts';
import { readTellLists, tellPatterns, type TellListPaths } from './private-files/tell-lists.ts';
import { resolvePolicy } from '../core/policy/resolve-policy.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';

export interface PolicyChoice {
  /** An explicit policy file. Nothing is discovered by magic: a security policy is chosen, not found. */
  readonly policyPath?: string;
  /** A settings file whose deny rules stand in for a policy when no policy file was given. */
  readonly settingsPath?: string;
}

/**
 * Which policy a session is read under: the policy file, else the settings file's deny rules, else the built-in
 * default. `report` and `watch` both ask this, so an alert and the report it points to cannot be read under different
 * rules (`specs/2026-09-16-when-an-agent-finishes.md` R10). A file that was named and cannot be read refuses the run
 * rather than falling back to rules nobody chose.
 */
export async function choosePolicy(
  choice: PolicyChoice,
  files: FileReader,
  tell?: TellListPaths,
): Promise<{ readonly policy: Policy } | { readonly errors: readonly string[] }> {
  const file = choice.policyPath;
  if (file !== undefined) {
    const text = await readOrUndefined(file, files);
    if (text === undefined) return { errors: [`${file} could not be read`] };
    // A policy file is the whole of what was chosen: nothing is added to it.
    return resolvePolicy({ file: parsePolicy(text, file) });
  }

  const settingsPath = choice.settingsPath;
  const text = settingsPath === undefined ? undefined : await readOrUndefined(settingsPath, files);
  if (settingsPath !== undefined && text === undefined) return { errors: [`${settingsPath} could not be read`] };
  const rules = text === undefined ? undefined : readDenyRules(text);
  // A settings file with no deny list is not a policy; it falls through to the default, which says so.
  const resolved = resolvePolicy(rules === undefined || settingsPath === undefined ? {} : { settings: policyFromDenyRules(rules, settingsPath) });
  if ('errors' in resolved || tell === undefined) return resolved;
  return { policy: withTold(resolved.policy, tellPatterns(await readTellLists(files, tell.pathsFor(settingsPath)))) };
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
  return {
    ...policy,
    protected: [...kept, ...told.filter((pattern) => !blocked.has(pattern)).map((pattern) => ({ pattern, mode: 'tell' as const }))],
  };
}

/** The words a refused policy is reported in, the same for every command that reads one. */
export function policyRefusal(errors: readonly string[]): string {
  return `${['The policy file was refused, so nothing was analysed:', ...errors.map((error) => `  - ${error}`)].join('\n')}\n`;
}

async function readOrUndefined(path: string, files: FileReader): Promise<string | undefined> {
  try {
    return await files.readText(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return undefined;
  }
}
