// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * What a person says they did about a file (R31; `for-people-who-build-with-ai.md` F25, F50): the keys it held were
 * replaced, a template's values are placeholders, what could be done about a file whose contents cannot be changed was
 * done, or the file holds nothing private.
 */
export const MARK_RESULTS = ['rotated', 'not-secret', 'handled', 'not-private'];
/** A result read from a file, a flag or a request, which this version knows. */
export function isMarkResult(value) {
    return MARK_RESULTS.includes(value);
}
