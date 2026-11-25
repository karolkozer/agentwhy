// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Where a short name may end: at the parts of an id, then nowhere before its end. */
const LENGTHS = [8, 13, 18, 23];
/** A conversation's id as a person may be asked to write it: the page's name for it without which AI's it is. */
export const idOf = (key) => key.replace(/^(?:codex|copilot)-/, '');
/**
 * A short name for each conversation of one answer, by its key (CV7): enough of its id to tell it from the rest. Two held within a
 * minute can begin alike - an id can start with the time - so a name that would stand for two is made longer.
 */
export function shortNames(keys) {
    const ids = [...new Set(keys)].map((key) => ({ key, id: idOf(key) }));
    return new Map(ids.map(({ key, id }) => {
        const alone = LENGTHS.find((length) => !ids.some((other) => other.key !== key && other.id.slice(0, length) === id.slice(0, length)));
        return [key, alone === undefined ? id : id.slice(0, alone)];
    }));
}
