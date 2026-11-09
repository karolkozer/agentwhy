// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { PACKAGE } from '../../../shared/package-name.ts';
import { isPlainInvocation, NPX_BEFORE_NAME, VERSION } from '../../../shared/plain-invocation.ts';
import { isOlder, plainVersion } from '../../../shared/plain-version.ts';
import { HOOK_SETTINGS, SETTINGS_FILES } from '../contract/settings.ts';
import { POST_TOOL_USE, POST_TOOL_USE_FAILURE, PRE_TOOL_USE, STOP, SUBAGENT_STOP, USER_PROMPT_SUBMIT } from '../contract/hooks.ts';

/** The two hooks `init` installs (`specs/2026-09-16-worth-running-every-day.md` R5). */
export type AgentwhyHook = 'watch' | 'refuse';

export interface HookEntry {
  readonly hook: AgentwhyHook;
  readonly event: string;
  readonly matcher?: string;
  readonly command: string;
}

/** Which settings file the hooks read deny rules from; absent means the built-in default. */
export type RulesFile = 'shared' | 'local';

/**
 * A command that runs agentwhy's `watch` or `refuse` through a word naming agentwhy - `agentwhy`, `npx @agentwhy/cli@1`,
 * `node /opt/agentwhy/dist/cli.js`. The word may be a path with agentwhy anywhere in it; the subcommand is the next word.
 * An invocation that names agentwhy nowhere is found by `invoke` instead (see `runs`). Found by a review: a path
 * after agentwhy was not matched, so a second `init` added every hook twice and `--remove` removed nothing. The
 * package's scope, `@agentwhy/`, counts as a word's start too - that scope and no other: found by a review, any `@`
 * did, so `--remove` took out `npx @agentwhy-labs/notifier watch`, a hook agentwhy never wrote. A path's separator is
 * either slash: found by a second review, `node_modules\@agentwhy\cli` on Windows stopped being found by the first fix.
 */
const RUNS_AGENTWHY = /(?:(?:^|[\s/\\])agentwhy|@agentwhy[/\\])\S*\s+(watch|refuse)(?:\s|$)/;

/** Which hook a command runs, if it runs one: through a word naming agentwhy, or through the invocation `init` was given. */
function hookRun(command: string, invoke: string | undefined): AgentwhyHook | undefined {
  const named = RUNS_AGENTWHY.exec(command)?.[1];
  if (named === 'watch' || named === 'refuse') return named;
  if (invoke === undefined) return undefined;
  for (const hook of ['watch', 'refuse'] as const) {
    const run = `${invoke} ${hook}`;
    if (command === run || command.startsWith(`${run} `)) return hook;
  }
  return undefined;
}

/**
 * The entries to install, each with the command it runs (R6, R9).
 *
 * `watch` is two entries, not one (`the-agent-nobody-watches` R1): `SubagentStop` finds what a delegated agent did,
 * and `Stop` says it and checks the session's own agent - the one agent that has no `SubagentStop` of its own. The
 * command line is the same in both, because `watch` reads the event from its input. Installed on one event alone it
 * is half a tool: with no `Stop`, nothing is ever said in the conversation and the main agent is never checked.
 *
 * `2026-11-01-a-key-in-your-message.md` PKD9: a third entry, `UserPromptSubmit`, the same command again, stops a person's
 * message holding a key before the AI gets it. It is added by the next write and never asked of a file that runs the
 * first two (`ADDED_LATER`): a project set up before it is still set up.
 */
export function hookEntries(hooks: readonly AgentwhyHook[], invoke: string, rules: RulesFile | undefined, platform?: string): HookEntry[] {
  const settings =
    rules === undefined
      ? ''
      : ` --settings "${HOOK_SETTINGS.projectDirectory}/${SETTINGS_FILES.directory}/${SETTINGS_FILES[rules]}"`;
  return hooks.flatMap((hook): HookEntry[] =>
    hook === 'watch'
      ? [SUBAGENT_STOP.event, STOP.event, USER_PROMPT_SUBMIT.event].map((event) => ({ hook, event, command: `${invoke} watch${settings}` }))
      : [{ hook, event: PRE_TOOL_USE.event, matcher: refuseMatcher(platform), command: `${invoke} refuse${settings}` }],
  );
}

