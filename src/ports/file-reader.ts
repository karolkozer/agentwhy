// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** The content of files. The probe needs this and nothing more. */
export interface FileReader {
  /** Throws FileAccessError when the file does not exist or cannot be read. */
  readText(path: string): Promise<string>;
  /** Yields lines without their terminators; throws FileAccessError during iteration if reading fails. */
  readLines(path: string): AsyncIterable<string>;
}
