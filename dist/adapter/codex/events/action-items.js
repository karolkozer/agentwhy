// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { posixReadingOfPowerShell } from '../../../core/access/powershell-line.js';
import { isJsonObject } from '../../../shared/json.js';
import { ACTION_ITEMS, CHANGE_KINDS, COMMAND, FILE_CHANGE, IMAGE_VIEW, ITEM, ITEM_STATUSES, MCP, OWN_RESULT, OMISSION_NOTICE, POWERSHELL_FLAG, POWERSHELLS, SHELL_FLAGS, SHELLS, WEB_SEARCH, } from '../contract/actions.js';
/** The action item types the contract names, whether or not it has a profile for them (X6). */
export function isActionItem(type) {
    return Object.values(ACTION_ITEMS).some((known) => known === type);
}
/**
 * One action item, read as X6-X11 say. An item type the contract does not name is read the same way as `Extension`:
 * an unknown tool whose recorded fields are kept as raw input, with no targets and no effect - the caller adds the
 * capability gap that says an item was not understood.
 */
export function readAction(item) {
    const execution = executionOf(item);
    switch (item[ITEM.type]) {
        case ACTION_ITEMS.command:
            return command(item, execution);
        case ACTION_ITEMS.fileChange:
            return fileChange(item, execution);
        case ACTION_ITEMS.mcp: {
            const server = item[MCP.server];
            const tool = item[MCP.tool];
            return {
                ...unknownTool('McpToolCall', pick(item, [MCP.server, MCP.tool, MCP.arguments]), execution),
                ...(typeof server === 'string' && server !== '' && typeof tool === 'string' && tool !== '' ? { mcp: { server, tool } } : {}),
                ...((tool === OWN_RESULT.tool ? ownWords(item[MCP.result]) : undefined) ?? rawOutput(item[MCP.result])),
            };
        }
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
function executionOf(item) {
    const status = item[ITEM.status];
    const exitCode = item[COMMAND.exitCode];
    const known = status === undefined ? 'completed' : status === ITEM_STATUSES.completed ? 'completed' : status === ITEM_STATUSES.failed ? 'failed' : 'unrecognised';
    return { status: known, ...(typeof exitCode === 'number' && Number.isInteger(exitCode) ? { exitCode } : {}) };
}
/**
 * X7, X8: the command line is `command[2]` only when `command` is exactly `[shell, -lc|-c, line]` with a listed shell,
 * or `[pwsh, -Command, line]` on Windows (PW11); any other shape keeps the whole array as input and is not read as a
 * line. `parsed_cmd` is never read. A read line is named by the shell the record says ran it, `zsh (cat)` beside Claude
 * Code's `Bash (cat)`: a listed name, never the record's text. Any other shape keeps the item's type as its name.
 */
function command(item, execution) {
    const words = item[COMMAND.command];
    const directory = item[COMMAND.workingDirectory];
    const input = { command: words, ...(typeof directory === 'string' ? { cwd: directory } : {}) };
    const shape = commandLineOf(words);
    const output = item[COMMAND.output];
    const recorded = typeof output === 'string'
        ? { output: { text: output, completeness: OMISSION_NOTICE.test(output) ? 'partial' : 'unknown' } }
        : {};
    if (shape === undefined)
        return { ...unknownTool('CommandExecution', input, execution), ...recorded };
    return {
        toolName: shape.shell, input, targets: [], commands: [shape.line], resultShape: 'listing', toolKnown: true, execution, ...recorded, unanswered: [],
    };
}
/**
 * X7: the shell a `command` array names and the line it runs, where the array is exactly `[shell, flag, line]` with a
 * listed shell and its flag. `2026-10-12-powershell-on-windows.md` PW11: PowerShell's line, Codex's on Windows, is read
 * as the POSIX line it equals (PW1); the item's input keeps it as written.
 */
export function commandLineOf(words) {
    if (!Array.isArray(words) || words.length !== 3 || typeof words[2] !== 'string')
        return undefined;
    const [program, flag, line] = words;
    const name = typeof program === 'string' ? fileName(program) : undefined;
    const shell = SHELLS.find((each) => each === name);
    if (shell !== undefined)
        return SHELL_FLAGS.some((each) => each === flag) ? { shell, line } : undefined;
    // Windows names a file in any case, and a program with `.exe`.
    const powershell = POWERSHELLS.find((each) => each === name?.toLowerCase().replace(/\.exe$/, ''));
    return powershell !== undefined && flag === POWERSHELL_FLAG ? { shell: powershell, line: posixReadingOfPowerShell(line) } : undefined;
}
/** The file name a program is run by - `/bin/zsh` is `zsh` - cut at either separator, since a Windows record writes `\`. */
function fileName(program) {
    return program.split(/[\\/]/).at(-1) ?? program;
}
/**
 * X9: the targets are the keys of `changes` and every `move_path`; `written` is the text of an add and the added lines of
 * an update, for a completed change only. A failed change keeps its proposed text in its raw input and writes nothing; a
 * change kind or diff this does not read writes nothing either, and says so.
 */
function fileChange(item, execution) {
    const changes = item[FILE_CHANGE.changes];
    if (!isJsonObject(changes))
        return unknownTool('FileChange', withoutEnvelope(item), execution);
    const targets = [];
    const written = [];
    const removed = [];
    let unread = false;
    for (const [path, change] of Object.entries(changes)) {
        targets.push(path);
        if (!isJsonObject(change)) {
            unread = true;
            continue;
        }
        const moved = change[FILE_CHANGE.movePath];
        if (typeof moved === 'string' && moved !== '')
            targets.push(moved);
        const kind = change[FILE_CHANGE.kind];
        const content = change[FILE_CHANGE.content];
        const diff = change[FILE_CHANGE.diff];
        if (kind === CHANGE_KINDS.add && typeof content === 'string')
            written.push(content);
        else if (kind === CHANGE_KINDS.update && typeof diff === 'string') {
            written.push(...addedLines(diff));
            removed.push(...removedLines(diff));
        }
        else if (kind !== CHANGE_KINDS.delete)
            unread = true;
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
        ...(completed && removed.length > 0 ? { removed } : {}),
        execution,
        // X9: a change this does not read adds nothing it may have saved. A failed one is an unestablished effect already,
        // which the core says as such.
        unanswered: completed && unread ? ['access'] : [],
    };
}
/** The lines an update removes, read only to say what a change to a guard file took out (OG2), never as text it wrote. */
function removedLines(diff) {
    // A `---` line is a file's header only before the first hunk; inside one it is a removed line that began with `--`.
    const lines = diff.split('\n');
    const hunk = lines.findIndex((line) => line.startsWith('@@'));
    return lines.filter((line, at) => line.startsWith('-') && !(line.startsWith('---') && (hunk === -1 || at < hunk))).map((line) => line.slice(1));
}
/** The lines an update adds, never the lines it removes: a value only there was in the file already (R7). */
function addedLines(diff) {
    return diff.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).map((line) => line.slice(1));
}
function unknownTool(toolName, input, execution) {
    return { toolName, input, targets: [], commands: [], resultShape: 'none', toolKnown: false, execution, unanswered: [] };
}
/** CV18: agentwhy's own answer is the words it handed over; any other tool's result is kept raw, of unknown completeness. */
function ownWords(result) {
    if (!isJsonObject(result))
        return undefined;
    const meta = result[OWN_RESULT.meta];
    const content = result[OWN_RESULT.content];
    const structured = result[OWN_RESULT.structured] ?? undefined;
    if (!isJsonObject(meta) || !(OWN_RESULT.answer in meta) || structured !== undefined || !Array.isArray(content) || content.length !== 1)
        return undefined;
    const [block] = content;
    const text = isJsonObject(block) && block[OWN_RESULT.type] === OWN_RESULT.textType ? block[OWN_RESULT.text] : undefined;
    return typeof text === 'string' ? { own: true, output: { text, completeness: 'unknown' } } : undefined;
}
/**
 * A result whose text fields the contract does not name (X10): kept whole as raw text, so a value in it is still found and
 * redacted, and never said to be complete.
 */
function rawOutput(value) {
    if (value === undefined || value === null)
        return {};
    return { output: { text: typeof value === 'string' ? value : JSON.stringify(value), completeness: 'unknown' } };
}
function pick(item, keys) {
    return Object.fromEntries(keys.filter((key) => key in item).map((key) => [key, item[key]]));
}
function withoutEnvelope(item) {
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== ITEM.type && key !== ITEM.id));
}
