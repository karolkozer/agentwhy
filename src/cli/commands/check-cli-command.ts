// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { parseSince } from '../../core/session-filter.ts';
import { isMarkResult, MARK_RESULTS } from '../../ports/mark-store.ts';
import type { CheckOutcome, CheckUseCase } from '../../report/check/session-check.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const CHECK_USAGE = `Usage: agentwhy check [--since <span | date>] [--full] [--policy <file> | --settings <file>]
                     [--share]
       agentwhy check --mark rotated|not-secret|handled|not-private <path> [--note <text>]
                     [--since <span | date>]
       agentwhy check --unmark <path>

Reads every session of the current directory's project active inside the range and says what to
do about them: one line per file, the strongest thing known about it first. Writes nothing.

  ROTATE     a value from this file was in an agent's context
  CHECK      the same, for a file named as a template - is the value in it real?
  UNKNOWN    a call named it and its outcome was not recorded
  REACHED    a call opened it and nothing refused the call
  IN RESULT  it was printed by a search; no call named it

  --since <span|date> sessions last active since then: 7d, 12h, 2w, or 2026-09-01 (UTC). Default 7d
  --full              every section, with what each one means and the rule that would close it
  --policy <file>     the policy the sessions are read under, as for \`report\`
  --settings <file>   a settings file whose deny rules stand in for a policy, as for \`report\`.
                      Without either, the built-in default is used and the output says so
  --share             paths relative to the project root, nothing above it
  --mark <result> <path>
                      record that you dealt with one line: rotated (any line), not-secret (a template
                      line whose values are placeholders), handled (a file with no key in it, whose
                      contents cannot be changed: you did what could be done), or not-private (a file
                      with no key in it that holds nothing private). The file leaves the check until a session active
                      after the mark reaches it again. Kept for you alone, outside the project:
                      ~/.agentwhy/projects/<project>/marks.jsonl
  --note <text>       with --mark: one line saying what was done, at most 200 characters
  --unmark <path>     undo a standing mark; the history keeps both
  -h, --help          this text

Exit code 0 when the check ran, whatever it found, and when a mark was recorded; 2 for bad arguments, a refused
policy or a mark that names no line; 3 when a mark could not be written.
`;

// A Record over the outcome union: a new outcome does not compile until it has an exit code.
const EXIT_CODE_BY_OUTCOME: Readonly<Record<CheckOutcome, ExitCode>> = {
  checked: EXIT_CODE.ok,
  'no-sessions': EXIT_CODE.ok,
  'policy-refused': EXIT_CODE.usage,
  marked: EXIT_CODE.ok,
  'mark-refused': EXIT_CODE.usage,
  'mark-failed': EXIT_CODE.unexpected,
};

export interface CheckCommandDependencies {
  readonly check: CheckUseCase;
  /** When the command started. A range is measured from it, so it is given rather than read. */
  readonly now: number;
}

/** `agentwhy check` - what to do now (`specs/2026-09-16-worth-running-every-day.md` R11-R16). */
export class CheckCliCommand implements CliCommand {
  readonly name = 'check';
  readonly usage = CHECK_USAGE;
  readonly #dependencies: CheckCommandDependencies;

  constructor(dependencies: CheckCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    let positionals: string[];
    try {
      ({ values, positionals } = parseArgs({
        args: [...args],
        options: {
          since: { type: 'string', default: '7d' },
          full: { type: 'boolean', default: false },
          policy: { type: 'string' },
          settings: { type: 'string' },
          share: { type: 'boolean', default: false },
          mark: { type: 'string' },
          note: { type: 'string' },
          unmark: { type: 'string' },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: true,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };

    const usageError = (message: string): CommandResult => ({ kind: 'usage-error', message, usage: this.usage });
    if (values.unmark !== undefined) {
      if (values.mark !== undefined || values.note !== undefined || positionals.length > 0) {
        return usageError('--unmark takes one path and nothing else');
      }
      const result = await this.#dependencies.check.unmark({ path: values.unmark });
      return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
    }
    if (values.mark === undefined) {
      if (positionals.length > 0) return usageError(`unexpected argument: ${positionals[0]}`);
      if (values.note !== undefined) return usageError('--note is given with --mark');
    } else {
      if (!isMarkResult(values.mark)) return usageError(`--mark is ${MARK_RESULTS.join(', ')}`);
      if (positionals.length !== 1) return usageError('--mark takes one path: agentwhy check --mark rotated <path>');
      if (values.full || values.share) return usageError('--mark is not given with --full or --share');
    }

    const since = parseSince(values.since, this.#dependencies.now);
    if ('error' in since) return usageError(since.error);

    if (isMarkResult(values.mark)) {
      const result = await this.#dependencies.check.mark({
        since,
        path: positionals[0] ?? '',
        result: values.mark,
        ...(values.note === undefined ? {} : { note: values.note }),
        ...(values.policy === undefined ? {} : { policyPath: values.policy }),
        ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
      });
      return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
    }

    const result = await this.#dependencies.check.run({
      since,
      share: values.share,
      full: values.full,
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}
