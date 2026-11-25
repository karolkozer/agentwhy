// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from './file-access-error.js';
/**
 * A file's text, or `undefined` where the port could not reach it - absent and unreadable alike. For a caller that
 * reads a file it was not given and treats its absence as an answer: an optional settings file, a list that may not
 * be there. A caller that must tell the two apart - because a file that is there and cannot be read is worth saying -
 * catches `FileAccessError` itself and reads its `failure`.
 */
export async function textOrUndefined(files, path) {
    try {
        return await files.readText(path);
    }
    catch (error) {
        if (!(error instanceof FileAccessError))
            throw error;
        return undefined;
    }
}
