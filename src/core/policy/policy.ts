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
  const computerWide = policy.protected.find((entry) => entry.everywhere === true && forms.some((form) => matchesGlob(form, entry.pattern)));
  if (computerWide !== undefined) return computerWide;

  if (forms.some((form) => policy.allowed.some((pattern) => matchesGlob(form, pattern)))) return undefined;
  return policy.protected.find((entry) => forms.some((form) => matchesGlob(form, entry.pattern)));
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
  const told = policy.protected.filter((entry) => entry.mode === 'tell');
  return {
    ...policy,
    protected: policy.protected.filter((entry) => entry.mode !== 'tell'),
    allowed: [...policy.allowed, ...told.map((entry) => entry.pattern)],
  };
}
