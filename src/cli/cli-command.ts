// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ExitCode } from './exit-codes.ts';

export type CommandResult =
  | { readonly kind: 'help'; readonly usage: string }
  /**
   * `hint` is a sentence between the message and the usage, for a reader the message alone leaves stuck. The message
   * stays the first thing on stderr, which `worth-running-every-day` R73 promises to a script that tests for it.
   */
  | { readonly kind: 'usage-error'; readonly message: string; readonly usage: string; readonly hint?: string }
  | { readonly kind: 'completed'; readonly output: string; readonly exitCode: ExitCode }
  /** A hook refusing a call: the reason goes to stderr, where the hook's caller reads it, and the exit code blocks. */
  | { readonly kind: 'hook-block'; readonly reason: string };

/** Strategy for one CLI command. A new command is a new implementation registered in the composition root. */
export interface CliCommand {
  readonly name: string;
  readonly usage: string;
  /** `args` are the arguments after the command name. Bad input is a usage error, never an exception. */
  execute(args: readonly string[]): Promise<CommandResult>;
}
