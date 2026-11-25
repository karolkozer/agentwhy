// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { PRE_TOOL_USE, USER_HOOKS } from '../adapter/copilot/contract/hooks.js';
import { absoluteInvocation, copilotHookFile, copilotInvocationIn, copilotRefuseCommand, copilotRefuseIn, copilotRefuseTrial, } from '../adapter/copilot/settings/copilot-hooks.js';
import { FileAccessError } from '../ports/file-access-error.js';
import { parseJsonObject } from '../shared/json.js';
import { isPlainInvocation } from '../shared/plain-invocation.js';
import { refuseRunsIn } from './refuse-runs-in.js';
const WHERE = `~/${USER_HOOKS.folder.join('/')}/${USER_HOOKS.file}`;
/** What the check covers and what it does not (CB11), said wherever it is written. */
const COVERS = "Copilot - in the terminal, its desktop app and VS Code - then refuses a call that would open a blocked file - its shell, and its read, write, edit and search tools, helpers included - in projects whose rules block files, and wherever your computer-wide rules do. Not covered: MCP tools, a blocked file's name in a listing, and a file VS Code hands Copilot itself - one open in the editor or attached to a question.";
/** CB18, CBD9: what happens when the check cannot run - said, since it is the price of never stopping the person's work. */
const FAILS_OPEN = "If neither this agentwhy nor one on Copilot's PATH can start - after a Node upgrade, say - Copilot runs the call unchecked rather than stopping your work. Running init again puts it right.";
/** CBB14: a new chat in the desktop app took the file with no restart; a session already open is not measured. */
const WHEN = "It holds from Copilot's next new chat; one already open may not see it until Copilot restarts.";
/**
 * `2026-10-09-copilot-blocks-too.md` CB9, CB16-CB19, CBD9: after the setup it wraps - Claude Code's settings, then Codex's
 * files - has written or found nothing to change, Copilot's check is made to match. Where `refuse` runs in this project,
 * `~/.copilot/hooks/agentwhy.json` holds agentwhy's one entry, tried first; it is the person's own, outside every project,
 * as Codex's check is. Only on a computer with `~/.copilot`, with its own part of the plan and the same consent (R7). A file
 * of that name agentwhy did not write is never rewritten or removed. A project's remove keeps the check, which does
 * nothing where no rule is; `--remove --copilot` takes it out.
 */
