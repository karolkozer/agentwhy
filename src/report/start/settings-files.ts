// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { fileRulesIn } from '../../adapter/claude-code/settings/deny-entries.ts';
import { missingHookEntries, type AgentwhyHook } from '../../adapter/claude-code/settings/hook-entries.ts';
import type { FileReader } from '../../ports/file-reader.ts';
import type { JsonObject } from '../../shared/json.ts';

/** A project's settings file as read: absent, a JSON object, or there and not one. */
export type SettingsRead = JsonObject | undefined | 'unreadable';

/**
 * A settings file, read the way `init` reads it. Absent is an answer - a project nobody set up has none - and a file
 * that is not a JSON object is `unreadable`, so nothing is drawn from a guess about what it holds.
 */
export async function readSettingsFile(files: FileReader, path: string): Promise<SettingsRead> {
  let text: string;
  try {
    text = await files.readText(path);
  } catch {
    return undefined;
  }
  try {
    const settings: unknown = JSON.parse(text);
    if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) return 'unreadable';
    return settings as JsonObject;
  } catch {
    return 'unreadable';
  }
}

/**
 * Whether a file runs a hook whole. `watch` is not installed where only one of its two events is (`hookEntries`'s own
 * comment): a file left running `watch` on `SubagentStop` alone never says anything in the conversation and never checks
 * the session's own agent, so a hook this incomplete reads as off - the `missingHookEntries` a fresh `init` uses to find
 * the gap.
 */
export function hookComplete(settings: JsonObject, hook: AgentwhyHook): boolean {
  return missingHookEntries(settings, [hook], '', undefined).length === 0;
}

/**
 * Whether agentwhy is set up in a project, from its settings files (`.ai/specs/2026-09-27-which-project.md` V10, and the
 * onboarding's W23 as amended the same day): one of its hooks runs there whole, or the files hold rules that block a file
 * - a rule a person wrote by hand included. Decided by the maintainer on 2026-09-28: a project that blocks files is set
 * up, and is not offered the setup again. A file that could not be read says nothing.
 */
export function setUpBy(files: readonly SettingsRead[]): boolean {
  return files.some((settings) => settings !== undefined && settings !== 'unreadable' &&
    (hookComplete(settings, 'watch') || hookComplete(settings, 'refuse') || fileRulesIn(settings).length > 0));
}
