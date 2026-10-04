// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** A moment as part of a file name: it sorts by time, and holds no character a file system refuses. */
export function fileStamp(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, '-');
}
