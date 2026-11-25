// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { fileOperandsIn } from '../core/access/command-line.js';
import { everydayReach, readsContent, readsContentOf, showsTextOf } from '../core/access/protected-access.js';
import { printedOutput } from '../core/access/printed-output.js';
import { wordsPlaced } from '../core/access/protected-access.js';
/**
 * The files one call reached, and what it did to each (`2026-10-11-step-by-step.md` SB3): stopped where the call or the
 * access was refused, not known where the access's end is not, changed where the call wrote it, read where its text came
 * back or a printer printed it (for a private file, `showsTextOf`, the story's answer), else a name only seen. Named in the call first, then in the order its output printed
 * them. One rule, so a Files row and a step can never disagree about a call.
 */
export function reachesOf(event, accesses, policy, place = {}) {
    const output = printedOutput(event) ?? '';
    const reach = new Map(everydayReach(event, policy, wordsPlaced(event, place.home, place.root), place.home, place.root)
        .filter((one) => one.written !== true || place.isNoFile?.(event.id, one.path) !== true)
        .map((one) => [one.path, one.how]));
    const accessAt = new Map(accesses.map((access) => [access.path, access]));
    // R12b, P32a: a tool the adapter has no profile for has its whole input as targets - a plan's items, a closing recap -
    // and names no everyday file by it, as the Files tab has it; a private path there keeps its access, and its row.
    const targets = event.toolKnown ? event.targets : [];
    const paths = [...new Set([...accesses.map((access) => access.path), ...targets, ...reach.keys()])].filter((path) => path !== '');
    const operands = new Set(fileOperandsIn(event.commands));
    // FN11: the call's operands and output are asked with the word as the line wrote it.
    const wordOf = (path) => accessAt.get(path)?.word ?? path;
    const howOf = (path) => {
        const access = accessAt.get(path);
        const word = wordOf(path);
        if (event.outcome === 'blocked' || access?.outcome === 'blocked')
            return 'stopped';
        if (access?.outcome === 'unknown')
            return 'unknown';
        if (event.written !== undefined && event.targets.includes(path))
            return 'changed';
        if ((access?.lines ?? 0) > 0 || reach.get(path) === 'read')
            return 'read';
        // S3: read where the Files tab says read - a loop that printed it, its own lines in what came back - and, as a flow
        // step's `shown`, only where the output reached the model: a print to nobody hands it no text (ER1, X14).
        if (access?.outcome === 'succeeded' && event.result?.stage === 'model' && showsTextOf(event, access))
            return 'read';
        if (reach.get(path) === 'unknown')
            return 'unknown';
        const opened = (event.resultShape === 'content' && event.targets.includes(path)) ||
            (readsContent(event) && operands.has(word)) || readsContentOf(event, word);
        return event.outcome === 'succeeded' && opened ? 'read' : 'named';
    };
    return paths.map((path) => ({ path, at: output.indexOf(wordOf(path)) }))
        .sort((a, b) => a.at - b.at)
        .map(({ path }) => {
        const access = accessAt.get(path);
        return { path, how: howOf(path), ...(access === undefined ? {} : { access }) };
    });
}
