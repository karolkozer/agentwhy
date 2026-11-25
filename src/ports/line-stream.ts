// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/** One program talking to another in lines over its standard streams, until the other ends it. */
export interface LineStream {
  lines(): AsyncIterable<string>;
  write(line: string): void;
}
