// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
/** Parses the arguments after `doctor`. Never throws: bad input is a usage error. */
export function parseDoctorArguments(args) {
    let values;
    try {
        values = parseValues(args);
    }
    catch (error) {
        return usageError(error instanceof Error ? error.message : String(error));
    }
    if (values.help)
        return { kind: 'help' };
    if (values.input === undefined || values.input === '') {
        return usageError('doctor needs --input <session-dir | session.jsonl>');
    }
    return { kind: 'options', options: { input: values.input, format: values.json ? 'json' : 'text' } };
}
function parseValues(args) {
    return parseArgs({
        args: [...args],
        options: {
            input: { type: 'string' },
            json: { type: 'boolean', default: false },
            help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
    }).values;
}
function usageError(message) {
    return { kind: 'usage-error', message };
}
