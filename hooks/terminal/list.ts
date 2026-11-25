// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { ACCESS, GROUPS, PROVIDERS, type Access, type Group, type Kind, type Lang, type List, type Row, type Tone } from './answer.js';
import type { Translate } from './words.js';
import { CORAL, MINT, AMBER, apart, BLANK, BLUE, bold, cellsOf, clean, COLOUR, cut, DIM, dim, fit, flow, HAIR, MARK, ON, paragraph, rule, run, widthOf, wrap, type Line, type Run } from './cells.js';
import { digits, progress, proportion, shares, type Share } from './pieces.js';
import { fileRuns, LOOK_MARK, LOOK_TONE, moreLine, placeOf, TONE_OF_ACCESS } from './conversation.js';
import { nameWidth, table, tableWidth, type Column, type TableRow } from './table.js';

const GROUP_TONE: Readonly<Record<Group, Tone>> = { attention: 'coral', fixed: 'mint', tracked: 'sand', stopped: 'mint', seen: 'blue', none: 'grey', partly: 'amber', failed: 'amber' };
const GROUP_MARK: Readonly<Record<Group, string>> = { attention: '!', fixed: '●', tracked: '✓', stopped: '■', seen: '○', none: '·', partly: '?', failed: '?' };

export const whereOf = (answer: List, t: Translate): string => t(answer.scope === 'project' ? 'an.where.project' : 'an.where.' + (answer.list ?? 'computer'));
export function rangeOf(answer: List, t: Translate): string {
  const days = /^(\d{1,4})d$/.exec(answer.asked)?.[1];
  return days === undefined ? t('an.since', { asked: clean(answer.asked) }) : t('an.days', { n: Number(days) });
}
const isPartWay = (answer: List): boolean => answer.checked.read < answer.checked.of;
const isCalm = (answer: List): boolean => answer.groups.attention === 0 && answer.groups.partly === 0 && answer.groups.failed === 0 && !isPartWay(answer) && answer.reading !== true;
/** The frame's colour: what asks to act, then what is not known; a list of one group has that group's. */
export function listAccent(answer: List, kind: Kind): string | undefined {
  if (answer.checked.read === 0) return isPartWay(answer) ? AMBER : undefined;
  if (kind === 'attention' || kind === 'tracked' || kind === 'stopped') return answer.groups[kind] > 0 ? COLOUR[GROUP_TONE[kind]] : isPartWay(answer) ? AMBER : undefined;
  if (kind === 'often') {
    if (answer.often.some((row) => row.read + row.changed > 0 && !row.tracked)) return CORAL;
    return isPartWay(answer) || answer.groups.partly + answer.groups.failed > 0 || answer.often.some((row) => row.unknown > 0) ? AMBER : answer.often.some((row) => row.stopped > 0) ? MINT : undefined;
  }
  return answer.groups.attention > 0 ? CORAL : answer.groups.partly + answer.groups.failed > 0 || isPartWay(answer) ? AMBER : undefined;
}

export const partWay = (answer: List, t: Translate, w: number): Line[] =>
  !isPartWay(answer) ? (answer.reading === true ? [BLANK, ...paragraph(t('an.again'), w, AMBER)] : []) : [BLANK, progress(answer.checked.read, answer.checked.of, w), ...paragraph(t('an.checked', { read: answer.checked.read, of: answer.checked.of }), w, AMBER)];

