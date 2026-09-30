import { byString } from './compare.ts';
import type { Counts } from './counter.ts';

export type Row = readonly [label: string, value: string];

const EMPTY_COUNTS = '(none)';

/** Rows with their labels aligned into one column. */
export function table(rows: readonly Row[], indentWidth: number): string[] {
  const width = Math.max(...rows.map(([label]) => label.length));
  return rows.map(([label, value]) => `${' '.repeat(indentWidth)}${label.padEnd(width)}  ${value}`);
}

/** Counts as a table, largest first and ties by key, with the numbers right-aligned. */
export function countsTable(values: Counts, indentWidth: number): string[] {
  const entries = Object.entries(values).sort(([keyA, a], [keyB, b]) => b - a || byString(keyA, keyB));
  if (entries.length === 0) return [`${' '.repeat(indentWidth)}${EMPTY_COUNTS}`];

  const width = Math.max(...entries.map(([, value]) => String(value).length));
  return table(
    entries.map(([key, value]): Row => [key, String(value).padStart(width)]),
    indentWidth,
  );
}
