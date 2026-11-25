// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { textOrUndefined } from '../../../ports/file-reader.js';
import { parseJsonObject } from '../../../shared/json.js';
import { USER_HOOKS } from '../contract/hooks.js';
import { approvedCodexEntries } from './codex-hooks.js';
import { approvalKey, approvalOf, entryHash } from './hook-approval.js';
export async function codexCheckState(files, home) {
    const userPath = join(home, USER_HOOKS.directory, USER_HOOKS.file);
    const file = parseJsonObject((await textOrUndefined(files, userPath)) ?? '');
    if (file === undefined)
        return 'absent';
    // The entries setup approves, not every entry of agentwhy's: one left sharing a group with another tool's (AO4) is
    // never approved, so demanding an approval for it too would pin the state at `stale` with no repair to reach.
    const placed = approvedCodexEntries(file);
    if (placed.length === 0)
        return 'absent';
    const config = await textOrUndefined(files, join(home, USER_HOOKS.directory, USER_HOOKS.config));
    if (config === undefined)
        return 'stale';
    const verified = placed.every((entry) => {
        const hash = entryHash(entry);
        const approval = approvalOf(config, approvalKey(userPath, entry));
        return hash !== undefined && approval !== undefined && approval.hash === hash && !approval.disabled;
    });
    return verified ? 'on' : 'stale';
}