/**
 * `2026-10-12-powershell-on-windows.md` PW5: the tools a project's `refuse` runs on - the shell, and on Windows Claude
 * Code's `PowerShell` beside it, the shell there (PWB1). Anywhere else the matcher every install has written, unchanged.
 */
export function refuseMatcher(platform: string | undefined): string {
  return platform === 'win32' ? `${PRE_TOOL_USE.shellTool}|${PRE_TOOL_USE.powershellTool}` : PRE_TOOL_USE.shellTool;
}

/**
 * Events a hook gained after files running it were written: a fresh write adds them, and a file without them still runs
 * the hook whole (PKD9) - which is what says a project is set up, and what Settings shows as on.
 */
export const ADDED_LATER: ReadonlySet<string> = new Set([USER_PROMPT_SUBMIT.event]);

/**
 * `2026-11-05-a-key-in-what-it-read.md` KR1, KR10: the hook of a person who turned the switch on. It is no `AgentwhyHook`, on
 * purpose: nothing that says a project is set up, nothing `init` installs by itself, and neither of `refuse` and `watch` can see
 * it, so with the switch off every one of them answers as it did. Its own entries, added and taken out only by the switch,
 * `init --remove` and Uninstall.
 */
export const KEY_SWAP_COMMAND = 'hide-keys';
const KEY_SWAP_EVENTS: readonly string[] = [POST_TOOL_USE.event, POST_TOOL_USE_FAILURE.event];
const RUNS_KEY_SWAP = /(?:(?:^|[\s/\\])agentwhy|@agentwhy[/\\])\S*\s+hide-keys(?:\s|$)/;
const BEFORE_KEY_SWAP = /^\s*(.*?)\s+hide-keys(?:\s|$)/;

function runsKeySwapCommand(command: string, invoke: string | undefined): boolean {
  if (RUNS_KEY_SWAP.test(command)) return true;
  if (invoke === undefined) return false;
  const run = `${invoke} ${KEY_SWAP_COMMAND}`;
  return command === run || command.startsWith(`${run} `);
}

/** Whether these settings hide keys: the event a swap happens on. The other only tells the person of a failed call (KR7). */
export function runsKeySwap(settings: JsonObject, invoke?: string): boolean {
  const hooks = settings[HOOK_SETTINGS.hooks];
  return isJsonObject(hooks) && commandsInList(hooks[POST_TOOL_USE.event]).some((command) => runsKeySwapCommand(command, invoke));
}

/** The settings with the switch on, on no tool in particular since a key can come from any: each event that lacks it, and every other key as it was. */
export function withKeySwap(settings: JsonObject, invoke: string): JsonObject {
  const held = isJsonObject(settings[HOOK_SETTINGS.hooks]) ? { ...(settings[HOOK_SETTINGS.hooks] as JsonObject) } : {};
  for (const event of KEY_SWAP_EVENTS) {
    if (commandsInList(held[event]).some((command) => runsKeySwapCommand(command, invoke))) continue;
    const list = Array.isArray(held[event]) ? [...(held[event] as unknown[])] : [];
    list.push({ [HOOK_SETTINGS.commands]: [{ [HOOK_SETTINGS.type]: HOOK_SETTINGS.commandType, [HOOK_SETTINGS.command]: `${invoke} ${KEY_SWAP_COMMAND}` }] });
    held[event] = list;
  }
  return { ...settings, [HOOK_SETTINGS.hooks]: held };
}

