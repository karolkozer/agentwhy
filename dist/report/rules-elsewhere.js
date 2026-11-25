// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import { refuseProjectAbove, refuseRulesOf } from '../adapter/claude-code/settings/refuse-project.js';
import { placesNamedIn } from '../core/access/places-named.js';
import { located } from '../core/access/shell-place.js';
import { sameFolder } from '../core/drive-path.js';
import { leftAlone } from '../core/guarded-places.js';
import { heldInProject } from '../core/policy/another-project.js';
import { choosePolicy } from './choose-policy.js';
import { tellListPaths } from './private-files/tell-lists.js';
/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW6: how many places one line is walked up from. A line names a handful;
 * one that names more is walked from its first ones, and nothing is guessed about the rest.
 */
export const MOST_PLACES_OF_A_LINE = 64;
/** RW7: the same for a whole conversation, whose calls name many places but few folders - the walks share their answers. */
export const MOST_PLACES_OF_A_CONVERSATION = 4096;
/**
 * RW2: the set-up projects the places lie in - for each, the nearest folder at or above it, short of the home folder,
 * whose Claude Code settings run `refuse` (AO5) - other than `own`, the project whose rules are already the policy's.
 * A folder `leftAlone` names (V10b, RW10) is walked past unread, and so is one `mayHold` says cannot hold `.claude/` (WF1).
 */
export async function projectsHolding(files, home, places, own, options) {
    const seen = options.seen ?? new Map();
    const found = new Map();
    const ownFolder = own === undefined ? undefined : trimmed(own);
    const walk = {
        seen,
        ...(options.leftAlone === undefined ? {} : { leftAlone: options.leftAlone }),
        ...(options.mayHold === undefined ? {} : { mayHold: options.mayHold }),
    };
    for (const place of places.slice(0, options.most)) {
        const project = await refuseProjectAbove(files, place, home, walk);
        // `2026-10-12-windows-paths.md` WP9: the same folder in another form at a drive - `C:/…` from Claude Code's
        // `$CLAUDE_PROJECT_DIR/.claude/…`, `C:\…` walked from the line - is the project's own, never a second project.
        if (project !== undefined && (ownFolder === undefined || !sameFolder(trimmed(project.project), ownFolder)))
            found.set(trimmed(project.project), project);
    }
    return [...found.values()];
}
/**
 * RW2, RW7, RW10: the projects a conversation's calls reached into - each command's words where it ran, each file a tool
 * was handed - other than `own`, the folder whose rules are already read, with their rules. A folder macOS guards, other
 * than the one `workingDirectory` lies in, is not looked into (V10b). The report's reading, and since
 * `2026-10-12-a-read-outside-the-project.md` RX4 `watch`'s: the line said "a file you let it read" of a file the report
 * called blocked, read by neither from the same rules (RXB2). `listing` is what the conversations of one listing share:
 * the walks they made, so a folder is walked once a listing and not once a conversation (DC6), and whether a folder can
 * hold `.claude/` at all, from listings kept as long (WF2).
 */
export async function rulesOfConversation(files, home, model, own, workingDirectory, listing = {}) {
    const root = model.projectRoot.kind === 'known' ? model.projectRoot.path : undefined;
    const places = new Set();
    for (const event of model.events) {
        const from = event.workingDirectory ?? root;
        const place = from === undefined ? undefined : { workingDirectory: from, home };
        const commands = new Set(event.commands);
        if (place !== undefined)
            for (const command of event.commands)
                for (const one of placesNamedIn(command, place))
                    places.add(one);
        for (const target of event.targets) {
            if (commands.has(target))
                continue;
            const whole = place === undefined ? target : located(target, place);
            if (isAbsolute(whole))
                places.add(whole);
        }
    }
    const projects = await projectsHolding(files, home, [...places], own, {
        most: MOST_PLACES_OF_A_CONVERSATION,
        leftAlone: (folder) => leftAlone(folder, workingDirectory, home),
        ...(listing.seen === undefined ? {} : { seen: listing.seen }),
        ...(listing.mayHold === undefined ? {} : { mayHold: listing.mayHold }),
    });
    return rulesOfProjects(files, home, projects);
}
/**
 * RW3: each project's rules as its own `refuse` reads them - the rules its command names (AO6), the built-in list where it
 * names none, and its two told lists - held to its folder. The computer's rules and its told list are every policy's
 * already, and left out: read here as well, a file only the computer tracks was said to be tracked by the project
 * (found on the maintainer's data, 2026-10-12, as "Track · LearningPython2").
 */
export async function rulesOfProjects(files, home, projects) {
    const held = [];
    const read = [];
    const shown = [];
    let unreadable = false;
    for (const project of projects) {
        const folder = trimmed(project.project);
        const chosen = await choosePolicy(refuseRulesOf(project), files, projectListsOnly(tellListPaths(home, folder)), home);
        if ('errors' in chosen) {
            unreadable = true;
            read.push({ folder, key: UNREADABLE });
            continue;
        }
        const rules = heldInProject(chosen.policy, folder);
        held.push(rules);
        read.push({ folder, key: keyOf(rules) });
        const denied = chosen.policy.origin.kind === 'settings';
        shown.push({
            folder,
            blocked: denied ? rules.protected.filter((entry) => entry.mode !== 'tell').map((entry) => entry.pattern) : [],
            told: rules.protected.filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern),
        });
    }
    return { projects: held, read, unreadable, shown };
}
/**
 * RW9: what each folder holds now, as `rulesOfProjects` keyed it - so a report kept since can be told apart from one that
 * would be drawn differently. A folder that no longer runs `refuse` holds nothing.
 */
export async function rulesNow(files, home, folders) {
    const read = [];
    for (const folder of folders) {
        const found = await refuseProjectAbove(files, folder, home);
        if (found === undefined || trimmed(found.project) !== trimmed(folder)) {
            read.push({ folder: trimmed(folder), key: NONE });
            continue;
        }
        const [one] = (await rulesOfProjects(files, home, [found])).read;
        read.push(one ?? { folder: trimmed(folder), key: NONE });
    }
    return read;
}
/**
 * A project's two told lists without the computer's: the computer's list is read again in its place as the project's own
 * local one, which adds nothing - `tellPatterns` keeps one of each.
 */
function projectListsOnly(paths) {
    return { pathsFor: (settingsPath) => { const lists = paths.pathsFor(settingsPath); return { ...lists, computer: lists.local }; } };
}
const UNREADABLE = 'unreadable';
const NONE = 'none';
function keyOf(rules) {
    return JSON.stringify([rules.protected.map((entry) => [entry.pattern, entry.mode ?? 'block']), rules.allowed]);
}
function trimmed(folder) {
    return folder.length > 1 ? folder.replace(/\/+$/, '') : folder;
}
