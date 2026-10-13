// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Answer, Question } from './capabilities.ts';

/**
 * Where VS Code keeps Copilot's chats (`what-copilot-wrote` §2.1, CPB1, measured on macOS): one folder a workspace under
 * the person's `workspaceStorage`, named by an opaque hash, whose `workspace.json` names the folder it was opened on, and
 * whose `GitHub.copilot-chat/transcripts/` holds one `.jsonl` a chat. Their content is not read - the transcript records
 * no result and a refused call as one that ran (CPB5, CPB28; CPD2, `copilot-blocks-too` CBD5) - only counted.
 */
export const VS_CODE_STORE = {
  /** Under the home directory, on macOS: the one platform measured. */
  workspaces: ['Library', 'Application Support', 'Code', 'User', 'workspaceStorage'],
  workspaceFile: 'workspace.json',
  folderKey: 'folder',
  transcripts: ['GitHub.copilot-chat', 'transcripts'],
  /** Beside `workspace.json`: VS Code's own log of each chat, `<session id>.jsonl` (VCB-M1). */
  chatLogs: 'chatSessions',
  extension: '.jsonl',
} as const;

/**
 * v1 (2026-10-13): the log VS Code keeps of each Copilot chat - `chatSessions/<session id>.jsonl` beside `workspace.json` -
 * from `what-vs-code-copilot-wrote` §2 (VCB-M1-M18), measured by a reconnaissance probe on 95 logs. A contract of its own,
 * apart from the runtime's (`version.ts`): the CLI's and the desktop app's record does not change with it.
 */
export const VS_CODE_CONTRACT_VERSION = 1;

export const VS_CODE_VERIFIED_AGAINST = {
  date: '2026-10-13',
  /** The VS Code and Copilot Chat builds the transcripts beside the logs name (VCB-M1). */
  vscode: ['1.139.0'],
  copilotChat: ['0.67.0'],
  logs: 95,
} as const;

/**
 * A log of changes (VCB-M2, VCB-M13): each line a `kind` - 0, a snapshot of the whole chat in `v`; 1, the value at the
 * path `k` set to `v`; 2, the array at `k` grown by `v`'s items, appended or, where `i` is given, spliced in at `i`. One
 * snapshot a log, first. `version` 3 is the one measured (VCB-M3).
 */
export const CHAT_LOG = {
  kind: 'kind',
  value: 'v',
  path: 'k',
  index: 'i',
  snapshot: 0,
  set: 1,
  append: 2,
  version: 3,
} as const;

/** The chat a log replays to (VCB-M4): its id, when it was made, its title - every chat with a request has one - and its requests. */
export const CHAT = {
  version: 'version',
  sessionId: 'sessionId',
  created: 'creationDate',
  title: 'customTitle',
  requests: 'requests',
} as const;

/**
 * A request (VCB-M5, VCB-M6): what the person wrote, when (ms), with which model, in which mode, and - in its result's
 * metadata - each round of calls the model made, with arguments, and what each returned, keyed by the call's id.
 */
export const REQUEST = {
  id: 'requestId',
  timestamp: 'timestamp',
  message: 'message',
  text: 'text',
  model: 'modelId',
  mode: 'modeInfo',
  modeKind: 'kind',
  agentMode: 'agent',
  response: 'response',
  result: 'result',
  metadata: 'metadata',
  rounds: 'toolCallRounds',
  calls: 'toolCalls',
  results: 'toolCallResults',
} as const;

/** A call the model made (VCB-M6): its id - the key of its result (VCB-M7) - its tool's name, and its arguments as JSON text. */
export const CALL = { id: 'id', name: 'name', arguments: 'arguments' } as const;

/** A call's id (VCB-M7, VCB-M17): `call_` or, for a Claude model, `toolu_`, then `__vscode-` and digits. */
export const CALL_ID = /^(?:call|toolu)_[A-Za-z0-9]+__vscode-\d+$/;

/**
 * What a call handed the model (VCB-M7, VCB-M17): `content[].value` - a string, or an element tree whose text is its `text`
 * leaves in order, a leaf with `lineBreakBefore` opening a line, a file it names in `references[].anchor.fsPath`.
 */
export const RESULT = {
  content: 'content',
  value: 'value',
  tree: 'node',
  children: 'children',
  text: 'text',
  lineBreak: 'lineBreakBefore',
  references: 'references',
  anchor: 'anchor',
  fsPath: 'fsPath',
} as const;

/**
 * VS Code's words in a result (VCB-M9, VCB-M12, VCB-M15), each opening it: a hook refused the call, its reason following;
 * a person skipped it, or cancelled it; and, closing a terminal's output, that its beginning was lost past the scrollback.
 */
export const RESULT_WORDS = {
  hookRefused: 'Tool execution denied: ',
  skipped: 'The user chose to skip the tool call',
  cancelled: 'The user cancelled the tool call',
  cut: 'Output exceeded terminal scrollback; beginning of output was lost',
} as const;

/**
 * A part of the reply that shows a call (VCB-M8, VCB-M12, VCB-M16): the call it shows by `toolCallId`, the id before
 * `__vscode-` (a call refused before it ran carries a UUID instead, and joins none); how it was let through; what VS Code
 * keeps of a terminal or a helper; and, for a helper's own call, the `runSubagent` it ran under. A file it names is a
 * `URI` among its messages' `uris` (28 parts, a helper's 1 of 1).
 */