/** The settings with the switch off: its commands out, an entry or an event left empty dropped, `hooks` left empty dropped, and all else as it was. */
export function withoutKeySwap(settings: JsonObject, invoke?: string): { readonly settings: JsonObject; readonly removed: number } {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return { settings, removed: 0 };
  let removed = 0;
  const kept: JsonObject = {};
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) {
      kept[event] = list;
      continue;
    }
    const entries = list.flatMap((entry: unknown) => {
      if (!isJsonObject(entry) || !Array.isArray(entry[HOOK_SETTINGS.commands])) return [entry];
      const commands = (entry[HOOK_SETTINGS.commands] as unknown[]).filter((command) => {
        const runs = isJsonObject(command) && typeof command[HOOK_SETTINGS.command] === 'string' && runsKeySwapCommand(command[HOOK_SETTINGS.command] as string, invoke);
        if (runs) removed += 1;
        return !runs;
      });
      // Only what the switch held comes out: an entry or an event a person left empty is theirs (found by a review).
      if (commands.length === (entry[HOOK_SETTINGS.commands] as unknown[]).length) return [entry];
      return commands.length === 0 ? [] : [{ ...entry, [HOOK_SETTINGS.commands]: commands }];
    });
    if (entries.length > 0 || list.length === 0) kept[event] = entries;
  }
  if (removed === 0) return { settings, removed };
  const { [HOOK_SETTINGS.hooks]: _taken, ...rest } = settings;
  return { settings: Object.keys(kept).length === 0 ? rest : { ...rest, [HOOK_SETTINGS.hooks]: kept }, removed };
}

/**
 * `2026-10-05-protected-everywhere.md` GD23: the flag of the `watch` the computer runs in every project, from the
 * person's own Claude Code settings - the one `watch` that says nothing where the project runs its own.
 */
export const EVERYWHERE_FLAG = '--everywhere';
const RUNS_EVERYWHERE = /\s--everywhere(?:\s|$)/;

/** GD23's entries: `watch` on both its events, as a project's are (`hookEntries`), with the computer's flag. */
export function everywhereWatchEntries(invoke: string): HookEntry[] {
  return hookEntries(['watch'], invoke, undefined).map((entry) => ({ ...entry, command: `${entry.command} ${EVERYWHERE_FLAG}` }));
}

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW11: the computer's own `refuse`, on Claude Code's shell tool, from the
 * person's own settings - Claude Code runs a project's hooks only in a conversation started in that project, so one held
 * elsewhere and moved into it, or one that names its files from outside, had no check at all (RWB6).
 */
export function everywhereRefuseEntry(invoke: string, platform?: string): HookEntry {
  // PW5: on Windows the computer's check runs on Claude Code's `PowerShell` too, as a project's does.
  const matcher = platform === 'win32' ? `${EVERYWHERE_REFUSE_MATCHER}|${PRE_TOOL_USE.powershellTool}` : EVERYWHERE_REFUSE_MATCHER;
  return { hook: 'refuse', event: PRE_TOOL_USE.event, matcher, command: `${invoke} refuse ${EVERYWHERE_FLAG}` };
}

/**
 * `2026-10-12-a-read-outside-the-project.md` RX1: the tools the computer's `refuse` runs on - the shell, and Claude Code's
 * own file reader, which a project's deny rule stops only in a conversation started in that project (RXB1).
 */
export const EVERYWHERE_REFUSE_MATCHER = `${PRE_TOOL_USE.shellTool}|${PRE_TOOL_USE.readTool}`;

/** RW11: whether these settings run the computer's `refuse` - on any tool, as an older version wrote it too (RX2). */
export function runsEverywhereRefuse(settings: JsonObject, invoke?: string): boolean {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return false;
  return commandsInList(hooks[PRE_TOOL_USE.event]).some((command) => hookRun(command, invoke) === 'refuse' && RUNS_EVERYWHERE.test(command));
}

/** RX2: whether the computer's `refuse` in these settings runs on Claude Code's `Read` too - an entry's matcher covers it. */
export function everywhereRefuseReads(settings: JsonObject, invoke?: string): boolean {
  return everywhereRefuseOn(settings, PRE_TOOL_USE.readTool, invoke);
}

