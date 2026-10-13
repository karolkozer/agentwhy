// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ResultShape } from '../../../core/event.ts';
import type { JsonObject } from '../../../shared/json.ts';
import { SEARCH_NAMES, SEARCH_OUTPUT, TOOLS } from '../contract/actions.ts';

/** What a call addressed and what its result is, by its tool (`what-copilot-wrote` CP8, plan step 4). */
export interface CallProfile {
  readonly targets: readonly string[];
  readonly commands: readonly string[];
  readonly resultShape: ResultShape;
  readonly toolKnown: boolean;
  /** For `create` and `edit`: the text the call puts in, never its path and never the text an edit takes out. */
  readonly written?: readonly string[];
  /** For `rg` printing the lines it matched (`search-hits-are-reads` H1). */
  readonly printsMatches?: true;
}

/**
 * The runtime's tools as the contract measured them. `bash` is read through the shared command-line reader; `view` is
 * the content of the path it names, `glob` and `rg` a listing of what they reached; `create` and `edit` write their path.
 * `task` and `read_agent` hand work to an agent and back. Any other tool - an MCP call, `sql`, `list_bash`, a tool no
 * build was measured with - is a typed unknown action: everything it was given may name a target, and its result may list
 * what it reached, the noisiest reading and a visible one (CP8, L005).
 */
export function profileOf(toolName: string, input: JsonObject): CallProfile {
  // CPB60: the search tool is called `grep` as well as `rg`, by the same keys.
  switch (SEARCH_NAMES.includes(toolName) ? TOOLS.search.name : toolName) {
    case TOOLS.shell.name:
      return { targets: [], commands: stringsOf(input[TOOLS.shell.command]), resultShape: 'listing', toolKnown: true };
    case TOOLS.view.name:
      return { targets: stringsOf(input[TOOLS.view.path]), commands: [], resultShape: 'content', toolKnown: true };
    case TOOLS.glob.name:
      return { targets: stringsOf(input[TOOLS.glob.paths]), commands: [], resultShape: 'listing', toolKnown: true };
    case TOOLS.search.name:
      return {
        targets: stringsOf(input[TOOLS.search.paths]), commands: [], resultShape: 'listing', toolKnown: true,
        // CPB57: `files_with_matches` prints names alone. Any other value, or none, is read as printing what it matched.
        ...(input[TOOLS.search.outputMode] === SEARCH_OUTPUT.namesOnly ? {} : { printsMatches: true as const }),
      };
    case TOOLS.create.name:
      return { targets: stringsOf(input[TOOLS.create.path]), commands: [], resultShape: 'none', toolKnown: true, written: stringsOf(input[TOOLS.create.text]) };
    case TOOLS.edit.name:
      return { targets: stringsOf(input[TOOLS.edit.path]), commands: [], resultShape: 'none', toolKnown: true, written: stringsOf(input[TOOLS.edit.newText]) };
    case TOOLS.readFile.name:
      return { targets: stringsOf(input[TOOLS.readFile.path]), commands: [], resultShape: 'content', toolKnown: true };
    // CPB62: a search of the whole project, narrowed by `includePattern`; its result is the lines it matched.
    case TOOLS.grepSearch.name:
      return { targets: [], commands: [], resultShape: 'listing', toolKnown: true, printsMatches: true };
    case TOOLS.fileSearch.name:
      return { targets: [], commands: [], resultShape: 'listing', toolKnown: true };
    case TOOLS.delegate.name:
    case TOOLS.searchAgent.name:
    case TOOLS.readAgent.name:
      return { targets: [], commands: [], resultShape: 'none', toolKnown: true };
    default:
      return { targets: stringsOf(input), commands: [], resultShape: 'listing', toolKnown: false };
  }
}

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}
