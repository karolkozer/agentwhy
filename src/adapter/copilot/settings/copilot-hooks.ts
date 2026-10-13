// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { PRE_TOOL_USE, USER_HOOKS } from '../contract/hooks.ts';

/** agentwhy's Copilot check, and no one else's: `refuse` with `--copilot` straight after it, which only agentwhy writes. */
const RUNS_COPILOT_REFUSE = /(?:^|\s)refuse\s+--copilot(?:\s|$)/;

/** The installed name, tried where the invocation written cannot start - its Node upgraded away, its script moved. */
const ON_PATH = 'agentwhy';

/**
 * What ends the hook's command (CBD9, §2a d1, d2): Copilot runs the command through a shell and refuses every call whose
 * hook cannot start (c5), so a check that cannot run at all lets the call run instead.
 */
const FAILS_OPEN = ' || true';

/**
 * The command agentwhy's Copilot check runs (CBD9 as decided 2026-10-12): the invocation, then `agentwhy` on the hook's
 * `PATH` where it is gone, ending in exit 0 whatever happens. `refuse --copilot` itself exits 0 on every path (CB18), so
 * the second runs only where the first could not start.
 */
export function copilotRefuseCommand(invoke: string): string {
  const fallback = invoke === ON_PATH ? '' : ` || ${copilotRefuseTrial(ON_PATH)}`;
  return `${copilotRefuseTrial(invoke)}${fallback}${FAILS_OPEN}`;
}

/** The invocation a command `copilotRefuseCommand` wrote runs first: the words before `refuse --copilot`. */
export function copilotInvocationIn(command: string): string | undefined {
  const invoke = /^(.*?)\s+refuse\s+--copilot(?:\s|$)/.exec(command)?.[1]?.trim();
  return invoke === undefined || invoke === '' ? undefined : invoke;
}

/**
 * The two absolute paths of an invocation agentwhy wrote as `'<node>' '<script>'` - each one shell word - or `undefined`
 * for any other form. Read so a check whose files are gone is known without running it.
 */
export function absoluteInvocation(invoke: string): { readonly node: string; readonly script: string } | undefined {
  const word = "'((?:[^']|'\\\\'')*)'";
  const match = new RegExp(`^${word} ${word}$`).exec(invoke);
  if (match === null) return undefined;
  const [node, script] = [match[1], match[2]].map((each) => (each ?? '').replaceAll("'\\''", "'"));
  return node !== undefined && script !== undefined && node.startsWith('/') && script.startsWith('/') ? { node, script } : undefined;
}

/** The same command without its fallback - what a trial runs, since with it every run would exit 0. */
export function copilotRefuseTrial(invoke: string): string {
  return `${invoke} refuse --copilot`;
}

/** The whole file agentwhy writes: its one entry, and nothing else. */
export function copilotHookFile(command: string): JsonObject {
  const { keys } = USER_HOOKS;
  return {
    [keys.version]: USER_HOOKS.version,
    [keys.hooks]: {
      [PRE_TOOL_USE.event]: [{ [keys.type]: USER_HOOKS.commandType, [keys.command]: command, [keys.timeout]: USER_HOOKS.timeoutSeconds }],
    },
  };
}

/**
 * The command of agentwhy's check where the file is agentwhy's own - a version, and one `PreToolUse` entry running
 * `refuse --copilot`, with nothing beside them - and `undefined` for any other file, which agentwhy never rewrites or
 * removes (CB9).
 */
export function copilotRefuseIn(file: JsonObject): string | undefined {
  const { keys } = USER_HOOKS;
  if (!Object.keys(file).every((key) => key === keys.version || key === keys.hooks)) return undefined;
  const hooks = file[keys.hooks];
  if (!isJsonObject(hooks) || Object.keys(hooks).join() !== PRE_TOOL_USE.event) return undefined;
  const entries = hooks[PRE_TOOL_USE.event];
  if (!Array.isArray(entries) || entries.length !== 1) return undefined;
  const [entry] = entries as unknown[];
  if (!isJsonObject(entry) || entry[keys.type] !== USER_HOOKS.commandType) return undefined;
  if (!Object.keys(entry).every((key) => key === keys.type || key === keys.command || key === keys.timeout)) return undefined;
  const command = entry[keys.command];
  return typeof command === 'string' && RUNS_COPILOT_REFUSE.test(command) ? command : undefined;
}
