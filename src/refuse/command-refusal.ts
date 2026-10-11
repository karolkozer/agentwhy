// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join, relative } from 'node:path';
import { parsePreToolUseInput } from '../adapter/claude-code/hooks/pre-tool-use-input.ts';
import { refuseProjectAbove, refuseRulesOf } from '../adapter/claude-code/settings/refuse-project.ts';
import { parseCodexPreToolUseInput } from '../adapter/codex/hooks/pre-tool-use-input.ts';
import { protectedPathsInCommand } from '../core/access/protected-access.ts';
import type { DirectoryReader } from '../ports/directory-reader.ts';
import type { FileReader } from '../ports/file-reader.ts';
import type { TextInput } from '../ports/text-input.ts';
import { choosePolicy, type PolicyChoice } from '../report/choose-policy.ts';
import { computerWide, readComputerPolicy } from '../report/computer-policy.ts';
import type { TellListPaths } from '../report/private-files/tell-lists.ts';
import { blockingOnly, heldGlobs, type Policy } from '../core/policy/policy.ts';
import type { ShellPlace } from '../core/access/shell-place.ts';
import { protectedFileFound, protectedFileReached } from './command-reach.ts';

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
export type RefusalRoute =
  | { readonly kind: 'named' }
  | { readonly kind: 'byName' }
  | { readonly kind: 'glob'; readonly word: string }
  | { readonly kind: 'search' }
  /** `2026-10-11-a-folder-found-while-it-runs.md` FW1: through `word`, a folder the line finds while it runs. */
  | { readonly kind: 'found'; readonly word: string };

export type RefusalDecision =
  | { readonly kind: 'allow' }
  | {
      readonly kind: 'refuse';
      readonly path: string;
      readonly pattern: string;
      readonly others: number;
      readonly route: RefusalRoute;
      /** The pattern was written for the whole computer, not this project (G16): the reason says so in its own words. */
      readonly everywhere: boolean;
    }
  | { readonly kind: 'not-checked'; readonly reason: RefusalNotChecked };

/**
 * What one run has to go on: the rules it could read, and - apart from them - a source it could not. The two are
 * separate because a source that failed may not answer for the ones that did: an unreadable file in the home
 * directory had been standing in for a project whose own rules were readable and did refuse (the second review).
 */
