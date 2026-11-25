// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { PRE_TOOL_USE } from '../adapter/claude-code/contract/hooks.js';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.js';
import { parsePreToolUseInput, toolNamedIn } from '../adapter/claude-code/hooks/pre-tool-use-input.js';
import { everywhereRefuseOn, runsEverywhereRefuse } from '../adapter/claude-code/settings/hook-entries.js';
import { refuseProjectAbove, refuseRulesOf } from '../adapter/claude-code/settings/refuse-project.js';
import { pendingCommandPlace } from '../adapter/codex/hooks/pending-command.js';
import { parseCodexPreToolUseInput } from '../adapter/codex/hooks/pre-tool-use-input.js';
import { parseCopilotPreToolUseInput } from '../adapter/copilot/hooks/pre-tool-use-input.js';
import { placesNamedIn } from '../core/access/places-named.js';
import { onAnotherShare } from '../core/guarded-places.js';
import { protectedPathsInCommand } from '../core/access/protected-access.js';
import { linesItRuns } from '../core/access/lines-it-runs.js';
import { withProjects } from '../core/policy/another-project.js';
import { MOST_PLACES_OF_A_LINE, projectsHolding, rulesOfProjects } from '../report/rules-elsewhere.js';
import { FileAccessError } from '../ports/file-access-error.js';
import { textOrUndefined } from '../ports/file-reader.js';
import { parseJsonObject } from '../shared/json.js';
import { choosePolicy } from '../report/choose-policy.js';
import { computerWide, readComputerPolicy } from '../report/computer-policy.js';
import { blockingOnly, heldGlobs } from '../core/policy/policy.js';
import { protectedFileFound, protectedFileReached } from './command-reach.js';
/** A command line is a few kilobytes; past this the input is not held at all, and the command is not checked. */
const MAX_INPUT_BYTES = 1024 * 1024;
/** RW15: how much of a rollout's end holds the cell running the command - its newest line but one, a cell of code. */
const ROLLOUT_TAIL_BYTES = 512 * 1024;
/**
 * `agentwhy refuse`: the project's own rules, applied to a shell command line before it runs
 * (`specs/2026-09-16-worth-running-every-day.md` R18-R21a). It adds no rule of its own - the policy is chosen as `report`
 * chooses it - and it reads the line with the code a report uses. A command that names a protected path is refused;
 * so is one that would open a protected file without naming it, through a glob or a recursive search. The usage says
 * what still walks past it.
 */
