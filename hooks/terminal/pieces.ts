// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Tone } from './answer.js';
import { AMBER, BLANK, bold, cellsOf, COLOUR, cut, DIM, dim, fit, flow, HAIR, MARK, run, square, widthOf, type Line, type Run } from './cells.js';

/** Numbers three rows tall: a 4 by 5 drawing, two of its rows to a cell, the half cell over it left empty. */
const DIGITS: readonly string[] = [
  '####.#..#.#..#.#..#.####', '.#.##..#..#.###', '####....#.####.#....####', '####....#..###....#.####', '#..#.#..#.####....#....#',
  '####.#....####....#.####', '####.#....####.#..#.####', '####....#....#....#....#', '####.#..#.####.#..#.####', '####.#..#.####....#.####',
];
/** A one is three wide, the others four and a gap between their rows of drawing. */
const pixel = (digit: string, x: number, y: number): boolean => y >= 0 && (DIGITS[Number(digit)] as string)[digit === '1' ? y * 3 + x : y * 5 + x] === '#';
export function digits(n: number): readonly [string, string, string] {
  const rows = [0, 1, 2].map((row) => [...String(n)].map((digit) => Array.from({ length: digit === '1' ? 3 : 4 }, (_, x) => {
    const up = pixel(digit, x, row * 2 - 1);
    const down = pixel(digit, x, row * 2);
    return up && down ? '█' : up ? '▀' : down ? '▄' : ' ';
  }).join('')).join(' '));
  return [rows[0] as string, rows[1] as string, rows[2] as string];
}

export interface Tile { readonly title: string; readonly n: number; readonly tone: Tone | 'ink'; readonly mark: string; }
const inkOf = (tone: Tone | 'ink'): string | undefined => (tone === 'ink' ? undefined : COLOUR[tone]);

/** A row of tiles, the title in each one's top line; on a narrow card the same numbers on a line. */
export function tiles(all: readonly Tile[], w: number): Line[] {
  const oneLine = (): Line[] => flow(all.map((each) => [bold(String(each.n), inkOf(each.tone)), run(' '), dim(each.title)]), '   ', w);
  if (all.length === 0) return [];
  if (w < 58) return oneLine();
  const gaps = all.length - 1;
  const least = all.map((each) => Math.max(cellsOf(each.title) + 5, digits(each.n)[0].length + 6, 12));
  const spare = w - gaps - least.reduce((a, b) => a + b, 0);
  if (spare < 0) return oneLine();
  const even = Math.floor((w - gaps) / all.length);
  const widths = least.every((each) => each <= even)
    ? all.map((_, at) => even + (at < (w - gaps) % all.length ? 1 : 0))
    : least.map((each, at) => each + Math.floor(spare / all.length) + (at < spare % all.length ? 1 : 0));
  const each = (draw: (tile: Tile, size: number) => Line): Line => all.flatMap((tile, at) => [...(at === 0 ? [] : [run(' ')]), ...draw(tile, widths[at] as number)]);
  return [
    each((tile, size) => [run('╭─ ', HAIR), dim(tile.title), run(' ' + '─'.repeat(size - cellsOf(tile.title) - 5) + '╮', HAIR)]),
    ...([0, 1, 2] as const).map((row) => each((tile, size) => [run('│', HAIR), ...fit([run('  '), bold(digits(tile.n)[row], inkOf(tile.tone))], size - 2), run('│', HAIR)])),
    each((_, size) => [run('╰' + '─'.repeat(size - 2) + '╯', HAIR)]),
  ];
}

const RANK: Readonly<Record<Tone, number>> = { coral: 6, sand: 5, amber: 4, blue: 3, mint: 2, grey: 0 };
export const strongest = (tones: readonly Tone[]): Tone => tones.reduce<Tone>((best, tone) => (RANK[tone] > RANK[best] ? tone : best), 'grey');

/** One square a step, in order; under them, what a run of them is, as a mark and its steps. */
export function strip(tones: readonly Tone[], w: number): { readonly lines: Line[]; readonly per: number; } {
  if (tones.length === 0) return { lines: [], per: 1 };
  const ROWS = 2;
  // As wide as the card leaves, short of a step so wide it is no square; past that, two cells a step and then several to one.
  const size = Math.max(2, Math.min(9, Math.floor((w + 1) / tones.length)));
  const across = Math.max(1, Math.floor((w + 1) / size));
  const per = Math.ceil(tones.length / (across * ROWS));
  const drawn = per === 1 ? [...tones] : Array.from({ length: Math.ceil(tones.length / per) }, (_, at) => strongest(tones.slice(at * per, at * per + per)));
  const lines: Line[] = [];
  for (let from = 0; from < drawn.length; from += across) {
    const part = drawn.slice(from, from + across);
    lines.push(part.flatMap((tone, at): Run[] => [run(square(tone === 'grey', size - 1), tone === 'grey' ? HAIR : COLOUR[tone]), ...(at < part.length - 1 ? [run(' ')] : [])]));
    const under: Run[] = [];
    for (let at = 0; at < part.length;) {
      const tone = part[at] as Tone;
      let end = at + 1;
      while (end < part.length && part[end] === tone) end += 1;
      const cells = (end - at) * size - 1;
      // Squares may stand for several steps: the steps said are the ones that have this look.
      const first = tones.indexOf(tone, (from + at) * per) + 1;
      const last = tones.lastIndexOf(tone, Math.min((from + end) * per, tones.length) - 1) + 1;
      const said = `${MARK[tone]} ${first === last ? first : `${first}–${last}`}`;
      const shown = tone === 'grey' ? ' '.repeat(cells)
        : cells >= cellsOf(said) + 4 ? `╰${'─'.repeat(Math.floor((cells - cellsOf(said) - 4) / 2))} ${said} ${'─'.repeat(Math.ceil((cells - cellsOf(said) - 4) / 2))}╯`
        : Array.from({ length: end - at }, () => MARK[tone].padEnd(size)).join('').slice(0, cells);
      under.push(run(shown + (end < part.length ? ' ' : ''), COLOUR[tone]));
      at = end;
    }
    if (part.some((tone) => tone !== 'grey')) lines.push(under);
  }
  return { lines, per };
}

