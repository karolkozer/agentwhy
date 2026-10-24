// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from 'node:util';
import { PRE_TOOL_USE, PRE_TOOL_USE_ANSWER } from '../../adapter/copilot/contract/hooks.ts';
import type { RefusalDecision, RefusalUseCase } from '../../refuse/command-refusal.ts';
import { notCheckedMessage, refusalReason, type NotCheckedReason } from '../../refuse/render/refusal-words.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

export const REFUSE_USAGE = `Usage: agentwhy refuse [--codex | --everywhere [--plugin] | --copilot] [--policy <file> | --settings <file>]

Run by a Claude Code or Codex PreToolUse hook on Bash, never by hand: reads the hook input on standard
input and refuses a shell command that would open a file the policy protects, before it runs:
one that names it, one with a glob the shell expands to it (cat .env*), a recursive search
(grep -r, rg) whose own filters do not leave it out, and a listing whose names another program
opens (find -exec cat, find | xargs cat, for f in $(find ...)). The agent is told which path and
that it can ask the user. Anything else runs as it would have.

  --policy <file>     the policy to apply, as for \`report\`
  --settings <file>   a settings file whose deny rules stand in for a policy, as for \`report\`
  --codex             the input is Codex's. The project is the nearest folder at or above the
                      command's whose Claude Code settings run refuse, short of the home folder.
                      Without --settings or --policy, the rules are the ones that project's refuse
                      names; where no such folder is found, the command runs with no message
  --everywhere        the computer's own check in Claude Code, from your own ~/.claude/settings.json:
                      Claude Code's input, with the project found as for --codex. Claude Code runs a
                      project's hooks only in a conversation started there, so this is what checks one
                      held elsewhere. agentwhy protect --refuse installs it
  --plugin            with --everywhere: this is the agentwhy plugin's copy of that check. Where
                      your own ~/.claude/settings.json runs it on the shell and on Read, the call is
                      left to that one, since Claude Code runs both at once
  --copilot           the input is GitHub Copilot's, from a hook in your own ~/.copilot/hooks - its
                      CLI, desktop app or VS Code: its shell and terminal, and its file tools (Read,
                      Write, Edit, Grep, a patch) judged as the shell line that does the same, with the
                      project found as for --codex. A refusal is an answer in
                      JSON with exit 0; anything else, an error included, is exit 0 with nothing
                      written, since Copilot refuses every call a hook fails on
  -h, --help          this text

It reads a command line, so it does NOT stop: a path held in a variable, reached after cd, or
built while the command runs; a search it does not recognise (a script, a program it does not
know); any tool other than Bash. Only a boundary below the agent - file permissions, a sandbox - closes
those. When it cannot read its input or its policy, or a search reaches more files than it can
look through, it lets the command run and warns the user, so a typo in a settings path cannot
stop every command.

Exit 2 refuses the command; 0 lets it run. agentwhy init --refuse installs the hook, and on a
computer that uses Codex, Codex's too - written into your own ~/.codex files and approved there
by agentwhy itself, tried once first, so it runs from the first message.
`;

/**
 * `2026-10-09-copilot-blocks-too.md` CB18: a check that could not run lets Copilot's call run, said by nothing - Copilot
 * refuses every call whose hook ended in another exit code (§2a c4, c5), and any text it is handed may be read as its
 * answer (CB8), so R20's notice is not written to it.
 */
const LET_COPILOT_RUN: CommandResult = { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };

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
    // CB18: for Copilot, no path ends in an error - a crash included.
    if (!args.includes('--copilot')) return this.#execute(args);
    try {
      return await this.#execute(args);
    } catch {
      return LET_COPILOT_RUN;
    }
  }

  async #execute(args: readonly string[]): Promise<CommandResult> {
    let values;
    try {
      ({ values } = parseArgs({
        args: [...args],
        options: {
          policy: { type: 'string' },
          settings: { type: 'string' },
          codex: { type: 'boolean', default: false },
          everywhere: { type: 'boolean', default: false },
          plugin: { type: 'boolean', default: false },
          copilot: { type: 'boolean', default: false },
          help: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }));
    } catch {
      return args.includes('--copilot') ? LET_COPILOT_RUN : notChecked('arguments');
    }

    if (values.help) return { kind: 'help', usage: this.usage };
    // CBD6: `--copilot` names whose input this is, and beside another's it is a hook nobody wrote - let through, unsaid.
    const copilot = values.copilot === true;
    if (copilot && (values.codex === true || values.everywhere === true)) return LET_COPILOT_RUN;
    // One input is read, Codex's or Claude Code's: both named is a hook nobody wrote, said and let through (R20).
    if (values.codex === true && values.everywhere === true) return notChecked('arguments');
    // AP5: `--plugin` names the plugin's copy of the computer's check, and means nothing beside any other input.
    if (values.plugin === true && values.everywhere !== true) return copilot ? LET_COPILOT_RUN : notChecked('arguments');
    if (this.#dependencies.interactive) {
      return { kind: 'usage-error', message: 'refuse reads a hook input on standard input, and this is a terminal', usage: this.usage };
    }

    const decision = await this.#dependencies.refusal.decide({
      ...(values.codex === true ? { codex: true } : {}),
      ...(values.everywhere === true ? { everywhere: true } : {}),
      ...(values.plugin === true ? { plugin: true } : {}),
      ...(copilot ? { copilot: true } : {}),
      ...(values.policy === undefined ? {} : { policyPath: values.policy }),
      ...(values.settings === undefined ? {} : { settingsPath: values.settings }),
    });
    return copilot ? copilotResultOf(decision) : resultOf(decision);
  }
}

/**
 * CB15, CPB44: Copilot is told a refusal in JSON on exit 0, and records the reason after its own words - which is how a
 * report knows the refusal as agentwhy's (CPD12). CB21: the same decision under `hookSpecificOutput` too, where VS Code
 * reads it (§2b). Everything else lets the call run, unsaid (CB18).
 */
function copilotResultOf(decision: RefusalDecision): CommandResult {
  if (decision.kind !== 'refuse') return LET_COPILOT_RUN;
  const reason = refusalReason(decision.path, decision.pattern, decision.others, decision.route, decision.whose);
  const refused = { [PRE_TOOL_USE_ANSWER.decision]: PRE_TOOL_USE_ANSWER.deny, [PRE_TOOL_USE_ANSWER.reason]: reason };
  const answer = { ...refused, [PRE_TOOL_USE_ANSWER.specific]: { [PRE_TOOL_USE_ANSWER.event]: PRE_TOOL_USE.event, ...refused } };
  return { kind: 'completed', output: JSON.stringify(answer), exitCode: EXIT_CODE.ok };
}

function resultOf(decision: RefusalDecision): CommandResult {
  switch (decision.kind) {
    case 'allow':
      return { kind: 'completed', output: '', exitCode: EXIT_CODE.ok };
    case 'not-checked':
      return notChecked(decision.reason);
    case 'refuse':
      return { kind: 'hook-block', reason: refusalReason(decision.path, decision.pattern, decision.others, decision.route, decision.whose) };
  }
}

function notChecked(reason: NotCheckedReason): CommandResult {
  return { kind: 'completed', output: notCheckedMessage(reason), exitCode: EXIT_CODE.ok };
}