export class CommandRefusal {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async decide(options) {
        const { codex = false, everywhere = false, copilot = false, plugin = false, ...choice } = options;
        const text = await this.#dependencies.input.readAll(MAX_INPUT_BYTES);
        // AP5, after the input is read: a hook that exits before reading it leaves Claude Code writing into a closed pipe.
        if (everywhere && plugin && (await this.#personChecksEverywhere(text === undefined ? undefined : toolNamedIn(text))))
            return { kind: 'allow' };
        const parsed = text === undefined ? undefined : copilot ? parseCopilotPreToolUseInput(text) : codex ? parseCodexPreToolUseInput(text) : parsePreToolUseInput(text);
        if (parsed === undefined || 'unusable' in parsed)
            return { kind: 'not-checked', reason: 'input' };
        if ('anotherTool' in parsed)
            return { kind: 'allow' };
        const told = parsed.cwd ?? this.#dependencies.workingDirectory;
        // RW15: Codex runs a command in the folder its call names, which the hook is not told - read from the cell that runs it.
        const transcript = codex && 'transcriptPath' in parsed && typeof parsed.transcriptPath === 'string' ? parsed.transcriptPath : undefined;
        // PW11: the cell holds the line as Codex wrote it - on Windows PowerShell's, not the reading judged here (PW8).
        const written = 'written' in parsed && typeof parsed.written === 'string' ? parsed.written : parsed.command;
        const where = transcript === undefined ? undefined : await this.#whereItRuns(transcript, written, told);
        // RW2: one walk's answers serve every walk of this line - from where it runs, and from each place its words name.
        const seen = new Map();
        let unchecked;
        // ET15-ET17: the line, then each line it runs or reads - a shell's `-c`, a substitution of literal words, a file sent by
        // `@` - judged as if written directly. A line holding none of them is judged alone, as before.
        const lines = [parsed.command, ...linesItRuns(parsed.command)];
        for (const workingDirectory of where?.folders ?? [told]) {
            for (const line of lines) {
                const decision = await this.#decideIn(line, workingDirectory, choice, codex || everywhere || copilot, seen);
                if (decision.kind === 'refuse')
                    return decision;
                if (decision.kind === 'not-checked')
                    unchecked ??= decision.reason;
            }
        }
        // RW15: a call naming a folder that is not written text runs where nobody here knows - said, never guessed (R20).
        if (unchecked === undefined && where?.unread === true)
            unchecked = 'place';
        return unchecked === undefined ? { kind: 'allow' } : { kind: 'not-checked', reason: unchecked };
    }
    async decideLine(command, workingDirectory, options) {
        const { codex = false, everywhere = false, copilot = false, plugin: _plugin, ...choice } = options;
        const seen = new Map();
        let unchecked;
        // ET15-ET17, as `decide` judges them.
        for (const line of [command, ...linesItRuns(command)]) {
            const decision = await this.#decideIn(line, workingDirectory, choice, codex || everywhere || copilot, seen);
            if (decision.kind === 'refuse')
                return decision;
            if (decision.kind === 'not-checked')
                unchecked ??= decision.reason;
        }
        return unchecked === undefined ? { kind: 'allow' } : { kind: 'not-checked', reason: unchecked };
    }
    /**
     * AP5: whether the person's own `~/.claude/settings.json` runs the computer's check on both tools the plugin's runs on,
     * the shell and Claude Code's `Read` (RX1). An older entry on the shell alone leaves the plugin's copy checking - two
     * checks that agree cost time, one missing costs a file. A file that cannot be read runs nothing anybody can know of.
     *
     * APO13: and on the tool this call names - Windows' `PowerShell`, which an entry written before PW5 does not cover.
     */
    async #personChecksEverywhere(tool) {
        const { files, home } = this.#dependencies;
        const settings = parseJsonObject((await textOrUndefined(files, join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared))) ?? '');
        // Each tool by an entry whose matcher covers it: an entry on `Read` alone leaves the shell to the plugin's copy.
        const tools = new Set([PRE_TOOL_USE.shellTool, PRE_TOOL_USE.readTool, ...(tool === undefined ? [] : [tool])]);
        return settings !== undefined && runsEverywhereRefuse(settings) && [...tools].every((each) => everywhereRefuseOn(settings, each));
    }
    /** The decision for the line run in one folder: its project's rules, the computer's, and those of the projects it names. */
    async #decideIn(command, workingDirectory, choice, foundProject, seen) {
        const place = { workingDirectory, home: this.#dependencies.home };
        const parsed = { command };
        const here = await refuseProjectAbove(this.#dependencies.files, workingDirectory, this.#dependencies.home, { seen });
        const settled = foundProject ? this.#inFoundProject(choice, here) : choice;
        const toApply = await this.#policy(settled, parsed.command, place, ownProject(settled, here), seen);
        // AO6, widened by `2026-10-05-protected-everywhere.md` G4: the computer-wide check runs in every Codex session;
        // where no project above runs `refuse` and no global policy was written either, there are no rules anybody chose
        // here, and the command runs with no message. A global policy, once one exists, is not "nothing chosen" - and
        // neither, since RW3, is a project the line's words reach into.
        if (toApply.policy !== undefined) {
            // F57: a file a person asked only to be told about is theirs to let the agent read. Only what is blocked is refused.
            const policy = blockingOnly(toApply.policy);
            // G16, RW5: which policy stopped the command is read off the entry that matched. Where a project and the computer
            // name the same pattern, both entries are there and `protectionOf` answers with the computer's (G15) - which is
            // also the one a person has to change, since taking the project's out would not unblock the file.
            const whose = (pattern) => {
                const entries = policy.protected.filter((entry) => entry.pattern === pattern);
                return entries.some((entry) => entry.everywhere === true) ? 'computer' : entries.some((entry) => entry.project !== undefined) ? 'elsewhere' : 'project';
            };
            // FW4: a rule is named as it protects - `note.md`, never `**/note.md` for the one file it holds.
            const shown = (pattern) => shownRule(policy, pattern, place);
            // `2026-10-07-a-file-in-its-place.md` IP3: a path is read where the command runs as well as as written, so a rule
            // naming a place meets `cat sub/x`, `cd sub && cat x` and `cat ../app/x` (IPB7).
            const byWords = (searchWalked) => {
                const [first, ...others] = protectedPathsInCommand(parsed.command, policy, place, searchWalked);
                if (first === undefined)
                    return undefined;
                // FND9: met only by its name, in a folder the line does not let this follow - the refusal says which file is
                // protected, so the agent does not take it for the file it wanted.
                return { kind: 'refuse', path: first[0], pattern: shown(first[1]), others: others.length, route: { kind: first[2] === true ? 'byName' : 'named' }, whose: whose(first[1]) };
            };
            const named = byWords(true);
            if (named !== undefined)
                return named;
            // `2026-10-12-windows-paths.md` WPB13: FND9 as amended judges a reading `find` as the search it is, which only a walk
            // that finished can do. One that ran out - `find ~ -name .env | xargs cat` past `~/Library` - meets its `-name` by
            // name, as before the amendment: R20 lets a command it cannot check run, never one it could refuse by its words.
            const unwalked = () => byWords(false) ?? { kind: 'not-checked', reason: 'search' };
            // R20 holds for the walk too: whatever it meets on disk, a failure lets the command run and is said to the user,
            // never an exception from a hook that runs before every shell command.
            const reach = await protectedFileReached(parsed.command, policy, place, this.#dependencies.directories).catch(() => ({ kind: 'too-large' }));
            if (reach?.kind === 'too-large')
                return unwalked();
            if (reach !== undefined) {
                const route = reach.kind === 'glob' ? { kind: 'glob', word: reach.word } : { kind: 'search' };
                return { kind: 'refuse', path: reach.path, pattern: shown(reach.pattern), others: 0, route, whose: whose(reach.pattern) };
            }
            // `2026-10-11-a-folder-found-while-it-runs.md` FW1-FW3: a folder the line finds while it runs is any place under it.
            const found = await protectedFileFound(parsed.command, policy, place, this.#dependencies.directories).catch(() => ({ kind: 'too-large' }));
            if (found?.kind === 'too-large')
                return unwalked();
            if (found !== undefined) {
                return { kind: 'refuse', path: found.path, pattern: shown(found.pattern), others: 0, route: { kind: 'found', word: found.word }, whose: whose(found.pattern) };
            }
        }
        // Nothing the rules in hand refuse. A source that could not be read is said now, and never instead of a refusal:
        // found by the second review, where an unreadable file in the home directory answered for a project whose own
        // rules were readable and did refuse, so `cat .env` ran (R20 lets a command run; it does not let one through).
        return toApply.unchecked === undefined ? { kind: 'allow' } : { kind: 'not-checked', reason: toApply.unchecked };
    }
    /**
     * RW15: the folders the command runs in, as the rollout's newest code cell names them - each `workdir` written, read
     * against the session's folder, and that folder where a call names none. `undefined` where the rollout says nothing of
     * this command, and the folder the hook was told is read, as before. Read from the rollout's last part only: the cell
     * is the newest line but its own token count (RWB7), and a hook runs before every command.
     */
    async #whereItRuns(transcriptPath, command, told) {
        const tail = this.#dependencies.tail;
        if (tail === undefined)
            return undefined;
        let text;
        try {
            text = await tail.readTail(transcriptPath, ROLLOUT_TAIL_BYTES);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return undefined;
        }
        const found = pendingCommandPlace(text, command);
        if (found === undefined)
            return undefined;
        const folders = [...new Set([...found.workdirs.map((workdir) => resolve(told, workdir)), ...(found.inSessionFolder ? [told] : [])])];
        return { folders: folders.length === 0 ? [told] : folders, unread: found.unread };
    }
    /**
     * CK3, AO5, AO6: Codex runs its check in the session's folder, which can lie below the project, and names the
     * project nowhere (CKB6). The project is the nearest folder at or above `folder`, short of the home directory, whose
     * Claude Code settings run `refuse`. With no flag of its own, the check reads the rules that project's `refuse`
     * names, and with no project found it is `'no-project'`: the command runs, silently. A relative `--settings`, as an
     * older project-level entry wrote it, resolves against the same project; none found is `undefined`, and the command
     * runs said to be unchecked (R20). An absolute path or a policy file is read as given. The computer's own check in
     * Claude Code (RW11) finds its project the same way: it is no project's hook either.
     */
    #inFoundProject(choice, found) {
        const relative = choice.settingsPath;
        if (choice.policyPath !== undefined || (relative !== undefined && isAbsolute(relative)))
            return choice;
        if (relative !== undefined)
            return found === undefined ? undefined : { ...choice, settingsPath: join(found.project, relative) };
        return found === undefined ? 'no-project' : refuseRulesOf(found);
    }
    /**
     * `2026-10-05-protected-everywhere.md` G4: a global policy, written once in `~/.claude/settings.json` and outside
     * every project, is unioned into whatever a project chose, and stands alone where the computer-wide Codex hook
     * finds no project at all. Where nobody has written a global policy, this hands back exactly what `choosePolicy`
     * already decided - reading no such file is no behaviour change for anyone who has not set one up.
     *
     * Every branch answers with the rules it *does* have and, apart, the one it could not read: a source that failed
     * narrows what this run can say, and never what it enforces.
     */
    async #policy(settled, command, place, own, seen) {
        const { files, home } = this.#dependencies;
        const chosen = await this.#chosen(settled);
        // `2026-10-11-the-rules-where-the-file-is.md` RW3: the projects the line's words reach into, each with its own rules
        // held to its folder - the Codex app runs a conversation in a folder no project is above, and the project's file,
        // named by its whole path, was printed (RWB3).
        // `2026-10-12-windows-paths.md` WP8: never a network share the line does not run on - a word shaped like one cost seconds.
        const projects = await projectsHolding(files, home, placesNamedIn(command, place), own, {
            most: MOST_PLACES_OF_A_LINE, seen, leftAlone: (folder) => onAnotherShare(folder, place.workingDirectory),
        });
        if (projects.length === 0)
            return chosen;
        const elsewhere = await rulesOfProjects(files, home, projects);
        // RW6: a project whose rules cannot be read is said where nothing refused, as any other source is (R20).
        const unchecked = chosen.unchecked ?? (elsewhere.unreadable ? 'policy' : undefined);
        const policy = elsewhere.projects.length === 0 ? chosen.policy : withProjects(chosen.policy ?? NO_RULES, elsewhere.projects);
        return { ...(policy === undefined ? {} : { policy }), ...(unchecked === undefined ? {} : { unchecked }) };
    }
    async #chosen(settled) {
        const read = await readComputerPolicy(this.#dependencies.files, this.#dependencies.home);
        // A global file that is there and cannot be read is a policy nobody can apply, and is said so (R20) - but only
        // once the rules that *could* be read have had their say. It never stands in for them.
        const unreadable = read === 'unreadable' ? { unchecked: 'policy' } : undefined;
        const global = read === 'unreadable' ? undefined : read;
        const everywhere = global === undefined ? undefined : computerWide(global);
        // CK3 with R20: a relative `--settings` names rules only inside a project, and no project was found. That is a
        // rule nobody can read, said as such - and the computer-wide policy, which needs no project, still applies.
        // Found by the second review: this returned before the global policy was consulted at all, which left GB8's own
        // hole open in the one hook form that carries a relative path.
        if (settled === undefined)
            return { ...(everywhere === undefined ? {} : { policy: everywhere }), unchecked: 'project' };
        if (settled === 'no-project')
            return { ...(everywhere === undefined ? {} : { policy: everywhere }), ...unreadable };
        // `choosePolicy` adds the computer's rules to what it chose (G6), as this did itself until both read them alike.
        const chosen = await choosePolicy(settled, this.#dependencies.files, this.#dependencies.tell, this.#dependencies.home);
        // A policy the run was pointed at and cannot read stops that policy, not the other one.
        if ('errors' in chosen)
            return { ...(everywhere === undefined ? {} : { policy: everywhere }), unchecked: 'policy' };
        return { policy: chosen.policy, ...unreadable };
    }
}
/** RW3: nothing chosen where the line runs - the base another project's rules are added to, where a word reaches one. */
const NO_RULES = { level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' } };
/**
 * RW3: the project whose rules the line's policy already is, so it is not read twice - the project of the settings file a
 * flag names (`<project>/.claude/<file>`), else the one found above where the line runs.
 */
function ownProject(settled, here) {
    const settings = typeof settled === 'object' ? settled.settingsPath : undefined;
    if (settings !== undefined && isAbsolute(settings) && basename(dirname(settings)) === SETTINGS_FILES.directory)
        return dirname(dirname(settings));
    return here?.project;
}
/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW4: a rule as a person finds it - one written for one place (`at`) by the
 * file or folder it holds, from where the line runs, home-relative outside it; `**\/note.md` read as every `note.md`, and
 * the agent said so while `docs/note.md` was not protected. A pattern held everywhere is kept as written.
 */
function shownRule(policy, pattern, place) {
    // One entry a pattern: a rule written for every place and one for this folder alike are merged where the policy is read.
    const held = policy.protected.find((entry) => entry.pattern === pattern);
    // RW5: another project's rule is written whole, inside its folder - said from the home folder, as a place is.
    if (held?.project !== undefined)
        return place.home !== undefined && pattern.startsWith(`${place.home}/`) ? `~/${pattern.slice(place.home.length + 1)}` : pattern;
    if (held?.at === undefined)
        return pattern;
    const [fromFolder, whole] = heldGlobs(pattern, held.at);
    const inside = relative(place.workingDirectory, whole);
    if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside))
        return inside;
    const home = place.home;
    return home !== undefined && whole.startsWith(`${home}/`) ? `~/${whole.slice(home.length + 1)}` : whole === '' ? fromFolder : whole;
}
