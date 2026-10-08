// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EventOutcome, Execution } from '../event.ts';
import { handsOverCodeOnly, simpleCommandsIn } from './command-line.ts';
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

/**
 * The options of each program in `READS_EVERY_OPERAND` that take a value, so that the value is not counted as a file
 * (XD4c-R3). Written from the programs' documented options, GNU's and BSD's together, and **not measured against a
 * corpus** (XD4c-O1): the corpus holds few of them. `head -5` needs no entry, being a cluster of flags to `readOptions`.
 * A miscount makes one operand look like two or none, which withholds a read and never invents one.
 */
const PRINTS_ITS_OPERAND_OPTIONS: Readonly<Record<string, OptionTable>> = {
  cat: { shortWithValue: new Set(), longWithValue: new Set() },
  head: { shortWithValue: new Set(['n', 'c']), longWithValue: new Set(['--lines', '--bytes']) },
  tail: { shortWithValue: new Set(['n', 'c', 'b', 's']), longWithValue: new Set(['--lines', '--bytes', '--sleep-interval', '--pid', '--max-unchanged-stats']) },
  nl: {
    shortWithValue: new Set(['b', 'd', 'f', 'h', 'i', 'l', 'n', 's', 'v', 'w']),
    longWithValue: new Set([
      '--body-numbering', '--section-delimiter', '--footer-numbering', '--header-numbering', '--line-increment',
      '--join-blank-lines', '--number-format', '--number-separator', '--starting-line-number', '--number-width',
    ]),
  },
};

/**
 * A line a failing program or the shell prints about it, and nothing else: `cat: f: No such file or directory`,
 * `head: f: Is a directory`, and the shell's own `zsh:1: permission denied: f` (XD4c-R5 as amended 2026-10-08: the
 * shell's shape was found by a measurement of interpreters, where it was the whole output of a heredoc that never ran).
 */
const DIAGNOSTIC_LINE = /^[\w.\-/]+(?::\d+)?: \S/;

/** Options that make a printing program print something of its own and open no file. */
const OPENS_NOTHING = new Set(['--help', '--version']);

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
 * - the same command given exactly one file, completed with **no exit code recorded**, whose own printed text is known
 *   and is not made of diagnostics alone: that file was read (`2026-10-08-what-it-printed-is-the-file.md` XD4c). Such a
 *   program prints the file or a diagnostic about it and nothing else, so text that is not a diagnostic came from the
 *   file. A recorded exit is never overridden by this (XD4c-D3);
 * - an interpreter handed code and nothing else - `python3 -c "…"`, `python3 - <<'PY' … PY`, `node -e "…"` - completed
 *   with exit 0: what its code names by a whole path it opened (X11 as amended 2026-10-07). An `open` of a file it
 *   cannot read raises, and the interpreter exits non-zero unless the code catches it; this is what Claude Code's record
 *   already establishes of such a call, whose result carries no error, and the one way a read inside code is seen at all;
 * - anything else - a failure, an interruption, another program, a pipeline, a tool with no profile: `unknown`. A
 *   requested path alone is an attempt. What the output itself shows is read per target by `protectedAccesses`.
 */
export function outcomeOfExecution(call: RecordedCall, execution: Execution): EventOutcome {
  if (!call.toolKnown) return 'unknown';
  // A search that matched nothing exits 1, which a runtime records as failed: it opened every operand all the same.
  if (searchedItsOperands(call, execution)) return 'succeeded';
  if (execution.status !== 'completed') return 'unknown';
  if (call.written !== undefined) return 'succeeded';
  if (execution.exitCode === undefined && printedItsOperand(call, execution)) return 'succeeded';
  if (call.commands.length !== 1 || execution.exitCode !== 0) return 'unknown';
  if (handsOverCodeOnly(call.commands)) return 'succeeded';
  const simple = simpleCommandsIn(call.commands[0] ?? '');
  return simple.length === 1 && simple[0] !== undefined && readsItsOperands(simple[0]) ? 'succeeded' : 'unknown';
}

function searchedItsOperands(call: RecordedCall, execution: Execution): boolean {
  if (execution.status === 'unrecognised' || call.written !== undefined || call.commands.length !== 1) return false;
  if (execution.exitCode !== 0 && execution.exitCode !== 1) return false;
  const simple = simpleCommandsIn(call.commands[0] ?? '');
  return simple.length === 1 && simple[0] !== undefined && SEARCHES_EVERY_OPERAND.has(simple[0].program);
}

/**
 * XD4c-R2 to R6: one simple command whose program prints the file it is given, given exactly one file, whose printed
 * text is known and is not made of diagnostics alone. Empty text is a read (XD4c-D2): such a program fails with a
 * diagnostic, never silently. `-` is standard input, no file. A redirection's target is read as a word of the command
 * (`cat f 2>/dev/null` is `f`, `2` and `/dev/null`), so a command whose diagnostics went elsewhere is never one of one
 * operand. `--help` and `--version` print something else and open nothing. Where it does not hold, nothing is said:
 * `unknown`, never `failed`, since a file's own lines may look like a diagnostic (XD4c-R6).
 */
function printedItsOperand(call: RecordedCall, execution: Execution): boolean {
  if (execution.printed === undefined || call.commands.length !== 1) return false;
  const simple = simpleCommandsIn(call.commands[0] ?? '');
  if (simple.length !== 1 || simple[0] === undefined) return false;
  const { program, args } = simple[0];
  // Own keys alone: a program named like an inherited property (`constructor`) is no program of the table.
  const table = Object.hasOwn(PRINTS_ITS_OPERAND_OPTIONS, program) ? PRINTS_ITS_OPERAND_OPTIONS[program] : undefined;
  if (table !== undefined) {
    const { options, positionals } = readOptions(args, table);
    if (options.some((option) => OPENS_NOTHING.has(option.name)) || positionals.length !== 1 || positionals[0] === '-') return false;
  } else if (program !== 'sed' || !readsItsOperands(simple[0])) {
    return false;
  }
  const lines = execution.printed.split('\n').filter((line) => line.trim() !== '');
  return !(lines.length > 0 && lines.every((line) => DIAGNOSTIC_LINE.test(line)));
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
