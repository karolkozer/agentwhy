// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
/**
 * Reads protected paths out of a Claude Code settings file's deny list.
 *
 * The limit is the point of test A7: a deny rule names **a tool and a route**, not a resource. `Read(./.env*)`
 * carries a path and can be read as one; `Bash(cat:*.env*)` is a command pattern and is not a path at all.
 * Pretending to understand the second would hand the reader a policy the tool never applied, so those entries
 * are counted as ignored and the report says how many.
 */
const FILE_RULE = /^(Read|Edit|Write|NotebookEdit)\(([^)]+)\)$/;
/** The path a deny rule names, when the rule is one about files at all. `Bash(cat:*)` names none (test A7). */
export function fileRulePathOf(entry) {
    return FILE_RULE.exec(entry.trim())?.[2];
}
const DENY_KEYS = { permissions: 'permissions', deny: 'deny' };
export function readDenyRules(text, places) {
    const settings = parseJsonObject(text);
    const permissions = settings?.[DENY_KEYS.permissions];
    const deny = isJsonObject(permissions) ? permissions[DENY_KEYS.deny] : undefined;
    if (!Array.isArray(deny))
        return undefined;
    const entries = deny.filter((entry) => typeof entry === 'string');
    const patterns = entries.flatMap((entry) => {
        const match = FILE_RULE.exec(entry);
        const path = match?.[2];
        if (path === undefined)
            return [];
        if (places === undefined)
            return [toPattern(path)];
        if (places === 'as-written')
            return [computerForm(path)];
        // FN15: a place inside the project is read as its path there, held to the project below.
        return [(places.project === undefined ? undefined : projectRead(path, places.project, places.home)) ?? placed(path, places.home)];
    });
    const at = places === undefined || places === 'as-written' || places.project === undefined ? {} : heldPlaces(entries.flatMap((entry) => FILE_RULE.exec(entry)?.[2] ?? []), places.project, places.home);
    return { patterns: [...new Set(patterns)], used: patterns.length, ignored: deny.length - patterns.length, ...(Object.keys(at).length === 0 ? {} : { at }) };
}
/** FN14: `./notes.md`, `./drafts/**` - one name at the project's root, no wildcard in it - and nothing else. */
const AT_ROOT = /^\.\/[^/*?[\]{}]+(?:\/\*\*)?$/;
/** FN14, FN15: whether a path is one name at the project's root (`./notes.md`, `./drafts/**`). */
export function atRoot(path) {
    return AT_ROOT.test(path);
}
/**
 * `2026-10-09-the-file-not-its-name.md` FN15, FNB30: a place inside the project, read as its path there - `~/shop/notes.md`
 * as `**` + `/notes.md`, the pattern every page finds a project file's rule by - for its caller to hold to the project.
 * Anything else, `undefined`: read as before.
 */
export function projectRead(path, project, home) {
    const inside = projectPathOfPlace(path, project, home);
    return inside === undefined ? undefined : toPattern(inside);
}
/**
 * FN15, FNB30: the read patterns of a project's deny rules that hold one path alone - a place inside the project, which
 * Claude Code applies to that file or folder wherever it is started - each with the project. A rule of one name
 * (`./notes.md`, `notes.md`) is every file of the name to Claude Code's Read and Edit (FNB30), so it is held nowhere,
 * and a pattern such a rule reads the same holds everywhere, as Claude Code applies the broader. Only on a POSIX home.
 */
export function heldPlaces(paths, project, home) {
    if (!home.startsWith('/') || !project.startsWith('/'))
        return {};
    const held = {};
    const everywhere = new Set();
    for (const path of paths) {
        const inside = projectRead(path, project, home);
        if (inside === undefined)
            everywhere.add(toPattern(path));
        else
            held[inside] = project.replace(/\/+$/, '');
    }
    for (const pattern of everywhere)
        delete held[pattern];
    return held;
}
/**
 * `2026-10-09-the-file-not-its-name.md` FN14 as amended by FN15: the read patterns of a project's **told** entries that
 * hold at its root alone, each with the project. A told list is agentwhy's own, read by nobody else, so `./notes.md` on it
 * is the root's `notes.md` and an exception for nothing else of its name (FNB26). A deny rule of that form is not: Claude
 * Code applies it to every file of the name (FNB30, `heldPlaces`). Only on a POSIX home and an absolute project (FNO1).
 */
export function heldAtRoot(paths, project, home) {
    if (!home.startsWith('/') || !project.startsWith('/'))
        return {};
    const everywhere = new Set(paths.filter((path) => !AT_ROOT.test(path)).map(toPattern));
    const held = {};
    for (const path of paths) {
        const pattern = toPattern(path);
        if (AT_ROOT.test(path) && !everywhere.has(pattern))
            held[pattern] = project.replace(/\/+$/, '');
    }
    return held;
}
/**
 * A deny rule is written relative to a project or a home directory, while a transcript records the path the
 * tool was given, often absolute. Anchoring at any depth keeps the two comparable. It **broadens** the match,
 * which errs toward reporting a call rather than passing over it - the safe direction here.
 */
export function toPattern(path) {
    const relative = path.replace(/^\.\//, '').replace(/^~\//, '');
    return relative.startsWith('**/') || relative.startsWith('/') ? relative : `**/${relative}`;
}
/**
 * A rule's path as the place it names, where it names one (IP1): `~/x` under the home, `//x` at the root. Anything else
 * is anchored as `toPattern` anchors it. A home that is not a POSIX path - Windows, unmeasured (IPB13) - keeps the old
 * reading, so nothing there is narrowed on a guess.
 */
export function placed(path, home) {
    if (!home.startsWith('/'))
        return toPattern(path);
    if (path.startsWith('~/'))
        return home.replace(/\/+$/, '') + '/' + path.slice(2);
    if (path.startsWith('//'))
        return path.slice(1);
    return toPattern(path);
}
/**
 * `2026-10-07-a-file-in-its-place.md` IP1: how a path is written for the whole computer. A place keeps its form - `~/x`
 * under the home, `//x` elsewhere, and `/x`, which Claude Code would read against the settings file's own folder (GB4),
 * is written `//x`. A name or a tail is anchored as `toPattern` anchors it: it holds only inside the folder the AI works
 * in (IPB3, IPB4), which the page says where it shows one.
 */
export function computerForm(path) {
    if (path.startsWith('~/') || path.startsWith('//'))
        return path;
    if (path.startsWith('/'))
        return '/' + path;
    return toPattern(path);
}
/** Whether a computer rule names a place - its form `~/…` or `//…` - rather than a name anywhere (IP1, IP5). */
export function namesAPlace(pattern) {
    return pattern.startsWith('~/') || pattern.startsWith('//');
}
/**
 * `2026-10-09-the-file-not-its-name.md` FN5, FND1: the place a project's file is, for the second rule that blocks it -
 * `~/…` under the home, `//…` elsewhere, as IP1 writes a place. Claude Code reads `./<path>` against the folder it was
 * started in, so from a sub-folder of the project the path alone holds nothing; the place holds from anywhere (FNB3,
 * FNB5, FNB19). Only a path written `./…` that stays inside the project has one, and only on a POSIX home: Windows is
 * unmeasured (FNO1, IPB13), so nothing there gains a rule on a guess.
 */
export function placeOfProjectPath(pattern, project, home) {
    if (!pattern.startsWith('./') || !home.startsWith('/') || !project.startsWith('/'))
        return undefined;
    const absolute = posix.join(project, pattern.slice(2));
    if (!within(posix.relative(project, absolute)))
        return undefined;
    const homeDirectory = home.replace(/\/+$/, '');
    return absolute.startsWith(`${homeDirectory}/`) ? `~/${absolute.slice(homeDirectory.length + 1)}` : `/${absolute}`;
}
/** FN5: the `./<path>` a place inside the project stands for - the other half of the pair - or `undefined`. */
export function projectPathOfPlace(pattern, project, home) {
    if (!home.startsWith('/') || !project.startsWith('/'))
        return undefined;
    const homeDirectory = home.replace(/\/+$/, '');
    const absolute = pattern.startsWith('~/') ? `${homeDirectory}/${pattern.slice(2)}` : pattern.startsWith('//') ? pattern.slice(1) : undefined;
    if (absolute === undefined)
        return undefined;
    const inside = posix.relative(project, absolute);
    return within(inside) ? `./${inside}` : undefined;
}
/**
 * Whether a path relative to the project stays inside it. A climb is `..` or a path through it; a name that only starts
 * with two dots - `..env.backup` - is a file of the project (found by the review of 2026-10-09: it was given no place).
 */
function within(relative) {
    return relative !== '' && relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative);
}
/**
 * FN5: whether a rule is the place half of a pair whose `./<path>` the same settings file holds. Such a place is that
 * file's one row, not a second one: a page lists the `./<path>`, and a change to it takes both (`ProjectSetup`).
 */
export function pairedPlace(rule, sameFile, project, home) {
    const path = projectPathOfPlace(rule, project, home);
    return path !== undefined && sameFile.has(path);
}
/**
 * `2026-10-09-the-file-not-its-name.md` FN1: a told entry read for matching, the way a deny rule is - a place where the
 * home is known, anchored otherwise. Read as written, `./lessons/a/exercise.py` matched only a command that typed that
 * very string, never the Read tool's absolute path (FNB9). Without a home a place stays as written, as IP1 kept it.
 */
export function toldPattern(entry, home) {
    if (home !== undefined)
        return placed(entry, home);
    return namesAPlace(entry) ? entry : toPattern(entry);
}
export function policyFromDenyRules(rules, path) {
    return {
        level: 'no-read',
        protected: rules.patterns.map((pattern) => {
            const at = rules.at?.[pattern];
            return at === undefined ? { pattern } : { pattern, at };
        }),
        allowed: [],
        origin: { kind: 'settings', path, used: rules.used, ignored: rules.ignored },
    };
}
