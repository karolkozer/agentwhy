// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

const CALL_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{7,127}$/;

/** A call's id in the shape an app writes one in, or nothing: it is put in an address and compared with a record's. */
export const callIdIn = (value: unknown): string | undefined => (typeof value === 'string' && CALL_ID.test(value) ? value : undefined);
