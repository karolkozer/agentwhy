// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { pinnedVersions } from '../adapter/claude-code/settings/hook-entries.js';
import { isOlder, plainVersion } from '../shared/plain-version.js';
/**
 * U2 over the project's two settings files, as parsed: behind where a hook runs the pinned published way at a release
 * older than `serving`. A serving version that is not a release, and hooks in any other form, are never behind.
 */
export function behind(files, serving) {
    if (serving === undefined || plainVersion(serving) === undefined)
        return undefined;
    const older = (settings) => pinnedVersions(settings ?? {}).filter((version) => isOlder(version, serving));
    const local = older(files.local);
    const shared = older(files.shared);
    const [first, ...rest] = [...local, ...shared];
    if (first === undefined)
        return undefined;
    const from = rest.reduce((lowest, version) => (isOlder(version, lowest) ? version : lowest), first);
    return { from, to: serving, shared: shared.includes(from) };
}
/** AP13 over the same two files: a hook pinned to a plain release newer than `serving`, the highest named. */
export function pluginBehind(files, serving) {
    if (serving === undefined || plainVersion(serving) === undefined)
        return undefined;
    const newer = [files.local, files.shared].flatMap((settings) => pinnedVersions(settings ?? {})).filter((version) => isOlder(serving, version));
    const [first, ...rest] = newer;
    if (first === undefined)
        return undefined;
    return { running: serving, newer: rest.reduce((highest, version) => (isOlder(highest, version) ? version : highest), first) };
}
