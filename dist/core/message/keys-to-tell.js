// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { keysInMessage } from '../redaction/redactor.js';
/**
 * The keys a message is stopped for (PK1): a known format or a URL's password whose value does not read as a sample or as
 * already cut out (PKD4), in the order they stand. None, and the message goes.
 */
export function keysToTell(message) {
    const lineStarts = [0];
    for (let at = message.text.indexOf('\n'); at !== -1; at = message.text.indexOf('\n', at + 1))
        lineStarts.push(at + 1);
    const lineOf = (offset) => {
        let line = 0;
        while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset)
            line += 1;
        return line + 1;
    };
    return keysInMessage(message.text)
        .filter((key) => !key.sample)
        .map((key) => {
        const line = lineOf(key.start);
        const paste = message.pastes.findIndex((span) => span.first <= line && line <= span.last);
        const inPaste = paste === -1 ? { line } : { line: line - message.pastes[paste].first + 1, paste: paste + 1 };
        return { kind: key.kind, ...inPaste, ...(key.name === undefined ? {} : { name: key.name }) };
    });
}