/** Whether an entry of these settings runs the computer's `refuse` on this tool - its matcher covers the tool's name. */
export function everywhereRefuseOn(settings: JsonObject, tool: string, invoke?: string): boolean {
  const hooks = settings[HOOK_SETTINGS.hooks];
  const list = isJsonObject(hooks) ? hooks[PRE_TOOL_USE.event] : undefined;
  return Array.isArray(list) && list.some((entry: unknown) =>
    isJsonObject(entry) &&
    commandsInList([entry]).some((command) => hookRun(command, invoke) === 'refuse' && RUNS_EVERYWHERE.test(command)) &&
    matcherCovers(entry[HOOK_SETTINGS.matcher], tool));
}

/** Claude Code's matcher: none, empty or `*` is every tool; else a tool's name, or a pattern of names (`Bash|Read`). */
function matcherCovers(matcher: unknown, tool: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (typeof matcher !== 'string') return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(tool);
  } catch {
    return matcher === tool;
  }
}

/** RW14: the settings without the computer's `refuse` - a project's own, and every other hook, stay. */
export function withoutEverywhereRefuse(settings: JsonObject, invoke?: string): { readonly settings: JsonObject; readonly removed: number } {
  return withoutAgentwhyHooks(settings, invoke, ['refuse'], (command) => RUNS_EVERYWHERE.test(command));
}

/** The events these settings run the computer's `watch` on (GD23): both, where it is installed whole. */
export function everywhereWatchEvents(settings: JsonObject, invoke?: string): ReadonlySet<string> {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return new Set();
  return new Set(Object.entries(hooks)
    .filter(([, list]) => commandsInList(list).some((command) => hookRun(command, invoke) === 'watch' && RUNS_EVERYWHERE.test(command)))
    .map(([event]) => event));
}

/**
 * Whether these settings run a `watch` of their own - any but the computer's (GD23). A project that does is watched by
 * it, and the computer's says nothing there, so one turn is never alerted twice.
 */
export function runsOwnWatch(settings: JsonObject, invoke?: string): boolean {
  return commandsIn(settings).some((command) => hookRun(command, invoke) === 'watch' && !RUNS_EVERYWHERE.test(command));
}

/**
 * `2026-11-01-a-key-in-your-message.md` PK7: whether these settings run a `watch` of their own on this one event. A
 * project set up before `UserPromptSubmit` was written runs `watch` on its other two events alone, and a person's message
 * there is checked by nobody unless the computer's copy - or the plugin's - checks it.
 */
export function runsOwnWatchOn(settings: JsonObject, event: string, invoke?: string): boolean {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return false;
  return commandsInList(hooks[event]).some((command) => hookRun(command, invoke) === 'watch' && !RUNS_EVERYWHERE.test(command));
}

/** The settings without the computer's `watch` (GD23): every other hook, agentwhy's own included, stays. */
export function withoutEverywhereWatch(settings: JsonObject, invoke?: string): { readonly settings: JsonObject; readonly removed: number } {
  return withoutAgentwhyHooks(settings, invoke, ['watch'], (command) => RUNS_EVERYWHERE.test(command));
}

/**
 * The entries of `hooks` that this settings object does not run yet, event by event. A hook is not "installed"
 * where only one of its events is: a file written by an older version runs `watch` on `SubagentStop` alone, and
 * asking for `watch` again has to add the `Stop` it is missing rather than report that there is nothing to do.
 */
export function missingHookEntries(
  settings: JsonObject,
  hooks: readonly AgentwhyHook[],
  invoke: string,
  rules: RulesFile | undefined,
  platform?: string,
): HookEntry[] {
  const running = runningEvents(settings, invoke);
  return hookEntries(hooks, invoke, rules, platform).flatMap((entry) => {
    if (running.get(entry.hook)?.has(entry.event) !== true) return [entry];
    // `2026-10-12-powershell-on-windows.md` PWO1: on Windows a project's `refuse` written before PW5 runs on the shell
    // alone, and Claude Code's `PowerShell` - its shell there - is unchecked. That tool alone is missing: an entry for it,
    // never a second one for the shell.
    const lacking = entry.hook === 'refuse' && platform === 'win32' && !projectRefuseOn(settings, PRE_TOOL_USE.powershellTool, invoke);
    return lacking ? [{ ...entry, matcher: PRE_TOOL_USE.powershellTool }] : [];
  });
}