interface PolicyToApply {
  /** Absent where no rule anybody chose applies here, which is what lets a command run with no message (AO6). */
  readonly policy?: Policy;
  /** Said only once nothing in `policy` refused the command (R20). */
  readonly unchecked?: RefusalNotChecked;
}

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
    const toApply = await this.#policy(settled);

    // AO6, widened by `2026-10-05-protected-everywhere.md` G4: the computer-wide check runs in every Codex session;
    // where no project above runs `refuse` and no global policy was written either, there are no rules anybody chose
    // here, and the command runs with no message. A global policy, once one exists, is not "nothing chosen".
    if (toApply.policy !== undefined) {
      // F57: a file a person asked only to be told about is theirs to let the agent read. Only what is blocked is refused.
      const policy = blockingOnly(toApply.policy);

      // G16: which policy stopped the command is read off the entry that matched. Where a project and the computer
      // name the same pattern, both entries are there and `protectionOf` answers with the computer's (G15) - which is
      // also the one a person has to change, since taking the project's out would not unblock the file.
      const wroteIt = (pattern: string): boolean =>
        policy.protected.some((entry) => entry.pattern === pattern && entry.everywhere === true);

      const workingDirectory = parsed.cwd ?? this.#dependencies.workingDirectory;
      const place = { workingDirectory, home: this.#dependencies.home };
      // FW4: a rule is named as it protects - `note.md`, never `**/note.md` for the one file it holds.
      const shown = (pattern: string): string => shownRule(policy, pattern, place);
      // `2026-10-07-a-file-in-its-place.md` IP3: a path is read where the command runs as well as as written, so a rule
      // naming a place meets `cat sub/x`, `cd sub && cat x` and `cat ../app/x` (IPB7).
      const [first, ...others] = protectedPathsInCommand(parsed.command, policy, place);
      if (first !== undefined) {
        // FND9: met only by its name, in a folder the line does not let this follow - the refusal says which file is
        // protected, so the agent does not take it for the file it wanted.
        return { kind: 'refuse', path: first[0], pattern: shown(first[1]), others: others.length, route: { kind: first[2] === true ? 'byName' : 'named' }, everywhere: wroteIt(first[1]) };
      }

      // R20 holds for the walk too: whatever it meets on disk, a failure lets the command run and is said to the user,
      // never an exception from a hook that runs before every shell command.
      const reach = await protectedFileReached(parsed.command, policy, place, this.#dependencies.directories).catch(
        () => ({ kind: 'too-large' }) as const,
      );
      if (reach?.kind === 'too-large') return { kind: 'not-checked', reason: 'search' };
      if (reach !== undefined) {
        const route: RefusalRoute = reach.kind === 'glob' ? { kind: 'glob', word: reach.word } : { kind: 'search' };
        return { kind: 'refuse', path: reach.path, pattern: shown(reach.pattern), others: 0, route, everywhere: wroteIt(reach.pattern) };
      }

      // `2026-10-11-a-folder-found-while-it-runs.md` FW1-FW3: a folder the line finds while it runs is any place under it.
      const found = await protectedFileFound(parsed.command, policy, place, this.#dependencies.directories).catch(
        () => ({ kind: 'too-large' }) as const,
      );
      if (found?.kind === 'too-large') return { kind: 'not-checked', reason: 'search' };
      if (found !== undefined) {
        return { kind: 'refuse', path: found.path, pattern: shown(found.pattern), others: 0, route: { kind: 'found', word: found.word }, everywhere: wroteIt(found.pattern) };
      }
    }

    // Nothing the rules in hand refuse. A source that could not be read is said now, and never instead of a refusal:
    // found by the second review, where an unreadable file in the home directory answered for a project whose own
    // rules were readable and did refuse, so `cat .env` ran (R20 lets a command run; it does not let one through).
    return toApply.unchecked === undefined ? { kind: 'allow' } : { kind: 'not-checked', reason: toApply.unchecked };
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

  /**
   * `2026-10-05-protected-everywhere.md` G4: a global policy, written once in `~/.claude/settings.json` and outside
   * every project, is unioned into whatever a project chose, and stands alone where the computer-wide Codex hook
   * finds no project at all. Where nobody has written a global policy, this hands back exactly what `choosePolicy`
   * already decided - reading no such file is no behaviour change for anyone who has not set one up.
   *
   * Every branch answers with the rules it *does* have and, apart, the one it could not read: a source that failed
   * narrows what this run can say, and never what it enforces.
   */
  async #policy(settled: PolicyChoice | 'no-project' | undefined): Promise<PolicyToApply> {
    const read = await readComputerPolicy(this.#dependencies.files, this.#dependencies.home);
    // A global file that is there and cannot be read is a policy nobody can apply, and is said so (R20) - but only
    // once the rules that *could* be read have had their say. It never stands in for them.
    const unreadable = read === 'unreadable' ? ({ unchecked: 'policy' } as const) : undefined;
    const global = read === 'unreadable' ? undefined : read;
    const everywhere = global === undefined ? undefined : computerWide(global);

    // CK3 with R20: a relative `--settings` names rules only inside a project, and no project was found. That is a
    // rule nobody can read, said as such - and the computer-wide policy, which needs no project, still applies.
    // Found by the second review: this returned before the global policy was consulted at all, which left GB8's own
    // hole open in the one hook form that carries a relative path.
    if (settled === undefined) return { ...(everywhere === undefined ? {} : { policy: everywhere }), unchecked: 'project' };
    if (settled === 'no-project') return { ...(everywhere === undefined ? {} : { policy: everywhere }), ...unreadable };

    // `choosePolicy` adds the computer's rules to what it chose (G6), as this did itself until both read them alike.
    const chosen = await choosePolicy(settled, this.#dependencies.files, this.#dependencies.tell, this.#dependencies.home);
    // A policy the run was pointed at and cannot read stops that policy, not the other one.
    if ('errors' in chosen) return { ...(everywhere === undefined ? {} : { policy: everywhere }), unchecked: 'policy' };
    return { policy: chosen.policy, ...unreadable };
  }
}

/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW4: a rule as a person finds it - one written for one place (`at`) by the
 * file or folder it holds, from where the line runs, home-relative outside it; `**\/note.md` read as every `note.md`, and
 * the agent said so while `docs/note.md` was not protected. A pattern held everywhere is kept as written.
 */
function shownRule(policy: Policy, pattern: string, place: ShellPlace): string {
  // One entry a pattern: a rule written for every place and one for this folder alike are merged where the policy is read.
  const held = policy.protected.find((entry) => entry.pattern === pattern);
  if (held?.at === undefined) return pattern;
  const [fromFolder, whole] = heldGlobs(pattern, held.at);
  const inside = relative(place.workingDirectory, whole);
  if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) return inside;
  const home = place.home;
  return home !== undefined && whole.startsWith(`${home}/`) ? `~/${whole.slice(home.length + 1)}` : whole === '' ? fromFolder : whole;
}
