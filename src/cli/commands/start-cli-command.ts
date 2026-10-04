// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { parseSince } from '../../core/session-filter.ts';
import type { StartOutcome, StartUseCase } from '../../report/start/session-start.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE, type ExitCode } from '../exit-codes.ts';

export const START_USAGE = `Usage: agentwhy start [--since <span | date>] [--out <dir>] [--policy <file> | --settings <file>]
                     [--no-open] [--serve | --no-serve | --detach] [--share] [--session <id>] [--quiet]

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
  --detach            serve the page from the background and return at once: the server already
                      running for this project if there is one, else a new one, which stops 30
                      minutes after its last page is closed. Where none can run, the page is a file
  --share             no session ids, no project path, nothing above the project root. This
                      reduces exposure; it does not anonymise
  --session <id>      open this session's report instead of the list, beside every other one, so
                      its "All conversations" leads back to them. Written whatever the range
  --quiet             say where the page is and nothing else - for an agent opening a report
                      because you said yes, as \`report --quiet\` does
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
  /** `--detach` (`2026-10-02-a-page-not-a-file.md` PF3): absent, the flag is refused. */
  readonly detached?: StartUseCase;

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
          session: { type: 'string' },
          quiet: { type: 'boolean', default: false },
          detach: { type: 'boolean', default: false },
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

    // A shared page names no session, and has none to open by its id.
    if (values.share && values.session !== undefined) {
      return { kind: 'usage-error', message: '--session names a session by its id, which --share leaves out', usage: this.usage };
    }
    if (values.session === '') return { kind: 'usage-error', message: '--session needs a session id', usage: this.usage };

    // PF3: from the background is served, and a shared page is never served (R37).
    if (values.detach && (values.share || values['no-serve'] || values.serve === true)) {
      return { kind: 'usage-error', message: '--detach serves the page, and cannot be given with --share, --serve or --no-serve', usage: this.usage };
    }
    const detached = this.#dependencies.detached;
    if (values.detach && detached === undefined) return { kind: 'usage-error', message: '--detach is not available here', usage: this.usage };

    const since = parseSince(values.since, this.#dependencies.now);
    if ('error' in since) return { kind: 'usage-error', message: since.error, usage: this.usage };

    const result = await (values.detach ? (detached as StartUseCase) : this.#dependencies.start).run({
      since,
      ...(values.out === undefined || values.out === '' ? {} : { out: values.out }),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
      open: !values['no-open'],
      share: values.share,
      ...(values['no-serve'] ? { serve: false } : values.serve === true ? { serve: true } : {}),
      ...(values.session === undefined ? {} : { session: values.session }),
      ...(values.quiet ? { quiet: true } : {}),
    });
    return { kind: 'completed', output: result.output, exitCode: EXIT_CODE_BY_OUTCOME[result.outcome] };
  }
}
