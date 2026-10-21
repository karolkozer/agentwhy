// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { TOOL_CATALOG } from '../contract/tool-catalog.ts';

/** `2026-10-21-the-plan-and-the-recap.md` PN8: the key a catalog description is found under - a server and one of its tools. */
export function catalogKey(server: string, tool: string): string {
  return `${server}\u0000${tool}`;
}

/** PN8, PNB11: every description `TOOL_CATALOG`'s file holds, by `catalogKey`; none where the text is no such file. */
export function catalogDescriptions(text: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  let node: unknown = parseJsonObject(text);
  for (const key of TOOL_CATALOG.path) node = isJsonObject(node) ? node[key] : undefined;
  if (!Array.isArray(node)) return found;
  for (const entry of node) {
    if (!isJsonObject(entry)) continue;
    const server = entry[TOOL_CATALOG.server];
    const tools = entry[TOOL_CATALOG.tools];
    if (typeof server !== 'string' || server === '' || !isJsonObject(tools)) continue;
    for (const [tool, definition] of Object.entries(tools)) {
      const description = isJsonObject(definition) ? definition[TOOL_CATALOG.description] : undefined;
      if (typeof description === 'string' && description.trim() !== '') found.set(catalogKey(server, tool), description);
    }
  }
  return found;
}
