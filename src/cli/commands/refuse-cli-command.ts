import { parseArgs } from 'node:util';
import type { RefusalDecision, RefusalUseCase } from '../../refuse/command-refusal.ts';
import { notCheckedMessage, refusalReason, type NotCheckedReason } from '../../refuse/render/refusal-words.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

export const REFUSE_USAGE = `Usage: agentwhy refuse [--codex] [--policy <file> | --settings <file>]

Run by a Claude Code or Codex PreToolUse hook on Bash, never by hand: reads the hook input on standard
input and refuses a shell command that would open a file the policy protects, before it runs:
one that names it, one with a glob the shell expands to it (cat .env*), and a recursive search
(grep -r, rg) whose own filters do not leave it out. The agent is told which path and that it
can ask the user. Anything else runs as it would have.

  --policy <file>     the policy to apply, as for \`report\`
  --settings <file>   a settings file whose deny rules stand in for a policy, as for \`report\`
  --codex             the input is Codex's; a relative --settings is read in the project, the
                      nearest folder at or above the command's that holds .codex/hooks.json
  -h, --help          this text

It reads a command line, so it does NOT stop: a path held in a variable, reached after cd, or
built while the command runs; a search it does not recognise (find -exec, xargs, a script); any
tool other than Bash. Only a boundary below the agent - file permissions, a sandbox - closes
those. When it cannot read its input or its policy, or a search reaches more files than it can
look through, it lets the command run and warns the user, so a typo in a settings path cannot
stop every command.

Exit 2 refuses the command; 0 lets it run. agentwhy init --refuse installs the hook, and in a
project that uses Codex, Codex's too - which Codex runs only once you approve it there.
`;

export interface RefuseCommandDependencies {
  readonly refusal: RefusalUseCase;
  /** Standard input is a terminal: there is no hook, and so no input to wait for. */
  readonly interactive: boolean;
}

/** `agentwhy refuse` - the shell hook of `specs/2026-09-16-worth-running-every-day.md` R18-R22. */
export class RefuseCliCommand implements CliCommand {
  readonly name = 'refuse';
  readonly usage = REFUSE_USAGE;
  readonly #dependencies: RefuseCommandDependencies;

  constructor(dependencies: RefuseCommandDependencies) {
    this.#dependencies = dependencies;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          policy: { type: 'string' },
          settings: { type: 'string' },
          codex: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch {
      return notChecked('arguments');
    }

    if (values.help) return { kind: 'help', usage: this.usage };
    if (this.#dependencies.interactive) {
      return { kind: 'usage-error', message: 'refuse reads a hook input on standard input, and this is a terminal', usage: this.usage };
    }

    const decision = await this.#dependencies.refusal.decide({
      ...(values.codex === true ? { codex: true } : {}),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
    });
    return resultOf(decision);
  }
}

function resultOf(decision: RefusalDecision): CommandResult {
  switch (decision.kind) {
    case 'allow':
      return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
    case 'not-checked':
      return notChecked(decision.reason);
    case 'refuse':
      return { kind: 'hook-block', reason: refusalReason(decision.path, decision.pattern, decision.others, decision.route) };
  }
}

function notChecked(reason: NotCheckedReason): CommandResult {
  return { kind: 'completed', output: notCheckedMessage(reason), exitCode: EXIT_CODE.ok };
}
