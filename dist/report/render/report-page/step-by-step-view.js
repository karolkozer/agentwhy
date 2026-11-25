import { toolKey } from '../../report-model.js';
import { escapeHtml as e } from '../html-report-components.js';
import { inLanguages, labelAttributes } from '../report-copy.js';
import { avatar } from '../ui/avatar.js';
import { pill } from '../ui/button.js';
import { opener } from '../ui/popup.js';
import { modelChips } from './model-chips.js';
import { MCP_ICON, mcpBadge, toolAbout } from './tool-window.js';
import { stoppedFor, triesAfterStops } from './tries.js';
import { agentTone, fileTone, foldFileOf, foldKey, foldSentence, guardStepsOf, labelOf, readsPrivate, stepTone, strongest, strongestFile, TAG_KEY, TONE_RANK, toneOf } from './step-looks.js';
import { LOOKS } from '../ui/status-look.js';
export { fileTone, strongest, TAG_KEY, toneOf } from './step-looks.js';
/** How many of a step's files show before "+N more". */
const CHIPS_SHOWN = 6;
/**
 * Who stopped a step, in the step's sentence (`who-stopped-it` WS3, WS9): only a rule's refusal is said as a rule's, and a
 * check whose owner the record does not name is said as a check. A step with no source on record says it was stopped.
 */
const STOPPED_BY = {
    rule: 'sb.stop.rule', person: 'sb.stop.person', check: 'sb.stop.check', reviewer: 'sb.stop.other',
};
/** WK7: the glyph of a key the AI wrote the placeholder over - the kit's warning mark, never the read's ◉. */
const KEY_WRITTEN_GLYPH = LOOKS.failed.glyph;
/**
 * SB12 as amended 2026-10-11 by the maintainer: what happened is a pill in its colour, with a dot, beside the step. `label`
 * says it in other words where the colour is a read's and the fact is not: a key written over (WK7).
 */
export function stepPill(tone, label = TAG_KEY[tone]) {
    return '<span class="stp-pill stp-pill-' + tone + '"><span class="stp-pill-dot" aria-hidden="true"></span>' + inLanguages((t) => t(label)) + '</span>';
}
/** The pill of one step: its tone's, or WK7's own where a key was written over. */
function pillOf(step, tone) {
    return stepPill(tone, step.keyWrite?.kind === 'written' ? 'sb.tag.keyWritten' : TAG_KEY[tone]);
}
const AVATAR_TONE = { coral: 'coral', sand: 'grey', amber: 'grey', blue: 'grey', mint: 'mint', grey: 'grey' };
/** A step's glyph in its circle: the look of what it did, or what kind of plain step it was. */
function glyphOf(step, tone) {
    if (step.keyWrite?.kind === 'written')
        return KEY_WRITTEN_GLYPH;
    const file = strongestFile(step);
    const look = tone === 'coral' ? 'read' : tone === 'sand' ? 'allowed' : tone === 'mint' ? 'stopped'
        : tone === 'amber' ? 'unchecked' : tone === 'blue' ? (file?.how === 'opened' ? 'opened' : 'name') : undefined;
    if (look !== undefined)
        return LOOKS[look].glyph;
    // PN8: an MCP tool's step is marked by the plug, so it is seen as one before its sentence is read.
    if (step.mcp !== undefined)
        return MCP_ICON;
    return (step.programs ?? []).length > 0 ? '›_' : '✓';
}
function wrotePieces(wrote, main, who, names) {
    // Polish says your AI and a helper in different genders, so each sentence about one has two keys.
    const of = (key) => key + (main ? '.main' : '.helper');
    if (wrote.sentence !== undefined) {
        const label = of(wrote.kind === 'reasoning' ? 'sb.noted' : 'sb.said');
        return { label: inLanguages((t) => t(label, { who: who(t) })), quote: e(wrote.sentence) + (wrote.cut === true ? '…' : '') };
    }
    const [key, vars] = wrote.carried.length > 0 ? ['sb.words.carried', { files: wrote.carried.map((path) => '<code>' + e(names(path)) + '</code>').join(', ') }]
        : wrote.blank > 0 ? ['sb.words.blank', {}]
            : wrote.size > 0 ? [of('sb.words.size'), { n: wrote.size }]
                : [of('sb.words.none'), {}];
    return { fact: inLanguages((t) => t(key, { who: who(t), ...vars })) };
}
/**
 * SB13: what an AI wrote before a stretch of steps - its words, quoted and labelled as said or noted (R7a), or the fact in
 * their place (R3, R6, R9) - and how many steps they stand before (R2). Never called a reason (SBD2).
 */
export function wroteHtml(wrote, steps, main, who, names) {
    const pieces = wrotePieces(wrote, main, who, names);
    const covers = steps > 1 ? '<span class="stp-covers">' + inLanguages((t) => t('sb.words.covers', { n: steps })) + '</span>' : '';
    return pieces.quote === undefined
        ? '<div class="stp-words stp-words-fact"><span class="stp-fact">' + pieces.fact + '</span>' + covers + '</div>'
        : '<div class="stp-words"><span class="stp-label">' + pieces.label + '</span><q class="stp-q">' + pieces.quote + '</q>' + covers + '</div>';
}
/**
 * SB14: what a step did, in words, from facts - never the command line (main spec §7.3). A stopped step names first the
 * file a rule can have stopped it for - a blocked one, never a tracked file caught in the same call (SB14 as amended
 * 2026-10-20). With `focus`, a file's panel in By folder (SB26 as amended 2026-10-20): what the step did to that file,
 * named first.
 */