export interface Share { readonly n: number; readonly colour: string; readonly ink: string | undefined; readonly says: readonly string[]; }
/** Cells to each, at least `least` for what is not nothing, all of `w` used. */
export function shares(numbers: readonly number[], w: number, least: number): number[] {
  const total = numbers.reduce((a, b) => a + b, 0);
  const out = numbers.map((n) => (n === 0 ? 0 : least));
  const spare = w - out.reduce((a, b) => a + b, 0);
  if (total === 0 || spare <= 0) return out;
  const exact = numbers.map((n, at) => Math.max(0, (n / total) * w - (out[at] as number)));
  const sum = exact.reduce((a, b) => a + b, 0);
  const given = exact.map((each) => Math.floor((each / sum) * spare));
  let rest = spare - given.reduce((a, b) => a + b, 0);
  const order = exact.map((each, at) => ({ at, part: (each / sum) * spare - (given[at] as number) })).sort((a, b) => b.part - a.part);
  for (const { at } of order) { if (rest <= 0) break; if ((numbers[at] as number) > 0) { given[at] = (given[at] as number) + 1; rest -= 1; } }
  return out.map((each, at) => each + (given[at] as number));
}
/** One bar of everything, what each part is written inside it. */
export function proportion(all: readonly Share[], w: number, tall: boolean): Line[] {
  const some = all.filter((each) => each.n > 0);
  if (some.length === 0) return [];
  const least = some.length * 7 <= w ? 6 : some.length * 4 <= w ? 3 : 1;
  const widths = shares(some.map((each) => each.n), w - (some.length - 1), least);
  const row = (draw: (share: Share, size: number) => Run): Line => some.flatMap((share, at) => [...(at === 0 ? [] : [run(' ')]), draw(share, widths[at] as number)]);
  const label = (share: Share, size: number): string => {
    const said = share.says.find((each, at) => cellsOf(each) + (at === 0 ? 2 : 0) <= size) ?? '';
    const before = cellsOf(said) + 2 <= size ? 1 : 0;
    return ' '.repeat(before) + said + ' '.repeat(Math.max(0, size - before - cellsOf(said)));
  };
  // What asks for nothing has no colour of its own to stand on: it is drawn low, as its squares are.
  const middle = row((share, size) => (share.ink === undefined ? { s: label(share, size), c: DIM, b: true } : { s: label(share, size), c: share.ink, bg: share.colour, b: true }));
  return tall ? [row((share, size) => run((share.ink === undefined ? ' ' : '▄').repeat(size), share.colour)), middle, row((share, size) => run((share.ink === undefined ? '▂' : '▀').repeat(size), share.colour))] : [middle];
}

/** A thin line of how much has been read so far. */
export function progress(read: number, of: number, w: number): Line {
  const done = Math.max(read > 0 ? 1 : 0, Math.min(w, Math.round((read / of) * w)));
  return [run('━'.repeat(done), AMBER), run('─'.repeat(w - done), HAIR)];
}

interface Card { readonly accent: string | undefined; readonly where: string; readonly range?: string; readonly ask?: ((room: number) => string) | undefined; readonly body: Line[]; }

/** The one frame: what it is about in its top line, what can be asked next in its bottom one. A narrow card has no sides. */
export function frame(card: Card, w: number): Line[] {
  const colour = card.accent ?? HAIR;
  const walls = w >= 60;
  const title: Line = [bold(' agentwhy ', card.accent), dim('· ' + card.where + ' ')];
  const right = card.range === undefined || widthOf(title) + cellsOf(card.range) + 10 > w ? undefined : ` ${card.range} `;
  const top = (inner: number): Line => {
    const left = fit(title, Math.min(widthOf(title), inner - 2));
    return [...left, run('─'.repeat(Math.max(0, inner - widthOf(left) - (right === undefined ? 0 : cellsOf(right) + 1))), colour), ...(right === undefined ? [] : [dim(right), run('─', colour)])];
  };
  const foot = (inner: number): Line => {
    const said = card.ask === undefined ? '' : cut(card.ask(inner - 5), inner - 5);
    const from = said.search(/[„“]/);
    const line: Line = said === '' ? [] : [dim(' ' + (from < 0 ? said : said.slice(0, from))), ...(from < 0 ? [] : [run(said.slice(from))]), run(' ')];
    return [...line, run('─'.repeat(Math.max(0, inner - widthOf(line))), colour)];
  };
  if (!walls) {
    const under: Line[] = card.range === undefined || right !== undefined ? [] : [[dim(card.range)], BLANK];
    return [[run('──', colour), ...top(w - 2)], BLANK, ...under, ...card.body, BLANK, [run('──', colour), ...foot(w - 2)]];
  }
  const side = run('│', colour);
  const inside = (line: Line): Line => [side, run('  '), ...fit(line, w - 6), run('  '), side];
  return [[run('╭─', colour), ...top(w - 3), run('╮', colour)], inside(BLANK), ...card.body.map(inside), inside(BLANK), [run('╰─', colour), ...foot(w - 3), run('╯', colour)]];
}
/** How wide the inside of a card of this width is. */
export const roomOf = (w: number): number => (w >= 60 ? w - 6 : w);
