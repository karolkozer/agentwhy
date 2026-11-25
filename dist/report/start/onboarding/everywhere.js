// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.js';
import { computerForm, readDenyRules } from '../../../adapter/claude-code/policy/deny-rules.js';
import { denyEntriesFor, denyEntriesIn } from '../../../adapter/claude-code/settings/deny-entries.js';
import { entryMissingIn, openFromChatIn } from '../../../open-from-chat/where-it-works.js';
import { codexCheckState } from '../../../adapter/codex/settings/codex-check.js';
import { FileAccessError } from '../../../ports/file-access-error.js';
import { defaultsOnThisComputer } from '../../../setup/global-defaults.js';
import { isAbsolutePattern } from '../../../setup/global-setup.js';
import { patternsOf } from '../../../setup/protected-patterns.js';
import { parseJsonObject } from '../../../shared/json.js';
/**
 * The onboarding's computer-wide path (`.ai/specs/2026-10-05-protected-everywhere.md` G7-G10, GD11-GD14): what it
 * starts from, and what its confirmation writes - through `GlobalProtect`, the same route `agentwhy protect --yes`
 * takes, and the computer's told list, the one Track writes. The confirmation window is the consent, as a Settings
 * window is for a project's rules (R58).
 */
export class Everywhere {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async now() {
        const { files, home, platform, tellLists, codexOnThisComputer } = this.#dependencies;
        const [rows, blocked, lists, codex, alerts, plugin, missing] = await Promise.all([
            defaultsOnThisComputer(files, home, platform),
            this.#blocked(),
            tellLists.read(),
            codexOnThisComputer(),
            this.#dependencies.alerts?.on(),
            this.#plugin(),
            this.#whereItWorks().then((where) => entryMissingIn(where, undefined)),
        ]);
        return {
            rows, blocked, told: lists.computer, codex,
            ...(alerts === undefined ? {} : { alerts }),
            ...(alerts === true && missing.claudeCode ? { alertsLackPhrase: true } : {}),
            ...(plugin === 'none' ? {} : { plugin }),
        };
    }
    /** `plugin`: this run is the plugin's own, whose hook answers the phrase (RO7, as `openFromChatIn` reads it). */
    async protect(choices, plugin = false) {
        const answer = await this.#protect(choices);
        if (answer.outcome !== 'finished' || choices.finish !== true)
            return answer;
        return { ...answer, openFromChat: await openFromChatIn({ ...(await this.#whereItWorks()), plugin }, undefined) };
    }
    async #whereItWorks() {
        const { files, home, invoke } = this.#dependencies;
        return { files, home, invoke: (await invoke?.()) ?? '', plugin: false };
    }
    async #protect(choices) {
        if (choices.uninstall === true)
            return this.#uninstall();
        if (choices.alerts !== undefined && this.#dependencies.alerts === undefined)
            return { outcome: 'refused', message: 'This run cannot turn alerts on or off for every project.' };
        // GD23: the computer's alerts alone - from Settings, or the onboarding's step with no file new - or after its files.
        const lists = [choices.block, choices.tell, choices.unblock ?? [], choices.untell ?? []].some((list) => list.length > 0);
        if (!lists && choices.alerts !== undefined)
            return { outcome: 'finished', results: [await this.#alerts(choices.alerts)] };
        if (!lists && choices.finish === true)
            return { outcome: 'finished', results: [] };
        // Refused whole, before anything is written: a request half written would protect what nobody chose.
        const refused = refusal(choices, await this.#blocked());
        if (refused !== undefined)
            return { outcome: 'refused', message: refused };
        const results = [];
        const unblock = choices.unblock ?? [];
        const untell = choices.untell ?? [];
        // Whichever way a switch goes, the block side is changed first, and the file is never left in neither list. To
        // Track, the block comes out first, and a block that will not come out stops the switch with the file still
        // blocked. To Block, the block goes in first, and the Track comes off only once it is in - found by the review of
        // 2026-10-06: the Track came off first, so a block that could not be written left the file on neither list. On
        // both lists for a moment it is blocked, which G15 answers first.
        if (unblock.length > 0) {
            const answer = await this.#dependencies.protect.run({ protect: [], unprotect: [...unblock], remove: true, yes: true });
            const written = answer.outcome === 'written' || answer.outcome === 'unchanged';
            results.push({ change: 'unblock', written });
            if (!written)
                return { outcome: 'finished', results };
        }
        if (choices.block.length > 0) {
            const answer = await this.#dependencies.protect.run({ protect: [...choices.block], remove: false, yes: true });
            results.push({ change: 'block', written: answer.outcome === 'written' || answer.outcome === 'unchanged' });
        }
        if (choices.tell.length > 0) {
            // Written as a block is (IP1) - a place as its place, a name anchored - so Track names the same files Block would have.
            const written = await this.#dependencies.tellLists.change('computer', choices.tell.map(computerForm), []);
            results.push({ change: 'tell', written });
        }
        if (untell.length > 0 && results.every((result) => result.written)) {
            results.push({ change: 'untell', written: await this.#dependencies.tellLists.change('computer', [], untell) });
        }
        if (choices.alerts !== undefined)
            results.push(await this.#alerts(choices.alerts));
        const codex = choices.block.length > 0 && (await this.#dependencies.codexOnThisComputer())
            ? ((await codexCheckState(this.#dependencies.files, this.#dependencies.home)) === 'on' ? 'on' : 'off')
            : undefined;
        return { outcome: 'finished', results, ...(codex === undefined ? {} : { codex }) };
    }
    #plugin() {
        return this.#dependencies.plugin?.() ?? Promise.resolve('none');
    }
    /**
     * GD23: the computer's alerts turned on or off, said as one part of the answer. AP10: where the plugin alerts in every
     * project, no entry of the person's own is written beside it - the page offers none, and a request that asks all the
     * same is answered as one with nothing to change. Turning them off stays: it takes out an entry the person has.
     */
    async #alerts(on) {
        if (on && (await this.#plugin()) === 'on')
            return { change: 'alerts', written: true };
        const answer = await this.#dependencies.alerts.set(on);
        return { change: 'alerts', written: answer.outcome === 'written' || answer.outcome === 'unchanged' };
    }
    /**
     * Whether anything of the computer setup is there - agentwhy's own rules, the told list, the alerts: a computer set up
     * before its setup was recorded, which a run records silently, as N6 records a project (GD26).
     */
    async setUp() {
        const [pairs, lists, alerts] = await Promise.all([this.#ownPairs(), this.#dependencies.tellLists.read(), this.#dependencies.alerts?.on()]);
        return (pairs !== 'unreadable' && pairs.length > 0) || (lists.computer !== 'unreadable' && lists.computer.length > 0) || alerts === true;
    }
    /**
     * GD24: what the computer setup wrote, taken out - agentwhy's Read and Edit pairs from the person's own Claude Code
     * settings, the computer's told list, the computer's alerts and its check of shell commands (RW14) - each tried, each said. A rule written by hand stays,
     * and so does every project's own setup and Codex's check, which the projects that use Codex share.
     */
    async #uninstall() {
        const pairs = await this.#ownPairs();
        if (pairs === 'unreadable')
            return { outcome: 'refused', message: 'Your Claude Code settings could not be read, so nothing was taken out.' };
        const results = [];
        if (pairs.length > 0) {
            const answer = await this.#dependencies.protect.run({ protect: [], unprotect: pairs, remove: true, yes: true });
            results.push({ change: 'unblock', written: answer.outcome === 'written' || answer.outcome === 'unchanged' });
        }
        const told = (await this.#dependencies.tellLists.read()).computer;
        if (told === 'unreadable')
            results.push({ change: 'untell', written: false });
        else if (told.length > 0)
            results.push({ change: 'untell', written: await this.#dependencies.tellLists.change('computer', [], told) });
        const alerts = this.#dependencies.alerts;
        if (alerts !== undefined && (await alerts.on()) !== false) {
            const answer = await alerts.set(false);
            results.push({ change: 'alerts', written: answer.outcome === 'written' || answer.outcome === 'unchanged' });
        }
        // RW14: and the computer's check of shell commands, which this setup wrote - every project's own check stays.
        const check = this.#dependencies.check;
        if (check !== undefined && (await check.on()) !== false) {
            const answer = await check.set(false);
            results.push({ change: 'check', written: answer.outcome === 'written' || answer.outcome === 'unchanged' });
        }
        return { outcome: 'finished', results };
    }
    /** The patterns whose Read and Edit pair this file holds, as the computer setup writes them (GD3); a rule alone is not one. */
    async #ownPairs() {
        let text;
        try {
            text = await this.#dependencies.files.readText(join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return error.failure === 'not-found' ? [] : 'unreadable';
        }
        const settings = parseJsonObject(text);
        if (settings === undefined)
            return 'unreadable';
        const held = new Set(denyEntriesIn(settings));
        // IP1: read as written, so a pair written for a place (`Read(~/.ssh/**)`) is known as agentwhy's as an anchored one is.
        const patterns = readDenyRules(text, 'as-written')?.patterns ?? [];
        return [...new Set(patterns)].filter((pattern) => denyEntriesFor(pattern).every((entry) => held.has(entry)));
    }
    /** The patterns the person's own Claude Code settings block, as `refuse` reads them; `unreadable` where it cannot. */
    async #blocked() {
        let text;
        try {
            text = await this.#dependencies.files.readText(join(this.#dependencies.home, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return error.failure === 'not-found' ? [] : 'unreadable';
        }
        if (parseJsonObject(text) === undefined)
            return 'unreadable';
        // IP5: a place as the place it names, so the page shows `~/.ssh/**` where that is what is written.
        return readDenyRules(text, 'as-written')?.patterns ?? [];
    }
}
/**
 * Why a request cannot be written, or `undefined`. A pattern R46 refuses, a path in a form not measured (IPB13), one name on
 * both lists, a Track for what the computer already blocks - which G15 would answer as blocked anyway - or a file the
 * page could not read: each is a page out of date or a request it did not send.
 */
function refusal(choices, blocked) {
    const unblock = choices.unblock ?? [];
    const untell = choices.untell ?? [];
    const all = [...choices.block, ...choices.tell, ...unblock, ...untell];
    if (all.length === 0)
        return 'Nothing was chosen.';
    const named = patternsOf(all).refused[0];
    if (named !== undefined)
        return `"${named.pattern}" was not written: ${named.reason}.`;
    // Only what is written: a rule written by hand as an absolute path can still be taken out, by the path it holds.
    const absolute = [...choices.block, ...choices.tell].find(isAbsolutePattern);
    if (absolute !== undefined)
        return `"${absolute}" is a Windows path or names a variable, which is not written for the whole computer yet.`;
    const both = choices.block.find((pattern) => choices.tell.includes(pattern));
    if (both !== undefined)
        return `"${both}" was asked to be blocked and tracked at once.`;
    const back = choices.block.find((pattern) => unblock.includes(pattern)) ?? choices.tell.find((pattern) => untell.includes(pattern));
    if (back !== undefined)
        return `"${back}" was asked to be written and taken out at once.`;
    if (blocked === 'unreadable')
        return 'Your Claude Code settings could not be read, so nothing was written.';
    // A Track for what the computer blocks is G15's to answer as blocked - unless the same request takes the block out.
    const already = choices.tell.find((pattern) => blocked.includes(computerForm(pattern)) && !unblock.map(computerForm).includes(computerForm(pattern)));
    if (already !== undefined)
        return `"${already}" is blocked on this computer already.`;
    return undefined;
}
