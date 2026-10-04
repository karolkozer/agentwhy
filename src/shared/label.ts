// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Labels come only from structural positions: keys, line types, tool names, enumerations. A label must look
// like an identifier, and anything else is replaced, so free text cannot reach the output even from a
// malformed transcript. Known limit: an identifier-shaped secret placed in a structural position would pass;
// recognising secrets is the job of the secret scanner (spec §5.4), not of this guard.

const LABEL_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

export const ABSENT_LABEL = '(absent)';

export const INVALID_LABEL = '(invalid)';

export function toLabel(value: unknown): string {
  if (value === undefined) return ABSENT_LABEL;
  const text = typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
  return typeof text === 'string' && LABEL_PATTERN.test(text) ? text : INVALID_LABEL;
}
