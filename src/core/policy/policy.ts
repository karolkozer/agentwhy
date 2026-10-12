// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from './glob.ts';

/**
 * What the policy forbids (spec §6.1). A ban on quoting values is **not** permission to read the file, which is
 * why these are two levels and not one flag.
 */
export type PolicyLevel = 'no-read' | 'no-disclose';

/**
 * What is done about a private file before the agent reaches it (`for-people-who-build-with-ai.md` F57): `block` keeps
 * it from the agent - a deny rule Claude Code applies, and `refuse` for the searches the rule does not see - and `tell`
 * lets the agent read it and says so afterwards. Every reading of a session treats both as private; only what stops a
 * command asks which it is.
 */
export type ProtectionMode = 'block' | 'tell';

export interface ProtectedPath {
  readonly pattern: string;
  /**
   * A level for this entry alone. Read and reported, but nothing acts on it yet: verdicts arrive with the
   * detector. Accepting it now means a policy file written today stays valid when they do.
   */
  readonly level?: PolicyLevel;
  /** Absent: `block`, which is what every rule written before F57 meant. */
  readonly mode?: ProtectionMode;
  /**
   * The entry was written for the whole computer rather than for one project (`2026-10-05-protected-everywhere.md`
   * G4, G15), so an exception a project wrote does not lift it. Absent: a project's own rule, which an exception
   * does lift, as every rule written before G15 did.
   */
  readonly everywhere?: boolean;
  /**
   * `2026-10-09-the-file-not-its-name.md` FN14: the folder the entry holds in alone - a project's, where its rule was
   * written for a file or folder at the project's root (`./notes.md`, `./drafts/**`). It holds that path, from the folder
   * or whole, and no other file of the name; its pattern stays the read form (`**` + `/notes.md`) every page finds the
   * rule by. Absent: the pattern holds wherever it matches, as every rule did before.
   */
  readonly at?: string;
  /**
   * `2026-10-11-the-rules-where-the-file-is.md` RW3, RW4: the folder of another project this entry was read from - a rule
   * that project wrote for its own files, its pattern written whole inside that folder (`heldInProject`). Answered before
   * an exception of this policy, as the computer's is, and lifted only by that project's own (`Policy.allowedIn`, its
   * told entries). Absent: an entry of this policy's own.
   */
  readonly project?: string;
  /**
   * `2026-10-12-a-project-block-holds.md` PB1, GD11: a told entry of the computer's own told list, under a project's own
   * rules - read after them, so a project that blocks the file keeps it blocked, and no exception to them in the view a
   * hook stops commands by. Absent: a project's told entry, or the computer's where only the built-in list is read.
   */
  readonly fromComputer?: true;
}

/** Where the policy came from. The report says this in words, every time, including when it is the default. */
export type PolicyOrigin =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'settings'; readonly path: string; readonly used: number; readonly ignored: number }
  | { readonly kind: 'default' };

