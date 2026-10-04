// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';

/** Why an input could not be read. Named, so the notice can say the command was not checked. */
export type UnusableShellInput = 'not-json' | 'another-event' | 'field-missing';

/**
 * Reads the text a Codex `PreToolUse` hook was given (`codex-blocks-too` CK4): the command line of a shell call, and the
 * session's folder, which `refuse --codex` looks for the project from (CK3). A call to any tool but the shell is
 * `another-tool`, and passes. Never throws. The fields are Codex's own, measured (CKB2); that they are named as Claude
 * Code's are is an observation, not a shared definition.
 */
export function parseCodexPreToolUseInput(
  text: string,
): { readonly command: string; readonly cwd?: string } | { readonly anotherTool: true } | { readonly unusable: UnusableShellInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };

  const { fields } = PRE_TOOL_USE;
  if (input[fields.event] !== PRE_TOOL_USE.event) return { unusable: 'another-event' };
  if (input[fields.toolName] !== PRE_TOOL_USE.shellTool) return { anotherTool: true };

  const toolInput = input[fields.toolInput];
  const command = isJsonObject(toolInput) ? toolInput[fields.command] : undefined;
  if (typeof command !== 'string') return { unusable: 'field-missing' };
  const cwd = input[fields.cwd];
  return typeof cwd === 'string' && cwd !== '' ? { command, cwd } : { command };
}
