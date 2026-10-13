// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { RefusalSource } from '../../../core/event.ts';
import type { AgentRuns, ReportModel, Run, RunFile, RunStep, WroteBefore } from '../../report-model.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, type Lang, type Translate } from '../report-copy.ts';
import { avatar, type AvatarTone } from '../ui/avatar.ts';
import { pill } from '../ui/button.ts';
import { opener } from '../ui/popup.ts';
import { LOOKS, type Look } from '../ui/status-look.ts';
import type { FileRow } from './files.ts';
import type { FileNames } from './item-names.ts';

/** How many of a step's files show before "+N more". */
const CHIPS_SHOWN = 6;

/** What the page around the tab already knows: a file's short name, its row in Files, its window, its to-do title. */
export interface StepsContext {
  readonly names: FileNames;
  /** The id of the "What happened" window a file's row opens, where it has a row. */
  readonly windowOf: (path: string) => string | undefined;
  /** A private file's title, as the to-do list names it, where it is on the list. */
  readonly titleOf: (path: string, t: Translate, lang: Lang) => string | undefined;
  /** SB25: the file's row in Files, whose look and mode By folder draws. Absent where the file has no row. */
  readonly rowOf?: (path: string) => FileRow | undefined;
}

/** The colour of what a step did (SB12): a private file's look, or grey for everything else. */
export type StepTone = 'coral' | 'sand' | 'amber' | 'blue' | 'mint' | 'grey';

export const TAG_KEY: Readonly<Record<StepTone, string>> = {
  coral: 'sb.tag.read', sand: 'look.allowed', amber: 'sb.tag.unknown', blue: 'look.name', mint: 'look.stopped', grey: 'look.none',
};

/**
 * Who stopped a step, in the step's sentence (`who-stopped-it` WS3, WS9): only a rule's refusal is said as a rule's, and a
 * check whose owner the record does not name is said as a check. A step with no source on record says it was stopped.
 */
const STOPPED_BY: Readonly<Record<RefusalSource, string>> = {
  rule: 'sb.stop.rule', person: 'sb.stop.person', check: 'sb.stop.check', reviewer: 'sb.stop.other',
};

/**
 * SB12 as amended 2026-10-11: the ladder the Files tab sorts its parts by - read, not recorded, opened, stopped, a name
 * only seen - so a step and a row never disagree about which of two things weighs more. A tracked read sits under a read.
 */
const HOW_RANK: Readonly<Record<RunFile['how'], number>> = { read: 6, changed: 6, unknown: 4, opened: 3, stopped: 2, named: 1 };

function rankOf(file: RunFile): number {
  return HOW_RANK[file.how] - ((file.how === 'read' || file.how === 'changed') && file.tracked === true ? 1 : 0);
}

/** The colour of what one step did to one private file (SB12). */
export function fileTone(file: RunFile): StepTone {
  if (file.how === 'read' || file.how === 'changed') return file.tracked === true ? 'sand' : 'coral';
  if (file.how === 'unknown') return 'amber';
  if (file.how === 'opened' || file.how === 'named') return 'blue';
  return 'mint';
}

/** The private file a step did the most to, by the Files ladder. */
function strongestFile(step: RunStep): RunFile | undefined {
  return step.files.filter((file) => file.private === true).reduce<RunFile | undefined>((best, file) => best === undefined || rankOf(file) > rankOf(best) ? file : best, undefined);
}

export function toneOf(step: RunStep): StepTone {
  const file = strongestFile(step);
  return file === undefined ? 'grey' : fileTone(file);
}

const TONE_RANK: Readonly<Record<StepTone, number>> = { coral: 6, sand: 5, amber: 4, blue: 3, mint: 2, grey: 0 };
export const strongest = (tones: readonly StepTone[]): StepTone => tones.reduce<StepTone>((best, tone) => TONE_RANK[tone] > TONE_RANK[best] ? tone : best, 'grey');

/** SB12 as amended 2026-10-11 by the maintainer: what happened is a pill in its colour, with a dot, beside the step. */
export function stepPill(tone: StepTone): string {
  return '<span class="stp-pill stp-pill-' + tone + '"><span class="stp-pill-dot" aria-hidden="true"></span>' + inLanguages((t) => t(TAG_KEY[tone])) + '</span>';
}

