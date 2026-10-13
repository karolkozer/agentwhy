// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { JsonObject } from '../../../shared/json.ts';
import { TOOLS } from '../contract/actions.ts';
import { VS_CODE_LOG_TOOLS } from '../contract/vs-code.ts';
import { profileOf, type CallProfile } from '../events/call-profiles.ts';
import { patchFiles, patchWritten } from '../patch/patch-lines.ts';

const tools = VS_CODE_LOG_TOOLS;

/**
 * VS Code's tools, read with the profile `refuse --copilot` judges them by (`what-vs-code-copilot-wrote` VC3): `read_file`
 * and `file_search` are the runtime's own and read as it reads them; `run_in_terminal` is a shell command, `apply_patch`
 * writes each file its patch names, `list_dir` lists a folder, `get_errors` names files without reading them; the to-do
 * list, `tool_search`, `terminal_last_command` and `runSubagent` reach no file. Any other name is a typed unknown action,
 * every string it was given a possible target (CP8, L005).
 */
export function chatProfileOf(toolName: string, input: JsonObject): CallProfile {
  switch (toolName) {
    case TOOLS.readFile.name:
    case TOOLS.fileSearch.name:
      return profileOf(toolName, input);
    case tools.terminal.name:
      return { targets: [], commands: textOf(input[tools.terminal.command]), resultShape: 'listing', toolKnown: true };
    case tools.patch.name: {
      const patch = textOf(input[tools.patch.input]).join('\n');
      return { targets: patchFiles(patch).filter((path) => path !== ''), commands: [], resultShape: 'none', toolKnown: true, written: patchWritten(patch) };
    }
    case tools.listDir.name:
      return { targets: textOf(input[tools.listDir.path]), commands: [], resultShape: 'listing', toolKnown: true };
    case tools.getErrors.name:
      return { targets: stringsOf(input[tools.getErrors.paths]), commands: [], resultShape: 'none', toolKnown: true };
    case tools.todo.name:
    case tools.toolSearch.name:
    case tools.lastCommand.name:
    case tools.subagent.name:
      return { targets: [], commands: [], resultShape: 'none', toolKnown: true };
    default:
      return { targets: stringsOf(input), commands: [], resultShape: 'listing', toolKnown: false };
  }
}

/**
 * A helper's call, known by its part alone (VCB-M16): no arguments, the files its messages name. Its shape is its tool's;
 * a tool the parts were not measured with is a typed unknown action.
 */
export function helperProfileOf(toolName: string | undefined, files: readonly string[]): CallProfile {
  switch (toolName) {
    case tools.readFile.name:
      return { targets: files, commands: [], resultShape: 'content', toolKnown: true };
    case tools.listDir.name:
    case tools.fileSearch.name:
      return { targets: files, commands: [], resultShape: 'listing', toolKnown: true };
    default:
      return { targets: files, commands: [], resultShape: 'listing', toolKnown: false };
  }
}

function textOf(value: unknown): string[] {
  return typeof value === 'string' && value !== '' ? [value] : [];
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}
