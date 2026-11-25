// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { listingPathCandidates } from './listing.js';
const LINE_NUMBER = /^\d+[:-]/;
const CONTEXT_LINE = /^(.+)-(\d+)-(.*)$/;
export function hitLines(output, withContext) {
    const lines = output.split('\n');
    const found = [];
    for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon <= 0)
            continue;
        const path = line.slice(0, colon);
        // The same rule a listing uses for the field before a hit's first colon: a path because of where it sits.
        if (!listingPathCandidates(line).some(([first]) => first?.positional === true && first.text === path))
            continue;
        found.push({ path, kind: 'hit', text: line.slice(colon + 1).replace(LINE_NUMBER, '') });
    }
    if (!withContext || found.length === 0)
        return found;
    // A context line with a colon in its text - `.env-3-URL=https://…` - reads as a hit on a path no file has: where its
    // "path" is another hit path's line number, it is that file's context line, and is taken below as one.
    const around = (path) => found.some((other) => other.path !== path && path.startsWith(other.path + '-') && /^\d+-/.test(path.slice(other.path.length + 1)));
    const hits = found.filter((hit) => !around(hit.path));
    const hitPaths = new Set(hits.map((hit) => hit.path));
    const context = lines.flatMap((line) => {
        const match = CONTEXT_LINE.exec(line);
        // The longest prefix that is a hit path: `my-file-2-x` is `my-file`'s line 2 where `my-file` had a hit.
        if (match === null || line.indexOf(':') !== -1 && hitPaths.has(line.slice(0, line.indexOf(':'))))
            return [];
        const path = [...hitPaths].filter((candidate) => line.startsWith(candidate + '-') && /^\d+-/.test(line.slice(candidate.length + 1)))
            .sort((one, other) => other.length - one.length)[0];
        return path === undefined ? [] : [{ path, kind: 'context', text: line.slice(path.length + 1).replace(/^\d+-/, '') }];
    });
    return [...hits, ...context];
}
