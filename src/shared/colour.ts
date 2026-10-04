// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Colour for a terminal, as escape codes and nothing more (`specs/2026-09-15-findings-worth-reading.md` R14, R15, and its
 * non-goal of no new dependency). Whether a report is coloured is decided once, in the shell; everything below
 * the shell is told.
 */
export type Hue = 'bold' | 'dim' | 'red' | 'green' | 'yellow' | 'indigo';

// `indigo` is the brand colour of the wordmark (`--indigo`, #7C8CF8), as the nearest of the 256 colours every modern
// terminal has. It marks the tool itself and never an outcome.
const CODES: Readonly<Record<Hue, string>> = {
  bold: '1',
  dim: '2',
  red: '31',
  green: '32',
  yellow: '33',
  indigo: '38;5;105',
};

/** Every escape `paint` writes, so that a test - or a reader piping a coloured report on - can remove them. */
export const ESCAPES = /\u001b\[[0-9;]*m/g;

/** `text` wrapped in the escape for `hue`. Removing the escapes gives `text` back exactly. */
export function paint(text: string, hue: Hue): string {
  return text === '' ? text : `\u001b[${CODES[hue]}m${text}\u001b[0m`;
}

/**
 * Whether stdout may be coloured: only when it is a terminal, and never when `NO_COLOR` holds anything but the
 * empty string, which is how no-color.org defines it. Flags narrow this further; nothing widens it.
 */
export function colourWanted(stdoutIsTerminal: boolean, noColor: string | undefined): boolean {
  return stdoutIsTerminal && (noColor === undefined || noColor === '');
}
