// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_POLICY } from './default-policy.ts';
import type { PolicyDocument } from './parse-policy.ts';
import type { Policy } from './policy.ts';

export interface PolicyCandidates {
  /** The document named by the caller, parsed. Its errors stop the run - see below. */
  readonly file?: PolicyDocument;
  /** What a settings file of the environment declared, when one could be read. */
  readonly settings?: Policy;
}

export type ResolvedPolicy = { readonly policy: Policy } | { readonly errors: readonly string[] };

/**
 * Chooses the policy: an explicit file, else the environment's own deny rules, else the built-in default.
 *
 * **A policy file that cannot be read is an error, never a fallback.** Falling back would run the whole analysis
 * under rules nobody chose while the header claimed a policy was in force - the failure mode this tool exists to
 * describe, in its own output. Absence is a different thing from breakage: absence falls through, breakage stops.
 */
export function resolvePolicy(candidates: PolicyCandidates): ResolvedPolicy {
  const { file, settings } = candidates;

  if (file !== undefined) return 'errors' in file ? { errors: file.errors } : { policy: file.policy };
  if (settings !== undefined) return { policy: settings };
  return { policy: DEFAULT_POLICY };
}
