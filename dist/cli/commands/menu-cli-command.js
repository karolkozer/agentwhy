import { EXIT_CODE } from '../exit-codes.js';
export const MENU_USAGE = `Usage: agentwhy menu

At a terminal: a list of the few things to do here. Pick one, it runs, you read what it said, and
the list comes back so you can do the next thing. Leaving the list ends it, and so does Quit.
Nothing is served by the list itself and nothing keeps running between those runs. It needs a
terminal: piped or redirected, it prints this help and exits 2. \`agentwhy\` alone opens the page
of sessions, the same as \`agentwhy start\`.
`;
/**
 * `agentwhy menu` (`specs/2026-09-16-worth-running-every-day.md` R24, R74). A way on, and a way in for someone who
 * does not know the commands: what is picked runs, what it said is printed, and the list comes back until the person
 * leaves it. The list itself browses and serves nothing - each run is the same command it would have been from the
 * shell - the same rule the rest of the tool follows (main spec §2).
 */
export class MenuCliCommand {
    name = 'menu';
    usage = MENU_USAGE;
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async execute(args) {
        const { chooser, printer, entries, interactive } = this.#dependencies;
        if (args.length > 0)
            return { kind: 'usage-error', message: 'menu takes no arguments', usage: this.usage };
        if (!interactive)
            return { kind: 'usage-error', message: 'menu needs a terminal', usage: this.usage };
        const rows = [...entries.map(({ label, detail }) => ({ label, detail })), { label: 'Quit', detail: 'leave agentwhy' }];
        let exitCode = EXIT_CODE.ok;
        for (let first = true;; first = false) {
            const chosen = await chooser.choose(first ? 'What do you want to do?' : 'What now?', rows);
            const entry = chosen === undefined ? undefined : entries[chosen];
            // Leaving the list, or Quit, ends it: the exit code is that of the last thing that ran.
            if (entry === undefined)
                return { kind: 'completed', output: '', exitCode };
            const result = await entry.command.execute([]);
            // Written as it happens, because the list comes back afterwards and an answer held until the end is read last.
            // The blank lines keep what a command said apart from the next question; on screen they run together otherwise.
            printer.write(`\n${textOf(result).replace(/\n*$/, '\n')}\n`);
            if (result.kind === 'completed')
                exitCode = result.exitCode;
        }
    }
}
/** What a command said, whatever kind of answer it gave: a usage error is read the same way at a terminal. */
function textOf(result) {
    switch (result.kind) {
        case 'completed':
            return result.output;
        case 'help':
            return result.usage;
        case 'usage-error':
            return `agentwhy: ${result.message}\n\n${result.usage}`;
        case 'hook-block':
            return result.reason;
    }
}
