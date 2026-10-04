// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Policy } from './policy.ts';

/**
 * The fallback when no policy was configured anywhere.
 *
 * `allowed` is **empty on purpose**. The obvious entries would be `.env.example` and `.env.sample`, and adding
 * them would have the tool decide, on its own, that a file is safe. Teams leave real values in those templates,
 * and spec §8.2 makes the same point from the other side: if the policy covers a sample file, that file stays
 * out of reach too. An exception is a decision someone takes and writes down, never a gift from the default.
 */
export const DEFAULT_POLICY: Policy = {
  level: 'no-read',
  protected: [
    // The name starts with `.env`, or ends with it. Chosen on measurement against a measured session
    // (2026-09-14), not on taste - the wider shapes cost far more than they found:
    //
    //   `.env*`                113 findings · 29 paths · 4 of 5 refused calls recognised
    //   `.env*` + `*.env`      124 findings · 34 paths · 4 of 5      <- this
    //   `*.env` + `*.env.*`    218 findings · 91 paths · 4 of 5
    //   `*.env*`               240 findings · 97 paths · 5 of 5
    //
    // The last catches one more refused call at the price of 116 further findings, most of them a mention of
    // `.environment` in a document. That one call names a file shape none of the narrower patterns knows; it is
    // recorded as an open question in the M3 plan rather than paid for with noise.
    { pattern: '**/.env*' },
    { pattern: '**/*.env' },
    { pattern: '**/.npmrc' },
    { pattern: '**/secrets/**' },
    { pattern: '**/.ssh/**' },
    { pattern: '**/id_rsa*' },
  ],
  allowed: [],
  origin: { kind: 'default' },
};