export function stepSentence(step, t, names, focus) {
    // SB14 as amended 2026-10-21: the tool by its name - an MCP server's with the server, as its adapter read them - and what
    // not knowing it means: "a tool we don't recognise" said nothing, and "we don't know" over an MCP tool too little.
    // PN8: where the tool is described, the step says what is still not known; where not, that the record does not say.
    if (!step.toolKnown) {
        const code = (text) => '<code>' + e(text) + '</code>';
        const described = step.described === true;
        return step.mcp === undefined
            ? t(described ? 'sb.do.describedTool' : 'sb.do.unknownTool', { tool: code(step.did) })
            : t(described ? 'sb.do.mcpTool' : 'sb.do.mcpTool.unsaid', { tool: code(step.mcp.tool), server: code(step.mcp.server) });
    }
    // WK7: a write and a key in its file is what the step did to that file - agentwhy's own stop, never a rule's, or the key gone.
    if (step.keyWrite !== undefined) {
        const file = '<code>' + e(names(step.keyWrite.path)) + '</code>';
        return step.keyWrite.kind === 'stopped' ? t('sb.do.keyWrite.stopped', { file }) : t('sb.do.keyWrite.written', { file, n: step.keyWrite.keys ?? 1 });
    }
    const files = step.files;
    const name = (file) => '<code>' + e(names(file.path)) + '</code>';
    const count = files.length + (step.filesLeftOut ?? 0);
    const focused = (file) => focus !== undefined && file.path === focus;
    const of = (how) => {
        const list = files.filter((file) => file.how === how);
        return [...list.filter(focused), ...list.filter((file) => !focused(file))];
    };
    const stopped = of('stopped');
    if (stopped.length > 0 || (files.length === 0 && step.outcome === 'blocked')) {
        const stoppedOver = stoppedFor(step);
        const lead = stopped.find((file) => stoppedOver.includes(file));
        const target = lead === undefined ? t('sb.do.stopped.call') : t('sb.do.stopped.file', { file: name(lead) });
        return target + ' ' + t(step.refusedBy === undefined ? 'sb.stop.other' : STOPPED_BY[step.refusedBy]);
    }
    const several = (key, list) => list.length === 1 ? t(key, { file: name(list[0]) }) : t(key + '.more', { file: name(list[0]), n: list.length - 1 });
    const how = files.find(focused)?.how;
    if (how === 'named')
        return t('sb.do.namedOne', { file: name(files.find(focused)) });
    const first = (kind) => (how === undefined || how === kind) && of(kind).length > 0;
    if (first('read'))
        return several('sb.do.read', of('read'));
    if (first('changed'))
        return several('sb.do.changed', of('changed'));
    if (first('unknown'))
        return t('sb.do.unknown', { file: name(of('unknown')[0]) });
    if (first('opened'))
        return t('sb.do.opened', { file: name(of('opened')[0]) });
    if (count > 0)
        return count === 1 ? t('sb.do.namedOne', { file: name(files[0]) }) : t('sb.do.named', { n: count });
    const ended = step.outcome === 'unknown' ? ' ' + t('sb.do.notEnded') : '';
    const programs = step.programs ?? [];
    return (programs.length > 0
        ? t('sb.do.command', { programs: programs.map((program) => '<code>' + e(program) + '</code>').join(', ') })
        : t('sb.do.tool', { did: '<code>' + e(step.did) + '</code>' })) + ended;
}
/**
 * TA2-TA4 (`2026-11-17-tried-again-after-a-stop.md`): the line under a step about a file the same AI was stopped over -
 * what came after its first stop, or how many stops came before a later try. Counts and outcomes, never intent.
 */
export function tryLine(note, t, names) {
    const file = '<code>' + e(names(note.path)) + '</code>';
    // WK7: a stop of a write is said with a write's verbs, and a later write said as a loss only where it was one.
    const write = note.write === true ? 'sb.again.write.' : 'sb.again.';
    if (note.kind === 'before')
        return t(write + 'before', { file, n: note.stops });
    const ended = note.ended === 'stopped' ? t('sb.again.stopped', { n: note.more })
        : note.write === true ? t(note.overwritten === true ? 'sb.again.write.overwritten' : 'sb.again.write.changed') : t('sb.again.' + note.ended);
    const ways = note.ways > 1 ? ' ' + t('sb.again.ways', { n: note.ways }) : '';
    return t(write + 'after', { file, n: note.more }) + ' ' + ended + ways;
}
/**
 * "Step by step" (`2026-10-11-step-by-step.md` SB10-SB23, redrawn 2026-10-11 by the maintainer): every step your AI took,
 * in its own order, each stretch a card headed by what it wrote before it, each step a row of that card, and each helper's
 * steps inside the row that gave it work. Never ordered across AIs.
 */
export function stepByStepPanel(report, context) {
    const runs = report.runs ?? [];
    const byAgent = new Map(runs.map((agent) => [agent.agentIndex, agent]));
    const ordinals = new Map(report.graph.agents.map((agent) => [agent.index, agent.ordinal]));
    // MR3: each AI's models, drawn on its row and, for your AI, in the head of its first card (SG7).
    const models = new Map([report.graph.main, ...report.graph.agents].map((agent) => [agent.index, agent.models ?? []]));
    const main = report.graph.main.index;
    const given = new Set(runs.flatMap((agent) => agent.runs.flatMap((run) => run.steps.flatMap((step) => step.gave?.agentIndex === undefined ? [] : [step.gave.agentIndex]))));
    const unplaced = runs.filter((agent) => agent.agentIndex !== main && !given.has(agent.agentIndex));
    const draw = new Drawing(byAgent, ordinals, models, main, context, guardStepsOf(report));
    const mainModels = models.get(main) ?? [];
    const mainRuns = byAgent.get(main);
    const body = mainRuns === undefined
        ? '<p class="stp-empty">' + inLanguages((t) => t('sb.empty')) + '</p>' + (mainModels.length === 0 ? '' : '<p class="stp-note-alone">' + modelTag(mainModels) + '</p>') + '<ol class="stp-flow">' + nowCard(context.toDo) + '</ol>'
        : '<ol class="stp-flow">' + draw.timeline(mainRuns, new Set([main])) + nowCard(context.toDo) + '</ol>';
    const others = unplaced.length === 0 ? '' :
        '<h3 class="stp-h">' + inLanguages((t) => t('sb.unplaced')) + '</h3><p class="stp-lead">' + inLanguages((t) => t('sb.unplaced.lead')) + '</p>' +
            '<div class="stp-rows stp-rows-alone">' + unplaced.map((agent) => draw.helperRow(agent.agentIndex, undefined, new Set([main]))).join('') + '</div>';
    return '<div class="stp" data-steps>' + stepMap(draw.cells, mainRuns?.stepsLeftOut ?? 0) +
        body + others +
        '<p class="stp-foot">' + inLanguages((t) => t('sb.foot')) + '</p></div>';
}
/**
 * SG1: every step of your AI as one square in its look, in its order, each a link to its row, and each look present with
 * its count - the shape of the conversation before its words. One step has no shape to show.
 */
