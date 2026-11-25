// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ACCESS, type Access, type Conversation, type FileOf, type Helper, type Look, type PathOf, type Tone } from './answer.js';
import type { Translate } from './words.js';
import { AMBER, apart, BLANK, bold, cellsOf, clean, COLOUR, CORAL, cut, cutPath, DIM, dim, fit, flow, HAIR, heading, MARK, paragraph, rule, run, square, widthOf, wrap, type Line, type Run } from './cells.js';
import { strip, strongest, tiles, type Tile } from './pieces.js';

export const TONE_OF_ACCESS: Readonly<Record<Access, Tone>> = { read: 'coral', changed: 'coral', unknown: 'amber', opened: 'blue', stopped: 'mint', name: 'blue' };
export const LOOK_TONE: Readonly<Record<Look, Tone>> = { read: 'coral', guard: 'coral', fixed: 'mint', allowed: 'sand', opened: 'blue', name: 'blue', stopped: 'mint', none: 'grey', unchecked: 'amber', failed: 'amber', outside: 'amber', checking: 'amber' };
export const LOOK_MARK: Readonly<Record<Look, string>> = { read: '!', guard: '!', fixed: '●', allowed: '✓', opened: '◐', name: '○', stopped: '■', none: '·', unchecked: '?', failed: '?', outside: '?', checking: '?' };
const markOf = (tone: Tone): Run => bold(MARK[tone], COLOUR[tone]);

export const placeOf = (file: PathOf, t: Translate): string => (file.place === undefined ? '' : ` (${t('ch.' + file.place)})`);
/** A file as runs no wider than `w`: the path gives way, where it lies does not while it fits. */
export function fileRuns(file: PathOf, t: Translate, w: number, strong = false): Line {
  const place = placeOf(file, t);
  const path = clean(file.path);
  const room = w - cellsOf(place);
  if (place !== '' && room >= Math.min(8, cellsOf(path))) return [run(cutPath(path, room), undefined, strong), dim(place)];
  return [run(cutPath(path, w), undefined, strong)];
}

const askOf = (answer: Conversation, t: Translate): string => {
  const all = answer.todo.length + answer.todoMore;
  if (all === 0) return '';
  const what = answer.todoKeys > 0 ? 'an.sum.keys' : 'an.sum.data';
  return answer.numbers.read === 1 && all === 1 ? t(what + '.it') : t(what, { n: answer.todoKeys > 0 ? answer.todoKeys : all });
};
const factOf = (answer: Conversation, t: Translate): string => (answer.numbers.read > 0 ? t('an.sum.read', { n: answer.numbers.read }) : t('look.' + answer.look));
export const accentOf = (answer: Conversation): string | undefined => {
  if (answer.todo.length > 0) return CORAL;
  const tone = answer.notChecked !== undefined ? 'amber' : LOOK_TONE[answer.look];
  return tone === 'grey' ? undefined : COLOUR[tone];
};

function notChecked(answer: Conversation, t: Translate, w: number): Line[] {
  if (answer.notChecked === undefined) return [];
  const said = `${answer.look === 'unchecked' ? `${t('an.unchecked')}: ` : ''}${answer.notChecked.map(clean).join(' · ')}`;
  return [BLANK, ...wrap(said, w - 3).map((each, at): Line => [bold(at === 0 ? '?  ' : '   ', AMBER), run(each, AMBER)])];
}
export const moreLine = (n: number, t: Translate): Line[] => (n === 0 ? [] : [[dim(`…  ${t('an.more', { n })}`)]]);

/** A numbered thing to do: the file, and under it - or beside it, where there is room - what to do about it. */
function todoLines(answer: Conversation, t: Translate, w: number, airy: boolean): Line[] {
  const names = Math.max(...answer.todo.map((item) => cellsOf(clean(item.path) + placeOf(item, t))), 0);
  const says = Math.max(...answer.todo.map((item) => cellsOf(t('an.todo.' + item.kind))), 0);
  const beside = !airy && names + says + 6 <= w;
  return answer.todo.flatMap((item, at): Line[] => {
    const number = bold(String(at + 1), CORAL);
    if (beside) return [[number, run('  '), ...fit(fileRuns(item, t, names, true), names + 3), dim(t('an.todo.' + item.kind))]];
    return [...(airy && at > 0 ? [rule(w)] : []), [number, run('  '), ...fileRuns(item, t, w - 3, true)], ...wrap(t('an.todo.' + item.kind), w - 3).map((each): Line => [run('   '), dim(each)])];
  });
}
const warnLines = (answer: Conversation, t: Translate, w: number): Line[] =>
  answer.todo.some((item) => item.kind === 'keys') ? [BLANK, ...wrap(t('an.todo.warn'), w - 3).map((each, at): Line => [bold(at === 0 ? '!  ' : '   ', CORAL), run(each)])] : [];

