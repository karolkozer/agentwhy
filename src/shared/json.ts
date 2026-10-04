// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses text that should hold a JSON object. Invalid JSON and any other JSON value yield undefined. */
export function parseJsonObject(text: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return isJsonObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
