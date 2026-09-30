import type { CodexStopRefusals } from '../../adapter/codex/hooks/stop-refusals.ts';
import { codexStopInstruction } from '../../refuse/render/codex-stop-words.ts';
import type { CliCommand, CommandResult } from '../cli-command.ts';
import { EXIT_CODE } from '../exit-codes.ts';

const USAGE = `Usage: agentwhy codex-stop --codex

Run by the Codex Stop hook. When agentwhy refused a shell command in this turn, asks Codex to
explain the block in its reply. It reads the turn's local transcript and never sends it anywhere.
`;

export class CodexStopCliCommand implements CliCommand {
  readonly name = 'codex-stop';
  readonly usage = USAGE;
  readonly #refusals: CodexStopRefusals;
  readonly #interactive: boolean;

  constructor(refusals: CodexStopRefusals, interactive: boolean) {
    this.#refusals = refusals;
    this.#interactive = interactive;
  }

  async execute(args: readonly string[]): Promise<CommandResult> {
    if (args.length !== 1 || args[0] !== '--codex' || this.#interactive) return { kind: 'usage-error', message: 'codex-stop reads Codex hook input on standard input', usage: this.usage };
    const refusals = await this.#refusals.find();
    return {
      kind: 'completed',
      output: refusals.length === 0 ? '' : JSON.stringify({ decision: 'block', reason: codexStopInstruction(refusals) }),
      exitCode: EXIT_CODE.ok,
    };
  }
}
