import { EXIT_CODE } from '../exit-codes.js';
const USAGE = `Usage: agentwhy codex-stop --codex

Run by the Codex Stop hook. At the end of a Codex turn it says what agentwhy says at the end of a
Claude Code one: a command it stopped, a key from a private file now in the chat, a private file
you let the AI read, or that nothing private was opened. It reads the turn's local transcript and
never sends it anywhere. Run by Codex's UserPromptSubmit hook too, it stops your message before
Codex gets it where the message holds a key, as agentwhy watch does in Claude Code.
`;
/**
 * Codex's Stop hook (`2026-10-02-codex-says-it-too.md` CX1). Its command is the one setup has always written and a
 * person has approved in Codex (CK13), so what it says grew without asking anyone to approve it again: it runs `watch`
 * for Codex, which says first a command agentwhy stopped (CX2), then what `watch` says at Claude Code's `Stop`.
 */
export class CodexStopCliCommand {
    name = 'codex-stop';
    usage = USAGE;
    #watch;
    #interactive;
    constructor(watch, interactive) {
        this.#watch = watch;
        this.#interactive = interactive;
    }
    async execute(args) {
        if (args.length !== 1 || args[0] !== '--codex' || this.#interactive)
            return { kind: 'usage-error', message: 'codex-stop reads Codex hook input on standard input', usage: this.usage };
        // A hook never exits 2 and never fails loudly: whatever `watch` found to say is all it prints (R8).
        const result = await this.#watch.run({});
        return { kind: 'completed', output: result.output, exitCode: EXIT_CODE.ok };
    }
}