/** PWO1: whether these settings run a project's `refuse` - not the computer's - on this tool, by an entry's matcher. */
function projectRefuseOn(settings: JsonObject, tool: string, invoke?: string): boolean {
  const hooks = settings[HOOK_SETTINGS.hooks];
  const list = isJsonObject(hooks) ? hooks[PRE_TOOL_USE.event] : undefined;
  return Array.isArray(list) && list.some((entry: unknown) =>
    isJsonObject(entry) &&
    commandsInList([entry]).some((command) => hookRun(command, invoke) === 'refuse' && !RUNS_EVERYWHERE.test(command)) &&
    matcherCovers(entry[HOOK_SETTINGS.matcher], tool));
}

/** Which events already run each of agentwhy's hooks, by the same reading `installedHooks` uses. */
function runningEvents(settings: JsonObject, invoke?: string): Map<AgentwhyHook, Set<string>> {
  const found = new Map<AgentwhyHook, Set<string>>();
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return found;

  for (const [event, list] of Object.entries(hooks)) {
    for (const command of commandsInList(list)) {
      const hook = hookRun(command, invoke);
      if (hook === undefined) continue;
      const events = found.get(hook) ?? new Set<string>();
      events.add(event);
      found.set(hook, events);
    }
  }
  return found;
}

/**
 * Which of agentwhy's hooks a settings object already runs (R8): through any command naming agentwhy, and through
 * `invoke`, the invocation this run of `init` was given, however it is spelled.
 */
/**
 * The full command these settings run `refuse` with, whose own flags name the rules it reads
 * (`2026-10-02-codex-approves-its-own-hook.md` AO5, AO6).
 */
export function refuseCommandIn(settings: JsonObject): string | undefined {
  return commandsIn(settings).find((command) => hookRun(command, undefined) === 'refuse');
}

export function installedHooks(settings: JsonObject, invoke?: string): Set<AgentwhyHook> {
  const found = new Set<AgentwhyHook>();
  for (const command of commandsIn(settings)) {
    const hook = hookRun(command, invoke);
    if (hook !== undefined) found.add(hook);
  }
  return found;
}

/**
 * How the `Stop` hook that runs `watch` runs agentwhy: its command up to the subcommand, `npx @agentwhy/cli` or
 * `agentwhy`. A command that works as a hook is one that works for the agent in the same project, which a name
 * chosen here would not be: `agentwhy` is on no path where only `npx` ever ran it. `undefined` where these settings
 * run no such hook, or run it through anything but plain words.
 */
export function watchInvocation(settings: JsonObject): string | undefined {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return undefined;
  return firstPlain(commandsInList(hooks[STOP.event]), ['watch']);
}

/**
 * How the agentwhy hooks these settings already run invoke it: the first one's command up to its subcommand, where it
 * is in plain words (`a-hook-runs-what-you-ran.md` J1, J4). A hook written next repeats it (R42), so a project does
 * not run `watch` one way and `refuse` another.
 */
export function runningInvocation(settings: JsonObject): string | undefined {
  return firstPlain(commandsIn(settings), ['watch', 'refuse']);
}

/** The first of these commands that runs one of `hooks` through agentwhy named in plain words: its invocation. */
function firstPlain(commands: readonly string[], hooks: readonly AgentwhyHook[]): string | undefined {
  for (const command of commands) {
    const plain = plainRun(command);
    if (plain !== undefined && hooks.includes(plain.hook)) return plain.invocation;
  }
  return undefined;
}

/**
 * Which hook a command runs and the invocation before it, where agentwhy is named in plain words (J4). The session's
 * agent is asked to run what `watchInvocation` finds (`the-agent-tells-you.md` R18), and a hook agentwhy writes repeats
 * what `runningInvocation` finds, so a settings file cannot hand either more than agentwhy through it.
 */