export interface Policy {
  readonly level: PolicyLevel;
  readonly protected: readonly ProtectedPath[];
  /** Deliberate exceptions. Empty unless someone wrote them: see `default-policy.ts` for why. */
  readonly allowed: readonly string[];
  readonly origin: PolicyOrigin;
  /**
   * RW4: another project's exceptions, by its folder - its told files once `blockingOnly` has taken them out, and a
   * policy file's `allowed`. Each lifts that project's entries alone, never this policy's.
   */
  readonly allowedIn?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The entry that protects this path, or undefined. An exception wins over every protecting pattern, so a path
 * someone deliberately excluded stays excluded however many rules would otherwise cover it.
 */
export function protectionOf(policy: Policy, path: string): ProtectedPath | undefined {
  // A directory is written both ways - `ls secrets` and `cat secrets/x` - while `**/secrets/**` only matches
  // the form with the separator. Both are tried, so how the command happened to be typed does not decide.
  const forms = path.endsWith('/') ? [path] : [path, `${path}/`];

  // G15: a block written for the whole computer is answered before any exception, so a project may add to what is
  // kept from the agent and never take away from it - a file somebody blocked on this computer stays blocked whether
  // or not a project's tell list or a policy file's `allowed` names it. Only an entry marked `everywhere` is read
  // this way; a project's own rules resolve exceptions first, exactly as they did.
  const computerWide = policy.protected.find((entry) => entry.everywhere === true && forms.some((form) => holds(entry, form)));
  if (computerWide !== undefined) return computerWide;

  // RW4: another project's block is answered next, as the computer's is - this policy's told list was written about its
  // own files, and its `**/note.md` would otherwise let through a `note.md` another project keeps from the agent. That
  // project's own exceptions, and they alone, lift it.
  const stands = (entry: ProtectedPath): boolean => entry.project === undefined || entry.mode === 'tell' || !liftedIn(policy, entry.project, forms);
  const elsewhere = policy.protected.find((entry) => entry.project !== undefined && entry.mode !== 'tell' && forms.some((form) => holds(entry, form)) && stands(entry));
  if (elsewhere !== undefined) return elsewhere;

  if (forms.some((form) => policy.allowed.some((pattern) => matchesGlob(form, pattern)))) return undefined;
  return policy.protected.find((entry) => stands(entry) && forms.some((form) => holds(entry, form)));
}

/** RW4: whether another project's own exceptions - its `allowedIn`, or a told entry of its own - hold the path. */
function liftedIn(policy: Policy, project: string, forms: readonly string[]): boolean {
  const allowed = policy.allowedIn?.[project] ?? [];
  return forms.some((form) => allowed.some((pattern) => matchesGlob(form, pattern))) ||
    policy.protected.some((entry) => entry.project === project && entry.mode === 'tell' && forms.some((form) => holds(entry, form)));
}

/**
 * FN14: whether an entry holds a path. One held in a folder (`at`) holds there alone - by the path from the folder
 * (`notes.md`, `./notes.md`) or by the whole path (`<at>/notes.md`) - never by its pattern anywhere: a rule for the
 * root's `notes.md` had blocked `docs/notes.md` too, and a told one had let a blocked `docs/notes.md` through (FNB26).
 */
export function holds(entry: Pick<ProtectedPath, 'pattern' | 'at'>, path: string): boolean {
  if (entry.at === undefined) return matchesGlob(path, entry.pattern);
  const [fromFolder, whole] = heldGlobs(entry.pattern, entry.at);
  return matchesGlob(path.replace(/^(?:\.\/)+/, ''), fromFolder) || matchesGlob(path, whole);
}

/** FN14: the two globs an entry held in a folder is matched as - the path from the folder, and the whole path. */
export function heldGlobs(pattern: string, at: string): readonly [string, string] {
  const fromFolder = pattern.replace(/^\*\*\//, '');
  return [fromFolder, at.replace(/\/+$/, '') + '/' + fromFolder];
}

export function protects(policy: Policy, path: string): boolean {
  return protectionOf(policy, path) !== undefined;
}

/**
 * The same policy with only what is kept from the agent: what a hook that stops a command may act on (F57). A told
 * pattern becomes one of the allowed, not merely absent: dropped, a broader blocking pattern answered for the file -
 * `demo.env`, told by its name but inside the blocked `.env` wildcard, was still refused - and a file the person said
 * their AI may read was kept from it (found by the maintainer, 2026-10-02).
 */
export function blockingOnly(policy: Policy): Policy {
  // PB1, GD11: the computer's Track, under a project's rules, lifts none of them - a whole path named it, and the
  // project's block of the same file let the command through (the maintainer's data, 2026-10-12).
  const told = policy.protected.filter((entry) => entry.mode === 'tell' && entry.fromComputer !== true);
  // FN14: a told entry held in a folder is an exception there alone, never for every file of its name (FNB26).
  const lifted = (entry: ProtectedPath): readonly string[] => (entry.at === undefined ? [entry.pattern] : heldGlobs(entry.pattern, entry.at));
  // RW4: another project's told file is that project's exception, lifting its own blocks and none of this policy's.
  const allowedIn: Record<string, readonly string[]> = { ...policy.allowedIn };
  for (const entry of told) {
    if (entry.project !== undefined) allowedIn[entry.project] = [...(allowedIn[entry.project] ?? []), ...lifted(entry)];
  }
  return {
    ...policy,
    protected: policy.protected.filter((entry) => entry.mode !== 'tell'),
    allowed: [...policy.allowed, ...told.filter((entry) => entry.project === undefined).flatMap(lifted)],
    ...(Object.keys(allowedIn).length === 0 ? {} : { allowedIn }),
  };
}
