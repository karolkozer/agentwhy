// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Showing a file to the person at the machine. The report needs this and nothing more: no URLs, no navigation,
 * no process to keep alive - `agentwhy` opens a file it has just written and forgets about it (spec §7.5).
 */
export interface Browser {
  /**
   * Hands the file to whatever the machine opens that kind of file with. **False when nothing could be
   * started**, which is a thing to report and never a reason to fail the analysis: the file is written either
   * way, and its path is the part that matters.
   */
  open(path: string): Promise<boolean>;
}
