// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { shellWord as quoted } from '../../../shared/shell-word.ts';
import { TOOLS } from '../contract/actions.ts';
import { PRE_TOOL_USE, VS_CODE_TOOLS } from '../contract/hooks.ts';
import { patchFiles } from '../patch/patch-lines.ts';

/** Why an input could not be read. Named, so a caller can tell it from a call it lets through. */
export type UnusableCopilotInput = 'not-json' | 'another-event' | 'field-missing';

/**
 * Reads the text a Copilot `PreToolUse` hook was given (`copilot-blocks-too` CB1-CB5, CB20) as the shell line that does
 * what the call would do, so `refuse` judges it by the reading it already has for a command - as Claude Code's `Read` is
 * judged as `cat` of its file (`a-read-outside-the-project` RX1):
 *
 * - `Bash`: its command line, as written (CB1).
 * - `Read`, `Write`, `Edit` and the search subagent's `read_file`: every key that names a file, printed - a part of a file
 *   is that file, and writing one is reaching it (CB2, CB5).
 * - `Grep` and `grep_search`: ripgrep entering hidden files, over what they were given - `paths` or `path`, or the
 *   folder the call runs in where they name none - narrowed by their `glob` or `includePattern` as ripgrep reads a
 *   `-g`, `!` and `**` included (CB3; §2a e3: Copilot's `grep` read `.env` and a hidden folder, and left a git-ignored
 *   file out, which `refuse`'s reading of ripgrep takes to be reached all the same).
 * - VS Code's `run_in_terminal`: its command line, as `Bash`'s (CB22). Its `apply_patch`: every file its patch names, as a
 *   file written (CB23); a patch that names none passes, as an unknown tool does.
 *
 * Any other tool - `Glob` and `file_search`, which list names (CB4); `search_code_subagent` and `task`, whose subagent's own
 * calls come to the same hook (CB6); an MCP call or a tool no measurement has shown (CB7, CBD8) - is `another-tool`, and
 * passes. Which tool it is comes from `tool_name` alone, never from the shape of the rest (CBD6). Never throws.
 */
export function parseCopilotPreToolUseInput(
  text: string,
): { readonly command: string; readonly cwd?: string } | { readonly anotherTool: true } | { readonly unusable: UnusableCopilotInput } {
  const input = parseJsonObject(text);
  if (input === undefined) return { unusable: 'not-json' };
  const { fields } = PRE_TOOL_USE;
  if (input[fields.event] !== PRE_TOOL_USE.event) return { unusable: 'another-event' };
  const tool = input[fields.toolName];
  if (typeof tool !== 'string') return { unusable: 'field-missing' };
  const given = input[fields.toolInput];
  const line = lineOf(tool, isJsonObject(given) ? given : {});
  if (line === 'another-tool') return { anotherTool: true };
  if (line === undefined) return { unusable: 'field-missing' };
  const cwd = input[fields.cwd];
  return typeof cwd === 'string' && cwd !== '' ? { command: line, cwd } : { command: line };
}

/** The line a call is judged as; `undefined` where a tool this reads names nothing it can read. */
function lineOf(tool: string, given: JsonObject): string | 'another-tool' | undefined {
  const { tools, keys } = PRE_TOOL_USE;
  switch (tool) {
    case tools.shell:
    case VS_CODE_TOOLS.terminal.name: {
      const command = given[keys.command];
      return typeof command === 'string' && command !== '' ? command : undefined;
    }
    case VS_CODE_TOOLS.patch.name: {
      const patch = given[VS_CODE_TOOLS.patch.input];
      if (typeof patch !== 'string') return undefined;
      return printing(patchFiles(patch)) ?? 'another-tool';
    }
    case tools.read:
    case tools.write:
    case tools.edit:
      return printing(keys.paths.flatMap((key) => strings(given[key])));
    case TOOLS.readFile.name:
      return printing(strings(given[TOOLS.readFile.path]));
    case tools.search:
      return searching(given[keys.pattern], keys.searchPaths.flatMap((key) => strings(given[key])), strings(given[keys.glob]));
    case TOOLS.grepSearch.name:
      return searching(given[TOOLS.grepSearch.query], [], strings(given[TOOLS.grepSearch.include]));
    default:
      return 'another-tool';
  }
}

/** The line that prints each file - every one the call names, each quoted whole. */
function printing(paths: readonly string[]): string | undefined {
  const named = [...new Set(paths.filter((path) => path !== ''))];
  return named.length === 0 ? undefined : `cat -- ${named.map(quoted).join(' ')}`;
}

/**
 * ripgrep over `paths` - the folder the call runs in where it names none - entering hidden files as Copilot's search did
 * (§2a e1, e3), each glob a `-g` as ripgrep reads it: `!` excludes, and a leading `**` and slash match at any depth
 * (`refuse`'s reading, measured on ripgrep 14.1.1).
 */
function searching(pattern: unknown, paths: readonly string[], globs: readonly string[]): string | undefined {
  if (typeof pattern !== 'string' || pattern === '') return undefined;
  const narrowed = globs.filter((glob) => glob !== '').map((glob) => ` -g ${quoted(glob)}`).join('');
  const where = paths.filter((path) => path !== '');
  return `rg --hidden${narrowed} -- ${quoted(pattern)} ${(where.length === 0 ? ['.'] : where).map(quoted).join(' ')}`;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}
