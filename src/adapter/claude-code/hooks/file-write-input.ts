// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { HOOK_INPUT, PRE_TOOL_USE } from '../contract/hooks.ts';
import { parseJsonObject } from '../../../shared/json.ts';

/** What a `Write` or an `Edit` is about to put in a file (`2026-11-23-a-write-over-the-key.md` §2a, WKB1). */
export interface FileWriteInput {
  /** `file_path` as given. */
  readonly path: string;
  /** A `Write`'s `content`, an `Edit`'s `new_string`. */
  readonly newText: string;
  /** An `Edit`'s `old_string`; undefined for a `Write`, which replaces the whole file. */
  readonly replaced: string | undefined;
  /** The call's `cwd`. */
  readonly directory: string | undefined;
}

/** Claude Code's `PreToolUse` input for `Write` or `Edit`. Never throws: any other event, tool or shape is nothing. */
export function parseFileWriteInput(text: string): FileWriteInput | undefined {
  const input = parseJsonObject(text);
  if (input === undefined || input[PRE_TOOL_USE.fields.event] !== PRE_TOOL_USE.event) return undefined;
  const tool = input[PRE_TOOL_USE.fields.toolName];
  const args = input[PRE_TOOL_USE.fields.toolInput];
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined;
  const fields = args as Record<string, unknown>;
  const path = fields[PRE_TOOL_USE.fields.filePath];
  if (typeof path !== 'string' || path === '') return undefined;
  const folder = input[HOOK_INPUT.fields.workingDirectory];
  const directory = typeof folder === 'string' && folder !== '' ? folder : undefined;
  if (tool === PRE_TOOL_USE.writeTool) {
    const content = fields[PRE_TOOL_USE.fields.content];
    return typeof content === 'string' ? { path, newText: content, replaced: undefined, directory } : undefined;
  }
  if (tool === PRE_TOOL_USE.editTool) {
    const oldText = fields[PRE_TOOL_USE.fields.oldString];
    const newText = fields[PRE_TOOL_USE.fields.newString];
    return typeof oldText === 'string' && typeof newText === 'string' ? { path, newText, replaced: oldText, directory } : undefined;
  }
  return undefined;
}
