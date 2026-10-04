// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { HOOK_HASH, PRE_TOOL_USE, PROJECT_HOOKS, USER_HOOKS } from '../contract/hooks.ts';
import type { HookEvent, PlacedEntry } from './hook-approval.ts';

/**
 * agentwhy's Codex hook, and no one else's: `refuse` with `--codex` straight after it. Nothing but agentwhy writes that
 * flag, so a command with it is taken out and replaced, and every other command in the file is left as it was (K13).
 */
const RUNS_CODEX_REFUSE = /(?:^|\s)refuse\s+--codex(?:\s|$)/;
const RUNS_CODEX_STOP = /(?:^|\s)codex-stop\s+--codex(?:\s|$)/;

/**
 * The command agentwhy's Codex hook runs (`codex-blocks-too` CK3): the invocation, `refuse --codex`, and the settings
 * file Claude Code's `refuse` reads, relative to the project, where it reads one. `refuse --codex` finds the project
 * from the folder Codex runs it in, so no absolute path is written and the file works in a clone.
 */
export function codexRefuseCommand(invoke: string, settings: string | undefined): string {
  return `${invoke} refuse --codex${settings === undefined ? '' : ` --settings "${settings}"`}`;
}

/** The `--settings` a command `codexRefuseCommand` wrote names, as written - relative to the project. */
const SETTINGS_NAMED = /\s--settings\s+"([^"]*)"/;

/**
 * The settings file agentwhy's Codex `refuse` reads in this file, relative to the project, where it names one (CK2):
 * the rules Codex's Stop hook reads too (`codex-says-it-too` CX5), so the two never read different lists.
 */
export function codexRefuseSettings(file: JsonObject): string | undefined {
  const command = codexRefuseIn(file);
  return command === undefined ? undefined : SETTINGS_NAMED.exec(command)?.[1];
}

/** The companion Stop hook asks Codex to credit agentwhy for a blocked command in its reply. */
export function codexStopCommand(invoke: string): string {
  return `${invoke} codex-stop --codex`;
}

/** The command agentwhy's Codex hook runs in this file, where it runs one. */
export function codexRefuseIn(file: JsonObject): string | undefined {
  return commandsOf(file, PRE_TOOL_USE.event).find((command) => RUNS_CODEX_REFUSE.test(command));
}

export function codexStopIn(file: JsonObject): string | undefined {
  return commandsOf(file, 'Stop').find((command) => RUNS_CODEX_STOP.test(command));
}

/** The file with agentwhy's Codex hook running `command`, on the shell's `PreToolUse`, in place of any it had (CK5). */
export function withCodexRefuse(file: JsonObject, command: string, stopCommand: string): JsonObject {
  const { file: without } = withoutCodexRefuse(file);
  const hooks = isJsonObject(without[PROJECT_HOOKS.hooks]) ? { ...(without[PROJECT_HOOKS.hooks] as JsonObject) } : {};
  const list = Array.isArray(hooks[PRE_TOOL_USE.event]) ? [...(hooks[PRE_TOOL_USE.event] as unknown[])] : [];
  const stops = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];
  list.push({
    [PROJECT_HOOKS.matcher]: PRE_TOOL_USE.shellTool,
    [PROJECT_HOOKS.commands]: [{ [PROJECT_HOOKS.type]: PROJECT_HOOKS.commandType, [PROJECT_HOOKS.command]: command }],
  });
  stops.push({ [PROJECT_HOOKS.commands]: [{ [PROJECT_HOOKS.type]: PROJECT_HOOKS.commandType, [PROJECT_HOOKS.command]: stopCommand }] });
  return { ...without, [PROJECT_HOOKS.hooks]: { ...hooks, [PRE_TOOL_USE.event]: list, Stop: stops } };
}

/**
 * The file without agentwhy's Codex hook. An entry left with no command is dropped, and an event left with no entry;
 * the `hooks` object itself stays, empty or not, and so does every other key and hook.
 */
export function withoutCodexRefuse(file: JsonObject): { readonly file: JsonObject; readonly removed: number } {
  const hooks = file[PROJECT_HOOKS.hooks];
  if (!isJsonObject(hooks)) return { file, removed: 0 };

  let removed = 0;
  const kept: JsonObject = {};
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) {
      kept[event] = list;
      continue;
    }
    const entries = list.flatMap((entry: unknown) => {
      if (!isJsonObject(entry) || !Array.isArray(entry[PROJECT_HOOKS.commands])) return [entry];
      const commands = (entry[PROJECT_HOOKS.commands] as unknown[]).filter((item) => {
        const ours = isJsonObject(item) && typeof item[PROJECT_HOOKS.command] === 'string' &&
          (event === PRE_TOOL_USE.event ? RUNS_CODEX_REFUSE.test(item[PROJECT_HOOKS.command] as string) :
            event === 'Stop' && RUNS_CODEX_STOP.test(item[PROJECT_HOOKS.command] as string));
        if (ours) removed += 1;
        return !ours;
      });
      return commands.length === 0 ? [] : [{ ...entry, [PROJECT_HOOKS.commands]: commands }];
    });
    if (entries.length > 0) kept[event] = entries;
  }
  return { file: removed === 0 ? file : { ...file, [PROJECT_HOOKS.hooks]: kept }, removed };
}