/** What the strip is, in words: how many steps, and how many of them where the record or the card could not draw them all. */
function stripSaid(answer: Conversation, t: Translate, per: number): string {
  const { n, leftOut } = answer.steps;
  return (leftOut === 0 ? t('ch.strip', { n }) : t('ch.strip.cut', { n, total: n + leftOut })) + (per > 1 ? ` (${t('ch.strip.per', { n: per })})` : '');
}
function stripLines(answer: Conversation, t: Translate, w: number): Line[] {
  if (answer.steps.list.length === 0) return [];
  const { lines, per } = strip(answer.steps.list.map((step) => step.tone), w);
  return [...paragraph(stripSaid(answer, t, per), w, DIM), ...lines];
}

export function summary(answer: Conversation, t: Translate, w: number): Line[] {
  const { numbers } = answer;
  const each = (['read', 'changed', 'opened', 'name', 'stopped', 'unknown'] as const).filter((one) => numbers[one] > 0)
    .map((one): Tile => ({ title: t('an.n.' + one, { n: numbers[one] }), n: numbers[one], tone: toneOf(answer, one), mark: MARK[toneOf(answer, one)] }));
  const row = tiles([...each, ...(numbers.helpers === 0 ? [] : [{ title: t('an.n.helpers', { n: numbers.helpers }), n: numbers.helpers, tone: 'ink' as const, mark: '' }])], w);
  const ask = askOf(answer, t);
  return [
    ...paragraph(factOf(answer, t), w, undefined, true), ...(ask === '' ? [] : paragraph(ask, w, CORAL, true)), ...sizeLine(answer, t),
    ...(row.length === 0 ? [] : [BLANK, ...row]),
    ...(answer.steps.n === 0 ? [] : [BLANK, ...stripLines(answer, t, w)]),
    ...(answer.todo.length === 0 ? [] : [BLANK, heading([bold(t('an.tab.todo'))], answer.todo.length + answer.todoMore, w), ...todoLines(answer, t, w, false), ...moreLine(answer.todoMore, t), ...warnLines(answer, t, w)]),
    ...metLines(answer, t, w),
    ...notChecked(answer, t, w),
  ];
}

/** A read of what the person tracks asks for nothing, as the list draws it. */
const toneOf = (answer: Conversation, access: Access): Tone => (answer.look === 'allowed' && (access === 'read' || access === 'changed') ? 'sand' : TONE_OF_ACCESS[access]);
const MET_SHOWN = 6;
/** The private files there is nothing to do about, each with what happened to it: a number alone says nothing. */
function metLines(answer: Conversation, t: Translate, w: number): Line[] {
  const rest = [...answer.files];
  // Each thing to do is one file, named above; another of the same name is another file, and keeps its line.
  for (const item of answer.todo) {
    const own = rest.filter((file) => file.path === item.path && file.place === item.place);
    const found = own.find((file) => file.access === 'read') ?? own[0];
    if (found !== undefined) rest.splice(rest.indexOf(found), 1);
  }
  if (rest.length === 0) return [];
  const shown = rest.slice(0, MET_SHOWN);
  const names = Math.min(w - 6, Math.max(...shown.map((file) => cellsOf(clean(file.path) + placeOf(file, t)))));
  return [BLANK, heading([bold(t('an.tab.files'))], rest.length + answer.filesMore, w), ...shown.map((file): Line => {
    const tone = toneOf(answer, file.access);
    return [bold(file.access === 'opened' ? '◐' : MARK[tone], COLOUR[tone]), run('  '), ...fit(fileRuns(file, t, names), names), ...(names + 6 + cellsOf(t('ch.access.' + file.access)) <= w ? [run('   '), dim(t('ch.access.' + file.access))] : [])];
  }), ...moreLine(Math.max(0, rest.length - shown.length) + answer.filesMore, t)];
}