export function okay(answer: List, t: Translate, w: number): Line[] {
  const { groups, checked } = answer;
  const part = isPartWay(answer);
  const act = groups.attention > 0 ? t('an.okay.act', { n: groups.attention }) : isCalm(answer) ? t('an.okay.calm') : '';
  const wide = w >= 58;
  const number = digits(groups.attention > 0 ? groups.attention : checked.read);
  // A number too long for a third of the card is left to the sentence beside it.
  const big = !part && number[0].length <= w / 3 ? number : (['', '', ''] as const);
  const colour = groups.attention > 0 ? CORAL : undefined;
  const beside = big[0] === '' ? 0 : big[0].length + 4;
  // From some of the conversations, what is counted is of those: that comes first, and no number of them stands for all.
  const told = [...wrap(part ? t('an.checked', { ...checked }) : t('an.okay.fact', { n: checked.read }), w - beside).map((each) => bold(each, part ? AMBER : undefined)), ...(act === '' ? [] : wrap(act, w - beside).map((each) => bold(each, colour)))];
  const lead: Line[] = Array.from({ length: beside === 0 ? told.length : Math.max(3, told.length) }, (_, row): Line => [...(beside === 0 ? [] : [bold((big[row] ?? '').padEnd(beside), colour)]), ...(told[told.length === 1 && beside > 0 ? row - 1 : row] === undefined ? [] : [told[told.length === 1 && beside > 0 ? row - 1 : row] as Run])]);
  const some = GROUPS.filter((group) => groups[group] > 0);
  const bar = some.length < 2 ? [] : proportion(some.map((group): Share => {
    const tone = GROUP_TONE[group];
    const n = String(groups[group]);
    return { n: groups[group], colour: tone === 'grey' ? HAIR : COLOUR[tone], ink: tone === 'grey' ? undefined : ON, says: [`${n} ${t('an.g.' + group)}`, `${GROUP_MARK[group]} ${n}`, n, GROUP_MARK[group]] };
  }), w, wide);
  const digitsWide = Math.max(...some.map((group) => String(groups[group]).length), 1);
  const next: Partial<Record<Group, string>> = { attention: t('tc.q.attention'), tracked: t('tc.q.tracked'), stopped: t('tc.q.stopped') };
  const asks = Math.max(...some.map((group) => (next[group] === undefined ? 0 : cellsOf(t('tc.quote', { q: next[group] as string })))));
  const rows = some.flatMap((group): Line[] => {
    const tone = GROUP_TONE[group];
    const number: Line = [run(' '.repeat(digitsWide - String(groups[group]).length)), bold(String(groups[group]), tone === 'grey' ? undefined : COLOUR[tone]), run('  '), bold(GROUP_MARK[group], COLOUR[tone]), run('  ')];
    const label = t('an.g.' + group);
    const asked = wide && next[group] !== undefined ? [dim(t('tc.quote', { q: next[group] as string }).padEnd(asks))] : [];
    if (cellsOf(label) + digitsWide + 5 > w) return wrap(label, w - digitsWide - 5).map((each, row): Line => [...(row === 0 ? number : [run(' '.repeat(digitsWide + 5))]), run(each)]);
    return [apart([...number, run(label)], asked, w)];
  });
  return [...(part ? [progress(checked.read, checked.of, w)] : []), ...lead, BLANK, ...bar, ...(bar.length === 0 ? [] : [BLANK]), ...rows, ...(part ? [] : partWay(answer, t, w)), BLANK, ...paragraph(t('an.covers'), w, DIM)];
}

/** Where a day is said: today and yesterday as words, any other as the language writes a day. */
function dayOf({ day, relative }: Pick<Row, 'day' | 'relative'>, lang: Lang, t: Translate): string {
  if (relative !== undefined) return t('an.' + relative);
  const month = t('tc.month.' + day.month);
  return lang === 'en' ? `${month} ${day.day}` : lang === 'de' ? `${day.day}. ${month}` : `${day.day} ${month}`;
}

/** Where it was held, as the page's badge says it. The card stands in Claude Code: only another AI is named beside the place. */
function heldOf(row: Row, t: Translate): string {
  const place = row.held === undefined ? '' : t('held.' + row.held);
  return row.provider !== 'claude-code' ? PROVIDERS[row.provider] + (place === '' ? '' : ` · ${place}`) : place === '' ? PROVIDERS['claude-code'] : place;
}
/** TK2: a record that is not whole, or was not read: what it holds nothing of is not known to be nothing. */
const isUnsure = (row: Row): boolean => row.group === 'partly' || row.group === 'failed';
/** Nothing private, as its look says already. */
const isBare = (row: Row): boolean => !isUnsure(row) && ACCESS.every((how) => row.files[how] === 0);
const titleOf = (row: Row, t: Translate): string => (clean(row.title ?? '') === '' ? t('an.untitled') : clean(row.title as string));
const timeOf = (row: Row): string => clean(row.time).slice(0, 5);

