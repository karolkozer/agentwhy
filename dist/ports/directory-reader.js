// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FileAccessError } from './file-access-error.js';
/** Whether a folder is there: an error the port names is "no", and nothing else is swallowed. */
export async function isDirectory(directories, path) {
    try {
        return (await directories.kindOf(path)) === 'directory';
    }
    catch (error) {
        if (!(error instanceof FileAccessError))
            throw error;
        return false;
    }
}
