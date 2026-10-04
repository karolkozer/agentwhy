// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { ALERT_THRESHOLDS, type AlertThreshold } from '../../report/watch/agent-alert.ts';
import { SAID_AS } from '../../report/watch/notice-choices.ts';
import {
  CLEAN_MODES,
  DEFAULT_CHANNELS,
  DEFAULT_CLEAN,
  NOTICE_CHANNELS,
  type CleanMode,
  type NoticeChannel,
  type WatchUseCase,
} from '../../report/watch/subagent-watch.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

export const WATCH_USAGE = `Usage: agentwhy watch [--policy <file> | --settings <file>]
                     [--on value | reached | refused]
                     [--clean off | once | every-turn] [--say agent | line]
                     [--notify chat,terminal,os]

Run by Claude Code hooks, never by hand: reads the hook input on standard input and works out which
event it was. On SubagentStop it checks the agent that just finished and keeps what it found; on Stop
it says, in the conversation, what that turn's agents did. It speaks when an agent wrote a value from
a protected file into its own messages, and otherwise says nothing - unless --on asks for less.
The notice names no path and no value, and reaches no model; agentwhy report --open shows the rest.
It always exits 0: a SubagentStop hook that exits 2 hands its error to the agent as an instruction,
and a Stop hook that exits 2 keeps the turn from ending.

  --policy <file>     the policy to read the session under, as for \`report\`
  --settings <file>   a settings file whose deny rules stand in for a policy, as for \`report\`
  --on <level>        value (default): only a value written from a protected file.
                      reached: also an agent that reached a protected file.
                      refused: also an attempt that was stopped - by a rule, by auto mode or
                      by you - where nothing was reached: the one notice that asks for nothing
  --clean <when>      when a turn that found nothing says so, in the conversation
                      once (default): the first quiet turn says the session is being watched.
                      off: nothing is ever said about a quiet turn, as before.
                      every-turn: after every reply. A quiet turn of a session that was
                      not quiet says both, so a clean turn never reads as a clean session
  --say <how>         how a value in the conversation is said
                      agent (default): the turn is kept open and your own agent says it,
                      in its words and your language, and offers to open the report. The
                      line is said beside it. Only where a person is reading: not in claude -p
                      line: the grey line under the reply, and nothing else
  --notify <channels> where the notice is shown, comma-separated. Default chat
                      chat: a line in the conversation, at the end of the turn, in any interface
                      terminal: a notification the terminal interface of Claude Code shows
                      os: a macOS notification, shown whatever interface is in use
  -h, --help          this text

To use it, run agentwhy init in the project, which asks before it writes. Or add this to
.claude/settings.local.json yourself - watch itself installs nothing:

  "hooks": {
    "SubagentStop": [
      { "hooks": [ { "type": "command",
          "command": "agentwhy watch --settings \\"$CLAUDE_PROJECT_DIR/.claude/settings.json\\"" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command",
          "command": "agentwhy watch --settings \\"$CLAUDE_PROJECT_DIR/.claude/settings.json\\"" } ] }
    ]
  }

The same command line in both: it reads the event it was given. Without the Stop hook nothing is said
in the conversation, and the notice waits for a channel that shows it.

A hook can fail to run at all. agentwhy start still reads every session, and stays the backstop.
`;

export interface WatchCommandDependencies {
  readonly watch: WatchUseCase;
  /** Standard input is a terminal: there is no hook, and so no input to wait for (R13). */
  readonly interactive: boolean;
}

/** `agentwhy watch` - the hook end of `specs/2026-09-16-when-an-agent-finishes.md`. */
export class WatchCliCommand implements CliCommand {
  readonly name = 'watch';
  readonly usage = WATCH_USAGE;
  readonly #dependencies: WatchCommandDependencies;

  constructor(dependencies: WatchCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          policy: { type: 'string' },
          settings: { type: 'string' },
          on: { type: 'string' },
          clean: { type: 'string' },
          say: { type: 'string' },
          notify: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch {
      // The channels are still read where they can be: a hook with one wrong flag was still told where to speak.
      const asked = channelsIn(looseNotify(args));
      return this.#notChecked(asked === 'unknown' ? DEFAULT_CHANNELS : asked);
    }

    if (values.help) return { kind: 'help', usage: this.usage };
    // The only usage error this command returns: at a terminal no hook is listening, so exit 2 instructs nobody (R13).
    if (this.#dependencies.interactive) {
      return { kind: 'usage-error', message: 'watch reads a hook input on standard input, and this is a terminal', usage: this.usage };
    }

    /*
     * A flag that was not written is not a choice: it is left to what the person set, and the use case settles it
     * (`the-agent-tells-you.md` R24). A flag that was written and is not a value this version knows is still an
     * error - a hook asking for `--on everything` is a hook whose person believes they are being told more.
     */
    const on = read(values.on, ALERT_THRESHOLDS);
    const clean = read(values.clean, CLEAN_MODES);
    const say = read(values.say, SAID_AS);
    const channels = values.notify === undefined ? undefined : channelsIn(values.notify);
    if (on === 'unknown' || clean === 'unknown' || say === 'unknown' || channels === 'unknown') {
      return this.#notChecked(channels === undefined || channels === 'unknown' ? DEFAULT_CHANNELS : channels);
    }

    const result = await this.#dependencies.watch.run({
      ...(on === undefined ? {} : { on }),
      ...(clean === undefined ? {} : { clean }),
      ...(say === undefined ? {} : { say }),
      ...(channels === undefined ? {} : { channels }),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
    });
    // R8: every outcome is exit 0. What could not be checked is said in the output, never in the exit code.
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE.ok };
  }

  /** Arguments a hook was configured with and this version cannot use: said to the user, exit 0 (R8). */
  async #notChecked(channels: readonly NoticeChannel[]): Promise<CommandResult> {
    const result = await this.#dependencies.watch.announce({ kind: 'not-checked', reason: 'arguments' }, channels);
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE.ok };
  }
}

/** One flag, as written: what it names, nothing where it was not written, and `unknown` where it names nothing. */
function read<T extends string>(value: string | undefined, known: readonly T[]): T | undefined | 'unknown' {
  if (value === undefined) return undefined;
  return known.find((candidate): candidate is T => candidate === value) ?? 'unknown';
}

/** `--notify` as given, read without refusing anything else in the arguments. */
function looseNotify(args: readonly string[]): string | undefined {
  const { values } = parseArgs({ args: [...args], options: { notify: { type: 'string' } }, strict: false, allowPositionals: true });
  return typeof values.notify === 'string' ? values.notify : undefined;
}

/** The channels named, or `unknown` when one is not a channel or none is named. */
function channelsIn(list: string | undefined): readonly NoticeChannel[] | 'unknown' {
  const names = (list ?? '').split(',').map((name) => name.trim()).filter((name) => name !== '');
  const channels = names.map((name) => NOTICE_CHANNELS.find((channel) => channel === name));
  return channels.length === 0 || channels.includes(undefined) ? 'unknown' : [...new Set(channels as NoticeChannel[])];
}