/** Its private files, each how many in its words: every way that happened to one, and none left out. */
function privateOf(row: Row, t: Translate): Line[] {
  const said = ACCESS.filter((how) => row.files[how] > 0).map((how: Access): Line => {
    const tone = row.look === 'allowed' && (how === 'read' || how === 'changed') ? 'sand' : TONE_OF_ACCESS[how];
    return [bold(String(row.files[how]), COLOUR[tone]), run(' '), dim(t('an.n.' + how, { n: row.files[how] }))];
  });
  return said.length > 0 ? said : [[isUnsure(row) ? bold('?', AMBER) : dim('–')]];
}
/** What happened, as the page's own words: a thing to act on stands on its own colour. */
function lookOf(row: Row, t: Translate, w: number): Line {
  const tone = LOOK_TONE[row.look];
  const said = cut(t('look.' + row.look), w - 4);
  if (row.group === 'attention') return [{ s: ` ${LOOK_MARK[row.look]} ${said} `, c: ON, b: true, bg: COLOUR[tone] }];
  return [run(' '), bold(LOOK_MARK[row.look], COLOUR[tone]), run(` ${said}`, tone === 'grey' ? DIM : COLOUR[tone])];
}
const numberOf = (n: number | undefined, unsure: boolean): Line => [n !== undefined && n > 0 ? run(String(n)) : unsure ? bold('?', AMBER) : dim('–')];

/** The rows under their days: each day a part of its own. */
function byDay(rows: readonly Row[], lang: Lang, t: Translate, airy: boolean, cells: (row: Row) => readonly (readonly Line[])[]): TableRow[] {
  return rows.flatMap((row, at): TableRow[] => {
    const before = rows[at - 1];
    const same = before !== undefined && before.day.year === row.day.year && before.day.month === row.day.month && before.day.day === row.day.day;
    return [...(same ? [] : [{ part: dayOf(row, lang, t) }]), { cells: cells(row), ...(same && airy ? { apart: true } : {}) }];
  });
}

const TITLE_ROOM = 44;
/** Everything in a column of its own, where the terminal has the room. */
function wideTable(rows: readonly Row[], lang: Lang, t: Translate, w: number): Line[] | undefined {
  const column = (key: string, wide: number, right = false): Column => ({ name: t('an.col.' + key), width: Math.max(wide, nameWidth(t('an.col.' + key))), ...(right ? { right } : {}) });
  const most = (of: (row: Row) => number): number => Math.max(...rows.map(of), 0);
  const when = column('when', Math.max(5, most((row) => cellsOf(dayOf(row, lang, t)))) + 1);
  const where = column('where', most((row) => cellsOf(heldOf(row, t))));
  const look = column('look', most((row) => cellsOf(t('look.' + row.look))) + 4);
  const all = column('all', most((row) => String(row.all ?? 0).length), true);
  const helpers = column('helpers', most((row) => String(row.helpers).length), true);
  // The titles come first: the files' words take what they leave, on one line where it is enough.
  const spare = w - tableWidth([when, where, look, all, helpers, { width: TITLE_ROOM }, { width: 0 }]);
  const held = column('private', Math.min(Math.max(34, spare), most((row) => privateOf(row, t).reduce((sum, each, at) => sum + widthOf(each) + (at === 0 ? 0 : 3), 0))));
  const others = [when, where, look, held, all, helpers];
  const title = { name: t('an.col.title'), width: w - tableWidth([...others, { width: 0 }]) };
  if (title.width < 30) return undefined;
  return table([when, title, where, look, held, all, helpers], byDay(rows, lang, t, false, (row) => [
    [[dim(timeOf(row))]], titleCell(row, t, title.width), [[dim(heldOf(row, t))]], [lookOf(row, t, look.width)], flow(privateOf(row, t), ' · ', held.width), [numberOf(row.all, isUnsure(row))], [numberOf(row.helpers, false)],
  ]));
}
const titleCell = (row: Row, t: Translate, w: number): Line[] =>
  [...wrap(titleOf(row, t), w, 4).map((each): Line => [run(each, undefined, row.group === 'attention')]), ...(row.project === undefined ? [] : [[dim(cut(clean(row.project), w))]])];

/** Where it was held and what it counts, in words on one line or more. */
function underOf(row: Row, t: Translate, w: number): Line[] {
  return flow([heldOf(row, t), ...(row.all === undefined || row.all === 0 ? [] : [t('an.row.files', { n: row.all })]), ...(row.helpers === 0 ? [] : [`${row.helpers} ${t('an.n.helpers', { n: row.helpers })}`])].map((each): Line => [dim(each)]), ' · ', w);
}

