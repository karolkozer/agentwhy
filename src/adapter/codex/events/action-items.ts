import { basename } from 'node:path';
import type { CapabilityQuestion, ContentCompleteness } from '../../../core/completeness.ts';
import type { Execution, ResultShape } from '../../../core/event.ts';
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import {
  ACTION_ITEMS,
  CHANGE_KINDS,
  COMMAND,
  FILE_CHANGE,
  IMAGE_VIEW,
  ITEM,
  ITEM_STATUSES,
  MCP,
  OMISSION_NOTICE,
  SHELL_FLAGS,
  SHELLS,
  WEB_SEARCH,
} from '../contract/actions.ts';

/** An action item as the core's call and result need it, before ids, agents and positions are added. */
export interface ReadAction {
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly targets: readonly string[];
  readonly commands: readonly string[];
  readonly resultShape: ResultShape;
  readonly toolKnown: boolean;
  readonly written?: readonly string[];
  readonly execution: Execution;
  /** What the action recorded as its output, at the `execution` stage: nothing here says the model received it. */
  readonly output?: { readonly text: string; readonly completeness: ContentCompleteness };
  /** Questions this one item cannot answer: a change of a kind the contract does not read, for instance. */
  readonly unanswered: readonly CapabilityQuestion[];
}

/** The action item types the contract names, whether or not it has a profile for them (X6). */
export function isActionItem(type: unknown): boolean {
  return Object.values(ACTION_ITEMS).some((known) => known === type);
}

/**
 * One action item, read as X6-X11 say. An item type the contract does not name is read the same way as `Extension`:
 * an unknown tool whose recorded fields are kept as raw input, with no targets and no effect - the caller adds the
 * capability gap that says an item was not understood.
 */
export function readAction(item: JsonObject): ReadAction {
  const execution = executionOf(item);
  switch (item[ITEM.type]) {
    case ACTION_ITEMS.command:
      return command(item, execution);
    case ACTION_ITEMS.fileChange:
      return fileChange(item, execution);
    case ACTION_ITEMS.mcp:
      return {
        ...unknownTool('McpToolCall', pick(item, [MCP.server, MCP.tool, MCP.arguments]), execution),
        ...rawOutput(item[MCP.result]),
      };
    case ACTION_ITEMS.webSearch:
      return { ...unknownTool('WebSearch', pick(item, [WEB_SEARCH.action]), execution), ...rawOutput(item[WEB_SEARCH.results]) };
    case ACTION_ITEMS.imageView: {
      const path = item[IMAGE_VIEW.path];
      return unknownTool('ImageView', typeof path === 'string' ? { path } : {}, execution);
    }
    case ACTION_ITEMS.extension:
      return unknownTool('Extension', withoutEnvelope(item), execution);
    default:
      return unknownTool('unrecognised action', withoutEnvelope(item), execution);
  }
}

/** X11: the status an item recorded, which says it ran and never what it reached. An item_completed with none completed. */
function executionOf(item: JsonObject): Execution {
  const status = item[ITEM.status];
  const exitCode = item[COMMAND.exitCode];
  const known = status === undefined ? 'completed' : status === ITEM_STATUSES.completed ? 'completed' : status === ITEM_STATUSES.failed ? 'failed' : 'unrecognised';
  return { status: known, ...(typeof exitCode === 'number' && Number.isInteger(exitCode) ? { exitCode } : {}) };
}

/**
 * X7, X8: the command line is `command[2]` only when `command` is exactly `[shell, -lc|-c, line]` with a listed shell;
 * any other shape keeps the whole array as input and is not read as a line. `parsed_cmd` is never read. A read line is
 * named by the shell the record says ran it, `zsh (cat)` beside Claude Code's `Bash (cat)`: a listed name, never the
 * record's text. Any other shape keeps the item's type as its name.
 */
