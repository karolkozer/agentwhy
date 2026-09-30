import { isJsonObject, type JsonObject } from '../../../shared/json.ts';
import { PRE_TOOL_USE, PROJECT_HOOKS } from '../contract/hooks.ts';

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