/** The two events agentwhy writes, each with the pattern that tells its command and the group it writes. */
const OWN_EVENTS: ReadonlyArray<{ readonly event: HookEvent; readonly runs: RegExp; readonly matcher?: string }> = [
  { event: 'PreToolUse', runs: RUNS_CODEX_REFUSE, matcher: PRE_TOOL_USE.shellTool },
  { event: 'Stop', runs: RUNS_CODEX_STOP },
];

/**
 * agentwhy's entries where they stand in this file, with the indices Codex keys their approval by
 * (`2026-10-02-codex-approves-its-own-hook.md` AOB1, AO3). Every array item counts toward an index, valid or not,
 * because Codex enumerates them all.
 */
export function agentwhyCodexEntries(file: JsonObject): readonly PlacedEntry[] {
  const hooks = file[PROJECT_HOOKS.hooks];
  if (!isJsonObject(hooks)) return [];
  const found: PlacedEntry[] = [];
  for (const { event, runs } of OWN_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    list.forEach((group: unknown, groupIndex) => {
      if (!isJsonObject(group) || !Array.isArray(group[PROJECT_HOOKS.commands])) return;
      (group[PROJECT_HOOKS.commands] as unknown[]).forEach((item, handlerIndex) => {
        if (!isJsonObject(item) || typeof item[PROJECT_HOOKS.command] !== 'string' || !runs.test(item[PROJECT_HOOKS.command] as string)) return;
        const matcher = group[PROJECT_HOOKS.matcher];
        found.push({ event, group: groupIndex, handler: handlerIndex, ...(typeof matcher === 'string' ? { matcher } : {}), entry: item });
      });
    });
  }
  return found;
}

/**
 * The entries agentwhy approves: the first of each event, which is the one `withOwnPair` keeps and setup files an
 * approval for (AO3). A further entry of the same event is one that shares a group with another tool's and stays
 * (AO4), unapproved and so skipped by Codex - never a reason to call the approved check anything but what it is.
 */
export function approvedCodexEntries(file: JsonObject): readonly PlacedEntry[] {
  const seen = new Set<HookEvent>();
  return agentwhyCodexEntries(file).filter((entry) => {
    if (seen.has(entry.event)) return false;
    seen.add(entry.event);
    return true;
  });
}

/** A hooks file after agentwhy's edit, and how many of its entries could not come out without moving another's key. */
export interface OwnEntriesEdit {
  readonly file: JsonObject;
  /** agentwhy's entries removed. */
  readonly removed: number;
  /** agentwhy's entries left in place: taking them out would have shifted another tool's key (AO4). */
  readonly stuck: number;
}

/**
 * The file holding exactly one agentwhy pair (AO1, AO4): of each event, the first agentwhy entry is rewritten **in
 * place** to the wanted command - alone in its group, the group's matcher becomes agentwhy's own - and every other
 * agentwhy entry of that event comes out; where there is none, a group is appended at the end of the event's list.
 * Nothing else moves, so no other tool's approval key shifts (AOD3).
 */
export function withOwnPair(file: JsonObject, refuseCommand: string, stopCommand: string): OwnEntriesEdit {
  const hooks = isJsonObject(file[PROJECT_HOOKS.hooks]) ? (file[PROJECT_HOOKS.hooks] as JsonObject) : {};
  const next: JsonObject = { ...hooks };
  let removed = 0;
  let stuck = 0;
  for (const { event, runs, matcher } of OWN_EVENTS) {
    const command = event === 'PreToolUse' ? refuseCommand : stopCommand;
    const list = Array.isArray(hooks[event]) ? [...(hooks[event] as unknown[])] : [];
    const placed = positionsIn(list, runs);
    const [first, ...duplicates] = placed;
    if (first === undefined) {
      list.push({ ...(matcher === undefined ? {} : { [PROJECT_HOOKS.matcher]: matcher }), [PROJECT_HOOKS.commands]: [ownEntry(command)] });
    } else {
      const group = list[first.group] as JsonObject;
      const handlers = [...(group[PROJECT_HOOKS.commands] as unknown[])];
      handlers[first.handler] = ownEntry(command);
      const alone = handlers.length === 1;
      list[first.group] = { ...group, ...(alone && matcher !== undefined ? { [PROJECT_HOOKS.matcher]: matcher } : {}), [PROJECT_HOOKS.commands]: handlers };
    }
    const result = withoutPositions(list, duplicates);
    removed += result.removed;
    stuck += result.stuck;
    next[event] = result.list;
  }
  return { file: { ...file, [PROJECT_HOOKS.hooks]: next }, removed, stuck };
}

