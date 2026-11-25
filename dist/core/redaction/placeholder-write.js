// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { KEY_PLACEHOLDER, keysSwappedIn, swapKeys } from './swap-keys.js';
const countOf = (text) => text.split(KEY_PLACEHOLDER).length - 1;
/** WK2: the new text holds more placeholders than the text it replaces. */
export function addsPlaceholder(newText, replaced) {
    return countOf(newText) > countOf(replaced);
}
/**
 * WK2: a write that adds the placeholder to a file holding a key the scanner finds. No file (`undefined`) is no key to lose.
 * `replaced` undefined means the file's own text is what is replaced (a `Write`).
 */
export function writesOverKey(write, fileText) {
    if (fileText === undefined)
        return false;
    if (!addsPlaceholder(write.newText, write.replaced ?? fileText))
        return false;
    return swapKeys(fileText).count > 0;
}
/**
 * WK7: how many keys a write the record shows took out of its file - a write that added the placeholder, of a file that held a
 * key before it and no longer holds it after; one value written over in two places is one key. Where the record kept the file
 * swapped (WKB4: with the switch on, Claude Code keeps the result the AI was handed) the scanner finds no key in it, so nothing is
 * said; a placeholder an earlier write left beside a real key does not hide that key. The keys are compared and dropped, never
 * kept: a raw value never enters the report model.
 */
export function keysWrittenOver(write, before, after) {
    if (!addsPlaceholder(write.newText, write.replaced ?? before))
        return 0;
    return [...new Set(keysSwappedIn(before))].filter((key) => !after.includes(key)).length;
}