/** How much there was of it: every step of your AI and every file its report lists. */
const sizeLine = (answer: Conversation, t: Translate): Line[] => {
  const steps = answer.steps.n + answer.steps.leftOut;
  const said = [...(steps === 0 ? [] : [t('an.row.steps', { n: steps })]), ...(answer.all === 0 ? [] : [t('an.row.files', { n: answer.all })])].join(' · ');
  return said === '' ? [] : [[dim(said)]];
};

const NAMES_SHOWN = 4;
/** The files of a step that met several, by name: its sentence only counts them. */
function metNames(moment: Conversation['steps']['moments'][number], t: Translate, w: number): Line[] {
  const all = moment.met ?? [];
  if (all.length < 2) return [];
  const more = all.length - Math.min(NAMES_SHOWN, all.length) + (moment.metMore ?? 0);
  return flow([...all.slice(0, NAMES_SHOWN).map((file): Line => fileRuns(file, t, w).map((each) => ({ ...each, c: DIM }))), ...(more > 0 ? [[dim(t('an.more', { n: more }))]] : [])], ' · ', w);
}

export function steps(answer: Conversation, t: Translate, w: number): Line[] {
  const { steps: all } = answer;
  if (all.n === 0) return [[bold(t('an.steps.none'))], ...notChecked(answer, t, w)];
  const rail = run('│  ', HAIR);
  const airy = all.moments.length <= 6;
  const moments = all.moments.flatMap((moment, at): Line[] => {
    const place = moment.from === moment.to ? t('an.steps.one', { n: moment.from }) : t('an.steps.some', { from: moment.from, to: moment.to });
    const who = moment.helper === undefined ? '' : `${t('st.helper', { ordinal: moment.helper })}: `;
    const wide = w >= 58;
    const said = wrap(who + clean(moment.said), wide ? w - 5 - cellsOf(place) : w - 3);
    const lead = at === all.moments.length - 1 && all.momentsMore + all.ordinary + all.leftOut === 0 ? run('   ') : rail;
    return [
      ...said.map((each, row): Line => {
        const left: Line = row === 0 ? [markOf(moment.tone), run('  '), run(each)] : [lead, run(each)];
        return wide && row === 0 ? apart(left, [dim(place)], w) : left;
      }),
      ...(wide ? [] : [[lead, dim(place)]]),
      ...metNames(moment, t, w - 3).map((each): Line => [lead, ...each]),
      ...(moment.first === true ? wrap(t('an.steps.first'), w - 3).map((each): Line => [lead, run(each, CORAL)]) : []),
      ...(lead === rail && airy ? [[rail]] : []),
    ];
  });
  const rest = [
    ...(all.momentsMore === 0 ? [] : [t('an.more', { n: all.momentsMore })]),
    ...(all.ordinary === 0 ? [] : [t('an.steps.ordinary', { n: all.ordinary })]),
    ...(all.helperSteps === 0 ? [] : [t('an.steps.helpers', { n: all.helperSteps })]),
    ...(all.leftOut === 0 ? [] : [t('an.steps.left', { n: all.leftOut })]),
  ];
  // TK2: what of the ordinary steps is not known stands with them, in the colour of what is not known.
  const open = (all.notKnown ?? []).flatMap((each) => wrap(clean(each), w - 3).map((said, row): Line => [bold(row === 0 ? '?  ' : '   ', AMBER), run(said, AMBER)]));
  return [
    ...paragraph(t('an.steps.fact', { n: all.n + all.leftOut }), w, undefined, true), ...(all.reads === 0 ? [] : paragraph(t('an.steps.act', { n: all.reads }), w, CORAL, true)),
    BLANK, ...stripLines(answer, t, w).slice(all.leftOut === 0 && strip(all.list.map((step) => step.tone), w).per === 1 ? 1 : 0),
    ...(moments.length === 0 ? [] : [BLANK, ...moments]),
    ...(moments.length === 0 && rest.length > 0 ? [BLANK] : []),
    ...rest.flatMap((each) => wrap(each, w - 3).map((said, row): Line => [dim(row === 0 ? '·  ' : '   '), dim(said)])),
    ...open,
    ...notChecked(answer, t, w),
  ];
}

