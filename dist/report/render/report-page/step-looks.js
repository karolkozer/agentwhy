// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { toolKey } from '../../report-model.js';
import { HOW_RANK } from '../../runs.js';
import { escapeHtml as e } from '../html-report-components.js';
export const TAG_KEY = {
    coral: 'sb.tag.read', sand: 'look.allowed', amber: 'sb.tag.unknown', blue: 'look.name', mint: 'look.stopped', grey: 'look.none',
};
/** SB12: the Files tab's ladder (`HOW_RANK`), with a tracked read under a read. */
function rankOf(file) {
    return HOW_RANK[file.how] - ((file.how === 'read' || file.how === 'changed') && file.tracked === true ? 1 : 0);
}
/** The colour of what one step did to one private file (SB12). */
export function fileTone(file) {
    if (file.how === 'read' || file.how === 'changed')
        return file.tracked === true ? 'sand' : 'coral';
    if (file.how === 'unknown')
        return 'amber';
    if (file.how === 'opened' || file.how === 'named')
        return 'blue';
    return 'mint';
}
/** The private file a step did the most to, by the Files ladder. */
export function strongestFile(step) {
    return step.files.filter((file) => file.private === true).reduce((best, file) => best === undefined || rankOf(file) > rankOf(best) ? file : best, undefined);
}
export function toneOf(step) {
    // WK7: a key the AI wrote the placeholder over is drawn as a key that reached it is, a write agentwhy stopped as a stop.
    if (step.keyWrite !== undefined)
        return step.keyWrite.kind === 'written' ? 'coral' : 'mint';
    const file = strongestFile(step);
    return file === undefined ? 'grey' : fileTone(file);
}
export const TONE_RANK = { coral: 6, sand: 5, amber: 4, blue: 3, mint: 2, grey: 0 };
export const strongest = (tones) => tones.reduce((best, tone) => TONE_RANK[tone] > TONE_RANK[best] ? tone : best, 'grey');
/**
 * SG2 (`specs/2026-11-23-the-story-at-a-glance.md`): which steps fold into one row - steps of one AI that follow one
 * another with the same look and the same verb. Steps with nothing private fold whatever they did, except that a tool
 * the adapter does not know folds with itself alone, so its badge and its window stay in sight. What was stopped, what
 * the record does not say the end of, a hand-over, several private files and a file whose outcome is not known never
 * fold: a row that says *nothing private* must hold none of them.
 */
export function foldKey(step) {
    // WK7: a key written over, or a write stopped over one, is said on its own row, whatever file it names.
    if (step.gave !== undefined || step.keyWrite !== undefined)
        return undefined;
    const file = strongestFile(step);
    if (file === undefined) {
        if (step.outcome !== 'succeeded')
            return undefined;
        return step.toolKnown ? 'grey' : 'tool:' + toolKey(step.did, step.mcp);
    }
    if (step.files.filter((each) => each.private === true).length !== 1)
        return undefined;
    const key = fileTone(file) + ':' + file.how;
    return FOLD_WORDS[key] === undefined ? undefined : key;
}
/**
 * SG2: what a folded row says, by its key - several files counted as files, one file named with how often, since a row
 * that counted steps as files said three files where there was one (the review of 2026-11-24). Stops and the steps of a
 * tool the adapter does not know are counted as steps: that is what they are.
 */
const FOLD_WORDS = {
    'coral:read': { files: 'sb.fold.read', same: 'sb.fold.sameRead' },
    'coral:changed': { files: 'sb.fold.changed', same: 'sb.fold.sameChanged' },
    'sand:read': { files: 'sb.fold.allowed', same: 'sb.fold.sameAllowed' },
    'mint:stopped': { files: 'sb.fold.stopped' },
    'blue:named': { files: 'sb.fold.named', same: 'sb.fold.sameNamed' },
    'blue:opened': { files: 'sb.fold.opened', same: 'sb.fold.sameOpened' },
};
/** What a folded row says: HTML, a file's or a tool's name in a code span, as a step's sentence has it. */
export function foldSentence(steps, key, t, names) {
    const first = steps[0];
    const n = steps.length;
    if (key.startsWith('tool:'))
        return t('sb.fold.tool', { n, tool: '<code>' + e(first.mcp === undefined ? first.did : first.mcp.tool) + '</code>' });
    const words = FOLD_WORDS[key];
    if (words === undefined)
        return t('sb.fold.plain', { n });
    const paths = [...new Set(steps.flatMap((step) => { const file = foldFileOf(step); return file === undefined ? [] : [file.path]; }))];
    if (words.same === undefined || paths.length !== 1)
        return t(words.files, { n: words.same === undefined ? n : paths.length });
    return t(words.same, { n, file: '<code>' + e(names(paths[0])) + '</code>' });
}
/** What a step is said to be in one label: its look's, or WK7's own where a key was written over - coral, and no read. */
export function labelOf(step) {
    return step.keyWrite?.kind === 'written' ? 'sb.tag.keyWritten' : TAG_KEY[toneOf(step)];
}
/** Whether a step changed a guard file (`2026-10-25-the-ai-changed-its-own-guard.md` OG1): never one that did nothing. */
export function guardStepsOf(report) {
    const changed = new Set((report.guardChanges ?? []).map((change) => change.agentIndex + ':' + change.step));
    return (agentIndex, step) => changed.has(agentIndex + ':' + step.sequence);
}
/** SG4, I8: your AI's first private *read* - a private file nobody lets pass, read and not merely written. */
export function readsPrivate(step) {
    return step.keyWrite === undefined && toneOf(step) === 'coral' && strongestFile(step)?.how === 'read';
}
/** The private file a step did the most to, or the first file it named: what a folded row's chip stands for. */
export function foldFileOf(step) {
    return strongestFile(step) ?? step.files[0];
}
/**
 * The strongest thing an AI did, its own steps and those of the helpers it gave work to (SB16), for the page and the chat
 * alike (SG13). A helper the record does not hold, and one met again, add nothing.
 */
export function agentTone(byAgent, index, seen) {
    const agent = byAgent.get(index);
    if (agent === undefined || seen.has(index))
        return 'grey';
    const inner = new Set([...seen, index]);
    return strongest(agent.runs.flatMap((run) => run.steps.map((step) => stepTone(byAgent, step, inner))));
}
/** A step's look where it stands among its AI's: its own, or for a hand-over the strongest of the helper's steps (SG13). */
export function stepTone(byAgent, step, seen) {
    return step.gave?.agentIndex === undefined ? toneOf(step) : agentTone(byAgent, step.gave.agentIndex, seen);
}
