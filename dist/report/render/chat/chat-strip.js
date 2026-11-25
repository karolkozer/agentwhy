import { labelOf, stepTone, strongest, TAG_KEY, TONE_RANK } from '../report-page/step-looks.js';
/**
 * SG12 (`specs/2026-11-23-the-story-at-a-glance.md`): the character a step's look has in the chat, where there is no
 * colour to tell them apart. Where a terminal's characters are measured (WYB5), an `--ascii` set replaces them.
 */
export const STRIP_MARK = { coral: '■', sand: '□', amber: '?', blue: '○', mint: '×', grey: '·' };
/** How many marks a strip draws before a mark stands for several steps, in order, in the strongest look of them. */
const STRIP_MARKS = 40;
/** Your AI's own steps in their looks, in order, and what each look is called (SG1): a hand-over takes its helper's. */
export function mainSteps(report) {
    const runs = report.runs ?? [];
    const byAgent = new Map(runs.map((agent) => [agent.agentIndex, agent]));
    const main = report.graph.main.index;
    return (byAgent.get(main)?.runs.flatMap((run) => run.steps) ?? []).map((step) => {
        const tone = stepTone(byAgent, step, new Set([main]));
        return { tone, label: step.gave === undefined ? labelOf(step) : TAG_KEY[tone] };
    });
}
/**
 * The strip as two lines of Markdown - the marks in a code span, then what each stands for with its count - or none for a
 * conversation of one step, which has no shape. The page's map draws the same looks from the same functions (TK4).
 */
export function stepStrip(report, t) {
    const steps = mainSteps(report);
    const tones = steps.map((step) => step.tone);
    if (tones.length < 2)
        return [];
    const per = Math.ceil(tones.length / STRIP_MARKS);
    const marks = [];
    for (let at = 0; at < tones.length; at += per) {
        marks.push(STRIP_MARK[strongest(tones.slice(at, at + per))]);
    }
    const counts = new Map();
    for (const step of steps)
        counts.set(step.label, { tone: step.tone, n: (counts.get(step.label)?.n ?? 0) + 1 });
    // A step that named no private file is said as that and no more: *Nothing private* is a claim about the whole record,
    // and a record with a gap is not clean (TK2).
    const looks = [...counts].sort((a, b) => TONE_RANK[b[1].tone] - TONE_RANK[a[1].tone])
        .map(([label, { tone, n }]) => `${STRIP_MARK[tone]} ${n} ${t(tone === 'grey' ? 'ch.strip.grey' : label)}`);
    const leftOut = report.runs?.find((agent) => agent.agentIndex === report.graph.main.index)?.stepsLeftOut ?? 0;
    const said = leftOut === 0 ? t('ch.strip', { n: tones.length }) : t('ch.strip.cut', { n: tones.length, total: tones.length + leftOut });
    return ['`' + marks.join('') + '`', said + (per > 1 ? ` (${t('ch.strip.per', { n: per })})` : '') + ': ' + looks.join(', ')];
}
