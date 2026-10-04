// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Policy } from '../../../core/policy/policy.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';

/**
 * Reads protected paths out of a Claude Code settings file's deny list.
 *
 * The limit is the point of test A7: a deny rule names **a tool and a route**, not a resource. `Read(./.env*)`
 * carries a path and can be read as one; `Bash(cat:*.env*)` is a command pattern and is not a path at all.
 * Pretending to understand the second would hand the reader a policy the tool never applied, so those entries
 * are counted as ignored and the report says how many.
 */
const FILE_RULE = /^(Read|Edit|Write|NotebookEdit)\(([^)]+)\)$/;

/** The path a deny rule names, when the rule is one about files at all. `Bash(cat:*)` names none (test A7). */
export function fileRulePathOf(entry: string): string | undefined {
  return FILE_RULE.exec(entry.trim())?.[2];
}

const DENY_KEYS = { permissions: 'permissions', deny: 'deny' } as const;

export interface DenyRules {
  readonly patterns: readonly string[];
  readonly used: number;
  readonly ignored: number;
}

export function readDenyRules(text: string): DenyRules | undefined {
  const settings = parseJsonObject(text);
  const permissions = settings?.[DENY_KEYS.permissions];
  const deny = isJsonObject(permissions) ? permissions[DENY_KEYS.deny] : undefined;
  if (!Array.isArray(deny)) return undefined;

  const entries = deny.filter((entry): entry is string => typeof entry === 'string');
  const patterns = entries.flatMap((entry) => {
    const match = FILE_RULE.exec(entry);
    const path = match?.[2];
    return path === undefined ? [] : [toPattern(path)];
  });

  return { patterns: [...new Set(patterns)], used: patterns.length, ignored: deny.length - patterns.length };
}

/**
 * A deny rule is written relative to a project or a home directory, while a transcript records the path the
 * tool was given, often absolute. Anchoring at any depth keeps the two comparable. It **broadens** the match,
 * which errs toward reporting a call rather than passing over it - the safe direction here.
 */
export function toPattern(path: string): string {
  const relative = path.replace(/^\.\//, '').replace(/^~\//, '');
  return relative.startsWith('**/') || relative.startsWith('/') ? relative : `**/${relative}`;
}

export function policyFromDenyRules(rules: DenyRules, path: string): Policy {
  return {
    level: 'no-read',
    protected: rules.patterns.map((pattern) => ({ pattern })),
    allowed: [],
    origin: { kind: 'settings', path, used: rules.used, ignored: rules.ignored },
  };
}
