// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_POLICY } from './default-policy.js';
/**
 * Chooses the policy: an explicit file, else the environment's own deny rules, else the built-in default.
 *
 * **A policy file that cannot be read is an error, never a fallback.** Falling back would run the whole analysis
 * under rules nobody chose while the header claimed a policy was in force - the failure mode this tool exists to
 * describe, in its own output. Absence is a different thing from breakage: absence falls through, breakage stops.
 */
export function resolvePolicy(candidates) {
    const { file, settings } = candidates;
    if (file !== undefined)
        return 'errors' in file ? { errors: file.errors } : { policy: file.policy };
    if (settings !== undefined)
        return { policy: settings };
    return { policy: DEFAULT_POLICY };
}