/** Three columns, the rest of each row under what it belongs to. */
function narrowTable(rows: readonly Row[], lang: Lang, t: Translate, w: number): Line[] {
  const when = { name: t('an.col.when'), width: Math.max(5, cellsOf(t('an.col.when')), ...rows.map((row) => cellsOf(dayOf(row, lang, t)))) + 1 };
  const look = { name: t('an.col.look'), width: Math.min(Math.floor(w * 0.42), Math.max(cellsOf(t('an.col.look')), ...rows.map((row) => cellsOf(t('look.' + row.look)) + 4), 24)) };
  const title = { name: t('an.col.title'), width: w - tableWidth([when, look, { width: 0 }]) };
  return table([when, title, look], byDay(rows, lang, t, true, (row) => [
    [[dim(timeOf(row))]], [...titleCell(row, t, title.width), ...underOf(row, t, title.width)], [lookOf(row, t, look.width), ...(isBare(row) ? [] : flow(privateOf(row, t), ' · ', look.width - 1)).map((each): Line => [run(' '), ...each])],
  ]));
}

/** TK2: the conversations that could not be checked, or not fully, beside any list that is not of them. */
const unsure = (answer: List, t: Translate, w: number): Line[] => (['partly', 'failed'] as const).filter((group) => answer.groups[group] > 0)
  .flatMap((group) => wrap(`${answer.groups[group]} ${t('an.g.' + group)}`, w - 3).map((said, row): Line => [bold(row === 0 ? '?  ' : '   ', AMBER), run(said, AMBER)]));

/** The conversations a list names, and how many more there are: the newest, or the newest of one group. */
export function rowsOf(answer: List, kind: Kind): { readonly rows: readonly Row[]; readonly rest: number } {
  if (kind !== 'attention' && kind !== 'tracked' && kind !== 'stopped') return { rows: answer.rows.slice(0, answer.recent), rest: answer.rowsMore };
  const rows = answer.rows.filter((row) => row.group === kind);
  return { rows, rest: Math.max(0, answer.groups[kind] - rows.length) };
}

/** Where a table has no room: each conversation on lines of its own, under its day. */
function listed(rows: readonly Row[], lang: Lang, t: Translate, w: number): Line[] {
  return byDay(rows, lang, t, false, () => []).reduce<{ readonly lines: Line[]; readonly at: number }>(({ lines, at }, one) => {
    if ('part' in one) return { lines: [...lines, ...(lines.length === 0 ? [] : [BLANK]), [bold(one.part), run(' ' + '─'.repeat(Math.max(0, w - cellsOf(one.part) - 1)), HAIR)]], at };
    const row = rows[at] as Row;
    const room = Math.max(8, w - 7);
    const said = [...titleCell(row, t, room), fit(lookOf(row, t, room), Math.min(room, cellsOf(t('look.' + row.look)) + 4)), ...(isBare(row) ? [] : flow(privateOf(row, t), ' · ', room - 1)).map((each): Line => [run(' '), ...each]), ...underOf(row, t, room)];
    return { lines: [...lines, ...said.map((each, index): Line => [index === 0 ? dim(timeOf(row).padEnd(7)) : run(' '.repeat(7)), ...each])], at: at + 1 };
  }, { lines: [], at: 0 }).lines;
}

export function conversations(answer: List, kind: Kind, lang: Lang, t: Translate, w: number): Line[] {
  const { rows, rest: more } = rowsOf(answer, kind);
  const all = kind === 'conversations';
  const counted = t('an.rows.n', { n: all ? answer.checked.read : answer.groups[kind as Group] });
  const drawn = w >= 76 ? wideTable(rows, lang, t, w) ?? narrowTable(rows, lang, t, w) : listed(rows, lang, t, w);
  return [
    ...(cellsOf(t('an.rows.' + kind)) + cellsOf(counted) + 5 <= w ? [apart([bold(t('an.rows.' + kind))], [dim(counted)], w)] : paragraph(t('an.rows.' + kind), w, undefined, true)), BLANK,
    ...(rows.length === 0 && more === 0 ? paragraph(t('an.rows.none'), w, DIM) : rows.length === 0 ? [] : drawn),
    ...(more > 0 ? [BLANK, ...moreLine(more, t)] : answer.groups.partly + answer.groups.failed > 0 ? [BLANK] : []),
    ...unsure(answer, t, w), ...partWay(answer, t, w), BLANK, ...paragraph(t('an.titles'), w, DIM),
  ];
}

