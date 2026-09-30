import { parseArgs } from 'node:util';
import { parseSince } from '../../core/session-filter.ts';
import type { StartOutcome, StartUseCase } from '../../report/start/session-start.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const START_USAGE = `Usage: agentwhy start [--since <span | date>] [--out <dir>] [--policy <file> | --settings <file>]
                     [--no-open] [--serve | --no-serve] [--share]

Lists every session of the current directory's project on one page, writes a report for each
session active inside the range, and opens the page. The page it opens is served from 127.0.0.1,
at an address holding a random token, so a file marked done on it is recorded at once; it stops
after 30 minutes with no request, or with Ctrl+C. The reports are files either way.

  --since <span|date> sessions last active since then: 7d, 12h, 2w, or 2026-09-01 (UTC). Default 7d
  --out <dir>         where to write; default a new directory in the system temporary location.
                      Refused inside a repository
  --policy <file>     the policy every report reads, as for \`report\`
  --settings <file>   a settings file whose deny rules stand in for a policy, as for \`report\`.
                      Without either, every report uses the built-in default and says so
  --no-open           write the files and print where, without opening anything
  --serve             serve the page even with --no-open, and print its address
  --no-serve          open the page as a file and return; marks on it are copied as commands
  --share             no session ids, no project path, nothing above the project root. This
                      reduces exposure; it does not anonymise
  -h, --help          this text
`;

// A Record over the outcome union: a new outcome does not compile until it has an exit code.
const EXIT_CODE_BY_OUTCOME: Readonly<Record<StartOutcome, ExitCode>> = {
  written: EXIT_CODE.ok,
  // No sessions is an answer about this directory, the same one `sessions` gives with exit 0.
  'no-sessions': EXIT_CODE.ok,
  refused: EXIT_CODE.usage,
  unwritable: EXIT_CODE.usage,
};

export interface StartCommandDependencies {
  readonly start: StartUseCase;
  /** When the command started. A range is measured from it, so it is given rather than read. */
  readonly now: number;
}

/** `agentwhy start` - a page to begin from, for someone who has a date and not a session id. */
export class StartCliCommand implements CliCommand {
  readonly name = 'start';
  readonly usage = START_USAGE;
  readonly #dependencies: StartCommandDependencies;

  constructor(dependencies: StartCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          since: { type: 'string', default: '7d' },
          out: { type: 'string' },
          policy: { type: 'string' },
          settings: { type: 'string' },
          'no-open': { type: 'boolean', default: false },
          serve: { type: 'boolean' },
          'no-serve': { type: 'boolean', default: false },
          share: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch (error) {
      return { kind: 'usage-error', message: error instanceof Error ? error.message : String(error), usage: this.usage };
    }

    if (values.help) return { kind: 'help', usage: this.usage };

    if (values.serve === true && values['no-serve']) {
      return { kind: 'usage-error', message: '--serve and --no-serve cannot be given together', usage: this.usage };
    }

    const since = parseSince(values.since, this.#dependencies.now);
    if ('error' in since) return { kind: 'usage-error', message: since.error, usage: this.usage };

    const result = await this.#dependencies.start.run({
      since,
      ...(values.out === undefined || values.out === '' ? {} : { out: values.out }),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
      open: !values['no-open'],
      share: values.share,
      ...(values['no-serve'] ? { serve: false } : values.serve === true ? { serve: true } : {}),
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}