export class CopilotMirror {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        // `2026-11-05-a-key-in-what-it-read.md` KR10: the switch is the person's own project file and nothing else, and it names no check for Copilot.
        if (options.hideKeys !== undefined)
            return this.#dependencies.setup.run(options);
        // `the-card-in-codex.md` CCX3: Codex's card alone.
        if (options.codexCard !== undefined)
            return this.#dependencies.setup.run(options);
        // `nothing-updates-by-itself` U7: an update re-pins what runs through npx, and Copilot's check names no version.
        if (options.update === true)
            return this.#dependencies.setup.run(options);
        if (this.#dependencies.onlyWhenNamed === true && options.copilot !== true)
            return this.#dependencies.setup.run(options);
        const alone = options.copilot === true && !options.remove && nothingElse(options);
        // `init --copilot` with nothing else named: Copilot's part alone. A remove keeps its usual course first, as Codex's.
        if (alone && options.codex !== true)
            return (await this.#mirror(options)) ?? { outcome: 'unchanged', output: await this.#nothingFor(options) };
        const result = await this.#dependencies.setup.run(options);
        // Decided 2026-10-12: `--codex --copilot` runs both parts whatever Codex's answered; anything else follows a setup
        // that wrote or found nothing to change, as Codex's part does.
        if (!alone && result.outcome !== 'written' && result.outcome !== 'unchanged')
            return result;
        const copilot = (await this.#mirror(options)) ?? (alone ? { outcome: 'unchanged', output: await this.#nothingFor(options) } : undefined);
        if (copilot === undefined)
            return result;
        return { outcome: joined(result.outcome, copilot.outcome, options.copilot === true), output: `${result.output}${result.output.endsWith('\n') || result.output === '' ? '' : '\n'}\n${copilot.output}` };
    }
    /** The change to the person's Copilot file; `undefined` where there is none to make. */
    async #mirror(options) {
        if (!(await this.#dependencies.copilotOnThisComputer())) {
            // Nothing is written and no folder is created. Said only where Copilot was asked for by name.
            return options.copilot === true ? refused('there is no ~/.copilot folder, so Copilot is not used on this computer and nothing was written for it.') : undefined;
        }
        const read = await this.#read();
        const runs = await refuseRunsIn(this.#dependencies.files, this.#dependencies.workingDirectory, options.invoke);
        if (options.remove) {
            if (options.copilot === true)
                return this.#removal(options, read);
            // CB9: a remove installs nothing. Where refuse is gone from here, the check stays for the other projects, said.
            if (runs || read.kind !== 'object' || copilotRefuseIn(read.file) === undefined)
                return undefined;
            return {
                outcome: 'unchanged',
                output: `Copilot: agentwhy's check in ${WHERE} stays - other projects may block files with it, and it does nothing where none do. To take it out of Copilot everywhere: agentwhy init --remove --copilot\n`,
            };
        }
        return runs ? this.#install(options, read) : undefined;
    }
    /** CB9, CBD9: the file holds agentwhy's one entry, its command tried first. */
    async #install(options, read) {
        if (read.kind === 'broken' || read.kind === 'unreadable') {
            return refused(`${WHERE} ${read.kind === 'broken' ? 'is not a JSON object' : 'could not be read'}, so agentwhy's check was not written to it.`);
        }
        const existing = read.kind === 'object' ? copilotRefuseIn(read.file) : undefined;
        if (read.kind === 'object' && existing === undefined)
            return refused(`${WHERE} holds something agentwhy did not write, so it was left as it is.`);
        const invoke = options.invoke ?? (await this.#kept(existing)) ?? this.#dependencies.ownInvocation;
        if (invoke === undefined)
            return refused('agentwhy could not tell where its own Node and script are, so nothing was written. Name how to run agentwhy with --command, and run this again.');
        const command = copilotRefuseCommand(invoke);
        if (existing === command)
            return undefined;
        const failed = await this.#try(invoke);
        if (failed !== undefined)
            return refused(`${failed} so nothing was written. Fix it, or name how to run agentwhy with --command, and run this again.`);
        const plan = [
            'And in Copilot, agentwhy will write a file of its own, outside every project:',
            '',
            `  ${WHERE}`,
            `    ${'before a Copilot tool'.padEnd(24)}${command}`,
            '',
            `  ${COVERS}`,
            `  ${FAILS_OPEN}`,
            ...(existing === undefined ? [] : ['', `  It replaces agentwhy's check there now, which runs: ${existing}`]),
        ];
        const done = existing === undefined
            ? `Copilot: agentwhy's check is in ${WHERE}. ${COVERS} ${WHEN}`
            : `Copilot: agentwhy's check in ${WHERE} changed. ${WHEN}`;
        return this.#write(options, plan, async () => {
            await this.#dependencies.files.ensureDirectory(this.#folder());
            await this.#dependencies.files.replaceText(this.#path(), `${JSON.stringify(copilotHookFile(command), null, 2)}\n`);
        }, done);
    }
    /**
     * Decided 2026-10-12, as Codex keeps its own (AO9): the invocation of agentwhy's check already in the file, kept so the
     * agentwhys of different projects do not rewrite each other's - while it can still start. One agentwhy wrote by its
     * absolute paths is kept while both files are there, looked at and never run; one named in plain words is the person's
     * own `--command`, kept as Codex keeps it. Anything else gives way to the one running.
     */
    async #kept(existing) {
        const invoke = existing === undefined ? undefined : copilotInvocationIn(existing);
        if (invoke === undefined)
            return undefined;
        const paths = absoluteInvocation(invoke);
        if (paths === undefined)
            return isPlainInvocation(invoke) ? invoke : undefined;
        for (const path of [paths.node, paths.script]) {
            const kind = await this.#dependencies.files.kindOf(path).catch(() => undefined);
            if (kind !== 'file')
                return undefined;
        }
        return invoke;
    }
    /** `--remove --copilot`: agentwhy's file out, and nothing else of Copilot's. */
    async #removal(options, read) {
        if (read.kind === 'absent')
            return { outcome: 'unchanged', output: `Copilot: agentwhy's check is not in ${WHERE}, so there was nothing to take out.\n` };
        if (read.kind !== 'object' || copilotRefuseIn(read.file) === undefined) {
            return refused(`${WHERE} ${read.kind === 'unreadable' ? 'could not be read' : 'holds something agentwhy did not write'}, so it was left as it is.`);
        }
        const plan = [
            'And in Copilot, agentwhy will remove its own file, outside every project:',
            '',
            `  ${WHERE}`,
            '',
            '  Copilot then no longer blocks anything for agentwhy, in any project on this computer. Your own hook files beside it stay.',
        ];
        return this.#write(options, plan, async () => {
            try {
                await this.#dependencies.files.removeFile(this.#path());
            }
            catch (error) {
                // Gone already: what was asked for holds.
                if (!(error instanceof FileAccessError) || error.failure !== 'not-found')
                    throw error;
            }
        }, `Copilot: ${WHERE} is removed. Copilot no longer blocks anything for agentwhy.`);
    }
    /** R7: consent, then the one change; a file that cannot be written is said, never thrown. */
    async #write(options, plan, change, done) {
        const consent = await this.#consent(options, plan);
        if (typeof consent !== 'string')
            return consent;
        const said = consent === 'asked' ? '' : `${plan.join('\n')}\n\n`;
        try {
            await change();
        }
        catch (error) {
            // Found by the review of step 3: `~/.copilot/hooks` as a file, or a dangling link, fails `mkdir` with EEXIST, which
            // no port translates - and Claude Code's and Codex's files are written by then, so a crash would hide them.
            if (!(error instanceof FileAccessError) && !systemError(error))
                throw error;
            return { outcome: 'unwritable', output: `${said}Copilot: ${WHERE} could not be written, so nothing was changed for Copilot.\n` };
        }
        return { outcome: 'written', output: `${said}${done}\n` };
    }
    /** The command, run once from a folder no project is above, as a hook with an input that reaches nothing. */
    async #try(invoke) {
        const trial = this.#dependencies.trial;
        if (trial === undefined)
            return 'agentwhy could not try the check before writing it,';
        const folder = this.#dependencies.trialFolder;
        const commandLine = copilotRefuseTrial(invoke);
        const input = JSON.stringify({ hook_event_name: PRE_TOOL_USE.event, cwd: folder, tool_name: PRE_TOOL_USE.tools.shell, tool_input: { command: 'true' } });
        return trialFailure(commandLine, await trial.run({ commandLine, input, folder, timeoutMs: USER_HOOKS.timeoutSeconds * 1000 }));
    }
    /** R7, as `ProjectSetup` and `CodexMirror` ask it: `--yes`, a person at a terminal, or the plan printed and nothing written. */
    async #consent(options, plan) {
        if (options.yes)
            return 'given';
        if (!this.#dependencies.interactive) {
            return { outcome: 'not-confirmed', output: `${plan.join('\n')}\n\nNothing was written for Copilot. To write it: the same command with --yes\n` };
        }
        const chosen = await this.#dependencies.chooser.choose(`${plan.join('\n')}\n\nWrite it?`, [
            { label: 'Yes', detail: "write agentwhy's Copilot file" },
            { label: 'No', detail: 'leave Copilot as it is' },
        ]);
        return chosen === 0 ? 'asked' : { outcome: 'declined', output: 'Nothing was written for Copilot.\n' };
    }
    /** What `init --copilot` alone says where the file already matches, or there is nothing for it to follow. */
    async #nothingFor(options) {
        if (!(await refuseRunsIn(this.#dependencies.files, this.#dependencies.workingDirectory, options.invoke))) {
            return "Copilot: nothing to write. agentwhy blocks Copilot where refuse runs, and refuse doesn't run here yet: agentwhy init --refuse --copilot\n";
        }
        return `Copilot: ${WHERE} already runs agentwhy's check. ${COVERS}\n`;
    }
    async #read() {
        let text;
        try {
            text = await this.#dependencies.files.readText(this.#path());
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return { kind: error.failure === 'not-found' ? 'absent' : 'unreadable' };
        }
        const file = parseJsonObject(text);
        return file === undefined ? { kind: 'broken' } : { kind: 'object', file };
    }
    #folder() {
        return join(this.#dependencies.home, ...USER_HOOKS.folder);
    }
    #path() {
        return join(this.#folder(), USER_HOOKS.file);
    }
}
/**
 * How two parts' outcomes are one run's, decided 2026-10-12: a part named on the command line that was refused or could
 * not be written is the run's answer, exit 2; otherwise as `CodexMirror` joins its two - written if either wrote.
 */
