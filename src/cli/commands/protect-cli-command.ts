// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import type { GlobalProtection } from '../../setup/global-setup.ts';
import type { SetupOutcome } from '../../setup/project-setup.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const PROTECT_USAGE = `Usage: agentwhy protect <path>... [--yes]
       agentwhy protect --list
       agentwhy protect --remove --unprotect <path>... [--yes]

Protects files that belong to no project - your SSH keys, a cloud login, a folder on a network
drive - on this whole computer. It writes deny rules into your own Claude Code settings
(~/.claude/settings.json), which Claude Code reads in every project, and shows exactly what it
will write and asks first. To set up one project instead, use agentwhy init.

A rule written here applies in every project on this computer, and no project can lift it. It
keeps the file from being read as well as written. Name the place: "~/.ssh/**" under your home
folder, or a path from / for another disk. A place is written as that place, which Claude Code
applies wherever it works. A name alone - "*.pem", ".ssh/id_rsa" - is written for any file of
that name and holds only inside the folder your AI works in: that is a project's rule, which
agentwhy init writes.

  <path>...           the places to protect: "~/.ssh/**", "~/.aws/credentials",
                      "/Volumes/share/ledger.csv". Repeat for several
  --list              what this computer protects today, and nothing else. Writes nothing
  --remove            take rules out, with --unprotect naming which
  --unprotect <path>  with --remove: a path to stop protecting. Repeat for several. A rule is
                      never taken out unless it is named
  --yes               write without asking
  -h, --help          this text

What it installs: no hook in Claude Code, which applies a rule naming a place to its own Read and
Edit tools by itself, wherever it works - measured 2026-10-07 on a Mac, in the terminal. On a
computer that uses Codex (~/.codex exists), agentwhy's check is written into your
own ~/.codex/hooks.json and approved there - tried once first, with its own plan and consent, as
init does - because Codex has no rules of its own and sees these only through that check. In
Claude Code, shell commands are checked only in the projects where refuse already runs.

Exit code 0 when the file was written, was already right, or nothing was asked for; 2 for bad
arguments, a settings file that is not a JSON object, or a path that could not be written.
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

/**
 * `agentwhy protect` - `2026-10-05-protected-everywhere.md` G1-G3 and G10: the way in that needs no project, since
 * the files this protects belong to none. The onboarding's own fork (G7-G10) is a second way to the same writer.
 */
export class ProtectCliCommand implements CliCommand {
  readonly name = 'protect';
  readonly usage = PROTECT_USAGE;
  readonly #setup: GlobalProtection;

  constructor(setup: GlobalProtection) {
    this.#setup = setup;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    let positionals;
    try {
      ({ values, positionals } = parseArgs({
        args: [...args],
        options: {
          list: { type: 'boolean', default: false },
          remove: { type: 'boolean', default: false },
          unprotect: { type: 'string', multiple: true, default: [] },
          yes: { type: 'boolean', short: 'y', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: true,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };

    if (values.list) {
      if (values.remove || values.unprotect.length > 0 || positionals.length > 0) {
        return { kind: 'usage-error', message: '--list reads and writes nothing, so it takes no path and no other flag', usage: this.usage };
      }
      const listed = await this.#setup.list();
      return { kind: 'completed', output: listed.output, exitCode: EXIT_CODE_BY_OUTCOME[listed.outcome] };
    }

    if (values.remove && positionals.length > 0) {
      return { kind: 'usage-error', message: '--remove takes rules out; name them with --unprotect, and protect a path without --remove', usage: this.usage };
    }
    if (!values.remove && values.unprotect.length > 0) {
      return { kind: 'usage-error', message: '--unprotect takes rules out, so it belongs with --remove', usage: this.usage };
    }
    if (values.remove && values.unprotect.length === 0) {
      return { kind: 'usage-error', message: '--remove needs the paths to take out: --unprotect <path>', usage: this.usage, hint: 'To see what is protected: agentwhy protect --list' };
    }
    if (!values.remove && positionals.length === 0) {
      return { kind: 'usage-error', message: 'no path was named', usage: this.usage, hint: 'To see what is protected already: agentwhy protect --list' };
    }

    const result = await this.#setup.run({
      protect: values.remove ? [] : positionals,
      ...(values.unprotect.length === 0 ? {} : { unprotect: values.unprotect }),
      remove: values.remove,
      yes: values.yes,
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}
