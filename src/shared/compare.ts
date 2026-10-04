// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** Orders strings by UTF-16 code units — the order `Array.prototype.sort` uses without a comparator. */
export function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
