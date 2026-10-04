// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Class A of spec §5.4: formats recognisable with a practically zero false-positive rate. `certain`, so they
 * redact **and** justify a finding.
 *
 * Classes B (a sensitive name beside a value) and C (entropy) are not here yet. What that means in practice is
 * written down in `redactor.ts`: an arbitrary in-house secret is caught because of **where it came from**, not
 * because of how it looks, which is the argument of §5.4 in the first place.
 */
export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

// v1: class A alone, with content from a protected resource redacted wholesale.
// v2 (2026-09-14): classes B and C, with the exclusion lists of §5.4 that make them usable at all.
export const RULESET_VERSION = 2;

export const CLASS_A: readonly SecretPattern[] = [
  { name: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{32,}/g },
  { name: 'openai-key', pattern: /sk-(?:proj-)?[A-Za-z0-9]{20,}/g },
  { name: 'github-token', pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'gitlab-token', pattern: /glpat-[A-Za-z0-9_-]{10,}/g },
  { name: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}/g },
  { name: 'aws-access-key-id', pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/g },
  { name: 'google-key', pattern: /AIza[A-Za-z0-9_-]{35}|ya29\.[A-Za-z0-9_-]{10,}/g },
  { name: 'stripe-key', pattern: /(?:sk|rk)_live_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}/g },
  { name: 'supabase-key', pattern: /sbp_[A-Za-z0-9]{10,}/g },
  { name: 'npm-token', pattern: /npm_[A-Za-z0-9]{36}/g },
  { name: 'digitalocean-token', pattern: /do[op]_v1_[a-f0-9]{30,}/g },
  { name: 'sendgrid-key', pattern: /SG\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g },
  { name: 'private-key', pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g },
  // Three base64url segments, the first of which starts a JSON object: `SUPABASE_SERVICE_ROLE_KEY` is one.
  { name: 'jwt', pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g },
  // The GitHub token that sat in git history since 2024 was an `.npmrc` auth token.
  { name: 'npmrc-auth-token', pattern: /(:_authToken=)\S+/g },
];
