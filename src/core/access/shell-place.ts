// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { simpleCommandsIn } from './command-line.ts';

/**
 * Where a command runs: the directory a relative word starts from, and the home directory `~` stands for. The home is
 * absent where the reader does not know it; a word that starts with `~` is then left as it was written.
 */
export interface ShellPlace {
  readonly workingDirectory: string;
  readonly home?: string;
}

/**
 * The absolute path a word names once the shell has rewritten it: `~`, `$HOME` and `${HOME}` at its start become the
 * home directory, `$PWD` and `${PWD}` where the command runs, and the rest is resolved against that, `..` included.
 * Read as written, `grep -rn KEY ~/app` named a directory that is not there, and the `.env` below the real one was let
 * through. Quoting was removed before the word got here, so a quoted `'~/app'`, which the shell leaves as it is, is read
 * as the home too: a refusal the agent can answer, never a file let through. Any other variable is not known here and
 * is left as written.
 */
export function located(word: string, place: ShellPlace): string {
  if (place.home === undefined && /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.test(word)) return word;
  const expanded = word
    .replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, () => place.home ?? '')
    .replace(/^(?:\$PWD|\$\{PWD\})(?=\/|$)/, () => place.workingDirectory);
  return resolve(place.workingDirectory, expanded);
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP3, IP4: every folder a command line's words may be read in - where it starts, and
 * each folder a `cd` in the same line moves to, in order. `cd sub && cat canary.txt` names `<start>/sub/canary.txt`,
 * which a rule written for that place has to meet. A word is tried against all of them, which can only find a file the
 * line named, never miss one; a `cd` to a word not known here (`cd "$DIR"`) moves to a place nobody can read, and the
 * words after it are tried where the line was before.
 */
export function placesIn(command: string, start: ShellPlace): readonly ShellPlace[] {
  const places = [start];
  let at = start;
  for (const simple of simpleCommandsIn(command)) {
    if (simple.program !== 'cd') continue;
    const target = simple.args.find((arg) => !arg.startsWith('-'));
    if (target === undefined && at.home !== undefined) at = { ...at, workingDirectory: at.home };
    else if (target === undefined || target === '-' || /\$(?!HOME\b|\{HOME\}|PWD\b|\{PWD\})/.test(target)) continue;
    else at = { ...at, workingDirectory: located(target, at) };
    places.push(at);
  }
  return places;
}
