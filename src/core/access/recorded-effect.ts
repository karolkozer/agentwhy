// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EventOutcome, Execution } from '../event.ts';
import { simpleCommandsIn } from './command-line.ts';
import { readOptions, type OptionTable } from './search-reach.ts';

/**
 * Programs that open every file operand they are given, print it, and exit non-zero when one of them cannot be opened.
 * With a recorded exit code of 0, each operand was read. Any other program's exit code establishes nothing about its
 * operands here: `grep` exits 1 for a file it read and found nothing in, and a script exits however it likes.
 */
const READS_EVERY_OPERAND = new Set(['cat', 'head', 'tail', 'nl']);

/**
 * Searches whose exit is documented: 0 where a line matched, 1 where none did, 2 or more where an operand could not be
 * read. With 0 or 1 recorded, each operand was opened and searched, whatever was printed. Found 2026-10-05: a search of a
 * tracked file for a name it does not hold exited 1, and the file was "an attempt with no known end". What a search
 * printed of a file is read from its output (`search-hits-are-reads` H1). `ag`, `ack` and `git grep` are not listed:
 * their exit on an unreadable operand is not established here.
 */
const SEARCHES_EVERY_OPERAND = new Set(['grep', 'egrep', 'fgrep', 'rg']);

/**
 * `sed` opens its file operands in turn and exits non-zero on one it cannot open, but a script that quits (`q`) stops
 * before the next: with exit 0, only a lone operand is known to have been read. `-e` and `-f` give the script, so every
 * positional word is then an operand. Any option not listed - `-i`, whose suffix BSD takes from the next word, or `--help`,
 * which opens nothing - leaves the effect unknown.
 */
const SED_OPTIONS: OptionTable = { shortWithValue: new Set(['e', 'f']), longWithValue: new Set(['--expression', '--file']) };
const SED_SCRIPT_OPTIONS = new Set(['-e', '-f', '--expression', '--file']);
const SED_PLAIN_OPTIONS = new Set([
  '-n', '-E', '-r', '-s', '-u', '-z', '--quiet', '--silent', '--regexp-extended', '--separate', '--unbuffered', '--null-data', '--posix',
  '--sandbox',
]);

/** What of a call the rule reads: its command lines, whether it writes, and whether its shape was recognised. */
export interface RecordedCall {
  readonly commands: readonly string[];
  readonly written?: readonly string[];
  readonly toolKnown: boolean;
}

/**
 * What a runtime's record of running a call establishes about access (`2026-09-27-what-codex-wrote.md` X9, X11). A
 * status says that something ran, never what it reached:
 *
 * - a recognised call that writes, recorded as completed: its write happened;
 * - a recognised command line of exactly one simple command whose program reads every operand, or a `sed` given one,
 *   completed with exit 0: each operand was read;
 * - anything else - a failure, an interruption, another program, a pipeline, a tool with no profile: `unknown`. A
 *   requested path alone is an attempt. What the output itself shows is read per target by `protectedAccesses`.
 */
export function outcomeOfExecution(call: RecordedCall, execution: Execution): EventOutcome {
  if (!call.toolKnown) return 'unknown';
  // A search that matched nothing exits 1, which a runtime records as failed: it opened every operand all the same.
  if (searchedItsOperands(call, execution)) return 'succeeded';
  if (execution.status !== 'completed') return 'unknown';
  if (call.written !== undefined) return 'succeeded';
  if (call.commands.length !== 1 || execution.exitCode !== 0) return 'unknown';
  const simple = simpleCommandsIn(call.commands[0] ?? '');
  return simple.length === 1 && simple[0] !== undefined && readsItsOperands(simple[0]) ? 'succeeded' : 'unknown';
}

function searchedItsOperands(call: RecordedCall, execution: Execution): boolean {
  if (execution.status === 'unrecognised' || call.written !== undefined || call.commands.length !== 1) return false;
  if (execution.exitCode !== 0 && execution.exitCode !== 1) return false;
  const simple = simpleCommandsIn(call.commands[0] ?? '');
  return simple.length === 1 && simple[0] !== undefined && SEARCHES_EVERY_OPERAND.has(simple[0].program);
}

function readsItsOperands({ program, args }: { readonly program: string; readonly args: readonly string[] }): boolean {
  if (READS_EVERY_OPERAND.has(program)) return true;
  if (program !== 'sed') return false;
  const { options, positionals } = readOptions(args, SED_OPTIONS);
  if (!options.every((option) => SED_SCRIPT_OPTIONS.has(option.name) || SED_PLAIN_OPTIONS.has(option.name))) return false;
  const scriptGiven = options.some((option) => SED_SCRIPT_OPTIONS.has(option.name));
  return positionals.length - (scriptGiven ? 0 : 1) === 1;
}

/**
 * Whether a call's recorded output shows what it reached, whatever its event outcome: a result the record establishes, or
 * the output of a process that ran - where a line naming its file (`path:12:…`) shows that file was read even when the
 * process then failed on another (X11).
 */
export function outputShowsReach(event: { readonly outcome: EventOutcome; readonly execution?: Execution }): boolean {
  return event.outcome === 'succeeded' || (event.outcome === 'unknown' && event.execution !== undefined);
}

/**
 * Whether every line of a process's output may name what it reached: the process completed with exit 0. Otherwise its
 * output may hold diagnostics that name paths it could not open, so only lines that carry a file name in a search hit's
 * position are read as reached.
 */
export function outputIsClean(execution: Execution | undefined): boolean {
  return execution === undefined || (execution.status === 'completed' && execution.exitCode === 0);
}
