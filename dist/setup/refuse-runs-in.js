// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.js';
import { installedHooks } from '../adapter/claude-code/settings/hook-entries.js';
import { textOrUndefined } from '../ports/file-reader.js';
import { parseJsonObject } from '../shared/json.js';
/**
 * Whether Claude Code's `refuse` runs in this folder's settings - the local file first, as `init` reads them - known by
 * `--command` where its hook names no `agentwhy`, as the setup that wrote it knows it. A file that cannot be read runs
 * nothing. `CodexMirror` asks the same in its own words; this one is `CopilotMirror`'s, so Codex's code stays as it is.
 */
export async function refuseRunsIn(files, folder, invoke) {
    for (const file of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
        const settings = parseJsonObject((await textOrUndefined(files, join(folder, SETTINGS_FILES.directory, file))) ?? '');
        if (settings !== undefined && installedHooks(settings, invoke).has('refuse'))
            return true;
    }
    return false;
}