export function files(answer: Conversation, t: Translate, w: number): Line[] {
  if (answer.files.length === 0) return [...paragraph(t('an.files.none'), w, undefined, true), ...notChecked(answer, t, w)];
  const body = ACCESS.flatMap((access): Line[] => {
    const own = answer.files.filter((file) => file.access === access);
    if (own.length === 0) return [];
    const tone = TONE_OF_ACCESS[access];
    const heading: Line = [bold(access === 'opened' ? '◐' : MARK[tone], COLOUR[tone]), run('  '), bold(t('ch.count.' + access, { n: own.length }), COLOUR[tone]), run(' ')];
    const longest = Math.max(...own.map((file) => cellsOf(clean(file.path) + placeOf(file, t))));
    const across = Math.max(1, Math.min(own.length, Math.floor((w - 3 + 3) / (Math.min(longest, w - 3) + 3))));
    const column = Math.floor((w - 3 + 3) / across) - 3;
    const rows = Math.ceil(own.length / across);
    return [
      BLANK, [...heading, run('─'.repeat(Math.max(0, w - widthOf(heading))), HAIR)],
      ...Array.from({ length: rows }, (_, row): Line => [run('   '), ...Array.from({ length: across }, (_unused, at) => own[row * across + at]).flatMap((file, at): Run[] => (file === undefined ? [] : [...fit(fileRuns(file, t, column), at < across - 1 ? column + 3 : column)]))]),
    ];
  });
  return [...paragraph(t('an.files.fact', { n: answer.files.length + answer.filesMore }), w, undefined, true), ...body, ...(answer.filesMore === 0 ? [] : [BLANK, ...moreLine(answer.filesMore, t)]), ...notChecked(answer, t, w)];
}

/** One square a thing, as in the strip: pairs while they fit, then single ones, then each cell the strongest of several. */
function squares(tones: readonly Tone[], w: number): Line {
  const size = tones.length * 3 - 1 <= w ? 3 : tones.length * 2 - 1 <= w ? 2 : 1;
  const n = size === 1 ? Math.min(w, tones.length) : tones.length;
  return Array.from({ length: n }, (_, at): Run[] => {
    const tone = strongest(tones.slice(Math.floor((at * tones.length) / n), Math.floor(((at + 1) * tones.length) / n)));
    return [run(square(tone === 'grey', Math.max(1, size - 1)), tone === 'grey' ? HAIR : COLOUR[tone]), ...(size > 1 && at < n - 1 ? [run(' ')] : [])];
  }).flat();
}
/** An AI's files, the ones that matter most first. */
const byReach = (list: readonly FileOf[]): Tone[] => [...list].sort((a, b) => ACCESS.indexOf(a.access) - ACCESS.indexOf(b.access)).map((file) => TONE_OF_ACCESS[file.access]);
function box(title: string, colour: string | undefined, lit: boolean, rows: readonly Line[], size: number, down = false): Line[] {
  const line = lit && colour !== undefined ? colour : HAIR;
  const name = cut(title, size - 6);
  const mid = Math.floor((size - 2) / 2);
  const top = '─'.repeat(Math.max(0, size - cellsOf(name) - 5));
  const bottom = down ? '─'.repeat(mid) + '┬' + '─'.repeat(size - 3 - mid) : '─'.repeat(size - 2);
  return [
    [run('╭─ ', line), bold(name, colour), run(' ' + top + '╮', line)],
    ...rows.map((row): Line => [run('│ ', line), ...fit(row, size - 4), run(' │', line)]),
    [run('╰' + bottom + '╯', line)],
  ];
}
export const beside = (boxes: readonly Line[][], widths: readonly number[], gap: number): Line[] =>
  Array.from({ length: Math.max(...boxes.map((each) => each.length)) }, (_, row) => boxes.flatMap((each, at): Run[] => [...(at === 0 ? [] : [run(' '.repeat(gap))]), ...fit(each[row] ?? BLANK, widths[at] as number)]));

