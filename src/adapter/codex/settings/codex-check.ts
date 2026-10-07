// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { USER_HOOKS } from '../contract/hooks.ts';
import { approvedCodexEntries } from './codex-hooks.ts';
import { approvalKey, approvalOf, entryHash } from './hook-approval.ts';

/**
 * Whether agentwhy's check runs in Codex without asking (`2026-10-02-codex-approves-its-own-hook.md` AO3): `on` where
 * its entries are in the person's `~/.codex/hooks.json` and each one's approval holds the hash of the entry as it
 * stands, none disabled; `stale` where its entries are there and that does not hold - a drifted key, a recipe a newer
 * Codex changed, a person's `enabled = false` - so Codex may ask, or skip them; `absent` where they are not there at
 * all. Read, never assumed: a page says `on` only on `on`.
 */
export type CodexCheckState = 'on' | 'stale' | 'absent';

export async function codexCheckState(files: FileReader, home: string): Promise<CodexCheckState> {
  const userPath = join(home, USER_HOOKS.directory, USER_HOOKS.file);
  const file = parseJsonObject((await textOrUndefined(files, userPath)) ?? '');
  if (file === undefined) return 'absent';
  // The entries setup approves, not every entry of agentwhy's: one left sharing a group with another tool's (AO4) is
  // never approved, so demanding an approval for it too would pin the state at `stale` with no repair to reach.
  const placed = approvedCodexEntries(file);
  if (placed.length === 0) return 'absent';
  const config = await textOrUndefined(files, join(home, USER_HOOKS.directory, USER_HOOKS.config));
  if (config === undefined) return 'stale';
  const verified = placed.every((entry) => {
    const hash = entryHash(entry);
    const approval = approvalOf(config, approvalKey(userPath, entry));
    return hash !== undefined && approval !== undefined && approval.hash === hash && !approval.disabled;
  });
  return verified ? 'on' : 'stale';
}
