// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SetupOutcome } from '../../../setup/project-setup.ts';

/**
 * One change a person made in the Settings view of the served page (`worth-running-every-day` R57). Each mirrors
 * the flags `init` already takes, because R58 asks for exactly the `SetupOptions` those flags would build:
 * `hooks` names the hooks to install (`--watch`/`--refuse`) or, with `on` false, to take out (`--remove --watch`),
 * and `protect`/`unprotect` name one pattern each, the way `--protect` and `--unprotect` do.
 *
 * R57 first wrote the hooks change as the whole set the confirm step showed. A set cannot be written through
 * `init`: its flags install what they name and `--remove` takes out what it names, and neither can be asked to
 * make the file hold one exact set. Naming the hooks and the direction is that same intent in the shape the
 * command line already has, and it is what R58 asks for.
 */
export type SettingsChange =
  | { readonly change: 'hooks'; readonly hooks: readonly ('watch' | 'refuse')[]; readonly on: boolean; readonly where?: SettingsFile }
  | { readonly change: 'protect' | 'unprotect'; readonly pattern: string; readonly where?: SettingsFile }
  /** Changing a pattern is the two flags in order, because `init` has no flag that rewrites a rule in place. */
  | { readonly change: 'edit'; readonly from: string; readonly pattern: string; readonly where?: SettingsFile }
  /**
   * The same rule, in the other file: what `init` asks at a terminal as "Who is this for?". It is the two runs
   * the change of a pattern already is, because nothing removes a deny rule except `--remove --unprotect`. A hook
   * needs none of this: installing one where it is not takes it out of where it was (R4g), so moving a hook is a
   * `hooks` change naming the file it is to run from.
   */
  | { readonly change: 'move'; readonly pattern: string; readonly from: SettingsFile; readonly where: SettingsFile }
  /**
   * The built-in list, written into the project as deny rules of its own. It is the one thing a person can do
   * about a list nobody wrote for them: a rule that is in no file cannot be taken out of one, and saying so is an
   * explanation rather than a way forward. Written, every pattern becomes theirs to change, to take out, or to
   * hand to everyone who clones.
   */
  | { readonly change: 'adopt'; readonly patterns: readonly string[]; readonly where: SettingsFile }
  /**
   * General (`for-people-who-build-with-ai.md` F56): everything agentwhy wrote into the project, into one of its two
   * files - the rules the page names, moved one by one as `move` moves one, then the hooks named, which installing
   * where they are not takes out of where they were (R4g). The page names both, as it names the patterns of `adopt`.
   */
  | { readonly change: 'scope'; readonly patterns: readonly string[]; readonly hooks: readonly ('watch' | 'refuse')[]; readonly where: SettingsFile }
  /**
   * General's **Uninstall** (`for-people-who-build-with-ai.md` F59): `init --remove` for each file named, taking out both
   * hooks and the whole rules agentwhy wrote there. The page names the rules per file, as `scope` names its patterns; a
   * rule written by hand is not one of them, and stays. `codex`, the window's unticked choice
   * (`codex-approves-its-own-hook` AO17): take agentwhy's check and its approvals out of the person's `~/.codex` too,
   * which one project's uninstall otherwise leaves for the others (AOD4).
   */
  | { readonly change: 'uninstall'; readonly rules: Readonly<Partial<Record<SettingsFile, readonly string[]>>>; readonly codex?: boolean }
  /**
   * F57: a private file blocked, told, or - `none` - taken off a told list. Going to `tell` takes out the deny rules the
   * page names, as the files write them, and puts the patterns on the told list of `where`; going to `block` takes the
   * patterns off both lists and protects them as an add does, with search protection. The page names all of it.
   */
  | { readonly change: 'mode'; readonly to: 'block' | 'tell' | 'none'; readonly patterns: readonly string[]; readonly rules: readonly string[]; readonly where: SettingsFile }
  /**
   * The update notice's **Update** (`nothing-updates-by-itself.md` U7): `init --update`, which pins every hook running
   * an older release to the one serving the page. It names nothing, since the setup reads both files and the version.
   */
  | { readonly change: 'update' }
  /** `codex-blocks-too` CK5: `init --codex`, Codex's hook written to match the block Claude Code runs. It names nothing. */
  | { readonly change: 'codex' };

/**
 * Which of the project's two settings files the change is to, as `--shared` names the second one. A rule is
 * changed in the file that holds it: a page that sent every change to the local file would answer "stop
 * protecting this" by writing a rule into a second file, leaving the first one denying it still.
 */
export type SettingsFile = 'local' | 'shared';

/** What `ProjectSetup` made of it, said in its own words (R59): the page shows the reason, and nothing is invented. */
export interface SettingsAnswer {
  readonly outcome: SetupOutcome;
  readonly output: string;
}
