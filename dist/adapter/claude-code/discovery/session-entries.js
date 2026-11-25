// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { byString } from '../../../shared/compare.js';
import { LAYOUT, isToolResultFileName, parseSubagentFileName, subagentFileName } from '../contract/layout.js';
export function pairSubagentFiles(listing) {
    const found = new Map();
    const unrecognised = [];
    for (const entry of listing.entries) {
        const parsed = entry.kind === 'file' ? parseSubagentFileName(entry.name) : undefined;
        if (parsed === undefined) {
            unrecognised.push(join(LAYOUT.subagentsDir, entry.name));
            continue;
        }
        const seen = found.get(parsed.fileId) ?? { transcript: false, meta: false };
        seen[parsed.kind] = true;
        found.set(parsed.fileId, seen);
    }
    const dir = listing.presence.path;
    const sources = [...found]
        .sort(([a], [b]) => byString(a, b))
        .map(([fileId, seen]) => ({
        fileId,
        transcript: listed(dir, subagentFileName(fileId, 'transcript'), seen.transcript),
        meta: listed(dir, subagentFileName(fileId, 'meta'), seen.meta),
    }));
    return { sources, unrecognised };
}
export function splitToolResults(listing) {
    const files = [];
    const unrecognised = [];
    for (const entry of listing.entries) {
        if (entry.kind === 'file' && isToolResultFileName(entry.name))
            files.push(entry.name);
        else
            unrecognised.push(join(LAYOUT.toolResultsDir, entry.name));
    }
    return { files: files.sort(byString), unrecognised };
}
function listed(dir, name, isPresent) {
    const path = join(dir, name);
    return isPresent ? { present: true, path } : { present: false, path, reason: 'not-found' };
}
