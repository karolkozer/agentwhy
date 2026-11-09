// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { parseJsonObject } from '../../../shared/json.ts';
import { SETTINGS_FILES } from '../contract/settings.ts';
import { installedHooks, runsKeySwap } from './hook-entries.ts';

/** How far up from where a hook ran a project is looked for, as `refuseProjectAbove` looks. */
const MOST_FOLDERS_UP = 64;

/**
 * `2026-11-09-codex-hides-keys.md` CH2: whether keys are hidden in the folder a Codex session runs in. One switch for both AIs
 * (CHD1), kept where Settings keeps it - the project's own `.claude/settings.local.json`, or `settings.json` where a person
 * wrote it there - so Codex's hook, which runs in every folder on the computer, asks the project's file.
 *
 * The project is the nearest folder, at or above `folder`, whose settings run any of agentwhy's hooks: Codex's session can
 * lie below it, as AO5 found for `refuse`. A project of agentwhy's whose switch is off ends the walk with no, so a project
 * inside another one answers for itself; a `.claude` of no agentwhy hook does not stop it. The home directory is never a
 * project (`which-project` V8), and the walk ends there. A file that cannot be read is one with nothing in it.
 */
export async function keysHiddenAt(readText: (path: string) => Promise<string>, folder: string, home: string): Promise<boolean> {
  for (let at = folder, depth = 0; depth < MOST_FOLDERS_UP && at !== home; depth += 1) {
    let agentwhys = false;
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
      const settings = parseJsonObject(await readText(join(at, SETTINGS_FILES.directory, file)).catch(() => ''));
      if (settings === undefined) continue;
      if (runsKeySwap(settings)) return true;
      agentwhys ||= installedHooks(settings).size > 0;
    }
    if (agentwhys) return false;
    const up = dirname(at);
    if (up === at) return false;
    at = up;
  }
  return false;
}
