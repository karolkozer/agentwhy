// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { parseSince } from '../../core/session-filter.ts';
import { isMarkResult, MARK_RESULTS } from '../../ports/mark-store.ts';
import type { DigestAsks } from '../../report/check/actions-digest.ts';
import type { CheckOutcome, CheckResult, CheckUseCase } from '../../report/check/session-check.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const CHECK_USAGE = `Usage: agentwhy check [--since <span | date>] [--full] [--policy <file> | --settings <file>]
                     [--share] [--fail-on rotate|any]
       agentwhy check --mark rotated|not-secret|handled|not-private <path> [--note <text>]
                     [--since <span | date>]
       agentwhy check --unmark <path>

Reads every Claude Code session of the current directory's project active inside the range and says
what to do about them: one line per file, the strongest thing known about it first. Writes nothing.
Codex and Copilot conversations are on the page \`agentwhy\` opens, not here.

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
  --fail-on rotate|any
                      exit 1 when the answer asks you to act, for a pre-commit hook or a script:
                      rotate on a ROTATE or CHECK line; any on every line above - a PROTECTION line,
                      where an agent took protection out of a file, included - and on a key's shape
                      a result carried, which names no file. Either way a session that could not be
                      read fails it too, and a line you marked does not. A Codex or Copilot
                      conversation is not read, so it never fails it
  --mark <result> <path>
                      record that you dealt with one line: rotated (any line), not-secret (a template
                      line whose values are placeholders), handled (a file with no key in it, whose
                      contents cannot be changed: you did what could be done), or not-private (a file
                      with no key in it that holds nothing private). The file leaves the check until a session active
                      after the mark reaches it again. Kept for you alone, outside the project:
                      ~/.agentwhy/projects/<project>/marks.jsonl
  --note <text>       with --mark: one line saying what was done, at most 200 characters
  --unmark <path>     undo a standing mark; the history keeps both
                      A mark is your own word: --mark and --unmark run by your AI, not typed in a
                      terminal, mark nothing, so a gate your AI was stopped by is never passed by it
  -h, --help          this text

Exit code 0 when the check ran, whatever it found unless --fail-on is given, and when a mark was recorded; 1 when
--fail-on is given and the answer meets it; 2 for bad arguments, a refused policy or a mark that names no line; 3 when
a mark could not be written.
`;

/** The levels `--fail-on` takes (`2026-11-20-it-runs-by-itself` RB4, RBD1). */
const FAIL_ON = ['rotate', 'any'] as const;
type FailOn = (typeof FAIL_ON)[number];

const isFailOn = (value: string): value is FailOn => (FAIL_ON as readonly string[]).includes(value);

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
  /**
   * This command was run by an AI, not typed by a person (`2026-11-20-it-runs-by-itself` RB7, `runByAnAi`): a mark is
   * the person's own word, so it is not taken from here. Absent, a person.
   */
  readonly runByAnAi?: boolean;
}

/**
 * RB7: what `--mark` and `--unmark` say when an AI ran them - nothing was marked and why, where the person marks it, and
 * to the AI, what to do instead. A gate the AI was stopped by is never passed by the AI's own word.
 */
function markedByAnAi(flag: '--mark' | '--unmark'): string {
  return (
    `Nothing was ${flag === '--mark' ? 'marked' : 'unmarked'}: agentwhy check ${flag} is your own word about a file, and this ` +
    `command was run by your AI, not typed in a terminal.\n` +
    `Do it yourself, on agentwhy's page or in your own terminal. To the AI: tell the person what the check found, ` +
    `and do not try another way.\n`
  );
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
          'fail-on': { type: 'string' },
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
    const failOn = values['fail-on'];
    if (failOn !== undefined) {
      if (!isFailOn(failOn)) return usageError(`--fail-on is ${FAIL_ON.join(' or ')}`);
      if (values.mark !== undefined || values.unmark !== undefined) return usageError('--fail-on is not given with --mark or --unmark');
    }
    if (values.unmark !== undefined) {
      if (values.mark !== undefined || values.note !== undefined || positionals.length > 0) {
        return usageError('--unmark takes one path and nothing else');
      }
      if (this.#dependencies.runByAnAi === true) return { kind: 'completed', output: markedByAnAi('--unmark'), exitCode: EXIT_CODE_BY_OUTCOME['mark-refused'] };
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
      if (this.#dependencies.runByAnAi === true) return { kind: 'completed', output: markedByAnAi('--mark'), exitCode: EXIT_CODE_BY_OUTCOME['mark-refused'] };
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
    return failOn === undefined ? { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] } : gated(result, failOn);
  }
}

/**
 * A check under `--fail-on` (RB4): exit 1 with one closing line saying why where the answer meets the level, and the
 * check's own exit code otherwise - a check that read no session, or whose policy was refused, is not a finding.
 */
function gated(result: CheckResult, level: FailOn): CommandResult {
  const reason = result.asks === undefined ? undefined : failure(result.asks, level);
  if (reason === undefined) return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  const output = result.output === '' || result.output.endsWith('\n') ? result.output : result.output + '\n';
  return { kind: 'completed', output: output + reason + '\n', exitCode: EXIT_CODE.asksToAct };
}

/** Why the answer meets the level, in one sentence; undefined where it does not. */
function failure(asks: DigestAsks, level: FailOn): string | undefined {
  const reasons: string[] = [];
  if (level === 'rotate' && asks.rotate > 0) reasons.push(`a value from ${count(asks.rotate, 'file')} was in an agent's context`);
  if (level === 'any' && asks.files > 0) reasons.push(`${count(asks.files, 'file')} ${asks.files === 1 ? 'asks' : 'ask'} you to act`);
  if (level === 'any' && asks.shapes > 0) reasons.push(`${count(asks.shapes, 'kind')} of key came back in a result`);
  if (asks.unreadable > 0) {
    reasons.push(`${count(asks.unreadable, 'session')} could not be read, so this check cannot call ${asks.unreadable === 1 ? 'it' : 'them'} clean`);
  }
  return reasons.length === 0 ? undefined : `--fail-on ${level}: ${reasons.join('; ')}. Exit code 1.`;
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
