// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { policyFromDenyRules, readDenyRules } from '../adapter/claude-code/policy/deny-rules.ts';
import type { Policy } from '../core/policy/policy.ts';
import { FileAccessError } from '../ports/file-access-error.ts';
import type { FileReader } from '../ports/file-reader.ts';

/**
 * The person's own, computer-wide rules (`2026-10-05-protected-everywhere.md` G4): `~/.claude/settings.json`'s deny
 * rules, which Claude Code reads in every project (GB10) and `refuse` enforces in every project and in none. Read the
 * same way a project's are, a rule written for a place being that place (IP1, IPD3).
 *
 * `undefined` where there is nothing to apply - the file is absent, holds no deny list, or names no file - and
 * `'unreadable'` where it is there and could not be read. The two are told apart on purpose: absence is the state every
 * computer is in before a global policy is written, while an unreadable one is a failure a person can fix.
 */
export async function readComputerPolicy(files: FileReader, home: string): Promise<Policy | undefined | 'unreadable'> {
  const path = join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared);
  let text: string;
  try {
    text = await files.readText(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return error.failure === 'not-found' ? undefined : 'unreadable';
  }
  const rules = readDenyRules(text, { home });
  return rules === undefined || rules.used === 0 ? undefined : policyFromDenyRules(rules, path);
}

/**
 * The chosen policy's own patterns first, then every computer-wide one - additive, never a removal (G4).
 *
 * A pattern the project already names is **not** a reason to leave the computer's entry out: a project that named the
 * same path on its tell list, or blocked it and then excepted it, would otherwise suppress the computer's entry while
 * `blockingOnly` moved its own into `allowed`, and the file the whole computer blocks was read (G15). Both are kept,
 * and `protectionOf` answers with the computer's first.
 */
export function withComputer(policy: Policy, computer: Policy): Policy {
  return { ...policy, protected: [...policy.protected, ...computerWide(computer).protected] };
}

/** Every pattern of a policy marked as written for the whole computer (G15), so no exception can lift it. */
export function computerWide(policy: Policy): Policy {
  return { ...policy, protected: policy.protected.map((entry) => ({ ...entry, everywhere: true })) };
}
