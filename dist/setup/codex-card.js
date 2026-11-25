// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { pinnedOlderThan } from '../adapter/claude-code/settings/hook-entries.js';
import { USER_HOOKS } from '../adapter/codex/contract/hooks.js';
import { cardServerIn, DISABLED, isCardRun, withCardServer, withoutCardServer } from '../adapter/codex/settings/card-server.js';
import { codexCheckState } from '../adapter/codex/settings/codex-check.js';
import { FileAccessError } from '../ports/file-access-error.js';
const WHERE = `~/${USER_HOOKS.directory}/${USER_HOOKS.config}`;
const TRIAL_MS = 30_000;
const WHAT = 'When you ask Codex what happened, agentwhy shows the answer as a card in Codex\'s desktop app. A small program of agentwhy\'s runs while a Codex conversation is open.';
const RESTART = 'Codex reads it the next time it starts.';
/**
 * `2026-11-25-the-card-in-codex.md` CCX1-CCX6: agentwhy's server in the person's own `~/.codex/config.toml`, so Codex's app draws its card.
 * Asked for alone (`codexCard`), with a Codex check set up for the first time whose yes named it (`cardToo`), taken out with that check
 * (`--remove --codex`) and re-pinned with it (`--update`). Tried first; one table and no other line; a table of the person's is left alone.
 */
