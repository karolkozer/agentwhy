// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseJsonObject } from '../../../shared/json.ts';
import { POST_TOOL_USE } from '../contract/hooks.ts';

/** What a shell command printed, as Codex hands it to a hook after the command, and the folder of its session. */
export interface CodexToolResult {
  readonly printed: string;
  readonly directory: string | undefined;
}

/**
 * Codex's `PostToolUse` input for its shell (`2026-11-09-codex-hides-keys.md` CH1). Only the shape measured: `tool_response`
 * a string (58 of 58). Never throws: what cannot be used is nothing, and Codex goes on with the result it has.
 */
export function parseCodexToolResult(text: string): CodexToolResult | undefined {
  const input = parseJsonObject(text);
  const { fields } = POST_TOOL_USE;
  if (input === undefined || input[fields.event] !== POST_TOOL_USE.event || input[fields.toolName] !== POST_TOOL_USE.shellTool) return undefined;
  const printed = input[fields.response];
  if (typeof printed !== 'string') return undefined;
  const folder = input[fields.cwd];
  return { printed, directory: typeof folder === 'string' && folder !== '' ? folder : undefined };
}

/**
 * The answer that hands Codex's model `text` in place of the command's result (§1): the whole of it in the hook's words, kept
 * as written - line breaks, tabs and all, since it stands for what the command printed.
 */
export function resultReplaced(text: string): string {
  const { output } = POST_TOOL_USE;
  return JSON.stringify({ [output.decision]: output.block, [output.reason]: text });
}
