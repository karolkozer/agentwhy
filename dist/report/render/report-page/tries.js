// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { IDENTIFIER_NOT_SHOWN, OUTSIDE_THE_PROJECT } from '../../../core/project-root.js';
import { HOW_RANK, RUN_FILES_KEPT } from '../../runs.js';
/**
 * TA1 (`2026-11-17-tried-again-after-a-stop.md`): what makes a step a try at a file - it reached for the file itself. A
 * name a listing printed (`named`) is not: seeing a name is not reaching for the file.
 */
const TRIES = new Set(['read', 'changed', 'opened', 'unknown', 'stopped']);
const chainOfStop = (step) => (step.keyWrite?.kind === 'stopped' ? 'write' : 'read');
/** The chains a step's try at a file may belong to: a write first where it writes the file, else a read's alone. */
function chainsOf(step, file) {
    if (step.keyWrite?.kind === 'stopped')
        return ['write'];
    return step.keyWrite !== undefined || file.how === 'changed' ? ['write', 'read'] : ['read'];
}
/** WK7: a step that writes the file - a change, or a write agentwhy's check stopped - is a try in a write's chain. */
function writeTry(step, path) {
    const how = triedAs(step, path);
    if (how === 'changed')
        return how;
    return how === 'stopped' && step.keyWrite?.kind === 'stopped' ? how : undefined;
}
/**
 * SB12, SB14 as amended 2026-10-20: the files a stopped step was stopped for - the blocked ones a rule can have refused it
 * over, else every file it tried. A tracked file in the same call was not, and is drawn as a file the step only named.
 */
export function stoppedFor(step) {
    const stopped = step.files.filter((file) => file.how === 'stopped');
    const blocked = stopped.filter((file) => file.private === true && file.tracked !== true);
    return blocked.length > 0 ? blocked : stopped;
}
/**
 * TA1-TA6: the one line each step of one AI carries about a file it had been stopped over - its first stop says what came
 * after, a later try says how many stops came before. Within this AI's steps only (TA1): there is no order across AIs.
 */
export function triesAfterStops(agent) {
    const steps = agent.runs.flatMap((run) => run.steps);
    const key = (chain, path) => chain + '\u0000' + path;
    const firstStop = new Map();
    steps.forEach((step, place) => {
        const chain = chainOfStop(step);
        for (const file of stoppedFor(step))
            if (namesOneFile(file.path) && !firstStop.has(key(chain, file.path)))
                firstStop.set(key(chain, file.path), place);
    });
    const firstStopOf = (chain, path) => firstStop.get(key(chain, path)) ?? Number.POSITIVE_INFINITY;
    const notes = new Map();
    steps.forEach((step, place) => {
        // A stopped step speaks of the file its sentence names (SB14); another step of the first file that stopped it before.
        const lead = stoppedFor(step)[0];
        const stopChain = chainOfStop(step);
        if (lead !== undefined && firstStop.get(key(stopChain, lead.path)) === place) {
            const cut = agent.stepsLeftOut !== undefined;
            const after = stopChain === 'write' ? writesAfterNote(steps, place, lead, cut) : afterNote(steps, place, lead, cut);
            if (after !== undefined)
                notes.set(step, after);
            return;
        }
        const chainOf = (file) => chainsOf(step, file).find((chain) => firstStopOf(chain, file.path) < place);
        const file = lead ?? step.files.find((one) => TRIES.has(one.how) && chainOf(one) !== undefined);
        const chain = file === undefined ? undefined : chainOf(file);
        if (file === undefined || chain === undefined)
            return;
        const earlier = steps.slice(0, place);
        // TA5: a stop a step's cap may have hidden would make the count too small.
        if (earlier.some((one) => mayHide(one, file)))
            return;
        const stops = earlier.filter((one) => triedAs(one, file.path) === 'stopped' && chainOfStop(one) === chain).length;
        notes.set(step, { kind: 'before', path: file.path, stops, ...(chain === 'write' ? { write: true } : {}) });
    });
    return notes;
}
/** TA2, TA5: the tries at a file after its first stop, unless a cut - of the AI's steps or a step's files - could hide one. */
function afterNote(steps, place, file, cut) {
    if (cut)
        return undefined;
    const following = steps.slice(place + 1);
    if (following.some((step) => mayHide(step, file)))
        return undefined;
    const later = following.flatMap((step) => {
        const how = triedAs(step, file.path);
        return how === undefined ? [] : [{ step, how }];
    });
    if (later.length === 0)
        return undefined;
    const ended = later.reduce((best, one) => HOW_RANK[one.how] > HOW_RANK[best] ? one.how : best, 'stopped');
    const ways = new Set([steps[place], ...later.map((one) => one.step)].map((step) => step.did)).size;
    return { kind: 'after', path: file.path, more: later.length, ended, ways };
}
/**
 * WK7: the writes of a file after agentwhy's write check first stopped one - a read after it is no try at what was stopped -
 * unless a cut could hide one, as TA5 says of any try.
 */
function writesAfterNote(steps, place, file, cut) {
    if (cut)
        return undefined;
    const following = steps.slice(place + 1);
    if (following.some((step) => mayHide(step, file)))
        return undefined;
    const later = following.flatMap((step) => {
        const how = writeTry(step, file.path);
        return how === undefined ? [] : [{ step, how }];
    });
    if (later.length === 0)
        return undefined;
    const ended = later.some((one) => one.how === 'changed') ? 'changed' : 'stopped';
    const ways = new Set([steps[place], ...later.map((one) => one.step)].map((step) => step.did)).size;
    const overwritten = later.some((one) => one.step.keyWrite?.kind === 'written');
    return { kind: 'after', path: file.path, more: later.length, ended, ways, write: true, ...(overwritten ? { overwritten: true } : {}) };
}
/** How a step tried a file, where it did (TA1). */
function triedAs(step, path) {
    const how = step.files.find((file) => file.path === path)?.how;
    return how === undefined || !TRIES.has(how) ? undefined : how;
}
/**
 * Whether a step's cap (SB4: `RUN_FILES_KEPT`, private files kept first) may have cut this file from it: the step left
 * files out, does not list this one, and kept room for it - any file, or for a private one only a step that kept
 * nothing but private files.
 */
function mayHide(step, file) {
    if ((step.filesLeftOut ?? 0) === 0 || step.files.some((one) => one.path === file.path))
        return false;
    return file.private !== true || (step.files.length >= RUN_FILES_KEPT && step.files.every((one) => one.private === true));
}
/**
 * A path that stands for one file. Under `--share` every path outside the project is written as one phrase, and an
 * identifier in a path as another (`Redactor.path`), so two files can share a path there and their tries cannot be told
 * apart.
 */
function namesOneFile(path) {
    return path !== OUTSIDE_THE_PROJECT && !path.includes(IDENTIFIER_NOT_SHOWN);
}