/**
 * The file without agentwhy's entries (AO4, AO7): each comes out of its group; a group left empty is dropped only when
 * it is the last of its event's list - and then the next one before it, while it is agentwhy's emptied group too - and
 * otherwise stays as an empty group, which Codex skips and still counts. An entry with another tool's entry after it in
 * the same group stays, and is counted as `stuck`: taking it out would shift that entry's key.
 */
export function withoutOwnEntries(file: JsonObject): OwnEntriesEdit {
  const hooks = file[PROJECT_HOOKS.hooks];
  if (!isJsonObject(hooks)) return { file, removed: 0, stuck: 0 };
  const next: JsonObject = { ...hooks };
  let removed = 0;
  let stuck = 0;
  for (const { event, runs } of OWN_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    const result = withoutPositions([...list], positionsIn(list, runs));
    removed += result.removed;
    stuck += result.stuck;
    if (result.removed === 0) continue;
    if (result.list.length === 0) delete next[event];
    else next[event] = result.list;
  }
  return { file: removed === 0 ? file : { ...file, [PROJECT_HOOKS.hooks]: next }, removed, stuck };
}

/**
 * agentwhy's entry as written: the command and Codex's wait for it (AO14, AOD9), and nothing else, so its hash stays
 * within what was measured (AO2, AOB10).
 */
function ownEntry(command: string): JsonObject {
  return { [PROJECT_HOOKS.type]: PROJECT_HOOKS.commandType, [PROJECT_HOOKS.command]: command, [HOOK_HASH.fields.timeout]: USER_HOOKS.timeoutSeconds };
}

function positionsIn(list: readonly unknown[], runs: RegExp): ReadonlyArray<{ readonly group: number; readonly handler: number }> {
  const found: Array<{ group: number; handler: number }> = [];
  list.forEach((group, groupIndex) => {
    if (!isJsonObject(group) || !Array.isArray(group[PROJECT_HOOKS.commands])) return;
    (group[PROJECT_HOOKS.commands] as unknown[]).forEach((item, handlerIndex) => {
      if (isJsonObject(item) && typeof item[PROJECT_HOOKS.command] === 'string' && runs.test(item[PROJECT_HOOKS.command] as string)) {
        found.push({ group: groupIndex, handler: handlerIndex });
      }
    });
  });
  return found;
}

/** The list with these entries out, under AO4's rule that no other entry's position moves. */
function withoutPositions(list: unknown[], positions: ReadonlyArray<{ readonly group: number; readonly handler: number }>): { readonly list: unknown[]; readonly removed: number; readonly stuck: number } {
  let removed = 0;
  let stuck = 0;
  const emptied = new Set<number>();
  const byGroup = new Map<number, number[]>();
  for (const { group, handler } of positions) byGroup.set(group, [...(byGroup.get(group) ?? []), handler]);
  for (const [groupIndex, handlers] of byGroup) {
    const group = list[groupIndex] as JsonObject;
    const items = [...(group[PROJECT_HOOKS.commands] as unknown[])];
    const out = new Set(handlers);
    // From the end: an entry comes out only while everything after it in the group comes out too.
    let keepFrom = items.length;
    while (keepFrom > 0 && out.has(keepFrom - 1)) keepFrom -= 1;
    removed += items.length - keepFrom;
    stuck += handlers.length - (items.length - keepFrom);
    const kept = items.slice(0, keepFrom);
    list[groupIndex] = { ...group, [PROJECT_HOOKS.commands]: kept };
    if (kept.length === 0) emptied.add(groupIndex);
  }
  while (list.length > 0 && emptied.has(list.length - 1)) list.pop();
  return { list, removed, stuck };
}

function commandsOf(file: JsonObject, event: string): string[] {
  const hooks = file[PROJECT_HOOKS.hooks];
  if (!isJsonObject(hooks)) return [];
  return [hooks[event]].flatMap((list) =>
    Array.isArray(list)
      ? list.flatMap((entry: unknown) =>
          isJsonObject(entry) && Array.isArray(entry[PROJECT_HOOKS.commands])
            ? (entry[PROJECT_HOOKS.commands] as unknown[]).flatMap((item) =>
                isJsonObject(item) && typeof item[PROJECT_HOOKS.command] === 'string' ? [item[PROJECT_HOOKS.command] as string] : [],
              )
            : [],
        )
      : [],
  );
}
