// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
declare const REDACTED: unique symbol;

/**
 * Text that has passed the redactor. The report model accepts nothing else, so a raw value cannot be assigned
 * into it - the compiler refuses, rather than a reviewer having to notice. This is the single reason the
 * project is TypeScript (`2026-09-13-overview.md`, invariant 1).
 *
 * The brand cannot be produced outside `redactor.ts`: there is no exported way to make one from a string.
 */
export type Redacted = string & { readonly [REDACTED]: true };

/** The only place a `Redacted` comes into being. Not exported beyond this directory. */
export function brand(text: string): Redacted {
  return text as Redacted;
}
