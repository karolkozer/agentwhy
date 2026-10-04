// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from '../core/policy/glob.ts';

/**
 * What the built-in rules are called in words (`for-people-who-build-with-ai.md` F33), and which of them a path falls
 * under. A file is named by the rule that matched it - a fact - and never by its own name, which would be a guess (F3).
 */
export type RuleName = 'env' | 'npmrc' | 'secrets' | 'ssh';

/** F33's table: the built-in patterns, grouped the way a person thinks of them. */
export const RULE_NAMES: readonly { readonly name: RuleName; readonly patterns: readonly string[] }[] = [
  { name: 'env', patterns: ['**/.env*', '**/*.env'] },
  { name: 'npmrc', patterns: ['**/.npmrc'] },
  { name: 'secrets', patterns: ['**/secrets/**'] },
  { name: 'ssh', patterns: ['**/.ssh/**', '**/id_rsa*'] },
];

/**
 * The name of the first built-in rule that matches `path` among the `patterns` in force, or `undefined`. Only a
 * pattern that is in force names a file: a path the run did not protect under `**\/.env*` is not called a passwords
 * file because the built-in list would have.
 */
export function ruleNameOf(path: string, patterns: readonly string[]): RuleName | undefined {
  for (const group of RULE_NAMES) {
    if (group.patterns.some((pattern) => patterns.includes(pattern) && matchesGlob(path, pattern))) return group.name;
  }
  return undefined;
}
