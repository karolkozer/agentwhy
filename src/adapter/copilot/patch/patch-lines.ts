// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PATCH_FILE_LINES } from '../contract/hooks.ts';

/**
 * The files a patch names (`copilot-blocks-too` CB23): the path of each `*** Add File:`, `*** Update File:`,
 * `*** Delete File:` and `*** Move to:` line. Read alike by `refuse --copilot`, which judges each, and by the reader of
 * VS Code's chat log, which counts each written.
 */
export function patchFiles(patch: string): string[] {
  return patch.split('\n').flatMap((line) => {
    const opening = PATCH_FILE_LINES.find((each) => line.startsWith(each));
    return opening === undefined ? [] : [line.slice(opening.length).replace(/\r$/, '').trim()];
  });
}

/**
 * The text a patch puts in: its `+` lines, the mark taken off - never a `-` line, which takes text out, nor a line it
 * keeps (`where-the-value-went` R7). One text a patch; none where it adds nothing.
 */
export function patchWritten(patch: string): string[] {
  const added = patch.split('\n').filter((line) => line.startsWith('+')).map((line) => line.slice(1).replace(/\r$/, ''));
  return added.length === 0 ? [] : [added.join('\n')];
}
