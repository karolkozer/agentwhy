// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Tone } from './answer.js';

/** The accents are `tokens.ts`'s; ink and the greys are the terminal's own, so a light terminal stays readable. */
export const CORAL = '#f8906f', MINT = '#6dd3a6', BLUE = '#8fb7de', SAND = '#f4ad5e', AMBER = '#f6b53d';
export const DIM = 'inactive', HAIR = 'subtle', ON = '#1c0f0a';
export const COLOUR: Readonly<Record<Tone, string>> = { coral: CORAL, sand: SAND, amber: AMBER, blue: BLUE, mint: MINT, grey: DIM };
/** The same without colour. */
export const MARK: Readonly<Record<Tone, string>> = { coral: '●', sand: '✓', amber: '?', blue: '○', mint: '■', grey: '·' };

/** A step or a conversation as a square. One that asks for nothing is drawn low: a terminal's own grey may be as bright as a colour. */
export const square = (grey: boolean, n: number): string => (grey ? '▂' : '▇').repeat(n);

export interface Run { readonly s: string; readonly c?: string | undefined; readonly b?: boolean; readonly bg?: string | undefined; }
export type Line = readonly Run[];
export const run = (s: string, c?: string, b = false): Run => ({ s, c, b });
export const dim = (s: string): Run => run(s, DIM);
export const bold = (s: string, c?: string): Run => run(s, c, true);
export const BLANK: Line = [];

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{20000}-\u{3fffd}]/u;
const cellOf = (char: string): number => (/\p{M}/u.test(char) ? 0 : WIDE.test(char) ? 2 : 1);

/** Words from a record as one plain line: no control or direction character, no emoji, a letter and its accent one cell. */
export function clean(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').replace(/[\p{C}︎️]/gu, '').replace(/(?![©®™])\p{Extended_Pictographic}|[\u{1f1e6}-\u{1f1ff}\u{1f3fb}-\u{1f3ff}⃣]/gu, '').replace(/ {2,}/g, ' ').trim();
}
export const cellsOf = (text: string): number => { let n = 0; for (const char of text) n += cellOf(char); return n; };
export const widthOf = (line: Line): number => line.reduce((sum, each) => sum + cellsOf(each.s), 0);

function head(text: string, w: number): string {
  let out = '';
  let n = 0;
  for (const char of text) { n += cellOf(char); if (n > w) break; out += char; }
  return out;
}
export function tail(text: string, w: number): string {
  let out = '';
  let n = 0;
  for (const char of [...text].reverse()) { n += cellOf(char); if (n > w) break; out = char + out; }
  return out;
}
export const cut = (text: string, w: number): string => (cellsOf(text) <= w ? text : w <= 0 ? '' : head(text, w - 1).trimEnd() + '…');
/** A path keeps its end: the file's name says more than the folder. */
export function cutPath(path: string, w: number): string {
  if (cellsOf(path) <= w) return path;
  const name = path.slice(path.lastIndexOf('/') + 1);
  const start = path.slice(0, path.length - name.length);
  const room = w - cellsOf(name) - 2;
  if (start !== '' && room >= 1) return head(start, room) + '…/' + name;
  if (start !== '' && cellsOf(name) + 2 <= w) return '…/' + name;
  return w <= 1 ? '…'.slice(0, w) : w < 10 ? cut(name, w) : head(name, Math.ceil((w - 1) / 2)) + '…' + tail(name, Math.floor((w - 1) / 2));
}
export function fit(line: Line, w: number): Line {
  const n = widthOf(line);
  if (n === w) return line;
  if (n < w) return [...line, run(' '.repeat(w - n))];
  const out: Run[] = [];
  let left = w;
  for (const each of line) {
    const size = cellsOf(each.s);
    if (size < left || (size === left && each === line[line.length - 1])) { out.push(each); left -= size; continue; }
    const part = head(each.s, left - 1);
    out.push({ ...each, s: part + '…' });
    left -= cellsOf(part) + 1;
    break;
  }
  return left > 0 ? [...out, run(' '.repeat(left))] : out;
}
/** What stands at the left and what stands at the right, the left giving way. */
export function apart(left: Line, right: Line, w: number): Line {
  const r = widthOf(right);
  return r === 0 || r + 4 > w ? fit(left, w) : [...fit(left, w - r - 1), run(' '), ...right];
}
/** Words on as many lines as they need, broken between words; a word too long is cut. */
export function wrap(text: string, w: number, most = 6): string[] {
  const out: string[] = [];
  let now = '';
  for (const word of text.split(' ')) {
    const next = now === '' ? word : `${now} ${word}`;
    if (cellsOf(next) <= w) { now = next; continue; }
    if (now !== '') out.push(now);
    now = cellsOf(word) <= w ? word : cutPath(word, w);
  }
  if (now !== '') out.push(now);
  return out.length <= most ? out : [...out.slice(0, most - 1), cut(out.slice(most - 1).join(' '), w)];
}
export const paragraph = (text: string, w: number, c?: string, b = false, most = 6): Line[] => wrap(text, w, most).map((each) => [run(each, c, b)]);
export const rule = (w: number): Line => [run('─'.repeat(Math.max(0, w)), HAIR)];
/** A part's name set into a hairline, how many are in it at its end. */
export const heading = (name: Line, n: number, w: number): Line => { const end = ` ${n}`; return [...name, run(' ' + '─'.repeat(Math.max(0, w - widthOf(name) - 1 - end.length)), HAIR), dim(end)]; };
/** Things of one row, on as many rows as they need, none cut in two. */
export function flow(things: readonly Line[], between: string, w: number): Line[] {
  const out: Line[] = [];
  let now: Line = [];
  for (const thing of things) {
    const next = now.length === 0 ? thing : [...now, run(between), ...thing];
    if (widthOf(next) <= w || now.length === 0) { now = next; continue; }
    out.push(now);
    now = thing;
  }
  return now.length === 0 ? out : [...out, now];
}