function stepMap(cells, leftOut) {
    if (cells.length < 2)
        return '';
    const counts = new Map();
    for (const cell of cells)
        counts.set(cell.label, { tone: cell.tone, n: (counts.get(cell.label)?.n ?? 0) + 1 });
    const squares = cells.map((cell) => '<li><a class="stp-cell stp-cell-' + cell.tone + '" href="#' + cell.anchor + '"' +
        labelAttributes((t) => t('sb.map.cell', { n: cell.place + 1, look: t(cell.label) })) + '></a></li>').join('');
    const keys = [...counts].sort((a, b) => TONE_RANK[b[1].tone] - TONE_RANK[a[1].tone]).map(([label, { tone, n }]) => '<span class="stp-key"><span class="stp-cell stp-cell-' + tone + '" aria-hidden="true"></span><b>' + n + '</b> ' +
        inLanguages((t) => t(label)) + '</span>').join('');
    const total = cells.length + leftOut;
    return '<div class="stp-map"><ol class="stp-cells"' + labelAttributes((t) => leftOut === 0 ? t('sb.map.h', { n: cells.length }) : t('sb.map.cut', { n: cells.length, total })) + '>' + squares + '</ol><div class="stp-keys">' + keys + '</div>' +
        (leftOut === 0 ? '' : '<span class="stp-map-note">' + inLanguages((t) => t('sb.map.first', { n: cells.length, total })) + '</span>') + '</div>';
}
/** SG7: your AI's model, as it is said in the head of its first card - where no step of it is recorded, alone. */
function modelTag(models) {
    return '<span class="stp-note-model"><span class="stp-note-model-l">' + inLanguages((t) => t('hp.model')) + '</span>' + modelChips(models, 'stp-model') + '</span>';
}
/** One state of the card that ends your AI's story: what it says, and the way to the list. */
function nowState(state, left, hidden) {
    const glyph = state === 'todo' ? '!' : state === 'done' ? '✓' : '→';
    const risk = state === 'todo';
    const words = state === 'todo' ? inLanguages((t) => t('sb.now.left', { n: '<b data-now-left>' + left + '</b>' }))
        : inLanguages((t) => t(state === 'done' ? 'sb.now.done' : 'sb.now.none'));
    return '<li class="stp-run stp-now" data-private="1"' + (state === 'none' ? '' : ' data-now="' + state + '"') + (hidden ? ' hidden' : '') + '>' +
        '<span class="stp-pin stp-pin-' + (risk ? 'coral' : state === 'done' ? 'mint' : 'end') + '" aria-hidden="true"></span>' +
        '<div class="stp-box' + (risk ? ' stp-box-risk' : '') + '"><div class="stp-row"><span class="stp-ic' + (risk ? ' stp-ic-coral' : state === 'done' ? ' stp-ic-mint' : '') + '" aria-hidden="true">' + glyph + '</span>' +
        '<div class="stp-x"><div class="stp-when">' + inLanguages((t) => t('sb.now')) + '</div><div class="stp-did">' + words + '</div>' +
        (state === 'done' ? '' : '<div class="stp-act">' + pill({ label: inLanguages((t) => t('sb.now.go')), tone: risk ? 'primary' : 'outline', size: 'sm', href: '#todo' }) + '</div>') +
        '</div></div></div></li>';
}
/**
 * SG5: the card that ends your AI's story - how many things the to-do list still holds, and the one way to it. *Done* is said
 * only of a list that held something; over an empty one the card claims nothing, since an empty list is not a clean
 * record - the list itself says what it leaves (TK2, TK4). Both states of a list that holds something stand in the page,
 * for its ticks to switch (`fix-wizard-script`).
 */
