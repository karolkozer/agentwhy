// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { CODE_CELL } from '../contract/deliveries.ts';
import { ENVELOPE, LINE_TYPES } from '../contract/envelope.ts';
import { RESPONSE_ITEMS } from '../contract/messages.ts';
import { cellCommandPlaces } from '../events/cell-commands.ts';

/** Where the command a Codex hook was handed runs, as the cell that runs it says. */
export interface PendingCommandPlace {
  /** The folders its calls name with `workdir`, as written: whole, or relative to the session's folder. */
  readonly workdirs: readonly string[];
  /** A call of it names no `workdir`, and so runs in the session's folder. */
  readonly inSessionFolder: boolean;
  /** A call of it names a `workdir` that is not written text: where it runs is not known. */
  readonly unread: boolean;
}

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW15, RWB7: a `PreToolUse` hook is told the session's folder and the
 * command line, never the folder the call runs it in - `tools.exec_command({cmd:"cat notes.txt", workdir:"<project>/sub"})`
 * ran in `sub` on Codex 0.162.1 while the hook was told `<project>`; 1366 of 2795 commands of the maintainer's rollouts
 * name a `workdir` (RWB8). When the hook runs, the cell running the command is the rollout's newest code cell, written
 * before it (RWB7). Its calls whose command is exactly the one handed over say where it runs.
 *
 * `undefined` where that cannot be read: no code cell in the text given, or none of its calls hands over this command -
 * the caller reads the command where the hook was told it runs, as before.
 */
export function pendingCommandPlace(rolloutTail: string, command: string): PendingCommandPlace | undefined {
  const code = newestCellCode(rolloutTail);
  if (code === undefined) return undefined;
  const calls = cellCommandPlaces(code).filter((call) => call.command === command);
  if (calls.length === 0) return undefined;
  return {
    workdirs: [...new Set(calls.flatMap((call) => (call.workdir === undefined ? [] : [call.workdir])))],
    inSessionFolder: calls.some((call) => call.workdir === undefined && call.workdirUnread !== true),
    unread: calls.some((call) => call.workdirUnread === true),
  };
}

/** The code of the last whole code-cell line in a rollout's tail; a first line cut by the tail is skipped as unparsed. */
function newestCellCode(text: string): string | undefined {
  const lines = text.split('\n');
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = parseJsonObject(lines[at] ?? '');
    if (line?.[ENVELOPE.type] !== LINE_TYPES.responseItem) continue;
    const payload = line[ENVELOPE.payload];
    if (!isJsonObject(payload) || payload[ENVELOPE.payloadType] !== RESPONSE_ITEMS.codeCell || payload[CODE_CELL.name] !== CODE_CELL.tool) continue;
    const code = payload[CODE_CELL.code];
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