const AVATAR_TONE: Readonly<Record<StepTone, AvatarTone>> = { coral: 'coral', sand: 'grey', amber: 'grey', blue: 'grey', mint: 'mint', grey: 'grey' };

/** A step's glyph in its circle: the look of what it did, or what kind of plain step it was. */
function glyphOf(step: RunStep, tone: StepTone): string {
  const file = strongestFile(step);
  const look: Look | undefined = tone === 'coral' ? 'read' : tone === 'sand' ? 'allowed' : tone === 'mint' ? 'stopped'
    : tone === 'amber' ? 'unchecked' : tone === 'blue' ? (file?.how === 'opened' ? 'opened' : 'name') : undefined;
  if (look !== undefined) return LOOKS[look].glyph;
  return (step.programs ?? []).length > 0 ? '›_' : '✓';
}

/** SB13: what an AI wrote before a stretch of steps, in parts a header or a line can draw. */
interface WrotePieces {
  readonly label?: string;
  readonly quote?: string;
  readonly fact?: string;
}

function wrotePieces(wrote: WroteBefore, main: boolean, who: (t: Translate) => string, names: FileNames): WrotePieces {
  // Polish says your AI and a helper in different genders, so each sentence about one has two keys.
  const of = (key: string): string => key + (main ? '.main' : '.helper');
  if (wrote.sentence !== undefined) {
    const label = of(wrote.kind === 'reasoning' ? 'sb.noted' : 'sb.said');
    return { label: inLanguages((t) => t(label, { who: who(t) })), quote: e(wrote.sentence) + (wrote.cut === true ? '…' : '') };
  }
  const [key, vars] = wrote.carried.length > 0 ? ['sb.words.carried', { files: wrote.carried.map((path) => '<code>' + e(names(path)) + '</code>').join(', ') }] as const
    : wrote.blank > 0 ? ['sb.words.blank', {}] as const
      : wrote.size > 0 ? [of('sb.words.size'), { n: wrote.size }] as const
        : [of('sb.words.none'), {}] as const;
  return { fact: inLanguages((t) => t(key, { who: who(t), ...vars })) };
}

/**
 * SB13: what an AI wrote before a stretch of steps - its words, quoted and labelled as said or noted (R7a), or the fact in
 * their place (R3, R6, R9) - and how many steps they stand before (R2). Never called a reason (SBD2).
 */
export function wroteHtml(wrote: WroteBefore, steps: number, main: boolean, who: (t: Translate) => string, names: FileNames): string {
  const pieces = wrotePieces(wrote, main, who, names);
  const covers = steps > 1 ? '<span class="stp-covers">' + inLanguages((t) => t('sb.words.covers', { n: steps })) + '</span>' : '';
  return pieces.quote === undefined
    ? '<div class="stp-words stp-words-fact"><span class="stp-fact">' + pieces.fact + '</span>' + covers + '</div>'
    : '<div class="stp-words"><span class="stp-label">' + pieces.label + '</span><q class="stp-q">' + pieces.quote + '</q>' + covers + '</div>';
}

/** SB14: what a step did, in words, from facts - never the command line (main spec §7.3). */
export function stepSentence(step: RunStep, t: Translate, names: FileNames): string {
  if (!step.toolKnown) return t('sb.do.unknownTool');
  const files = step.files;
  const name = (file: RunFile): string => '<code>' + e(names(file.path)) + '</code>';
  const count = files.length + (step.filesLeftOut ?? 0);
  const of = (how: RunFile['how']): RunFile[] => files.filter((file) => file.how === how);
  const stopped = of('stopped');
  if (stopped.length > 0 || (files.length === 0 && step.outcome === 'blocked')) {
    const target = stopped[0] === undefined ? t('sb.do.stopped.call') : t('sb.do.stopped.file', { file: name(stopped[0]) });
    return target + ' ' + t(step.refusedBy === undefined ? 'sb.stop.other' : STOPPED_BY[step.refusedBy]);
  }
  const several = (key: string, list: readonly RunFile[]): string =>
    list.length === 1 ? t(key, { file: name(list[0] as RunFile) }) : t(key + '.more', { file: name(list[0] as RunFile), n: list.length - 1 });
  if (of('read').length > 0) return several('sb.do.read', of('read'));
  if (of('changed').length > 0) return several('sb.do.changed', of('changed'));
  if (of('unknown').length > 0) return t('sb.do.unknown', { file: name(of('unknown')[0] as RunFile) });
  if (of('opened').length > 0) return t('sb.do.opened', { file: name(of('opened')[0] as RunFile) });
  if (count > 0) return count === 1 ? t('sb.do.namedOne', { file: name(files[0] as RunFile) }) : t('sb.do.named', { n: count });
  const ended = step.outcome === 'unknown' ? ' ' + t('sb.do.notEnded') : '';
  const programs = step.programs ?? [];
  return (programs.length > 0
    ? t('sb.do.command', { programs: programs.map((program) => '<code>' + e(program) + '</code>').join(', ') })
    : t('sb.do.tool', { did: '<code>' + e(step.did) + '</code>' })) + ended;
}

