// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** One word for a POSIX shell, whatever it holds: single-quoted, a quote inside closed and written as itself. */
export function shellWord(word: string): string {
  return `'${word.replaceAll("'", `'\\''`)}'`;
}