function command(item: JsonObject, execution: Execution): ReadAction {
  const words = item[COMMAND.command];
  const directory = item[COMMAND.workingDirectory];
  const input = { command: words, ...(typeof directory === 'string' ? { cwd: directory } : {}) };
  const shape = Array.isArray(words) && words.length === 3 && SHELL_FLAGS.some((flag) => flag === words[1]) && typeof words[2] === 'string'
    ? { shell: shellOf(words[0]), line: words[2] }
    : undefined;
  const output = item[COMMAND.output];
  const recorded = typeof output === 'string'
    ? { output: { text: output, completeness: OMISSION_NOTICE.test(output) ? ('partial' as const) : ('unknown' as const) } }
    : {};
  if (shape?.shell === undefined) return { ...unknownTool('CommandExecution', input, execution), ...recorded };
  return {
    toolName: shape.shell, input, targets: [], commands: [shape.line], resultShape: 'listing', toolKnown: true, execution, ...recorded, unanswered: [],
  };
}

/** The listed shell `program` names, by its file name: `/bin/zsh` is `zsh`. */
function shellOf(program: unknown): (typeof SHELLS)[number] | undefined {
  return typeof program === 'string' ? SHELLS.find((shell) => shell === basename(program)) : undefined;
}

/**
 * X9: the targets are the keys of `changes` and every `move_path`; `written` is the text of an add and the added lines of
 * an update, for a completed change only. A failed change keeps its proposed text in its raw input and writes nothing; a
 * change kind or diff this does not read writes nothing either, and says so.
 */
function fileChange(item: JsonObject, execution: Execution): ReadAction {
  const changes = item[FILE_CHANGE.changes];
  if (!isJsonObject(changes)) return unknownTool('FileChange', withoutEnvelope(item), execution);
  const targets: string[] = [];
  const written: string[] = [];
  let unread = false;
  for (const [path, change] of Object.entries(changes)) {
    targets.push(path);
    if (!isJsonObject(change)) {
      unread = true;
      continue;
    }
    const moved = change[FILE_CHANGE.movePath];
    if (typeof moved === 'string' && moved !== '') targets.push(moved);
    const kind = change[FILE_CHANGE.kind];
    const content = change[FILE_CHANGE.content];
    const diff = change[FILE_CHANGE.diff];
    if (kind === CHANGE_KINDS.add && typeof content === 'string') written.push(content);
    else if (kind === CHANGE_KINDS.update && typeof diff === 'string') written.push(...addedLines(diff));
    else if (kind !== CHANGE_KINDS.delete) unread = true;
  }
  const completed = execution.status === 'completed';
  return {
    toolName: 'FileChange',
    input: { changes },
    targets,
    commands: [],
    resultShape: 'none',
    toolKnown: true,
    ...(completed ? { written } : {}),
    execution,
    // X9: a change this does not read adds nothing it may have saved. A failed one is an unestablished effect already,
    // which the core says as such.
    unanswered: completed && unread ? ['access'] : [],
  };
}

/** The lines an update adds, never the lines it removes: a value only there was in the file already (R7). */
function addedLines(diff: string): string[] {
  return diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
}

function unknownTool(toolName: string, input: Readonly<Record<string, unknown>>, execution: Execution): ReadAction {
  return { toolName, input, targets: [], commands: [], resultShape: 'none', toolKnown: false, execution, unanswered: [] };
}

/**
 * A result whose text fields the contract does not name (X10): kept whole as raw text, so a value in it is still found and
 * redacted, and never said to be complete.
 */
function rawOutput(value: unknown): Pick<ReadAction, 'output'> {
  if (value === undefined || value === null) return {};
  return { output: { text: typeof value === 'string' ? value : JSON.stringify(value), completeness: 'unknown' } };
}

function pick(item: JsonObject, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in item).map((key) => [key, item[key]]));
}

function withoutEnvelope(item: JsonObject): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([key]) => key !== ITEM.type && key !== ITEM.id));
}