/**
 * "Step by step" (`2026-10-11-step-by-step.md` SB10-SB23, redrawn 2026-10-11 by the maintainer): every step your AI took,
 * in its own order, each stretch a card headed by what it wrote before it, each step a row of that card, and each helper's
 * steps inside the row that gave it work. Never ordered across AIs.
 */
export function stepByStepPanel(report: ReportModel, context: StepsContext): string {
  const runs = report.runs ?? [];
  const byAgent = new Map(runs.map((agent) => [agent.agentIndex, agent]));
  const ordinals = new Map(report.graph.agents.map((agent) => [agent.index, agent.ordinal]));
  const main = report.graph.main.index;
  const given = new Set(runs.flatMap((agent) => agent.runs.flatMap((run) => run.steps.flatMap((step) => step.gave?.agentIndex === undefined ? [] : [step.gave.agentIndex]))));
  const unplaced = runs.filter((agent) => agent.agentIndex !== main && !given.has(agent.agentIndex));
  const draw = new Drawing(byAgent, ordinals, main, context);

  const mainRuns = byAgent.get(main);
  const body = mainRuns === undefined
    ? '<p class="stp-empty">' + inLanguages((t) => t('sb.empty')) + '</p>'
    : '<ol class="stp-flow">' + draw.timeline(mainRuns, new Set([main])) + '</ol>';
  const others = unplaced.length === 0 ? '' :
    '<h3 class="stp-h">' + inLanguages((t) => t('sb.unplaced')) + '</h3><p class="stp-lead">' + inLanguages((t) => t('sb.unplaced.lead')) + '</p>' +
    '<div class="stp-rows stp-rows-alone">' + unplaced.map((agent) => draw.helperRow(agent.agentIndex, undefined, new Set([main]))).join('') + '</div>';
  const hidden = draw.plainSteps;

  return '<div class="stp" data-steps>' +
    '<div class="stp-bar js-only" role="group">' +
    '<button type="button" class="stp-seg stp-on" data-steps-show="all" aria-pressed="true">' + inLanguages((t) => t('sb.show.all')) + '</button>' +
    '<button type="button" class="stp-seg" data-steps-show="private" aria-pressed="false">' + inLanguages((t) => t('sb.show.private')) + '</button></div>' +
    (hidden === 0 ? '' : '<p class="stp-hidden-note">' + inLanguages((t) => t('sb.hidden', { n: hidden })) + '</p>') +
    body + others +
    '<p class="stp-foot">' + inLanguages((t) => t('sb.foot')) + '</p></div>';
}

/** One tab's drawing: the cards of each timeline, the helper rows nested in them, and how many plain steps there are. */
class Drawing {
  readonly #byAgent: ReadonlyMap<number, AgentRuns>;
  readonly #ordinals: ReadonlyMap<number, number | undefined>;
  readonly #main: number;
  readonly #context: StepsContext;
  #plain = 0;

  constructor(byAgent: ReadonlyMap<number, AgentRuns>, ordinals: ReadonlyMap<number, number | undefined>, main: number, context: StepsContext) {
    this.#byAgent = byAgent;
    this.#ordinals = ordinals;
    this.#main = main;
    this.#context = context;
  }

