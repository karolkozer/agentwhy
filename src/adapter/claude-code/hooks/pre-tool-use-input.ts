// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';

/** Why an input could not be read. Named, so the notice can say the command was not checked. */
export type UnusableShellInput = 'not-json' | 'another-event' | 'field-missing';

/**
 * Reads the text a `PreToolUse` hook was given. A call to any tool but the shell and `Read` is `another-tool`: a hook
 * installed without a matcher sees every call, and those are not this command's to judge, so they pass without a word.
 * Never throws. The working directory is carried when the input has one.
 *
 * `2026-10-12-a-read-outside-the-project.md` RX1: a `Read` prints the one file it is handed, as `cat` handed its path
 * does, and is read as that line - so it meets every rule a command naming the file meets, with the same reading.
 */
export function parsePreToolUseInput(
  text: string,
): { readonly command: string; readonly cwd?: string } | { readonly anotherTool: true } | { readonly unusable: UnusableShellInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };

  const { fields } = PRE_TOOL_USE;
  if (input[fields.event] !== PRE_TOOL_USE.event) return { unusable: 'another-event' };
  const tool = input[fields.toolName];
  if (tool !== PRE_TOOL_USE.shellTool && tool !== PRE_TOOL_USE.readTool) return { anotherTool: true };

  const toolInput = input[fields.toolInput];
  const given = isJsonObject(toolInput) ? toolInput[tool === PRE_TOOL_USE.readTool ? fields.filePath : fields.command] : undefined;
  if (typeof given !== 'string' || (tool === PRE_TOOL_USE.readTool && given === '')) return { unusable: 'field-missing' };
  const command = tool === PRE_TOOL_USE.readTool ? printingLine(given) : given;
  const cwd = input[fields.cwd];
  return typeof cwd === 'string' && cwd !== '' ? { command, cwd } : { command };
}

/** RX1: the line that prints one file - its path quoted whole, a quote in it closed and written as itself. */
function printingLine(path: string): string {
  return `cat -- '${path.replaceAll("'", `'\\''`)}'`;
}
