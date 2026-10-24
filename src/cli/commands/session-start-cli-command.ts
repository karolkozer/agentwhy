// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { SessionStartNoteUseCase } from '../../report/start/onboarding/session-start-note.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

const USAGE = `Usage: agentwhy session-start

Run by the agentwhy plugin's SessionStart hook in Claude Code, never by hand. When a new session
begins in a project whose agentwhy setup is not finished, it adds one paragraph to the agent's
context: agentwhy is on, it blocks nothing here yet, and /agentwhy:report opens its setup. At most
once a week a project, and never in a project that is set up, a session resumed, or a folder that
is no project. It always exits 0, and prints nothing where anything it reads could not be read.
`;

/** The plugin's `SessionStart` hook (`2026-10-15-agentwhy-as-a-plugin.md` AP6). */
export class SessionStartCliCommand implements CliCommand {
  readonly name = 'session-start';
  readonly usage = USAGE;
  readonly #note: SessionStartNoteUseCase;
  readonly #interactive: boolean;

  constructor(note: SessionStartNoteUseCase, interactive: boolean) {
    this.#note = note;
    this.#interactive = interactive;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return { kind: 'help', usage: this.usage };
    if (this.#interactive) return { kind: 'usage-error', message: 'session-start reads a hook input on standard input, and this is a terminal', usage: this.usage };
    // A hook that fails must not break a session: arguments it was not written with say nothing, exit 0.
    if (args.length > 0) return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
    return { kind: 'completed', output: await this.#note.run(), exitCode: EXIT_CODE.ok };
  }
}
