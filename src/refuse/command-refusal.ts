// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join } from 'node:path';
import { parsePreToolUseInput } from '../adapter/claude-code/hooks/pre-tool-use-input.ts';
import { refuseProjectAbove, refuseRulesOf } from '../adapter/claude-code/settings/refuse-project.ts';
import { parseCodexPreToolUseInput } from '../adapter/codex/hooks/pre-tool-use-input.ts';
import { protectedPathsInCommand } from '../core/access/protected-access.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { TextInput } from '../ports/text-input.ts';
import { choosePolicy, type PolicyChoice } from '../report/choose-policy.ts';
import type { TellListPaths } from '../report/private-files/tell-lists.ts';
import { blockingOnly } from '../core/policy/policy.ts';
import { protectedFileReached } from './command-reach.ts';

/** A command line is a few kilobytes; past this the input is not held at all, and the command is not checked. */
const MAX_INPUT_BYTES = 1024 * 1024;

/** Why a command was not checked. Each is said to the user, and the command runs (R20). */
export type RefusalNotChecked = 'input' | 'policy' | 'search' | 'project';

/** A policy choice, and whose hook input this is (`codex-blocks-too` CK3). */
export type RefusalOptions = PolicyChoice & {
  /** The input is Codex's, and a relative `settingsPath` is read in the project found from the input's folder. */
  readonly codex?: boolean;
};

/**
 * How the command reaches the protected file: by naming it (R18), through a word the shell expands into its name, or
 * through a recursive search that would open it (R21a).
 */
export type RefusalRoute = { readonly kind: 'named' } | { readonly kind: 'glob'; readonly word: string } | { readonly kind: 'search' };

export type RefusalDecision =
  | { readonly kind: 'allow' }
  | { readonly kind: 'refuse'; readonly path: string; readonly pattern: string; readonly others: number; readonly route: RefusalRoute }
  | { readonly kind: 'not-checked'; readonly reason: RefusalNotChecked };

export interface RefusalUseCase {
  decide(options: RefusalOptions): Promise<RefusalDecision>;
}

export interface CommandRefusalDependencies {
  readonly input: TextInput;
  readonly files: FileReader;
  readonly directories: DirectoryReader;
  /** Where the command runs when the hook input does not say. */
  readonly workingDirectory: string;
  /** The home directory the shell puts in place of `~` and `$HOME` in the command. */
  readonly home: string;
  /** The lists of files a person asked only to be told about (F57), read with the policy wherever it is chosen. */
  readonly tell?: TellListPaths;
}

/**
 * `agentwhy refuse`: the project's own rules, applied to a shell command line before it runs
 * (`specs/2026-09-16-worth-running-every-day.md` R18-R21a). It adds no rule of its own - the policy is chosen as `report`
 * chooses it - and it reads the line with the code a report uses. A command that names a protected path is refused;
 * so is one that would open a protected file without naming it, through a glob or a recursive search. The usage says
 * what still walks past it.
 */
export class CommandRefusal implements RefusalUseCase {
  readonly #dependencies: CommandRefusalDependencies;

  constructor(dependencies: CommandRefusalDependencies) {
    this.#dependencies = dependencies;
  }

  async decide(options: RefusalOptions): Promise<RefusalDecision> {
    const { codex = false, ...choice } = options;
    const text = await this.#dependencies.input.readAll(MAX_INPUT_BYTES);
    const parsed = text === undefined ? undefined : codex ? parseCodexPreToolUseInput(text) : parsePreToolUseInput(text);
    if (parsed === undefined || 'unusable' in parsed) return { kind: 'not-checked', reason: 'input' };
    if ('anotherTool' in parsed) return { kind: 'allow' };

    const settled = codex ? await this.#inCodexProject(choice, parsed.cwd ?? this.#dependencies.workingDirectory) : choice;
    // AO6: the computer-wide check runs in every Codex session; where no project above runs `refuse`, there are no
    // rules anybody chose here, and the command runs with no message.
    if (settled === 'no-project') return { kind: 'allow' };
    if (settled === undefined) return { kind: 'not-checked', reason: 'project' };
    const chosen = await choosePolicy(settled, this.#dependencies.files, this.#dependencies.tell);
    if ('errors' in chosen) return { kind: 'not-checked', reason: 'policy' };
    // F57: a file a person asked only to be told about is theirs to let the agent read. Only what is blocked is refused.
    const policy = { policy: blockingOnly(chosen.policy) };

    const [first, ...others] = protectedPathsInCommand(parsed.command, policy.policy);
    if (first !== undefined) return { kind: 'refuse', path: first[0], pattern: first[1], others: others.length, route: { kind: 'named' } };

    const workingDirectory = parsed.cwd ?? this.#dependencies.workingDirectory;
    // R20 holds for the walk too: whatever it meets on disk, a failure lets the command run and is said to the user,
    // never an exception from a hook that runs before every shell command.
    const place = { workingDirectory, home: this.#dependencies.home };
    const reach = await protectedFileReached(parsed.command, policy.policy, place, this.#dependencies.directories).catch(
      () => ({ kind: 'too-large' }) as const,
    );
    if (reach === undefined) return { kind: 'allow' };
    if (reach.kind === 'too-large') return { kind: 'not-checked', reason: 'search' };
    const route: RefusalRoute = reach.kind === 'glob' ? { kind: 'glob', word: reach.word } : { kind: 'search' };
    return { kind: 'refuse', path: reach.path, pattern: reach.pattern, others: 0, route };
  }

  /**
   * CK3, AO5, AO6: Codex runs its check in the session's folder, which can lie below the project, and names the
   * project nowhere (CKB6). The project is the nearest folder at or above `folder`, short of the home directory, whose
   * Claude Code settings run `refuse`. With no flag of its own, the check reads the rules that project's `refuse`
   * names, and with no project found it is `'no-project'`: the command runs, silently. A relative `--settings`, as an
   * older project-level entry wrote it, resolves against the same project; none found is `undefined`, and the command
   * runs said to be unchecked (R20). An absolute path or a policy file is read as given.
   */
  async #inCodexProject(choice: PolicyChoice, folder: string): Promise<PolicyChoice | 'no-project' | undefined> {
    const relative = choice.settingsPath;
    if (choice.policyPath !== undefined || (relative !== undefined && isAbsolute(relative))) return choice;
    const found = await refuseProjectAbove(this.#dependencies.files, folder, this.#dependencies.home);
    if (relative !== undefined) return found === undefined ? undefined : { ...choice, settingsPath: join(found.project, relative) };
    return found === undefined ? 'no-project' : refuseRulesOf(found);
  }
}
