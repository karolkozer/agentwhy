import { isAbsolute, join, dirname } from 'node:path';
import { parsePreToolUseInput } from '../adapter/claude-code/hooks/pre-tool-use-input.ts';
import { PROJECT_HOOKS } from '../adapter/codex/contract/hooks.ts';
import { parseCodexPreToolUseInput } from '../adapter/codex/hooks/pre-tool-use-input.ts';
import { protectedPathsInCommand } from '../core/access/protected-access.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { TextInput } from '../ports/text-input.ts';
import { choosePolicy, type PolicyChoice } from '../report/choose-policy.ts';
import type { TellListPaths } from '../report/private-files/tell-lists.ts';
import { blockingOnly } from '../core/policy/policy.ts';
import { protectedFileReached } from './command-reach.ts';

/** How many folders above the session's the project is looked for in: deeper than any project, short of a loop. */
const MAX_PROJECT_DEPTH = 64;

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
   * CK3: Codex runs its hook in the session's folder, which can lie below the project, and names the project nowhere
   * (CKB6). A relative settings path is read in the project: the nearest folder, at or above `folder`, that holds the
   * `.codex/hooks.json` this hook is written in. None found is `undefined`: the command runs, and is said to be unchecked.
   */
  async #inCodexProject(choice: PolicyChoice, folder: string): Promise<PolicyChoice | undefined> {
    const relative = choice.settingsPath;
    if (relative === undefined || isAbsolute(relative)) return choice;
    for (let at = folder, depth = 0; depth < MAX_PROJECT_DEPTH; depth += 1) {
      if (await this.#holds(join(at, PROJECT_HOOKS.directory, PROJECT_HOOKS.file))) return { ...choice, settingsPath: join(at, relative) };
      const up = dirname(at);
      if (up === at) return undefined;
      at = up;
    }
    return undefined;
  }

  /** Whether a file is there to read; a folder or anything unreadable is not. */
  async #holds(path: string): Promise<boolean> {
    try {
      await this.#dependencies.files.readText(path);
      return true;
    } catch (error) {
      if (error instanceof FileAccessError) return false;
      throw error;
    }
  }
}
