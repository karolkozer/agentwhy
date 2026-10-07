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

/**
 * `2026-10-07-a-file-in-its-place.md` IP1, IP3: how a rule is read where it is matched. Given the home, a rule written
 * for a place is that place - `~/x` the home's `x`, `//x` the absolute `/x` - as Claude Code reads both wherever it works
 * (IPB5, IPB6). Without it - a page listing rules as they were written - every rule is read as before (`toPattern`).
 */
export interface ReadAsPlaces {
  readonly home: string;
}

/**
 * IP5: a page that shows the computer's rules shows a place as the place it names (`~/.ssh/**`), and only a name or a
 * tail anchored as before. Nothing is matched against what this reads.
 */
export type ReadAsWritten = 'as-written';

export function readDenyRules(text: string, places?: ReadAsPlaces | ReadAsWritten): DenyRules | undefined {
  const settings = parseJsonObject(text);
  const permissions = settings?.[DENY_KEYS.permissions];
  const deny = isJsonObject(permissions) ? permissions[DENY_KEYS.deny] : undefined;
  if (!Array.isArray(deny)) return undefined;

  const entries = deny.filter((entry): entry is string => typeof entry === 'string');
  const patterns = entries.flatMap((entry) => {
    const match = FILE_RULE.exec(entry);
    const path = match?.[2];
    return path === undefined ? [] : [places === undefined ? toPattern(path) : places === 'as-written' ? computerForm(path) : placed(path, places.home)];
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

/**
 * A rule's path as the place it names, where it names one (IP1): `~/x` under the home, `//x` at the root. Anything else
 * is anchored as `toPattern` anchors it. A home that is not a POSIX path - Windows, unmeasured (IPB13) - keeps the old
 * reading, so nothing there is narrowed on a guess.
 */
export function placed(path: string, home: string): string {
  if (!home.startsWith('/')) return toPattern(path);
  if (path.startsWith('~/')) return home.replace(/\/+$/, '') + '/' + path.slice(2);
  if (path.startsWith('//')) return path.slice(1);
  return toPattern(path);
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP1: how a path is written for the whole computer. A place keeps its form - `~/x`
 * under the home, `//x` elsewhere, and `/x`, which Claude Code would read against the settings file's own folder (GB4),
 * is written `//x`. A name or a tail is anchored as `toPattern` anchors it: it holds only inside the folder the AI works
 * in (IPB3, IPB4), which the page says where it shows one.
 */
export function computerForm(path: string): string {
  if (path.startsWith('~/') || path.startsWith('//')) return path;
  if (path.startsWith('/')) return '/' + path;
  return toPattern(path);
}

/** Whether a computer rule names a place - its form `~/…` or `//…` - rather than a name anywhere (IP1, IP5). */
export function namesAPlace(pattern: string): boolean {
  return pattern.startsWith('~/') || pattern.startsWith('//');
}

export function policyFromDenyRules(rules: DenyRules, path: string): Policy {
  return {
    level: 'no-read',
    protected: rules.patterns.map((pattern) => ({ pattern })),
    allowed: [],
    origin: { kind: 'settings', path, used: rules.used, ignored: rules.ignored },
  };
}