function joined(setup, copilot, copilotNamed) {
    if (setup === 'refused' || setup === 'unwritable')
        return setup;
    if (copilotNamed && (copilot === 'refused' || copilot === 'unwritable'))
        return copilot;
    return setup === 'unchanged' && copilot === 'written' ? 'written' : setup;
}
/** An error the operating system raised, which a port did not translate: it has a code, as `EEXIST`. */
function systemError(error) {
    return error instanceof Error && typeof error.code === 'string';
}
/** A run that wrote nothing, and why, said as `Copilot: …`. */
function refused(why) {
    return { outcome: 'refused', output: `Copilot: ${why}\n` };
}
/** What a trial's failure is said as, or `undefined` where the command ran and exited 0. */
function trialFailure(commandLine, outcome) {
    if (outcome.kind === 'ran' && outcome.exitCode === 0)
        return undefined;
    if (outcome.kind === 'ran')
        return `"${commandLine}" exited with code ${outcome.exitCode}${outcome.stderr === '' ? '' : ` (${outcome.stderr})`} when tried as a hook,`;
    if (outcome.kind === 'timed-out')
        return `"${commandLine}" did not finish within ${USER_HOOKS.timeoutSeconds} seconds when tried as a hook,`;
    if (outcome.kind === 'not-started')
        return `"${commandLine}" could not be started (${outcome.reason}),`;
    return 'agentwhy cannot try the check on this system, which was measured on macOS only,';
}
/** `--copilot`, with or without `--remove`, and nothing else: no hook named, nothing to protect or take out, no update. */
function nothingElse(options) {
    return options.hooks === undefined && options.protect.length === 0 && (options.unprotect ?? []).length === 0 && options.update !== true;
}
