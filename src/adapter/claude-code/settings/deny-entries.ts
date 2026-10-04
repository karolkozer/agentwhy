// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { fileRulePathOf } from '../policy/deny-rules.ts';
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { PERMISSIONS } from '../contract/settings.ts';

/**
 * The tools a path is denied for. `Read` and `Edit` are what a deny rule can name about a file and what this project
 * already reads back as a policy; `Bash(...)` is a command pattern, not a path, and `init` writes none (test A7).
 */
const TOOLS = ['Read', 'Edit'] as const;

/** The deny entries a pattern becomes, in the order they are written. */
export function denyEntriesFor(pattern: string): string[] {
  return TOOLS.map((tool) => `${tool}(${pattern})`);
}

/** Every deny entry a settings object holds, in the order written; empty when it holds no deny list. */
export function denyEntriesIn(settings: JsonObject): string[] {
  const permissions = settings[PERMISSIONS.permissions];
  const deny = isJsonObject(permissions) ? permissions[PERMISSIONS.deny] : undefined;
  return Array.isArray(deny) ? deny.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Of those, the ones that name a file - what a hook reads as a policy, and what R4d copies. */
export function fileRulesIn(settings: JsonObject): string[] {
  return denyEntriesIn(settings).filter((entry) => fileRulePathOf(entry) !== undefined);
}

/**
 * The settings with these deny entries added, in order, skipping any that is already there
 * (`specs/2026-09-16-worth-running-every-day.md` R4c). Every other key, and every rule someone else wrote, stays as it
 * was: `init` adds, and never edits or removes a rule of its own accord.
 */
export function withDenyEntries(settings: JsonObject, entries: readonly string[]): JsonObject {
  const held = new Set(denyEntriesIn(settings));
  // Deduplicated against what is there and within what is being added: a rule written twice reads as two rules.
  const added = [...new Set(entries)].filter((entry) => !held.has(entry));
  if (added.length === 0) return settings;

  const permissions = isJsonObject(settings[PERMISSIONS.permissions]) ? { ...(settings[PERMISSIONS.permissions] as JsonObject) } : {};
  return {
    ...settings,
    [PERMISSIONS.permissions]: { ...permissions, [PERMISSIONS.deny]: [...denyEntriesIn(settings), ...added] },
  };
}

/**
 * The settings without these deny entries (`specs/2026-09-16-worth-running-every-day.md` R26): an empty deny list is
 * dropped, and `permissions` left with nothing in it is dropped too, so undoing leaves the file as it was found.
 */
export function withoutDenyEntries(settings: JsonObject, entries: readonly string[]): { readonly settings: JsonObject; readonly removed: number } {
  const taking = new Set(entries);
  const held = denyEntriesIn(settings);
  const kept = held.filter((entry) => !taking.has(entry));
  if (kept.length === held.length) return { settings, removed: 0 };

  const permissions = isJsonObject(settings[PERMISSIONS.permissions]) ? { ...(settings[PERMISSIONS.permissions] as JsonObject) } : {};
  if (kept.length > 0) {
    return { settings: { ...settings, [PERMISSIONS.permissions]: { ...permissions, [PERMISSIONS.deny]: kept } }, removed: held.length - kept.length };
  }

  const { [PERMISSIONS.deny]: _dropped, ...rest } = permissions;
  const { [PERMISSIONS.permissions]: _also, ...outside } = settings;
  return {
    settings: Object.keys(rest).length === 0 ? outside : { ...outside, [PERMISSIONS.permissions]: rest },
    removed: held.length,
  };
}

/** Whether a pattern is already denied for every tool `init` would write it for. */
export function isDenied(settings: JsonObject, pattern: string): boolean {
  const held = new Set(denyEntriesIn(settings));
  return denyEntriesFor(pattern).every((entry) => held.has(entry));
}
