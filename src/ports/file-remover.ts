// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Removing one file agentwhy wrote, and nothing else: never a folder, never a file it did not write. */
export interface FileRemover {
  /** Throws FileAccessError when the file cannot be removed - `not-found` where there is none. */
  removeFile(path: string): Promise<void>;
}