export class CodexCard {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        if (options.codexCard !== undefined)
            return options.codexCard ? this.#on(options, 'asked') : this.#off(options, true);
        const { setup, files, home } = this.#dependencies;
        const before = options.cardToo === true ? await codexCheckState(files, home) : undefined;
        const result = await setup.run(options);
        // A plan shown with nothing written names the card too: the same command with --yes writes both.
        if (result.outcome === 'not-confirmed' && before === 'absent' && options.codex === true)
            return joined(result, await this.#on({ ...options, yes: false }, 'too'));
        if (result.outcome !== 'written' && result.outcome !== 'unchanged')
            return result;
        const part = options.remove
            ? options.codex === true && options.hideKeys === undefined ? await this.#off(options, false) : undefined
            : options.update === true
                ? await this.#on(options, 'update')
                : before === 'absent' && (await codexCheckState(files, home)) !== 'absent' ? await this.#on(options, 'too') : undefined;
        if (part === undefined)
            return result;
        // Asked out of Codex and not all out: that is the answer, as the check's own removal answers.
        return options.remove && part.outcome !== 'written' && part.outcome !== 'unchanged' ? { ...joined(result, part), outcome: part.outcome } : joined(result, part);
    }
    async #on(options, why) {
        const quiet = { outcome: 'unchanged', output: '' };
        if (!(await this.#dependencies.codexOnThisComputer())) {
            return why === 'asked' ? refused(`there is no ~/${USER_HOOKS.directory} folder, so Codex is not used on this computer and nothing was written for it.`) : quiet;
        }
        const toml = await this.#read();
        if (toml === undefined)
            return why === 'update' ? quiet : refused(`${WHERE} could not be read, so agentwhy's card was not set up.`);
        const held = cardServerIn(toml);
        if (why === 'update' && held.kind !== 'own')
            return quiet;
        if (held.kind === 'yours')
            return why === 'asked' ? { outcome: 'unchanged', output: `Codex: a server named agentwhy is in ${WHERE} already, added by you, so agentwhy left it as it is.\n` } : quiet;
        if (held.kind === 'unsafe')
            return why === 'asked' ? refused(`${WHERE}: ${held.reason}, so agentwhy wrote nothing there.`) : quiet;
        const run = await this.#run(options, held);
        if (!isCardRun(run))
            return refused(`its card is set up only to run agentwhy in plain words, and \`${run.join(' ')}\` is not, so nothing was written for it.`);
        // Off by the person's own word in Codex, and asked for: the word is taken back, in the line that says it.
        const edit = (fresh) => {
            const placed = withCardServer(fresh, run);
            return placed.kind === 'edited' && why === 'asked' ? { kind: 'edited', text: enabledAgain(placed.text) } : placed;
        };
        const first = edit(toml);
        if (first.kind === 'unsafe')
            return refused(`${WHERE}: ${first.reason}, so agentwhy wrote nothing there.`);
        if (first.text === toml)
            return why === 'asked' ? { outcome: 'unchanged', output: `Codex: agentwhy's card is in ${WHERE} already.\n` } : quiet;
        const again = held.kind === 'own' && held.disabled && why === 'asked';
        return this.#write(options, edit, [
            'And in Codex, agentwhy will change your own Codex settings, outside every project:',
            '',
            `  In ${WHERE}`,
            `    its card's server   ${run.join(' ')}`,
            ...(again ? ['    turned on again: it was turned off there'] : []),
            '',
            `  ${WHAT}`,
            '',
            '  Everything else in the file stays.',
        ], `Codex: agentwhy's card is in ${WHERE}. ${WHAT} ${RESTART}`, run);
    }
    async #off(options, asked) {
        const quiet = { outcome: 'unchanged', output: asked ? `Codex: agentwhy's card is not in ${WHERE}, so there was nothing to take out.\n` : '' };
        if (!(await this.#dependencies.codexOnThisComputer()))
            return quiet;
        const toml = await this.#read();
        if (toml === undefined)
            return refused(`${WHERE} could not be read, so agentwhy's card was not taken out of it.`);
        const held = cardServerIn(toml);
        if (held.kind === 'yours')
            return { outcome: 'unchanged', output: `Codex: the server named agentwhy in ${WHERE} was added by you, so it stays. To take it out: codex mcp remove agentwhy\n` };
        if (held.kind === 'unsafe')
            return refused(`${WHERE}: ${held.reason}, so agentwhy took nothing out - take it out by hand.`);
        if (held.kind === 'absent')
            return quiet;
        return this.#write(options, withoutCardServer, [
            'And in Codex, agentwhy will change your own Codex settings, outside every project:',
            '',
            `  Take its card's server out of ${WHERE}`,
            '',
            '  Everything else in the file stays.',
        ], `Codex: agentwhy's card is out of ${WHERE}. ${RESTART}`);
    }
    /** What runs it: `--command`, else what is there already and not older than this, else as this agentwhy is run. */
    async #run(options, held) {
        const { invocation } = this.#dependencies;
        if (options.invoke === undefined && options.update !== true && held.kind === 'own' && !pinnedOlderThan(held.run.slice(0, -1).join(' '), await invocation.version()))
            return held.run;
        const words = (options.invoke ?? (await invocation.find())).split(/[ \t]+/).filter(Boolean);
        // A server's input is the app's: nothing can answer npx's question whether to install.
        return [...(words[0] === 'npx' && words[1] !== '-y' && words[1] !== '--yes' ? ['npx', '-y', ...words.slice(1)] : words), 'cards'];
    }
    /** CCX2: started once as Codex starts it; why it cannot be written, or nothing. */
    async #try(run) {
        const { serverTrial, trialFolder } = this.#dependencies;
        if (serverTrial === undefined)
            return 'agentwhy could not try its card\'s server before writing it,';
        const outcome = await serverTrial.run({ run, folder: trialFolder, timeoutMs: TRIAL_MS });
        const what = `\`${run.join(' ')}\``;
        if (outcome.kind === 'answered')
            return outcome.name === 'agentwhy' ? undefined : `${what} answered as ${outcome.name},`;
        if (outcome.kind === 'other')
            return `${what} wrote something else before its answer,`;
        return outcome.kind === 'timed-out' ? `${what} did not answer in ${TRIAL_MS / 1000} seconds,` : `${what} did not start (${outcome.reason}),`;
    }
    async #write(options, edit, plan, done, run) {
        if (!options.yes) {
            if (!this.#dependencies.interactive)
                return { outcome: 'not-confirmed', output: `${plan.join('\n')}\n\nNothing was written for Codex's card. To write it: the same command with --yes\n` };
            const chosen = await this.#dependencies.chooser.choose(`${plan.join('\n')}\n\nWrite it?`, [
                { label: 'Yes', detail: 'write agentwhy\'s card' },
                { label: 'No', detail: 'leave Codex as it is' },
            ]);
            if (chosen !== 0)
                return { outcome: 'declined', output: 'Nothing was written for Codex\'s card.\n' };
        }
        // CCX2: what Codex will start is started once, after the yes and before the write.
        const failed = run === undefined ? undefined : await this.#try(run);
        if (failed !== undefined)
            return refused(`${failed} so its card was not set up.`);
        const said = options.yes ? `${plan.join('\n')}\n\n` : '';
        // AO11: Codex writes this file too, so it is read again and the edit made on what is there now.
        const fresh = await this.#read();
        const now = fresh === undefined ? undefined : edit(fresh);
        if (fresh === undefined || now === undefined)
            return { outcome: 'unwritable', output: `${said}Codex: ${WHERE} could not be read again, so nothing was written.\n` };
        if (now.kind === 'unsafe')
            return { outcome: 'refused', output: `${said}Codex: ${WHERE}: ${now.reason}, so nothing was written.\n` };
        try {
            if (now.text !== fresh)
                await this.#dependencies.files.replaceText(this.#path(), now.text);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return { outcome: 'unwritable', output: `${said}Codex: ${WHERE} could not be written, so nothing was changed.\n` };
        }
        return { outcome: 'written', output: `${said}${done}\n` };
    }
    #path() {
        return join(this.#dependencies.home, USER_HOOKS.directory, USER_HOOKS.config);
    }
    /** The file's text, empty where there is none yet, `undefined` where there is one and it cannot be read. */
    async #read() {
        try {
            return await this.#dependencies.files.readText(this.#path());
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return error.failure === 'not-found' ? '' : undefined;
        }
    }
}
/** agentwhy's own table with no `enabled = false` in it. */
function enabledAgain(toml) {
    const held = cardServerIn(toml);
    if (held.kind !== 'own' || !held.disabled)
        return toml;
    const lines = toml.split('\n');
    const start = lines.findIndex((line) => /^\[mcp_servers\.agentwhy\]/.test(line));
    const at = lines.findIndex((line, index) => index > start && DISABLED.test(line));
    return lines.filter((_, index) => index !== at).join('\n');
}
function joined(result, part) {
    if (part.output === '')
        return result;
    const outcome = result.outcome === 'unchanged' && part.outcome === 'written' ? 'written' : result.outcome;
    return { outcome, output: `${result.output}${result.output.endsWith('\n') || result.output === '' ? '' : '\n'}\n${part.output}` };
}
function refused(why) {
    return { outcome: 'refused', output: `Codex: ${why}\n` };
}