export function often(answer: List, t: Translate, w: number): Line[] {
  const named: Line[] = answer.namedOnly === 0 ? [] : wrap(t('an.often.named', { n: answer.namedOnly }), w - 3).map((each, at): Line => [bold(at === 0 ? '○  ' : '   ', BLUE), dim(each)]);
  if (answer.often.length === 0) return [...paragraph(t('an.often.none'), w, undefined, true), ...(named.length === 0 ? [] : [BLANK, ...named]), ...unsure(answer, t, w), ...partWay(answer, t, w)];
  const wide = w >= 58;
  const most = Math.max(...answer.often.map((row) => row.wanted + row.named), 1) * 1.02;
  const number = Math.max(...answer.often.map((row) => String(row.wanted).length));
  const left = wide ? Math.min(Math.floor(w * 0.34), Math.max(...answer.often.map((row) => Math.max(cellsOf(clean(row.path) + placeOf(row, t)), cellsOf(t('an.often.in', { n: row.conversations })) + (row.tracked ? cellsOf(t('an.often.track')) + 3 : 0) + (row.project === undefined ? 0 : cellsOf(clean(row.project)) + 3)))) + 3) : 0;
  const bar = w - left - number - 2;
  const body = answer.often.flatMap((row, at): Line[] => {
    const parts = ([['read', row.tracked ? 'sand' : 'coral'], ['changed', row.tracked ? 'sand' : 'coral'], ['opened', 'blue'], ['stopped', 'mint'], ['unknown', 'amber'], ['named', 'blue']] as const).filter(([what]) => row[what] > 0);
    const reached = parts.filter(([what]) => what !== 'named');
    const cells = Math.max(reached.length, Math.round((row.wanted / most) * bar));
    const seen = row.named === 0 ? 0 : Math.min(bar - cells - 1, Math.max(1, Math.round((row.named / most) * bar)));
    const widths = shares(reached.map(([what]) => row[what]), cells, 1);
    const drawn: Line = fit([...reached.map(([what, tone], index) => run((what === 'opened' ? '▓' : '█').repeat(widths[index] as number), COLOUR[tone])), ...(seen > 0 ? [run(' '), run('▂'.repeat(seen), BLUE)] : []), run('░'.repeat(Math.max(0, bar - cells - (seen > 0 ? seen + 1 : 0))), HAIR)], bar);
    const total: Line = [run(' '.repeat(2 + number - String(row.wanted).length)), bold(String(row.wanted))];
    const said: Line[] = parts.map(([what, tone]): Line => [bold(what === 'opened' ? '◐' : MARK[tone], COLOUR[tone]), run(` ${row[what]} `), dim(t('an.o.' + what))]);
    const times = [t('an.often.in', { n: row.conversations }), ...(row.tracked ? [t('an.often.track')] : [])];
    if (wide) {
      const each = [...(row.project === undefined ? [] : [cut(clean(row.project), left - 2)]), ...times];
      let here = 1;
      while (here < each.length && cellsOf(each.slice(0, here + 1).join(' · ')) <= left - 2) here += 1;
      const where = each.slice(0, here).join(' · ');
      const under = flow([...said, ...each.slice(here).map((one): Line => [dim(one)])], '   ', w - left);
      return [
        ...(at === 0 ? [] : [rule(w)]),
        [...fit(fileRuns(row, t, left - 2, true), left), ...drawn, ...total],
        ...under.map((line, index): Line => [...fit(index === 0 ? [dim(cut(where, left - 2))] : BLANK, left), ...line]),
      ];
    }
    const whole = [...(row.project === undefined ? [] : [clean(row.project)]), ...times].join(' · ');
    const name = fileRuns(row, t, w, true);
    const together = widthOf(name) + cellsOf(whole) + 3 <= w;
    return [...(at === 0 ? [] : [rule(w)]), together ? apart(name, [dim(whole)], w) : name, ...(together ? [] : wrap(whole, w).map((each): Line => [dim(each)])), [...drawn, ...total], ...flow(said, '  ', w)];
  });
  return [
    apart([bold(t('an.often.fact'))], wide ? [dim(t('an.tab.often').toLowerCase())] : [], w), BLANK, ...body,
    ...(answer.oftenMore + named.length === 0 ? [] : [rule(w)]), ...moreLine(answer.oftenMore, t), ...named, ...unsure(answer, t, w),
    ...partWay(answer, t, w), BLANK, ...paragraph(t('an.often.counted'), w, DIM),
  ];
}
