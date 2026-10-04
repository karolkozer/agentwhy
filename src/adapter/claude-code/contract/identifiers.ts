// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
const TOOL_USE_ID = /toolu_[A-Za-z0-9]{20,}/g;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

const AGENT_ID = /^(agent-)?a[0-9a-f]{16}$/;

/**
 * The id of a subagent, as it appears in a file name and in the `agentId` field of its lines. An identifier, not
 * content: spec §5.4 already excludes this shape from the entropy class. Whole-value match only, so a longer
 * string that merely contains one is not mistaken for an identifier.
 */
export function isAgentId(value: string): boolean {
  return AGENT_ID.test(value);
}

/** Identifier shapes that the secret scanner must never mistake for secrets (lesson L001). */
export function identifierMatches(text: string): { readonly toolUseIds: string[]; readonly uuids: string[] } {
  return { toolUseIds: text.match(TOOL_USE_ID) ?? [], uuids: text.match(UUID) ?? [] };
}
