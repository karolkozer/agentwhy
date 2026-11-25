// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from '../../../core/policy/glob.js';
import { heldGlobs, holds, namesInEitherCase } from '../../../core/policy/policy.js';
import { helperViews } from './helpers.js';
import { nameOf, privateKey, ruleKey } from './item-names.js';
import { keyOverwrites, toDoItems } from './to-do.js';
/** Each file's step, by its path, with each AI ranked as the Helpers tab orders them: Your AI, then helpers by number. */
function stepsOf(report, accessOf) {
    const helpers = [...report.graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index);
    const agents = new Map([report.graph.main, ...helpers].map((agent, rank) => [agent.index, { rank, ordinal: agent === report.graph.main ? undefined : agent.ordinal }]));
    // OW1 as amended 2026-10-05: a row stands at the first step that did to its file what the row says - the read after
    // the listing that named it - else at the first that reached it. The steps come in the page's order of AIs.
    const chosen = new Map();
    for (const step of report.fileSteps ?? []) {
        const access = accessOf.get(step.path);
        const fits = (one) => access !== undefined && one.how === HOW[access];
        const known = chosen.get(step.path);
        if (known === undefined || (!fits(known) && fits(step)))
            chosen.set(step.path, step);
    }
    // Each AI's moments, in its own order, numbered from 1: the action's own number stays in Advanced.
    const times = new Map();
    for (const step of chosen.values())
        times.set(step.agentIndex, [...new Set([...(times.get(step.agentIndex) ?? []), step.step])].sort((a, b) => a - b));
    return new Map([...chosen.values()].flatMap((step) => {
        const agent = agents.get(step.agentIndex);
        if (agent === undefined)
            return [];
        return [[step.path, {
                    rank: agent.rank, ...(agent.ordinal === undefined ? {} : { helper: agent.ordinal }),
                    number: (times.get(step.agentIndex) ?? []).indexOf(step.step) + 1, place: step.place,
                }]];
    }));
}
const REACH = { read: 'read', unknown: 'unknown', opened: 'opened', named: 'name', stopped: 'stopped' };
/** What an action did to a file, in the model's words, for each thing a row says. */
const HOW = { read: 'read', opened: 'opened', name: 'named', unknown: 'unknown', stopped: 'stopped', changed: 'changed' };
// A stop outranks a name seen (changed 2026-10-05 by the maintainer): `rg --files` found it, `cat` of it was stopped -
// the rule held, which the person is to hear, and the name alone is the step before it.
// An open with nothing printed sits under what is not known and over a stop: the file was opened, which a stop means it
// was not, and what is inside it did not come back, which "not known" cannot say (2026-10-07).
const STRENGTH = ['read', 'unknown', 'opened', 'stopped', 'name', 'changed'];
export function fileRows(report, items, done, denied, everywhere, deniedAt, elsewhere) {
    const patternOf = new Map(report.findings.map((finding) => [finding.path, finding.pattern]));
    const reached = new Map();
    const note = (path, access) => {
        const known = reached.get(path);
        if (known === undefined || STRENGTH.indexOf(access) < STRENGTH.indexOf(known.access))
            reached.set(path, { path, access });
    };
    // A file on the to-do list had its contents reach an agent, whichever way the record says it did.
    for (const item of items)
        note(item.path, 'read');
    for (const view of helperViews(report))
        for (const file of view.files)
            note(file.path, REACH[file.reach]);
    const told = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
    // QE2: the rules that hold a path, found in the one pass that already says whether it is blocked.
    const rulesOf = (path) => {
        const forms = [path, path + '/'];
        // FN14: a rule for a file at the project's root holds that file alone, as `refuse` and the findings read it.
        return (denied ?? []).filter((pattern) => {
            const at = deniedAt?.[pattern];
            if (forms.some((form) => holds(at === undefined ? { pattern } : { pattern, at }, form)))
                return true;
            // LC3: shown from the project's root, `.ENV` is at no place a Mac's letters are read by; the rule that found it is. One
            // held in a folder is read there alone, as `holds` reads it.
            const globs = at === undefined ? [pattern] : heldGlobs(pattern, at);
            return patternOf.get(path) === pattern && namesInEitherCase({ pattern }) && forms.some((form) => globs.some((glob) => matchesGlob(form, glob, true)));
        });
    };
    const protectionOf = (path) => {
        if (denied === undefined)
            return told.has(path) ? 'told' : 'unknown';
        if (rulesOf(path).length > 0)
            return 'yes';
        return told.has(path) ? 'told' : 'no';
    };
    const privateRows = [...reached.values()].map(({ path, access }) => {
        const at = items.findIndex((item) => item.path === path);
        const rules = denied === undefined ? [] : rulesOf(path);
        const by = patternOf.get(path);
        const computer = everywhere !== undefined &&
            (rules.some((rule) => everywhere.blocked.includes(rule)) || (told.has(path) && by !== undefined && everywhere.told.includes(by)));
        // RW8: a rule of the project the file is in, read from outside it - the computer's, where both hold it, answers first.
        const project = computer ? undefined
            : elsewhere?.find((one) => rules.some((rule) => one.blocked.includes(rule)) || (told.has(path) && by !== undefined && one.told.includes(by)))?.name;
        return {
            path,
            private: true,
            access,
            protection: protectionOf(path),
            group: at < 0 ? 'none' : done.has(path) ? 'fixed' : 'fix',
            ...(at < 0 ? {} : { item: at }),
            kind: ruleKey(by) ?? privateKey(path, by),
            ...(rules.length === 0 ? {} : { rules }),
            ...(told.has(path) && by !== undefined ? { toldBy: by } : {}),
            ...(computer ? { everywhere: true } : {}),
            ...(project === undefined ? {} : { elsewhere: project }),
        };
    });
    const rank = (row) => (row.group === 'fix' ? 0 : row.group === 'fixed' ? 1 : 2);
    privateRows.sort((a, b) => rank(a) - rank(b) || (a.item ?? Infinity) - (b.item ?? Infinity) || STRENGTH.indexOf(a.access) - STRENGTH.indexOf(b.access));
    const everydayRows = report.everydayFiles.filter((file) => !reached.has(file.path)).map((file) => ({
        path: file.path,
        private: false,
        access: file.how === 'changed' ? 'changed' : file.how === 'stopped' ? 'stopped' : file.how === 'opened' ? 'opened' : file.how === 'named' ? 'name'
            : file.how === 'unknown' ? 'unknown' : 'read',
        protection: 'na',
        group: 'none',
        kind: kindOfName(nameOf(file.path)),
    }));
    // WK7: a file a write put the placeholder over a key in is a to-do of its own, so its row is to fix until the key is back.
    const overwrites = keyOverwrites(report).map(String);
    const withOverwrites = (row) => {
        const at = overwrites.indexOf(row.path);
        return at < 0 ? row : { ...row, overwrite: at, group: 'fix' };
    };
    // PG2: a row another row lies inside is a folder, and says so - "A file" was said of a lesson folder (2026-10-10).
    const listed = [...privateRows, ...everydayRows].map(withOverwrites);
    const rows = listed.map((row) => {
        const folder = row.path.endsWith('/') || listed.some((other) => other.path.startsWith(row.path + '/'));
        if (!folder)
            return row;
        const described = row.private && ruleKey(patternOf.get(row.path)) !== undefined;
        return { ...row, folder: true, kind: described ? row.kind : row.private ? 'rp.item.privateFolder' : 'fl.kind.folder' };
    });
    // A row's step is chosen by what the row says, so it is found once every row is.
    const steps = stepsOf(report, new Map(rows.map((row) => [row.path, row.access])));
    return rows.map((row) => {
        const step = steps.get(row.path);
        return step === undefined ? row : { ...row, step };
    });
}
/**
 * A file the AI only saw the name of, private or not: nothing shows it opened it, or that it exists, so it is never
 * counted as opened (P32a) - a row of the table all the same.
 */
export function onlyNamed(row) {
    return row.access === 'name';
}
/**
 * How many rows the Files tab lists - what a conversation's "See all {n} files" leads to (F14). Every row, a name only
 * seen among them (changed 2026-10-05: a session whose AI listed a folder had no link to the files it saw); the
 * sidebar's count and the tab's heading keep to the files opened (P32a). Marks and rules change a row's group and
 * protection, never whether it is a row, so none is needed to count them.
 */
export function listedFiles(report) {
    return fileRows(report, toDoItems(report), new Set(), undefined).length;
}
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|vue|svelte|css|scss|html|sql)$/i;
/** P33's fixed table: what an everyday file is, from its name alone. */
export function kindOfName(name) {
    if (/^(AGENTS|CLAUDE)\.md$/i.test(name))
        return 'fl.kind.aiNotes';
    if (/\.(md|txt)$/i.test(name))
        return 'fl.kind.notes';
    if (/\.(json|ya?ml|toml)$/i.test(name) || name.startsWith('.'))
        return 'fl.kind.settings';
    if (SOURCE.test(name))
        return 'fl.kind.code';
    return 'fl.kind.file';
}