export function helpers(answer: Conversation, t: Translate, w: number): Line[] {
  const { numbers } = answer;
  const fact = numbers.helpers === 0 ? [] : paragraph(t('an.helpers.fact', { n: numbers.helpers }), w, undefined, true);
  if (answer.helpers.length === 0) return [...fact, ...paragraph(t('an.helpers.none'), w, fact.length === 0 ? undefined : DIM, fact.length === 0), ...notChecked(answer, t, w)];
  const noneMet = answer.helpers.every((helper) => helper.files.length === 0 && helper.unrecorded !== true) ? paragraph(t('an.helpers.none'), w, DIM) : [];
  /** A helper with no file says so: an empty box says neither none nor not known. */
  const without = (helper: Helper, size: number): Line[] => wrap(t(helper.unrecorded === true ? 'an.helper.empty' : 'an.helper.none'), size).map((each): Line => [dim(each)]);
  const quiet = Math.max(0, numbers.helpers - answer.helpers.length - answer.helpersMore);
  const toneOf = (helper: Helper): Tone => strongest(helper.files.map((file) => TONE_OF_ACCESS[file.access]));
  /** A file of a helper's; where it lies goes on a line of its own when both do not fit. */
  const fileLines = (file: FileOf, size: number): Line[] => {
    const mark = bold(file.access === 'opened' ? '◐' : MARK[TONE_OF_ACCESS[file.access]], COLOUR[TONE_OF_ACCESS[file.access]]);
    const whole = cellsOf(clean(file.path) + placeOf(file, t)) <= size - 2 || file.place === undefined;
    return whole ? [[mark, run(' '), ...fileRuns(file, t, size - 2)]] : [[mark, run(' '), ...fileRuns({ path: file.path }, t, size - 2)], [run('  '), dim(cut(placeOf(file, t).trim(), size - 2))]];
  };
  const mine = answer.mine ?? [];
  const mineTone = strongest(mine.map((file) => TONE_OF_ACCESS[file.access]));
  const mineLines = (size: number): Line[] => [...mine.slice(0, 3).flatMap((file) => fileLines(file, size)), ...(Math.max(0, mine.length - 3) + (answer.mineMore ?? 0) > 0 ? [[dim(`… ${t('an.more', { n: Math.max(0, mine.length - 3) + (answer.mineMore ?? 0) })}`)]] : [])];
  const lit = (tone: Tone): boolean => tone === 'coral' || tone === 'amber';
  const tonesOf = answer.steps.list.map((step) => step.tone);
  const stepsSaid = answer.steps.n === 0 ? '' : stripSaid(answer, t, 1);
  const most = Math.floor((w + 2) / 24);
  const tail: Line[] = [
    ...(answer.helpersMore + quiet === 0 ? [] : [BLANK]),
    ...moreLine(answer.helpersMore, t),
    ...(quiet === 0 ? [] : wrap(t('ch.diagram.others', { n: quiet }), w - 3).map((each, at): Line => [dim(at === 0 ? '·  ' : '   '), dim(each)])),
    ...notChecked(answer, t, w),
  ];
  if (answer.helpers.length <= most && w >= 58) {
    const gap = 2;
    const n = answer.helpers.length;
    const size = Math.min(64, Math.floor((w - gap * (n - 1)) / n));
    const span = size * n + gap * (n - 1);
    const inset = Math.floor((w - span) / 2);
    const inner = size - 4;
    const listed = answer.helpers.map((helper) => {
      const left = Math.max(0, helper.files.length - 3) + helper.filesMore;
      if (helper.files.length === 0) return without(helper, inner);
      return [...helper.files.slice(0, 3).flatMap((file) => fileLines(file, inner)), ...(left > 0 ? [[dim(`… ${t('an.more', { n: left })}`)]] : [])];
    });
    const tasks = answer.helpers.map((helper) => (helper.asked === undefined ? [] : wrap(t('tc.quote', { q: clean(helper.asked) }), inner, size < 28 ? 3 : 2).map((each): Line => [dim(each)])));
    const deep = (of: readonly (readonly Line[])[]): number => Math.max(...of.map((each) => each.length));
    const below = answer.helpers.map((helper, at) => {
      const tone = toneOf(helper);
      return box(t('st.helper', { ordinal: helper.helper }), tone === 'grey' ? undefined : COLOUR[tone], lit(tone), [
        squares(byReach(helper.files), inner),
        ...Array.from({ length: deep(tasks) }, (_, row) => tasks[at]?.[row] ?? BLANK), ...(deep(tasks) > 0 ? [BLANK] : []),
        ...Array.from({ length: deep(listed) }, (_, row) => listed[at]?.[row] ?? BLANK),
      ], size);
    });
    const main = Math.min(w, Math.max(36, tonesOf.length * 3 + 3 <= span ? tonesOf.length * 3 + 3 : Math.min(span, tonesOf.length * 2 + 3)));
    const top = box(t('ch.ai'), mineTone === 'grey' ? undefined : COLOUR[mineTone], lit(mineTone), [...(tonesOf.length === 0 ? [] : [squares(tonesOf, main - 4)]), ...(stepsSaid === '' ? [] : [[dim(cut(stepsSaid, main - 4))]]), ...mineLines(main - 4)], main, true);
    const at = inset + Math.floor(span / 2) - Math.floor(main / 2);
    const stem = at + 1 + Math.floor((main - 2) / 2);
    const feet = answer.helpers.map((_, each) => inset + each * (size + gap) + Math.floor(size / 2));
    const joint = Array.from({ length: w }, (_, x) => {
      const isFoot = feet.includes(x);
      const first = Math.min(feet[0] as number, stem);
      const last = Math.max(feet[feet.length - 1] as number, stem);
      if (x < first || x > last) return ' ';
      const up = x === stem;
      if (first === last) return '│';
      if (x === first) return up ? (isFoot ? '├' : '╰') : '╭';
      if (x === last) return up ? (isFoot ? '┤' : '╯') : '╮';
      return up && isFoot ? '┼' : up ? '┴' : isFoot ? '┬' : '─';
    }).join('').trimEnd();
    const arrows = Array.from({ length: w }, (_, x) => (feet.includes(x) ? '▼' : ' ')).join('').trimEnd();
    return [
      ...fact, ...noneMet, BLANK,
      ...top.map((line): Line => [run(' '.repeat(Math.max(0, at))), ...line]),
      [run(joint, HAIR)], [run(arrows, DIM)],
      ...beside(below, below.map(() => size), gap).map((line): Line => [run(' '.repeat(inset)), ...line]),
      ...tail,
    ];
  }
  // Too many for a row, or too narrow: the same flow as a tree.
  const branch = answer.helpers.flatMap((helper, at): Line[] => {
    const last = at === answer.helpers.length - 1;
    const rail = run(last ? '    ' : '│   ', HAIR);
    const tone = toneOf(helper);
    const inner = w - 4;
    return [
      [run('│', HAIR)],
      [run(last ? '╰─▸ ' : '├─▸ ', HAIR), bold(t('st.helper', { ordinal: helper.helper }), tone === 'grey' ? undefined : COLOUR[tone]), run('  '), ...squares(byReach(helper.files), Math.max(4, inner - 14))],
      ...(helper.asked === undefined ? [] : wrap(t('tc.quote', { q: clean(helper.asked) }), inner, 2).map((each): Line => [rail, dim(each)])),
      ...(helper.files.length === 0 ? without(helper, inner) : helper.files.flatMap((file) => fileLines(file, inner))).map((line): Line => [rail, ...line]),
      ...(helper.filesMore === 0 ? [] : [[rail, dim(`… ${t('an.more', { n: helper.filesMore })}`)]]),
    ];
  });
  return [...fact, ...noneMet, BLANK, [bold(t('ch.ai')), run('  '), ...squares(tonesOf, Math.min(36, w - cellsOf(t('ch.ai')) - 2))], ...(stepsSaid === '' ? [] : wrap(stepsSaid, w - 4).map((each): Line => [run('│   ', HAIR), dim(each)])), ...mineLines(w - 4).map((line): Line => [run('│   ', HAIR), ...line]), ...branch, ...tail];
}

export function todo(answer: Conversation, t: Translate, w: number): Line[] {
  if (answer.todo.length === 0) return [...paragraph(t('an.todo.none'), w, undefined, true), ...notChecked(answer, t, w)];
  return [...paragraph(t('an.todo.fact', { n: answer.todo.length + answer.todoMore }), w, undefined, true), BLANK, ...todoLines(answer, t, w, true), ...(answer.todoMore === 0 ? [] : [rule(w), ...moreLine(answer.todoMore, t)]), ...warnLines(answer, t, w), ...notChecked(answer, t, w)];
}
