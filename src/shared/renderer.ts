// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Strategy for turning a value into output text. */
export interface Renderer<T> {
  render(value: T): string;
}
