// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * How many of a path's last segments it takes to tell it from every other path named beside it
 * (`specs/2026-09-14-path-display-and-share.md` R5): two files a page names must never read alike, and a name alone reads
 * alike wherever two folders hold a file of that name. Segments are compared, not text; where no tail tells the path
 * apart, the answer is every segment it has.
 */
export function distinctDepth(parts: readonly string[], others: readonly (readonly string[])[]): number {
  for (let depth = 1; depth < parts.length; depth += 1) {
    const tail = parts.slice(-depth).join('/');
    if (!others.some((other) => other.slice(-depth).join('/') === tail)) return depth;
  }
  return parts.length;
}