  /** How many steps touched nothing private: *Only private* hides them, and says so. */
  get plainSteps(): number {
    return this.#plain;
  }

  /** Who an AI is, in the page's words: your AI, a helper by its number, or a helper the record numbers nowhere. */
  #who(index: number | undefined, t: Translate): string {
    if (index === this.#main) return t('st.main');
    const ordinal = index === undefined ? undefined : this.#ordinals.get(index);
    return ordinal === undefined ? t('sb.someHelper') : t('st.helper', { ordinal });
  }

  #initials(index: number | undefined): string {
    if (index === this.#main) return 'AI';
    const ordinal = index === undefined ? undefined : this.#ordinals.get(index);
    return ordinal === undefined ? 'H' : 'H' + ordinal;
  }

  /** The strongest thing an AI did, its own steps and those of the helpers it gave work to. */
  toneOfAgent(index: number, seen: ReadonlySet<number>): StepTone {
    const agent = this.#byAgent.get(index);
    if (agent === undefined || seen.has(index)) return 'grey';
    const inner = new Set([...seen, index]);
    return strongest(agent.runs.flatMap((run) => run.steps.map((step) =>
      step.gave?.agentIndex === undefined ? toneOf(step) : this.toneOfAgent(step.gave.agentIndex, inner))));
  }

  /** SB11: one AI's runs as one timeline of cards - First, then Then, and Last where your AI answered. */
  timeline(agent: AgentRuns, seen: ReadonlySet<number>): string {
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
  #endCard(pin: string, glyph: string, when: string, words: string): string {
    return '<li class="stp-run" data-private="0"><span class="stp-pin stp-pin-' + pin + '" aria-hidden="true"></span><div class="stp-box">' +
      '<div class="stp-row"><span class="stp-ic" aria-hidden="true">' + glyph + '</span><div class="stp-x"><div class="stp-when">' +
      inLanguages((t) => t(when)) + '</div><div class="stp-did">' + words + '</div></div></div></div></li>';
  }

