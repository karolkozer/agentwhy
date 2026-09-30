import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';

/** Why an input could not be read. Named, so the notice can say the command was not checked. */
export type UnusableShellInput = 'not-json' | 'another-event' | 'field-missing';

/**
 * Reads the text a `PreToolUse` hook was given. A call to any tool but the shell is `another-tool`: a hook installed
 * without a matcher sees every call, and those are not this command's to judge, so they pass without a word. Never
 * throws. The working directory is carried when the input has one.
 */
export function parsePreToolUseInput(
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