function nowCard(toDo) {
    if (toDo === undefined)
        return '';
    if (toDo.total === 0)
        return nowState('none', 0, false);
    return nowState('todo', toDo.left, toDo.left === 0) + nowState('done', 0, toDo.left > 0);
}
/** One tab's drawing: the cards of each timeline, the helper rows nested in them, and the map of your AI's steps. */
class Drawing {
    #byAgent;
    #ordinals;
    #models;
    #main;
    #context;
    /** Which steps changed a guard file: said on their own rows, never folded among those that did nothing. */
    #guard;
    /** TA2, TA3: each step's line about a file its AI was stopped over, gathered per AI as its timeline is drawn. */
    #tries = new Map();
    /** SG1: your AI's own steps as the map draws them, in order. */
    #cells = [];
    /** SG4: your AI's first private read is marked once. */
    #firstMarked = false;
    /** SG7: your AI's model is said once, in the head of its first card. */
    #modelShown = false;
    constructor(byAgent, ordinals, models, main, context, guard) {
        this.#guard = guard;
        this.#byAgent = byAgent;
        this.#ordinals = ordinals;
        this.#models = models;
        this.#main = main;
        this.#context = context;
    }
    get cells() {
        return this.#cells;
    }
    /** The id a square leads to: your AI's rows alone, since a helper's row can be drawn twice (two hand-overs to it). */
    #id(agentIndex, anchor) {
        return agentIndex === this.#main ? ' id="' + anchor + '"' : '';
    }
    /** A square for a step of your AI alone; a helper's steps have no place in its order. */
    #cell(agentIndex, tone, label, anchor, place) {
        if (agentIndex === this.#main)
            this.#cells.push({ tone, label, anchor, place });
    }
    /** SG4: *here it first read a private file*, on your AI's first row in the read look - unless it is the story's first. */
    #first(agentIndex, steps, place) {
        if (this.#firstMarked || agentIndex !== this.#main || !steps.some(readsPrivate))
            return '';
        this.#firstMarked = true;
        return place === 0 ? '' : '<div class="stp-first">' + inLanguages((t) => t('sb.firstPrivate')) + '</div>';
    }
    /** Who an AI is, in the page's words: your AI, a helper by its number, or a helper the record numbers nowhere. */
    #who(index, t) {
        if (index === this.#main)
            return t('st.main');
        const ordinal = index === undefined ? undefined : this.#ordinals.get(index);
        return ordinal === undefined ? t('sb.someHelper') : t('st.helper', { ordinal });
    }
    #initials(index) {
        if (index === this.#main)
            return 'AI';
        const ordinal = index === undefined ? undefined : this.#ordinals.get(index);
        return ordinal === undefined ? 'H' : 'H' + ordinal;
    }
    /** The strongest thing an AI did, its own steps and those of the helpers it gave work to. */
    toneOfAgent(index, seen) {
        return agentTone(this.#byAgent, index, seen);
    }
    /** SB11: one AI's runs as one timeline of cards - First, then Then, and Last where your AI answered. */
    timeline(agent, seen) {
        for (const [step, note] of triesAfterStops(agent))
            this.#tries.set(step, note);
        let place = 0;
        const cards = agent.runs.map((run) => {
            const html = this.#card(agent, run, place, seen);
            place += run.steps.length;
            return html;
        });
        const left = agent.stepsLeftOut === undefined ? '' : this.#endCard('grey', '…', 'sb.then', inLanguages((t) => t('sb.leftOut', { n: agent.stepsLeftOut ?? 0 })));
        const last = agent.answered === true && agent.agentIndex === this.#main ? this.#endCard('end', '✓', 'sb.last', inLanguages((t) => t('sb.answered'))) : '';
        return cards.join('') + left + last;
    }
    /** A closing card of one line: how a timeline ends, or what it does not list. */
    #endCard(pin, glyph, when, words) {
        return '<li class="stp-run" data-private="0"><span class="stp-pin stp-pin-' + pin + '" aria-hidden="true"></span><div class="stp-box">' +
            '<div class="stp-row"><span class="stp-ic" aria-hidden="true">' + glyph + '</span><div class="stp-x"><div class="stp-when">' +
            inLanguages((t) => t(when)) + '</div><div class="stp-did">' + words + '</div></div></div></div></li>';
    }
    /** SB13: a stretch of steps is a card: what was written before it on top, once; its steps as rows under it. */
    #card(agent, run, from, seen) {
        const inner = new Set([...seen, agent.agentIndex]);
        const tones = run.steps.map((step) => stepTone(this.#byAgent, step, inner));
        const tone = strongest(tones);
        let place = from;
        const groups = groupHandOvers(run.steps);
        const parts = [];
        for (let at = 0; at < groups.length;) {
            const group = groups[at];
            if (Array.isArray(group)) {
                const anchor = 'stp-' + agent.agentIndex + '-' + place;
                parts.push(this.#handOver(agent, group, place, seen, anchor));
                for (const [offset, step] of group.entries()) {
                    const tone = stepTone(this.#byAgent, step, inner);
                    this.#cell(agent.agentIndex, tone, TAG_KEY[tone], anchor, place + offset);
                }
                place += group.length;
                at += 1;
                continue;
            }
            // SG2: steps one after another with one look and one verb are one row of the card; a single step stays its own row.
            const keyOf = (step) => (this.#guard(agent.agentIndex, step) ? undefined : foldKey(step));
            const key = keyOf(group);
            let end = at + 1;
            while (key !== undefined && end < groups.length && !Array.isArray(groups[end]) && keyOf(groups[end]) === key)
                end += 1;
            const folded = groups.slice(at, end);
            parts.push(folded.length > 1 ? this.#fold(agent.agentIndex, folded, place, key) : this.#step(group, place, agent.agentIndex));
            place += folded.length;
            at = end;
        }
        const rows = parts.join('');
        return '<li class="stp-run" data-private="' + (tone === 'grey' ? '0' : '1') + '"><span class="stp-pin stp-pin-' + tone + '" aria-hidden="true"></span>' +
            '<div class="stp-box' + (tone === 'coral' ? ' stp-box-risk' : '') + '">' + this.#note(agent.agentIndex, run.wrote, run.steps.length) + rows + '</div></li>';
    }
    /** The card's head: the AI's avatar, what it wrote - said or noted - and how many steps those words stand before. */
    #note(index, wrote, steps) {
        const pieces = wrotePieces(wrote, index === this.#main, (t) => this.#who(index, t), this.#context.names);
        const covers = steps > 1 ? '<span class="stp-covers">' + inLanguages((t) => t('sb.covers', { n: steps })) + '</span>' : '';
        const models = index === this.#main && !this.#modelShown ? this.#models.get(index) ?? [] : [];
        if (index === this.#main)
            this.#modelShown = true;
        return '<div class="stp-note">' + avatar(this.#initials(index), 'grey', 30) + '<div class="stp-note-t">' +
            (pieces.quote === undefined ? '<span class="stp-fact">' + pieces.fact + '</span>'
                : '<span class="stp-label">' + pieces.label + '</span><q class="stp-q">' + pieces.quote + '</q>') + '</div>' + (models.length === 0 ? '' : modelTag(models)) + covers + '</div>';
    }
    /** First or Then; inside an opened fold, the step's own number, so each row reads as one of the fold's steps. */
    #when(place, inFold = false) {
        return '<div class="stp-when">' + inLanguages((t) => inFold ? t('sb.fold.step', { n: place + 1 }) : t(place === 0 ? 'sb.first' : 'sb.then')) + '</div>';
    }
    /** SB12, SB14, SB15: one step - its glyph, what it did in words, its files, its window, and its pill. */
    /**
     * SG2, SG3: steps one after another with one look and one verb, as one row - its sentence once with the count, the file
     * of each step named, and every step behind it - so nothing is dropped. Opened, its steps are the card's own rows.
     */
    #fold(agentIndex, steps, place, key) {
        const tone = strongest(steps.map(toneOf));
        const anchor = 'stp-' + agentIndex + '-' + place;
        steps.forEach((step, offset) => this.#cell(agentIndex, toneOf(step), labelOf(step), anchor, place + offset));
        const marker = this.#first(agentIndex, steps, place);
        const files = [...new Map(steps.flatMap((step) => {
                const file = foldFileOf(step);
                return file === undefined ? [] : [[file.path, { file, step }]];
            })).values()];
        const shown = files.slice(0, CHIPS_SHOWN);
        const rest = files.length - shown.length;
        // In the folded row a file is a name alone: each opens its window from its own row, once the fold is open.
        const chips = files.length === 0 ? '' : '<div class="stp-chips">' + shown.map(({ file, step }) => this.#chip(file, stoppedFor(step), false)).join('') +
            (rest === 0 ? '' : '<span class="stp-not-kept">' + inLanguages((t) => t('sb.moreFiles', { n: rest })) + '</span>') + '</div>';
        // PN8 on a fold: an MCP tool's badge beside its First or Then, and what the tool is for, as one step has them.
        const lead = steps[0];
        // Only where every step is that one tool's: a fold of `coral:read` can mix an MCP tool with a Read.
        const oneTool = steps.every((step) => toolKey(step.did, step.mcp) === toolKey(lead.did, lead.mcp));
        const about = lead.toolKnown || !oneTool ? undefined : this.#context.toolWindowOf?.(lead.did, lead.mcp);
        const when = '<div class="stp-when">' + inLanguages((t) => t(place === 0 ? 'sb.first' : 'sb.then') + ' · ' + t('sb.fold.places', { from: place + 1, to: place + steps.length })) + '</div>';
        const body = steps.map((step, offset) => this.#step(step, place + offset, agentIndex, true)).join('');
        return '<details class="stp-foldset stp-foldset-' + tone + '" data-private="' + (tone === 'grey' ? '0' : '1') + '">' +
            '<summary class="stp-row stp-fold' + (tone === 'coral' ? ' stp-row-risk' : '') + '"' + this.#id(agentIndex, anchor) + '>' +
            '<span class="stp-ic stp-ic-' + tone + ' stp-ic-stack" aria-hidden="true">' + glyphOf(lead, tone) + '</span>' +
            '<div class="stp-x">' + marker + (lead.mcp === undefined || !oneTool ? when : '<div class="tw-when">' + when + mcpBadge('step', about) + '</div>') +
            '<div class="stp-did">' + inLanguages((t) => foldSentence(steps, key, t, this.#context.names)) + '</div>' + chips +
            (about === undefined ? '' : toolAbout(this.#context.toolNoteOf?.(lead.did, lead.mcp), about)) +
            '<span class="stp-more-files stp-each-show">' + inLanguages((t) => t('sb.fold.each', { n: steps.length })) + '</span>' +
            '<span class="stp-more-files stp-each-hide">' + inLanguages((t) => t('sb.fold.hide')) + '</span></div>' + stepPill(tone) + '</summary>' +
            '<div class="stp-fold-body stp-fold-body-' + tone + '">' + body + '</div></details>';
    }
    #step(step, place, agentIndex, inFold = false) {
        const tone = toneOf(step);
        const anchor = 'stp-' + agentIndex + '-' + place;
        if (!inFold)
            this.#cell(agentIndex, tone, labelOf(step), anchor, place);
        const marker = inFold ? '' : this.#first(agentIndex, [step], place);
        const files = step.files;
        const first = files[0];
        const seen = files.find((file) => file.seenAt !== undefined);
        const tried = this.#tries.get(step);
        // A stopped step opens the window of the file its sentence names: the one a rule stopped it for (SB14).
        const windowed = [...stoppedFor(step), ...files].find((file) => file.private === true && this.#context.windowOf(file.path) !== undefined);
        // PN8: a tool the adapter does not know opens the window that says what it is for.
        const about = step.toolKnown ? undefined : this.#context.toolWindowOf?.(step.did, step.mcp);
        const title = first !== undefined && first.private === true && (first.how === 'read' || first.how === 'changed')
            ? inLanguages((t, lang) => this.#context.titleOf(first.path, t, lang) ?? '') : '';
        return '<div class="stp-row' + (tone === 'coral' ? ' stp-row-risk' : '') + '"' + (inFold ? '' : this.#id(agentIndex, anchor)) + ' data-private="' + (tone === 'grey' ? '0' : '1') + '">' +
            '<span class="stp-ic stp-ic-' + tone + '" aria-hidden="true">' + glyphOf(step, tone) + '</span>' +
            // PN8: an MCP step's badge stands beside its First or Then (the maintainer: "obok np. FIRST i mieć jakiś kolor").
            '<div class="stp-x">' + marker + (step.mcp === undefined ? this.#when(place, inFold) : '<div class="tw-when">' + this.#when(place, inFold) + mcpBadge('step', about) + '</div>') +
            '<div class="stp-did">' + inLanguages((t) => stepSentence(step, t, this.#context.names)) + '</div>' +
            (title === '' || title.replace(/<[^>]*>/g, '') === '' ? '' : '<div class="stp-title">' + title + '</div>') +
            this.#chips(step) +
            (seen?.seenAt === undefined ? '' : '<div class="stp-seen">' + inLanguages((t) => t('sb.seen', { n: place - (seen.seenAt ?? 0) })) + '</div>') +
            (tried === undefined ? '' : '<div class="stp-again">' + inLanguages((t) => tryLine(tried, t, this.#context.names)) + '</div>') +
            (windowed === undefined ? '' : '<div class="stp-act">' + this.#open(windowed.path) + '</div>') +
            (about === undefined ? '' : toolAbout(this.#context.toolNoteOf?.(step.did, step.mcp), about)) +
            '</div>' + pillOf(step, tone) + '</div>';
    }
    #open(path) {
        const id = this.#context.windowOf(path);
        return pill({ label: inLanguages((t) => t('sb.whatHappened')), tone: 'outline', size: 'sm', href: '#' + id, attributes: opener(id) });
    }
    /** A file as a chip in its look, opening its window where it has one - or, in a folded row, its name alone. */
    #chip(file, stoppedOver, linked = true) {
        const id = linked ? this.#context.windowOf(file.path) : undefined;
        const toned = file.private === true && (file.how !== 'stopped' || stoppedOver.includes(file));
        const tone = toned ? ' stp-chip-' + fileTone(file) : '';
        const inner = e(this.#context.names(file.path));
        return id === undefined ? '<span class="stp-chip' + tone + '" title="' + e(file.path) + '">' + inner + '</span>'
            : '<a class="stp-chip' + tone + '" href="#' + id + '" title="' + e(file.path) + '"' + opener(id) + '>' + inner + '</a>';
    }
    #chips(step) {
        // One file is the one the sentence names: a chip of it would say it twice.
        if (step.files.length + (step.filesLeftOut ?? 0) < 2)
            return '';
        const stoppedOver = stoppedFor(step);
        const chip = (file) => this.#chip(file, stoppedOver);
        const shown = step.files.slice(0, CHIPS_SHOWN);
        const rest = step.files.slice(CHIPS_SHOWN);
        const leftOut = step.filesLeftOut ?? 0;
        const more = rest.length + leftOut;
        // "+25 more" opens on the rest (the maintainer, 2026-10-11): every file the model kept, and the count of those it did not.
        return '<div class="stp-chips">' + shown.map(chip).join('') + '</div>' + (more === 0 ? '' :
            '<details class="stp-more"><summary class="stp-more-files">' + inLanguages((t) => t('sb.moreFiles', { n: more })) + '</summary>' +
                '<div class="stp-chips">' + rest.map(chip).join('') +
                (leftOut === 0 ? '' : '<span class="stp-not-kept">' + inLanguages((t) => t('sb.notKept', { n: leftOut })) + '</span>') + '</div></details>');
    }
    /** SB16, SB17: one or more hand-overs of one stretch - "at once" where there are several - each helper a row. */
    #handOver(agent, steps, place, seen, anchor) {
        const inner = new Set([...seen, agent.agentIndex]);
        const rows = steps
            .map((step) => ({ step, tone: step.gave?.agentIndex === undefined ? 'grey' : this.toneOfAgent(step.gave.agentIndex, inner) }))
            .sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
        const tone = strongest(rows.map((row) => row.tone));
        const title = steps.length === 1
            ? inLanguages((t) => t('sb.gave.one', { who: this.#who(steps[0]?.gave?.agentIndex, t) }))
            : inLanguages((t) => t('sb.gave.many', { n: steps.length }));
        return '<div class="stp-hand"' + this.#id(agent.agentIndex, anchor) + ' data-private="' + (tone === 'grey' ? '0' : '1') + '">' + this.#when(place) +
            '<div class="stp-hand-t">' + title + '</div>' +
            (steps.length > 1 ? '<p class="stp-lead">' + inLanguages((t) => t('sb.gave.together')) + '</p>' : '') + '</div>' +
            '<div class="stp-rows" data-private="' + (tone === 'grey' ? '0' : '1') + '">' + rows.map(({ step }) => this.helperRow(step.gave?.agentIndex, step, inner)).join('') + '</div>';
    }
    /** SB16, SB18: a helper's row - its job and its pill - opening on its own cards, open where it read something private. */
    helperRow(index, step, seen) {
        const agent = index === undefined ? undefined : this.#byAgent.get(index);
        const tone = index === undefined ? 'grey' : this.toneOfAgent(index, seen);
        const job = step?.gave?.askedTo;
        const models = index === undefined ? [] : this.#models.get(index) ?? [];
        const head = '<summary class="stp-row-head">' + avatar(this.#initials(index), AVATAR_TONE[tone], 40) +
            '<span class="stp-row-text"><span class="stp-row-name">' + inLanguages((t) => this.#who(index, t)) + '</span>' +
            (job === undefined ? '' : '<span class="stp-row-job">' + inLanguages((t) => t('sb.job', { job: e(job) })) + '</span>') +
            // MR3: the model the record names on its replies, under its job.
            (models.length === 0 ? '' : '<span class="stp-row-model">' + inLanguages((t) => t('hp.model') + ':') + ' ' + modelChips(models, 'stp-model') + '</span>') + '</span>' +
            stepPill(tone) + '<span class="stp-chev" aria-hidden="true"></span></summary>';
        const back = step === undefined ? '' : this.#endCard('end', '↩', 'sb.then', inLanguages((t) => t(step.gave?.back === true ? 'sb.back' : 'sb.back.unknown')));
        const body = agent === undefined || seen.has(agent.agentIndex)
            ? '<p class="stp-lead">' + inLanguages((t) => t(index === undefined ? 'sb.helper.unfound' : 'hp.line.empty')) + '</p>'
            : '<ol class="stp-flow">' + this.timeline(agent, new Set([...seen, agent.agentIndex])) + back + '</ol>';
        return '<details class="stp-helper' + (tone === 'coral' ? ' stp-helper-risk' : '') + '" data-private="' + (tone === 'grey' ? '0' : '1') + '"' +
            (tone === 'coral' ? ' open' : '') + '>' + head + '<div class="stp-row-body">' + body + '</div></details>';
    }
}
/** SB17: the hand-overs of one stretch side by side, as one group; every other step alone. */
function groupHandOvers(steps) {
    const groups = [];
    for (const step of steps) {
        const last = groups[groups.length - 1];
        if (step.gave !== undefined && Array.isArray(last))
            last.push(step);
        else
            groups.push(step.gave !== undefined ? [step] : step);
    }
    return groups;
}
export const STEP_BY_STEP_STYLE = String.raw `
.stp{max-width:none}
.stp-note{align-items:center}
.stp-note-model{flex:none;display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2)}
.stp-note-model-l{font-weight:600}
.stp-note-model .stp-model{font-size:13px;color:var(--text);background:var(--white-09);border-color:var(--white-14);padding:2px 8px}
.stp-note-alone{margin:10px 0 0}
.stp-bar{display:none;padding:3px;border-radius:999px;width:fit-content;background:var(--card);border:1px solid var(--white-09);margin:4px 0 22px}
.js .stp-bar.js-only{display:flex}
.stp-seg{border:none;border-radius:999px;font:inherit;font-size:13.5px;font-weight:600;padding:6px 14px;cursor:pointer;background:transparent;color:var(--text-2)}
.stp-seg.stp-on{background:var(--raised-2);color:var(--text);box-shadow:inset 0 0 0 1px var(--white-14)}
.stp-flow{list-style:none;margin:0;padding:0 0 0 34px;position:relative}
.stp-flow::before{content:"";position:absolute;left:11px;top:24px;bottom:24px;width:2px;background:var(--white-08)}
.stp-run{position:relative;margin:0 0 16px}
.stp-pin{position:absolute;left:-34px;top:22px;width:24px;height:24px;border-radius:50%;border:5px solid var(--bg);background:var(--text-4)}
.stp-pin-coral{background:var(--coral)}.stp-pin-sand{background:var(--sand)}.stp-pin-amber{background:var(--amber)}
.stp-pin-blue{background:var(--blue)}.stp-pin-mint{background:var(--mint)}.stp-pin-end{background:var(--text-2)}
.stp-box{background:var(--card);border:1px solid var(--white-10);border-radius:18px;overflow:hidden;box-shadow:0 8px 24px var(--node-shadow)}
.stp-box-risk{border-color:var(--coral-40)}
.stp-note{display:flex;align-items:flex-start;gap:14px;padding:16px 22px;background:var(--raised);border-bottom:1px solid var(--white-08)}
.stp-note-t{flex:1;min-width:0}
.stp-label{display:block;font-size:13px;font-weight:600;color:var(--text-3)}
.stp-q{display:block;margin-top:1px;font-size:17px;line-height:1.45;color:var(--text);quotes:"\201C" "\201D"}
:lang(pl) .stp-q,:lang(de) .stp-q{quotes:"\201E" "\201D"}
.stp-q::before{content:open-quote}.stp-q::after{content:close-quote}
.stp-fact{display:block;font-size:15px;font-style:italic;color:var(--text-3)}
.stp-covers{flex:none;align-self:center;font-size:12.5px;font-weight:600;color:var(--text-3);background:var(--white-06);border-radius:999px;padding:3px 10px;white-space:nowrap}
.stp-words .stp-covers{display:block;width:fit-content;margin-top:6px;background:none;padding:0;font-weight:500}
.stp-row{display:flex;align-items:center;gap:16px;padding:16px 22px;border-top:1px solid var(--white-07);position:relative}
.stp-note + .stp-row{border-top:none}
.stp-row-risk{background:var(--coral-06)}
.stp-row-risk::before{content:"";position:absolute;left:0;top:16%;height:68%;width:3px;border-radius:0 3px 3px 0;background:var(--coral)}
.stp-ic{flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;background:var(--raised-2);color:var(--text-3);border:1px solid var(--white-10)}
.stp-ic svg{width:20px;height:20px}
.stp-ic-coral{background:var(--coral-16);color:var(--coral-text);border-color:var(--coral-40)}
.stp-ic-sand{background:var(--sand-16);color:var(--sand);border-color:var(--sand-35)}
.stp-ic-amber{background:var(--amber-16);color:var(--amber);border-color:var(--amber-35)}
.stp-ic-blue{background:var(--blue-16);color:var(--blue);border-color:transparent}
.stp-ic-mint{background:var(--mint-14);color:var(--mint);border-color:var(--mint-35)}
.stp-x{flex:1;min-width:0}
.stp-when{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
.stp-did{margin-top:1px;font-size:16.5px;font-weight:600;line-height:1.45;color:var(--text)}
.stp-did code,.stp-fact code{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 7px;margin:0 4px}
.stp-title{margin-top:3px;font-size:14px;font-weight:600;color:var(--coral-text)}
.stp-seen,.stp-again{margin-top:4px;font-size:14px;color:var(--text-2)}
.stp-act{margin-top:10px}
.stp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.stp-chip{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--text-soft);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 7px;text-decoration:none;overflow-wrap:anywhere}
a.stp-chip:hover{border-color:var(--white-28);color:var(--text)}
.stp-chip-coral{border-color:var(--coral-40);color:var(--coral-text)}.stp-chip-sand{border-color:var(--sand-35);color:var(--sand)}
.stp-chip-blue{color:var(--blue)}.stp-chip-mint{border-color:var(--mint-35);color:var(--mint)}.stp-chip-amber{border-color:var(--amber-35);color:var(--amber)}
.stp-more{margin-top:6px}
.stp-more-files{list-style:none;cursor:pointer;width:fit-content;font-size:13px;font-weight:600;color:var(--text-2);padding:2px 10px;border-radius:999px;border:1px solid var(--white-14)}
.stp-more-files::-webkit-details-marker{display:none}
.stp-more-files:hover{color:var(--text);border-color:var(--white-28)}
.stp-more[open] > .stp-more-files{color:var(--text)}
.stp-more .stp-chips{margin-top:8px}
.stp-not-kept{font-size:13px;color:var(--text-3);align-self:center}
.stp-pill{flex:none;display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;padding:5px 12px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.stp-pill-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.stp-pill-coral{color:var(--coral-text);background:var(--coral-08);border-color:var(--coral-40)}
.stp-pill-sand{color:var(--sand);background:var(--sand-16)}.stp-pill-amber{color:var(--amber);background:var(--amber-12)}
.stp-pill-blue{color:var(--blue);background:var(--blue-16)}.stp-pill-mint{color:var(--mint);background:var(--mint-10)}
.stp-pill-grey{color:var(--text-3);background:var(--white-04);font-weight:500}
.stp-hand{padding:16px 22px 12px;border-top:1px solid var(--white-07)}
.stp-note + .stp-hand{border-top:none}
.stp-hand-t{margin-top:1px;font-size:17px;font-weight:650}
.stp-lead{margin:3px 0 0;font-size:14px;color:var(--text-2);max-width:640px}
.stp-rows{border-top:1px solid var(--white-07)}
.stp-rows-alone{margin-top:12px;border:1px solid var(--white-10);border-radius:18px;overflow:hidden;background:var(--card)}
.stp-helper{border-top:1px solid var(--white-08)}.stp-helper:first-child{border-top:none}
.stp-row-head{list-style:none;cursor:pointer;display:flex;align-items:center;gap:16px;padding:16px 22px;position:relative}
.stp-row-head::-webkit-details-marker{display:none}
.stp-row-head:hover{background:var(--white-04)}
.stp-helper[open] > .stp-row-head{background:var(--raised)}
.stp-helper-risk > .stp-row-head::before{content:"";position:absolute;left:0;top:18%;height:64%;width:3px;border-radius:0 3px 3px 0;background:var(--coral)}
.stp-row-text{flex:1;min-width:0}
.stp-row-name{display:block;font-size:17px;font-weight:650}
.stp-row-job{display:block;margin-top:1px;font-size:14.5px;color:var(--text-2)}
.stp-row-model{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 6px;font-size:13px;color:var(--text-3);margin-top:5px}
.stp-model{font-family:var(--mono);font-size:12.5px;font-weight:500;color:var(--text-2);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 6px}
.stp-chev{flex:none;width:9px;height:9px;border-right:1.5px solid var(--text-3);border-bottom:1.5px solid var(--text-3);transform:rotate(-45deg);transition:transform .15s;margin-left:4px}
.stp-helper[open] > .stp-row-head .stp-chev{transform:rotate(45deg)}
.stp-row-body{padding:20px 22px 6px 26px;background:var(--panel);border-top:1px solid var(--white-07)}
.stp-row-body > .stp-lead{margin:0 0 14px}
.stp-row-body .stp-pin{border-color:var(--panel)}
.stp-words{margin:0;padding:0 0 6px}
.stp-map{display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px;margin:0 0 20px}
.stp-cells{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}
.stp-cell{display:block;width:14px;height:14px;border-radius:4px;background:var(--white-14);box-shadow:inset 0 0 0 1px var(--white-10)}
a.stp-cell:hover,a.stp-cell:focus-visible{outline:2px solid var(--text-2);outline-offset:2px}
.stp-cell-coral{background:var(--coral)}.stp-cell-sand{background:var(--sand)}.stp-cell-amber{background:var(--amber)}
.stp-cell-blue{background:var(--blue)}.stp-cell-mint{background:var(--mint)}
.stp-keys{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;color:var(--text-2)}
.stp-key{display:inline-flex;align-items:center;gap:7px}.stp-key .stp-cell{width:10px;height:10px;border-radius:3px}
.stp-key b{color:var(--text);font-weight:650}
.stp-map-note{font-size:13px;color:var(--text-3)}
.stp-first{display:inline-flex;align-items:center;gap:6px;margin-bottom:5px;font-size:12.5px;font-weight:650;color:var(--coral-text)}
.stp-first::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--coral)}
.stp-ic-stack{box-shadow:4px 4px 0 -1px var(--raised-2),4px 4px 0 0 var(--white-10),8px 8px 0 -1px var(--raised-2),8px 8px 0 0 var(--white-08)}
.stp-ic-coral.stp-ic-stack{box-shadow:4px 4px 0 -1px var(--coral-16),4px 4px 0 0 var(--coral-40),8px 8px 0 -1px var(--coral-08),8px 8px 0 0 var(--coral-40)}
.stp-foldset > summary{list-style:none;cursor:pointer}
.stp-foldset > summary::-webkit-details-marker{display:none}
.stp-foldset > summary:hover{background:var(--white-04)}
.stp-foldset[open]{background:var(--raised)}
.stp-foldset[open] > summary{background:transparent}
.stp-foldset{--fold-line:var(--white-28);--fold-gap:24px;--fold-at:43px;--fold-from:66px}
.stp-foldset-coral{--fold-line:var(--coral)}.stp-foldset-sand{--fold-line:var(--sand)}.stp-foldset-amber{--fold-line:var(--amber)}
.stp-foldset-blue{--fold-line:var(--blue)}.stp-foldset-mint{--fold-line:var(--mint)}
/* Opened, the fold's steps hang from its own mark: a line down from under the mark, and a branch to each step, the last
   one closing it - a tree, so each step reads as one of the fold's. */
.stp-fold > .stp-ic{align-self:flex-start;margin-top:2px}
.stp-foldset[open] > summary::after{content:"";position:absolute;left:var(--fold-at);top:var(--fold-from);bottom:0;width:2px;background:var(--fold-line)}
.stp-fold-body{position:relative;margin:0 22px 18px var(--fold-at);padding-left:var(--fold-gap)}
.stp-fold-body > .stp-row{padding:12px 16px;margin-top:10px;border:1px solid var(--white-08);border-radius:14px;background:var(--card)}
.stp-fold-body > .stp-row-risk{background:var(--card)}
/* A card's own pseudo-elements stand inside its 1px border, so the line is drawn 1px further left to meet the one under
   the fold's mark. */
.stp-fold-body > .stp-row::after{content:"";position:absolute;left:calc(-1 * var(--fold-gap) - 1px);top:-12px;height:calc(50% + 12px);width:calc(var(--fold-gap) + 1px);box-sizing:border-box;border-left:2px solid var(--fold-line);border-bottom:2px solid var(--fold-line);border-bottom-left-radius:12px}
.stp-fold-body > .stp-row::before,.stp-fold-body > .stp-row-risk::before{content:"";position:absolute;left:calc(-1 * var(--fold-gap) - 1px);top:50%;bottom:-12px;height:auto;width:2px;border-radius:0;background:var(--fold-line)}
.stp-fold-body > .stp-row:last-child::before{display:none}
.stp-fold-body > .stp-row > .stp-ic{width:36px;height:36px;font-size:14px}
.stp-fold-body .stp-did{font-size:15.5px}
.stp-foldset[open] > summary .stp-chips{display:none}
.stp-note + .stp-foldset > summary{border-top:none}
.stp-fold .stp-more-files{display:inline-block;margin-top:10px}
.stp-each-hide{display:none !important}
.stp-foldset[open] .stp-each-show{display:none}
.stp-foldset[open] .stp-each-hide{display:inline-block !important}
.stp-now .stp-did{font-size:17px}.stp-now[hidden]{display:none}
.stp-h{margin:32px 0 4px;font-size:18px;font-weight:650}
.stp-empty,.stp-foot{font-size:14px;color:var(--text-3);margin:16px 0 0}
@media (max-width:640px){
  .stp-flow{padding-left:26px}.stp-flow::before{left:8px}.stp-pin{left:-27px;width:20px;height:20px;border-width:4px}
  .stp-note,.stp-row,.stp-hand,.stp-row-head{padding-left:14px;padding-right:14px}
  .stp-row,.stp-row-head{flex-wrap:wrap}.stp-row .stp-pill,.stp-row-head .stp-pill{margin-left:60px}
  .stp-row > .stp-x,.stp-row-head > .stp-row-text{flex-basis:calc(100% - 60px)}
  .stp-row .stp-pill{max-width:calc(100% - 60px);white-space:normal}.stp-row-head .stp-pill{max-width:calc(100% - 89px);white-space:normal}
  .stp-ic{width:36px;height:36px}.stp-note .stp-covers{display:none}.stp-q{font-size:16px}
  .stp-note{flex-wrap:wrap}.stp-note-model{flex-basis:100%;padding-left:44px}
  .stp-foldset{--fold-gap:14px;--fold-at:31px;--fold-from:58px}.stp-fold-body{margin-right:8px}
  .stp-fold-body > .stp-row{padding:10px 12px;gap:12px}.stp-fold-body > .stp-row > .stp-ic{width:30px;height:30px;font-size:13px}
  .stp-fold-body > .stp-row > .stp-x{flex-basis:calc(100% - 42px)}
  .stp-fold-body > .stp-row .stp-pill{margin-left:42px;max-width:calc(100% - 42px);white-space:nowrap}
  .stp-row-body{padding:16px 10px 4px 12px}
}
@media (prefers-reduced-motion:reduce){.stp-chev{transition:none}}
`;