function plainRun(command: string): { readonly hook: AgentwhyHook; readonly invocation: string } | undefined {
  const hook = hookRun(command, undefined);
  if (hook === undefined) return undefined;
  const invocation = BEFORE_HOOK[hook].exec(command)?.[1];
  return invocation !== undefined && isPlainInvocation(invocation) ? { hook, invocation } : undefined;
}

/** The words before each hook's subcommand: the invocation `plainRun` reads, whether plain or not. */
const BEFORE_HOOK: Readonly<Record<AgentwhyHook, RegExp>> = {
  watch: /^\s*(.*?)\s+watch(?:\s|$)/,
  refuse: /^\s*(.*?)\s+refuse(?:\s|$)/,
};

/**
 * The published way with its version pinned, `npx @agentwhy/cli@0.2.0`, `--yes` allowed: what a hook written by a
 * release runs (`nothing-updates-by-itself.md` U1), and the only form an update rewrites (U7). Built from the plain-words
 * pattern's own parts, so the two cannot read `npx` differently. The package's name holds no character a pattern reads
 * as more than itself.
 */
const PINNED = new RegExp(`^(${NPX_BEFORE_NAME}${PACKAGE}@)(${VERSION})$`);

/** The release a plain invocation is pinned to, where it is the pinned published way (U2). */
function pinnedOf(invocation: string): string | undefined {
  const version = PINNED.exec(invocation)?.[2];
  return version !== undefined && plainVersion(version) !== undefined ? version : undefined;
}

/** Whether `invocation` is pinned to a release older than `own`, which may not know a command `own` does. Not a release: no. */
export function pinnedOlderThan(invocation: string, own: string | undefined): boolean {
  const pinned = pinnedOf(invocation);
  return pinned !== undefined && own !== undefined && plainVersion(own) !== undefined && isOlder(pinned, own);
}

/** The releases agentwhy's hooks in these settings are pinned to, one per command, in the order they are written (U2). */
export function pinnedVersions(settings: JsonObject): string[] {
  return commandsIn(settings).flatMap((command) => {
    const plain = plainRun(command);
    const version = plain === undefined ? undefined : pinnedOf(plain.invocation);
    return version === undefined ? [] : [version];
  });
}

/** One command an update rewrote: which hook, on which event, and the release it was pinned to. */
export interface PinChange {
  readonly hook: AgentwhyHook;
  readonly event: string;
  readonly from: string;
}

/**
 * The settings with every agentwhy hook pinned to a release older than `version` pinned to `version` instead (U7): the
 * version in its invocation replaced, everything after the subcommand kept. A newer pin, an unpinned hook, one in any
 * other form and every other key are left as they are.
 */
export function withHooksPinnedTo(settings: JsonObject, version: string): { readonly settings: JsonObject; readonly changed: readonly PinChange[]; readonly switchFrom?: string } {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks) || plainVersion(version) === undefined) return { settings, changed: [] };

  const changed: PinChange[] = [];
  let switchFrom: string | undefined;
  const next = withCommandsRewritten(hooks, (line, event) => {
    // KR1: the switch's own line follows the rest, and is no hook `init` counts (KR10).
    const hides = BEFORE_KEY_SWAP.exec(line)?.[1];
    if (hides !== undefined) {
      const pinned = isPlainInvocation(hides) ? pinnedOf(hides) : undefined;
      if (pinned === undefined || !isOlder(pinned, version)) return undefined;
      switchFrom = pinned;
      return line.replace(hides, hides.replace(PINNED, (_whole, head: string) => head + version));
    }
    const plain = plainRun(line);
    const from = plain === undefined ? undefined : pinnedOf(plain.invocation);
    if (plain === undefined || from === undefined || !isOlder(from, version)) return undefined;
    changed.push({ hook: plain.hook, event, from });
    const invocation = plain.invocation.replace(PINNED, (_whole, head: string) => head + version);
    return invocation + line.slice(line.indexOf(plain.invocation) + plain.invocation.length);
  });
  return {
    settings: changed.length === 0 && switchFrom === undefined ? settings : { ...settings, [HOOK_SETTINGS.hooks]: next },
    changed,
    ...(switchFrom === undefined ? {} : { switchFrom }),
  };
}

