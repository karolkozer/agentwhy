// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname } from 'node:path';
import { sessionKey } from './session-catalogue.js';
/**
 * A conversation by the name the page gives it (`sessionKey`), wherever it is kept (`2026-11-20-ask-your-ai-why.md` AYO7,
 * AYD10, AYD12): in the working folder; else in each folder above it, nearest first - each asked of its own conversations
 * by its name, so a project the listing cannot read is found too (the review of 2026-11-22: one whose recent records name
 * only a sub-folder is `unreadable` there); else by its record's name in whichever project's folder holds it, which opens
 * nothing and names no folder - the report then reads its rules where its own record holds its project (AYD12, replacing
 * a listing of every project that read the ends of their newest records). Measured 2026-11-22: after an AI moves into a
 * sub-folder, a skill's line and its commands run there, and the working folder's listing alone said a written
 * conversation was not written yet - its absence from one folder was a stand-in for its absence. The search ends where it
 * is found; the working folder's listing is handed back, for a reader that names where it looked.
 */
export async function locateSession(key, workingDirectory, places) {
    const listing = await places.catalogue.list(workingDirectory);
    const here = listing.sessions.find((session) => sessionKey(session) === key);
    if (here !== undefined || places.elsewhere === undefined)
        return here === undefined ? { listing } : { located: { summary: here, folder: workingDirectory }, listing };
    const { catalogue, finder } = places.elsewhere;
    for (const folder of foldersAbove(workingDirectory)) {
        const found = (await catalogue.list(folder)).sessions.find((session) => sessionKey(session) === key);
        if (found !== undefined)
            return { located: { summary: found, folder }, listing };
    }
    // Any other project may hold it - the AI moved out of its own, its folder gone: found by its record's name.
    const named = await finder.find(key);
    return named === undefined ? { listing } : { located: { summary: named }, listing };
}
/** Each folder a folder lies in, nearest first, up to the root of its disk. */
function foldersAbove(folder) {
    const folders = [];
    let current = folder;
    while (dirname(current) !== current) {
        current = dirname(current);
        folders.push(current);
    }
    return folders;
}
