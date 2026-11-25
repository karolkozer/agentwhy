// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { textOrUndefined } from '../../../ports/file-reader.js';
import { parseJsonObject } from '../../../shared/json.js';
import { isPlainInvocation } from '../../../shared/plain-invocation.js';
import { USER_HOOKS } from '../contract/hooks.js';
import { absoluteInvocation, copilotInvocationIn, copilotRefuseIn } from './copilot-hooks.js';
export async function copilotCheckState(files, directories, home) {
    const file = parseJsonObject((await textOrUndefined(files, join(home, ...USER_HOOKS.folder, USER_HOOKS.file))) ?? '');
    const command = file === undefined ? undefined : copilotRefuseIn(file);
    if (command === undefined)
        return 'absent';
    const invoke = copilotInvocationIn(command);
    if (invoke === undefined)
        return 'stale';
    const paths = absoluteInvocation(invoke);
    if (paths === undefined)
        return isPlainInvocation(invoke) ? 'on' : 'stale';
    for (const path of [paths.node, paths.script]) {
        if ((await directories.kindOf(path).catch(() => undefined)) !== 'file')
            return 'stale';
    }
    return 'on';
}
