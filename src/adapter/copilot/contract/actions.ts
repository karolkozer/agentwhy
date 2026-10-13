// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A call: announced in `assistant.message.data.toolRequests[]`, started by `tool.execution_start` and finished by
 * `tool.execution_complete`, all three carrying the same `toolCallId` (spec §2.3, §2.9; 28 of 28 starts joined to their
 * request and their completion, CPB16). The request's arguments and the start's were equal in every measured call.
 */
export const CALL = {
  requests: 'toolRequests',
  callId: 'toolCallId',
  /** On a request: the tool's name. On a start: `toolName`. */
  requestName: 'name',
  toolName: 'toolName',
  /** An object on the start; on a request an object too in the runtime (§2.8), a JSON string in VS Code's (CPB4). */
  arguments: 'arguments',
  turnId: 'turnId',
  /** On a subagent's call: the `task` call that started the subagent (§2.10). */
  parentCallId: 'parentToolCallId',
  /** On `bash`: the runtime's own reading of a command. Never evidence of what the command reached (plan step 4). */
  shellInfo: 'shellToolInfo',
  /** On an MCP call: its server and its tool (§2.14, CPB30). */
  mcpServer: 'mcpServerName',
  mcpTool: 'mcpToolName',
} as const;

/** The runtime's tools and the argument keys measured for each (CPB16, CPB25, CPB39). */
export const TOOLS = {
  shell: { name: 'bash', command: 'command', description: 'description' },
  view: { name: 'view', path: 'path', range: 'view_range' },
  glob: { name: 'glob', pattern: 'pattern', paths: 'paths' },
  search: { name: 'rg', pattern: 'pattern', paths: 'paths', glob: 'glob', outputMode: 'output_mode', headLimit: 'head_limit' },
  create: { name: 'create', path: 'path', text: 'file_text' },
  edit: { name: 'edit', path: 'path', oldText: 'old_str', newText: 'new_str' },
  delegate: { name: 'task', prompt: 'prompt', description: 'description', agentName: 'name', mode: 'mode', agentType: 'agent_type' },
  /** What a subagent handed back, collected by the agent that started it (CPB39, CP28). */
  readAgent: { name: 'read_agent', agentId: 'agent_id', sinceTurn: 'since_turn' },
  /** A search handed to a subagent of the runtime's own, `search-subagent` (CPB62): its words, and what it should find. */
  searchAgent: { name: 'search_code_subagent', prompt: 'query', description: 'details', thoroughness: 'thoroughness' },
  /** That subagent's tools, by VS Code's names and keys (CPB62, CP9): a file read in part or whole, a search, a listing. */
  readFile: { name: 'read_file', path: 'filePath', start: 'startLine', end: 'endLine' },
  grepSearch: { name: 'grep_search', query: 'query', regexp: 'isRegexp', include: 'includePattern' },
  fileSearch: { name: 'file_search', query: 'query' },
} as const;

/** The calls that start a subagent (CPB17, CPB62): the one `subagent.started` names. */
export const DELEGATING_TOOLS: readonly string[] = [TOOLS.delegate.name, TOOLS.searchAgent.name];

/**
 * The names the search tool was called by: `rg` (CPB16, CPB57), and `grep` with the same keys and a flag as a key of its
 * own (`-n`), in the CLI 1.0.95 with GPT-5 mini (CPB60) - which tools a session has follows its model.
 */
export const SEARCH_NAMES: readonly string[] = [TOOLS.search.name, 'grep'];

/**
 * `rg`'s `output_mode` (CPB57): `content` prints the lines it matched, `files_with_matches` the names alone. Any other
 * value, or none, is not measured, and is read the noisier way - as printing what it matched (CP8).
 */
export const SEARCH_OUTPUT = { matches: 'content', namesOnly: 'files_with_matches' } as const;

/**
 * Tools seen with no measured meaning: a typed unknown action, never a guess (CP8). `sql` ran three times in a fleet of
 * subagents (CPB39); what it reads is not measured. `list_bash` lists the session's shells (CPB51, the desktop app once).
 * (`search_code_subagent` was listed here until CPB62 measured it as a delegation.)
 */
export const UNPROFILED_TOOLS = ['sql', 'list_bash'] as const;