export const PART = {
  kind: 'kind',
  tool: 'toolInvocationSerialized',
  hook: 'hook',
  callId: 'toolCallId',
  toolId: 'toolId',
  complete: 'isComplete',
  confirmed: 'isConfirmed',
  confirmedType: 'type',
  specific: 'toolSpecificData',
  helperOf: 'subAgentInvocationId',
  message: 'invocationMessage',
  pastTense: 'pastTenseMessage',
  uris: 'uris',
} as const;

/**
 * What VS Code hands the model with a request, before any call (VCB-M20, VCB-M21): `variableData.variables[]`, each of a
 * `kind` - `file`, a file open in the editor (its `value` a location: `uri` and `range`) or attached with `#` (a URI);
 * `promptFile`, an instructions file VS Code adds itself (a URI). Its text is never in the log: VS Code reads the file as it
 * sends the request, and no hook is asked (VCD6).
 */
export const CONTEXT = {
  data: 'variableData',
  variables: 'variables',
  kind: 'kind',
  value: 'value',
  uri: 'uri',
  kinds: ['file', 'promptFile'],
} as const;

/** An entry of a message's `uris` (the probe, 54 of 54): VS Code's serialised URI, the file its `path` where the scheme is `file`. */
export const URI = { scheme: 'scheme', path: 'path', file: 'file' } as const;

/**
 * The kinds of part measured (VCB-M8, the probe); a markdown part has no `kind`, and its text is its `value`, a string (140
 * of 140, VCB-M19). A part of another kind may show a call no measurement saw, so a chat holding one is not known whole
 * (VCD4).
 */
export const PART_KINDS = [
  'thinking', 'inlineReference', 'toolInvocationSerialized', 'mcpServersStarting', 'hook', 'autoModeResolution', 'undoStop',
  'codeblockUri', 'textEditGroup', 'progressTaskSerialized', 'disabledClaudeHooks', 'reference', 'agent', 'text', 'promptFile',
] as const;

export const MARKDOWN = { value: 'value' } as const;

/**
 * A part's `toolId` and the name of the call it shows (VCB-M19, the probe: each of 53 joined parts, one name to one id).
 * A helper's call is its part alone (VCB-M16), so its tool is known by this.
 */
export const PART_TOOLS: Readonly<Record<string, string>> = {
  copilot_readFile: 'read_file',
  copilot_applyPatch: 'apply_patch',
  copilot_listDirectory: 'list_dir',
  copilot_getErrors: 'get_errors',
  copilot_findFiles: 'file_search',
  run_in_terminal: 'run_in_terminal',
  manage_todo_list: 'manage_todo_list',
  tool_search: 'tool_search',
  terminal_last_command: 'terminal_last_command',
  runSubagent: 'runSubagent',
};

/** How a call was let through (VCB1, answered): with no question, on a person's Allow, a person's Skip; 0 is a refusal. */
export const CONFIRMATION = { refused: 0, noQuestion: 1, allowed: 4, skipped: 5 } as const;

/**
 * What VS Code keeps beside a terminal's call and a helper's (VCB-M15, VCB-M16). A terminal's state holds an exit code for
 * each command that ran (the probe: 4 of 4 run on a person's Allow) and none for one skipped or refused (5 of 5).
 */
export const SPECIFIC = {
  kind: 'kind',
  terminal: 'terminal',
  subagent: 'subagent',
  state: 'terminalCommandState',
  exitCode: 'exitCode',
  /** The folder a terminal's command ran in, a `URI` (9 of 9, VCB-M19). */
  folder: 'cwd',
  helperResult: 'result',
} as const;

/**
 * The tools measured (VCB-M6, VCB-M16), by the name the log - and a `PreToolUse` hook (`hooks.ts`) - gives them, with the
 * argument keys each was seen with.
 */
export const VS_CODE_LOG_TOOLS = {
  readFile: { name: 'read_file', path: 'filePath', start: 'startLine', end: 'endLine' },
  terminal: { name: 'run_in_terminal', command: 'command' },
  patch: { name: 'apply_patch', input: 'input' },
  fileSearch: { name: 'file_search', query: 'query' },
  listDir: { name: 'list_dir', path: 'path' },
  getErrors: { name: 'get_errors', paths: 'filePaths' },
  todo: { name: 'manage_todo_list' },
  toolSearch: { name: 'tool_search' },
  lastCommand: { name: 'terminal_last_command' },
  subagent: { name: 'runSubagent', description: 'description', prompt: 'prompt' },
} as const;

/**
 * What a log of `version` 3 answers (§2), for the chat's own agent: every call with its arguments and what it returned
 * (VCB-M6, VCB-M7), a cut said in VS Code's words (VCB-M15), the agent's text (VCB-M19), and who refused a call - a hook in
 * its words, a person's Skip or cancel (VCB-M9, VCB-M12). Its `thinking` parts are not read as a reason, and the settings
 * that let a call run with no question are not recorded.
 */
export const CHAT_ANSWERS: Readonly<Record<Question, Answer>> = {
  actions: 'supported',
  access: 'supported',
  'output-delivery': 'supported',
  'own-words': 'supported',
  reasoning: 'unmeasured',
  refusals: 'supported',
  permissions: 'unmeasured',
};

/**
 * For a helper `runSubagent` started (VCB-M16, 1 of 1): its calls are parts that name their files and say whether they
 * finished, and keep no result - what it was handed is not recorded; what it wrote, and who refused a call of its, were not
 * measured.
 */
export const HELPER_ANSWERS: Readonly<Record<Question, Answer>> = {
  actions: 'supported',
  access: 'supported',
  'output-delivery': 'absent',
  'own-words': 'unmeasured',
  reasoning: 'unmeasured',
  refusals: 'unmeasured',
  permissions: 'unmeasured',
};