/**
 * The hooks with each command line `rewrite` gives a new line for replaced, and every other command, entry and key as it
 * was - whatever shape they are in. The walk `withHooksPinnedTo` and `withHooksReading` share; they differ in one line.
 */
function withCommandsRewritten(hooks: JsonObject, rewrite: (line: string, event: string) => string | undefined): JsonObject {
  const next: JsonObject = {};
  for (const [event, list] of Object.entries(hooks)) {
    next[event] = !Array.isArray(list) ? list : list.map((entry: unknown) => {
      if (!isJsonObject(entry) || !Array.isArray(entry[HOOK_SETTINGS.commands])) return entry;
      return {
        ...entry,
        [HOOK_SETTINGS.commands]: (entry[HOOK_SETTINGS.commands] as unknown[]).map((command) => {
          if (!isJsonObject(command) || typeof command[HOOK_SETTINGS.command] !== 'string') return command;
          const line = rewrite(command[HOOK_SETTINGS.command] as string, event);
          return line === undefined ? command : { ...command, [HOOK_SETTINGS.command]: line };
        }),
      };
    });
  }
  return next;
}

/** The settings with the entries added, each as its own item of its event's list. Nothing else is touched. */
export function withHookEntries(settings: JsonObject, entries: readonly HookEntry[]): JsonObject {
  const hooks = isJsonObject(settings[HOOK_SETTINGS.hooks]) ? { ...(settings[HOOK_SETTINGS.hooks] as JsonObject) } : {};
  for (const entry of entries) {
    const list = Array.isArray(hooks[entry.event]) ? [...(hooks[entry.event] as unknown[])] : [];
    list.push({
      ...(entry.matcher === undefined ? {} : { [HOOK_SETTINGS.matcher]: entry.matcher }),
      [HOOK_SETTINGS.commands]: [{ [HOOK_SETTINGS.type]: HOOK_SETTINGS.commandType, [HOOK_SETTINGS.command]: entry.command }],
    });
    hooks[entry.event] = list;
  }
  return { ...settings, [HOOK_SETTINGS.hooks]: hooks };
}

/**
 * The settings without the commands that run agentwhy's hooks - all of them, or only those named in `only` (R8, R4b). A matcher entry left with no command is dropped, an
 * event left with no entry is dropped, and `hooks` left empty is dropped; every other key and hook stays as it was.
 */
export function withoutAgentwhyHooks(
  settings: JsonObject,
  invoke?: string,
  only?: readonly AgentwhyHook[],
  /** Of those, only the commands this holds for (GD23: the computer's `watch`, and no project's). */
  matching?: (command: string) => boolean,
): { readonly settings: JsonObject; readonly removed: number } {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return { settings, removed: 0 };

  let removed = 0;
  const kept: JsonObject = {};
  for (const [event, list] of Object.entries(hooks)) {
    if (!Array.isArray(list)) {
      kept[event] = list;
      continue;
    }
    const entries = list.flatMap((entry: unknown) => {
      if (!isJsonObject(entry) || !Array.isArray(entry[HOOK_SETTINGS.commands])) return [entry];
      const commands = (entry[HOOK_SETTINGS.commands] as unknown[]).filter((command) => {
        const text = isJsonObject(command) && typeof command[HOOK_SETTINGS.command] === 'string' ? command[HOOK_SETTINGS.command] as string : undefined;
        const hook = text === undefined ? undefined : hookRun(text, invoke);
        // `--remove` with a hook named takes out that one; with none, every hook that runs agentwhy (R4b).
        const runs = hook !== undefined && (only === undefined || only.includes(hook)) && (matching === undefined || matching(text as string));
        if (runs) removed += 1;
        return !runs;
      });
      return commands.length === 0 ? [] : [{ ...entry, [HOOK_SETTINGS.commands]: commands }];
    });
    if (entries.length > 0) kept[event] = entries;
  }

  const { [HOOK_SETTINGS.hooks]: _dropped, ...rest } = settings;
  return { settings: Object.keys(kept).length === 0 ? rest : { ...rest, [HOOK_SETTINGS.hooks]: kept }, removed };
}

