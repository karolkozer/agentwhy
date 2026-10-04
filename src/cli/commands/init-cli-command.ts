// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import type { AgentwhyHook } from '../../adapter/claude-code/settings/hook-entries.ts';
import type { SetupOutcome, SetupUseCase } from '../../setup/project-setup.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const INIT_USAGE = `Usage: agentwhy init [--watch] [--refuse] [--protect <pattern>] [--shared] [--codex]
                    [--remove [--unprotect <pattern>]] [--yes] [--command <cmd>]
       agentwhy init --update [--yes]

Sets up the current project, and undoes it. At a terminal it asks who it is for, what agentwhy
should do here and what else to protect, then shows what it will write and asks. It writes to
.claude/settings.local.json, the settings file that is yours alone and stays out of the repository,
unless you say the change is for everyone. On a computer that uses Codex (~/.codex exists), it also
writes refuse into your own ~/.codex/hooks.json and approves those entries - its own and nothing
else, tried once first the way Codex runs them - so a file blocked here is blocked in Codex from
the first message, in the terminal and in VS Code, with nothing to approve in Codex.

  --watch             agentwhy watch, when a delegated agent finishes: a notification when it
                      wrote a value from a protected file. Ticked in the list, and the one
                      installed when nobody can be asked
  --refuse            agentwhy refuse, before every shell command: refuses one that names a
                      protected path or searches through one. It also refuses cat .env.example,
                      and it matches the text of a command, so it is not a boundary
  --protect <pattern> a path or pattern to protect, written as Read()/Edit() deny rules, with
                      refuse installed too, so a shell command cannot print it either. Repeat
                      for several. At a terminal you are asked for these as well
  --shared            write to .claude/settings.json, which is committed, so the hooks run for
                      everyone who clones. Default: .claude/settings.local.json, which is yours
  --codex             alone: write and approve Codex's check, to match the refuse Claude Code
                      already runs here. With --remove: take agentwhy's entries and their
                      approvals out of ~/.codex too, which a plain --remove leaves for the
                      other projects that block files with them
  --remove            undo it. At a terminal it asks what to take out - each hook, and each deny
                      rule by the path it protects - and removes only what is ticked. With
                      --watch or --refuse, only that hook; deny rules then stay
  --unprotect <path>  with --remove, off a terminal: a protected path to take the deny rules of.
                      Repeat for several. A rule is never removed unless it is named or ticked
  --yes               write without asking, and without asking anything else either
  --update            pin the hooks that run an older release of agentwhy through npx to this
                      one's version, and change nothing else. agentwhy never updates by itself
  --command <cmd>     how the hooks run agentwhy. Default: the way the hooks already here run it,
                      else the way you ran this - agentwhy where that is the agentwhy on PATH,
                      npx @agentwhy/cli@<this version> otherwise, pinned so that nothing updates
                      until --update. Give the same --command to --remove when the command
                      does not name agentwhy
  -h, --help          this text

A deny rule names a tool, not a file: Read(.env) stops the Read tool, while cat .env in a shell
walks past it. refuse narrows that route by reading the command line. Neither is a boundary below the agent.

Exit code 0 when the file was written, was already right, or nothing was asked to be written;
2 for bad arguments or a settings file that is not a JSON object.
`;

// A Record over the outcome union: a new outcome does not compile until it has an exit code.
const EXIT_CODE_BY_OUTCOME: Readonly<Record<SetupOutcome, ExitCode>> = {
  written: EXIT_CODE.ok,
  unchanged: EXIT_CODE.ok,
  declined: EXIT_CODE.ok,
  'not-confirmed': EXIT_CODE.ok,
  refused: EXIT_CODE.usage,
  unwritable: EXIT_CODE.usage,
};

/** `agentwhy init` - one command to set a project up (`specs/2026-09-16-worth-running-every-day.md` R4-R10). */
export class InitCliCommand implements CliCommand {
  readonly name = 'init';
  readonly usage = INIT_USAGE;
  readonly #setup: SetupUseCase;

  constructor(setup: SetupUseCase) {
    this.#setup = setup;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          watch: { type: 'boolean', default: false },
          refuse: { type: 'boolean', default: false },
          protect: { type: 'string', multiple: true, default: [] },
          unprotect: { type: 'string', multiple: true, default: [] },
          shared: { type: 'boolean', default: false },
          remove: { type: 'boolean', default: false },
          yes: { type: 'boolean', short: 'y', default: false },
          command: { type: 'string' },
          update: { type: 'boolean', default: false },
          codex: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };
    // `nothing-updates-by-itself.md` U7: an update changes versions and nothing else, so no other flag means anything beside it.
    if (values.update && (values.watch || values.refuse || values.protect.length > 0 || values.unprotect.length > 0 || values.shared || values.remove || values.codex || values.command !== undefined)) {
      return { kind: 'usage-error', message: '--update takes no other flag but --yes', usage: this.usage };
    }
    if (values.update) {
      const result = await this.#setup.run({ protect: [], remove: false, yes: values.yes, update: true });
      return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
    }
    if (values.command?.trim() === '') return { kind: 'usage-error', message: '--command is empty', usage: this.usage };
    if (values.remove && values.protect.length > 0) {
      return { kind: 'usage-error', message: '--remove undoes; to protect a path, run it without --remove', usage: this.usage };
    }
    if (!values.remove && values.unprotect.length > 0) {
      return { kind: 'usage-error', message: '--unprotect takes rules out, so it belongs with --remove', usage: this.usage };
    }

    // Named hooks are the whole answer where they are given; with none, the list asks, or `watch` is installed.
    const hooks: AgentwhyHook[] = [...(values.watch ? ['watch' as const] : []), ...(values.refuse ? ['refuse' as const] : [])];

    const result = await this.#setup.run({
      ...(hooks.length === 0 ? {} : { hooks }),
      ...(values.shared ? { target: 'shared' as const } : {}),
      protect: values.protect,
      ...(values.unprotect.length === 0 ? {} : { unprotect: values.unprotect }),
      remove: values.remove,
      yes: values.yes,
      ...(values.codex ? { codex: true } : {}),
      // Where none was given, the setup settles it (`a-hook-runs-what-you-ran.md` J1).
      ...(values.command === undefined ? {} : { invoke: values.command.trim() }),
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}
