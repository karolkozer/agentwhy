// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { bold, cellsOf, dim, fit, HAIR, run, widthOf, wrap, type Line } from './cells.js';

export interface Column { readonly name: string; readonly width: number; readonly right?: boolean; }
/** A cell is as many lines as it needs, and a row of more than one may stand apart from the one over it; a part is a rule with a name in it. */
export type TableRow = { readonly part: string } | { readonly cells: readonly (readonly Line[])[]; readonly apart?: boolean };

const BETWEEN = 3;
export const tableWidth = (columns: readonly { readonly width: number }[]): number => columns.reduce((sum, column) => sum + column.width, 0) + BETWEEN * (columns.length - 1);
/** The least a column's name needs: its longest word, since a name goes on under itself. */
export const nameWidth = (name: string): number => Math.max(...name.split(' ').map(cellsOf));

/** Columns apart by a hairline, every row as tall as its tallest cell; a rule crosses them where a part begins. */
export function table(columns: readonly Column[], rows: readonly TableRow[]): Line[] {
  const joined = (cells: readonly Line[], between: string): Line => cells.flatMap((cell, at): Line => [...(at === 0 ? [] : [run(between, HAIR)]), ...cell]);
  const placed = (line: Line, { width, right }: Column): Line => fit(right === true ? [run(' '.repeat(Math.max(0, width - widthOf(line)))), ...line] : line, width);
  const tall = (cells: readonly (readonly Line[])[]): Line[] =>
    Array.from({ length: Math.max(...cells.map((cell) => cell.length), 1) }, (_, row) => joined(columns.map((column, at) => placed(cells[at]?.[row] ?? [], column)), ' │ '));
  const rule = (name: string): Line => joined(columns.map(({ width }, at): Line => {
    const said = at === 0 && name !== '' ? `${name} `.slice(0, width + 1) : '';
    const inside = said.trimEnd().length >= width ? said.trimEnd() : said;
    return [...(inside === '' ? [] : [bold(inside)]), run('─'.repeat(Math.max(0, width - cellsOf(inside))), HAIR)];
  }), '─┼─');
  const heads = tall(columns.map(({ name, width }) => wrap(name, width, 2).map((each): Line => [dim(each)])));
  const opens = rows[0] !== undefined && 'part' in rows[0];
  return [...heads, ...(opens ? [] : [rule('')]), ...rows.flatMap((row) => ('part' in row ? [rule(row.part)] : [...(row.apart === true ? tall([]) : []), ...tall(row.cells)]))];
}