/**
 * Which rules a hook command reads: the settings file its `--settings` names, the built-in list where it names none,
 * `policy` where it was given a policy file, and `other` where `--settings` names a file that is neither of the
 * project's two. A settings file's rules replace the built-in list rather than add to it (`policyFromDenyRules`), so
 * this is the answer to "which files does the hook watch".
 */
export type RulesRead = RulesFile | 'default' | 'policy' | 'other';

const SETTINGS_FLAG = /\s--settings(?:\s+|=)("[^"]*"|'[^']*'|\S+)/;

export function rulesReadBy(command: string): RulesRead {
  if (/\s--policy(?:\s|=)/.test(command)) return 'policy';
  const named = SETTINGS_FLAG.exec(command)?.[1]?.replace(/^["']|["']$/g, '');
  if (named === undefined) return 'default';
  if (named.endsWith(`/${SETTINGS_FILES.directory}/${SETTINGS_FILES.local}`)) return 'local';
  if (named.endsWith(`/${SETTINGS_FILES.directory}/${SETTINGS_FILES.shared}`)) return 'shared';
  return 'other';
}

/** What each of agentwhy's hooks in this settings object reads; a hook it does not run is absent. */
export function rulesReadByHooks(settings: JsonObject, invoke?: string): ReadonlyMap<AgentwhyHook, RulesRead> {
  const found = new Map<AgentwhyHook, RulesRead>();
  for (const command of commandsIn(settings)) {
    const hook = hookRun(command, invoke);
    if (hook !== undefined && !found.has(hook)) found.set(hook, rulesReadBy(command));
  }
  return found;
}

/**
 * The settings with every agentwhy hook command pointed at `rules` (R6, R4d): the `--settings` it had is replaced, or
 * added where it had none. A command given a policy file is left alone - a policy is a choice somebody made on
 * purpose, and `watch` takes one or the other, not both. Returns the hooks it changed; nothing else is touched.
 */
export function withHooksReading(
  settings: JsonObject,
  rules: RulesFile,
  invoke?: string,
): { readonly settings: JsonObject; readonly changed: readonly AgentwhyHook[] } {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return { settings, changed: [] };

  const flag = ` --settings "${HOOK_SETTINGS.projectDirectory}/${SETTINGS_FILES.directory}/${SETTINGS_FILES[rules]}"`;
  const changed = new Set<AgentwhyHook>();
  const next = withCommandsRewritten(hooks, (line) => {
    const hook = hookRun(line, invoke);
    const reads = rulesReadBy(line);
    if (hook === undefined || reads === rules || reads === 'policy') return undefined;
    changed.add(hook);
    return line.replace(SETTINGS_FLAG, '') + flag;
  });
  return { settings: changed.size === 0 ? settings : { ...settings, [HOOK_SETTINGS.hooks]: next }, changed: [...changed] };
}

function commandsIn(settings: JsonObject): string[] {
  const hooks = settings[HOOK_SETTINGS.hooks];
  if (!isJsonObject(hooks)) return [];
  return Object.values(hooks).flatMap((list) => commandsInList(list));
}

/** Every command one event's list holds, whatever else is in the entries around it. */
function commandsInList(list: unknown): string[] {
  return Array.isArray(list)
    ? list.flatMap((entry: unknown) =>
        isJsonObject(entry) && Array.isArray(entry[HOOK_SETTINGS.commands])
          ? (entry[HOOK_SETTINGS.commands] as unknown[]).flatMap((command) =>
              isJsonObject(command) && typeof command[HOOK_SETTINGS.command] === 'string' ? [command[HOOK_SETTINGS.command] as string] : [],
            )
          : [],
      )
    : [];
}
