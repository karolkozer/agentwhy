// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Text handed to this process, read to its end. A hook's input arrives this way. */
export interface TextInput {
  /** The whole input, or `undefined` when it is longer than `maxBytes` or cannot be read. Never throws. */
  readAll(maxBytes: number): Promise<string | undefined>;
}