  /** SB13: a stretch of steps is a card: what was written before it on top, once; its steps as rows under it. */
  #card(agent: AgentRuns, run: Run, from: number, seen: ReadonlySet<number>): string {
    const inner = new Set([...seen, agent.agentIndex]);
    const tones = run.steps.map((step) => step.gave?.agentIndex === undefined ? toneOf(step) : this.toneOfAgent(step.gave.agentIndex, inner));
    const tone = strongest(tones);
    let place = from;
    const rows = groupHandOvers(run.steps).map((group) => {
      const html = Array.isArray(group) ? this.#handOver(agent, group, place, seen) : this.#step(group, place);
      place += Array.isArray(group) ? group.length : 1;
      return html;
    }).join('');
    return '<li class="stp-run" data-private="' + (tone === 'grey' ? '0' : '1') + '"><span class="stp-pin stp-pin-' + tone + '" aria-hidden="true"></span>' +
      '<div class="stp-box' + (tone === 'coral' ? ' stp-box-risk' : '') + '">' + this.#note(agent.agentIndex, run.wrote, run.steps.length) + rows + '</div></li>';
  }

  /** The card's head: the AI's avatar, what it wrote - said or noted - and how many steps those words stand before. */
  #note(index: number, wrote: WroteBefore, steps: number): string {
    const pieces = wrotePieces(wrote, index === this.#main, (t) => this.#who(index, t), this.#context.names);
    const covers = steps > 1 ? '<span class="stp-covers">' + inLanguages((t) => t('sb.covers', { n: steps })) + '</span>' : '';
    return '<div class="stp-note">' + avatar(this.#initials(index), 'grey', 30) + '<div class="stp-note-t">' +
      (pieces.quote === undefined ? '<span class="stp-fact">' + pieces.fact + '</span>'
        : '<span class="stp-label">' + pieces.label + '</span><q class="stp-q">' + pieces.quote + '</q>') + '</div>' + covers + '</div>';
  }

  #when(place: number): string {
    return '<div class="stp-when">' + inLanguages((t) => t(place === 0 ? 'sb.first' : 'sb.then')) + '</div>';
  }

  /** SB12, SB14, SB15: one step - its glyph, what it did in words, its files, its window, and its pill. */
  #step(step: RunStep, place: number): string {
    const tone = toneOf(step);
    if (tone === 'grey') this.#plain += 1;
    const files = step.files;
    const first = files[0];
    const seen = files.find((file) => file.seenAt !== undefined);
    const windowed = files.find((file) => file.private === true && this.#context.windowOf(file.path) !== undefined);
    const title = first !== undefined && first.private === true && (first.how === 'read' || first.how === 'changed')
      ? inLanguages((t, lang) => this.#context.titleOf(first.path, t, lang) ?? '') : '';
    return '<div class="stp-row' + (tone === 'coral' ? ' stp-row-risk' : '') + '" data-private="' + (tone === 'grey' ? '0' : '1') + '">' +
      '<span class="stp-ic stp-ic-' + tone + '" aria-hidden="true">' + glyphOf(step, tone) + '</span>' +
      '<div class="stp-x">' + this.#when(place) +
      '<div class="stp-did">' + inLanguages((t) => stepSentence(step, t, this.#context.names)) + '</div>' +
      (title === '' || title.replace(/<[^>]*>/g, '') === '' ? '' : '<div class="stp-title">' + title + '</div>') +
      this.#chips(step) +
      (seen?.seenAt === undefined ? '' : '<div class="stp-seen">' + inLanguages((t) => t('sb.seen', { n: place - (seen.seenAt ?? 0) })) + '</div>') +
      (windowed === undefined ? '' : '<div class="stp-act">' + this.#open(windowed.path) + '</div>') +
      '</div>' + stepPill(tone) + '</div>';
  }

  #open(path: string): string {
    const id = this.#context.windowOf(path) as string;
    return pill({ label: inLanguages((t) => t('sb.whatHappened')), tone: 'outline', size: 'sm', href: '#' + id, attributes: opener(id) });
  }

  #chips(step: RunStep): string {
    // One file is the one the sentence names: a chip of it would say it twice.
    if (step.files.length + (step.filesLeftOut ?? 0) < 2) return '';
    const chip = (file: RunFile): string => {
      const id = this.#context.windowOf(file.path);
      const tone = file.private === true ? ' stp-chip-' + fileTone(file) : '';
      const inner = e(this.#context.names(file.path));
      return id === undefined ? '<span class="stp-chip' + tone + '" title="' + e(file.path) + '">' + inner + '</span>'
        : '<a class="stp-chip' + tone + '" href="#' + id + '" title="' + e(file.path) + '"' + opener(id) + '>' + inner + '</a>';
    };
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
  #handOver(agent: AgentRuns, steps: readonly RunStep[], place: number, seen: ReadonlySet<number>): string {
    const inner = new Set([...seen, agent.agentIndex]);
    const rows = steps
      .map((step) => ({ step, tone: step.gave?.agentIndex === undefined ? 'grey' as StepTone : this.toneOfAgent(step.gave.agentIndex, inner) }))
      .sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
    const tone = strongest(rows.map((row) => row.tone));
    const title = steps.length === 1
      ? inLanguages((t) => t('sb.gave.one', { who: this.#who(steps[0]?.gave?.agentIndex, t) }))
      : inLanguages((t) => t('sb.gave.many', { n: steps.length }));
    return '<div class="stp-hand" data-private="' + (tone === 'grey' ? '0' : '1') + '">' + this.#when(place) +
      '<div class="stp-hand-t">' + title + '</div>' +
      (steps.length > 1 ? '<p class="stp-lead">' + inLanguages((t) => t('sb.gave.together')) + '</p>' : '') + '</div>' +
      '<div class="stp-rows" data-private="' + (tone === 'grey' ? '0' : '1') + '">' + rows.map(({ step }) => this.helperRow(step.gave?.agentIndex, step, inner)).join('') + '</div>';
  }

  /** SB16, SB18: a helper's row - its job and its pill - opening on its own cards, open where it read something private. */
  helperRow(index: number | undefined, step: RunStep | undefined, seen: ReadonlySet<number>): string {
    const agent = index === undefined ? undefined : this.#byAgent.get(index);
    const tone = index === undefined ? 'grey' : this.toneOfAgent(index, seen);
    const job = step?.gave?.askedTo;
    const head = '<summary class="stp-row-head">' + avatar(this.#initials(index), AVATAR_TONE[tone], 40) +
      '<span class="stp-row-text"><span class="stp-row-name">' + inLanguages((t) => this.#who(index, t)) + '</span>' +
      (job === undefined ? '' : '<span class="stp-row-job">' + inLanguages((t) => t('sb.job', { job: e(job) })) + '</span>') + '</span>' +
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
function groupHandOvers(steps: readonly RunStep[]): (RunStep | RunStep[])[] {
  const groups: (RunStep | RunStep[])[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (step.gave !== undefined && Array.isArray(last)) last.push(step);
    else groups.push(step.gave !== undefined ? [step] : step);
  }
  return groups;
}

/** SB19: *Only private* hides the plain steps; with no script, every step shows (P45). */
export const STEP_BY_STEP_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-steps-show]');
  if (!button) return;
  const view = button.closest('[data-steps]');
  const only = button.getAttribute('data-steps-show') === 'private';
  view.classList.toggle('stp-only', only);
  view.querySelectorAll('[data-steps-show]').forEach((each) => {
    const on = each === button;
    each.classList.toggle('stp-on', on);
    each.setAttribute('aria-pressed', String(on));
  });
});
`;

export const STEP_BY_STEP_STYLE = String.raw`
.stp{max-width:880px}
.stp-bar{display:none;padding:3px;border-radius:999px;width:fit-content;background:var(--card);border:1px solid var(--white-09);margin:4px 0 22px}
.js .stp-bar.js-only{display:flex}
.stp-seg{border:none;border-radius:999px;font:inherit;font-size:13.5px;font-weight:600;padding:6px 14px;cursor:pointer;background:transparent;color:var(--text-2)}
.stp-seg.stp-on{background:var(--raised-2);color:var(--text);box-shadow:inset 0 0 0 1px var(--white-14)}
.stp-hidden-note{display:none;margin:-8px 0 18px;font-size:14px;color:var(--text-3)}
.stp-only .stp-hidden-note{display:block}
.stp-only [data-private="0"]{display:none}
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
.stp-did code,.stp-fact code{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:0 6px}
.stp-title{margin-top:3px;font-size:14px;font-weight:600;color:var(--coral-text)}
.stp-seen{margin-top:4px;font-size:14px;color:var(--text-2)}
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
.stp-chev{flex:none;width:9px;height:9px;border-right:1.5px solid var(--text-3);border-bottom:1.5px solid var(--text-3);transform:rotate(-45deg);transition:transform .15s;margin-left:4px}
.stp-helper[open] > .stp-row-head .stp-chev{transform:rotate(45deg)}
.stp-row-body{padding:20px 22px 6px 26px;background:var(--panel);border-top:1px solid var(--white-07)}
.stp-row-body > .stp-lead{margin:0 0 14px}
.stp-row-body .stp-pin{border-color:var(--panel)}
.stp-words{margin:0;padding:0 0 6px}
.stp-h{margin:32px 0 4px;font-size:18px;font-weight:650}
.stp-empty,.stp-foot{font-size:14px;color:var(--text-3);margin:16px 0 0}
@media (max-width:640px){
  .stp-flow{padding-left:26px}.stp-flow::before{left:8px}.stp-pin{left:-27px;width:20px;height:20px;border-width:4px}
  .stp-note,.stp-row,.stp-hand,.stp-row-head{padding-left:14px;padding-right:14px}
  .stp-row,.stp-row-head{flex-wrap:wrap}.stp-row .stp-pill,.stp-row-head .stp-pill{margin-left:60px}
  .stp-row > .stp-x,.stp-row-head > .stp-row-text{flex-basis:calc(100% - 60px)}
  .stp-row .stp-pill{max-width:calc(100% - 60px);white-space:normal}.stp-row-head .stp-pill{max-width:calc(100% - 89px);white-space:normal}
  .stp-ic{width:36px;height:36px}.stp-note .stp-covers{display:none}.stp-q{font-size:16px}
  .stp-row-body{padding:16px 10px 4px 12px}
}
@media (prefers-reduced-motion:reduce){.stp-chev{transition:none}}
`;
