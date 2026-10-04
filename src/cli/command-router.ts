// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CliCommand, CommandResult } from './cli-command.ts';

const HELP_FLAGS: readonly string[] = ['--help', '-h'];

/** Dispatches argv to the registered command of that name. Adding a command never changes the router. */
export class CommandRouter {
  readonly #commands: ReadonlyMap<string, CliCommand>;
  readonly #withoutACommand: CliCommand | undefined;
  readonly #missingCommand: string | undefined;

  /**
   * `withoutACommand` answers `agentwhy` with nothing after it, and with arguments that begin with `-` (they are its
   * flags); without one, that stays a usage error. It may also be registered under its own name.
   *
   * `missingCommand` is said under that usage error alone, for whoever ran a bare `agentwhy` where nothing answers it.
   */
  constructor(commands: readonly CliCommand[], withoutACommand?: CliCommand, missingCommand?: string) {
    this.#withoutACommand = withoutACommand;
    this.#missingCommand = missingCommand;
    const byName = new Map<string, CliCommand>();
    for (const command of commands) {
      if (byName.has(command.name)) throw new Error(`duplicate command: ${command.name}`);
      byName.set(command.name, command);
    }
    this.#commands = byName;
  }

  /** The usage of every command, in registration order, after the one a bare `agentwhy` runs, and never twice. */
  get usage(): string {
    const commands = new Set([...(this.#withoutACommand === undefined ? [] : [this.#withoutACommand]), ...this.#commands.values()]);
    return [...commands].map((command) => command.usage).join('\n');
  }

  async route(argv: readonly string[]): Promise<CommandResult> {
    const [name, ...args] = argv;

    if (name !== undefined && HELP_FLAGS.includes(name)) return { kind: 'help', usage: this.usage };
    if (name === undefined) {
      if (this.#withoutACommand !== undefined) return this.#withoutACommand.execute([]);
      return { ...this.#usageError('missing command'), ...(this.#missingCommand === undefined ? {} : { hint: this.#missingCommand }) };
    }
    if (name.startsWith('-') && this.#withoutACommand !== undefined) return this.#withoutACommand.execute(argv);

    const command = this.#commands.get(name);
    if (command === undefined) return this.#usageError(`unknown command: ${name}`);
    return command.execute(args);
  }

  #usageError(message: string): CommandResult {
    return { kind: 'usage-error', message, usage: this.usage };
  }
}
