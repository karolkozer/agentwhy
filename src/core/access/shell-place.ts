// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { posix, resolve } from 'node:path';
import { simpleCommandsIn } from './command-line.ts';
import { findExcludedAt, findPatternWords, searchPatternWords } from './search-reach.ts';

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
export function placesIn(command: string, start: ShellPlace, parsed: SimpleCommands = simpleCommandsIn(command)): readonly ShellPlace[] {
  const places = [start];
  let at = start;
  for (const simple of parsed) {
    const moved = movedBy(simple, at);
    if (moved === undefined) continue;
    at = moved;
    places.push(at);
  }
  return places;
}

/**
 * Where the line is when its simple command at `index` runs: every `cd` before it taken, one to a folder nobody here
 * knows left out, as `placesIn` leaves it (`2026-10-09-the-file-not-its-name.md` FN17: `cd docs && find . -exec cat {}
 * \;` walks `docs`).
 */
export function placeBefore(parsed: SimpleCommands, index: number, start: ShellPlace): ShellPlace {
  let at = start;
  for (const simple of parsed.slice(0, index)) at = movedBy(simple, at) ?? at;
  return at;
}

/** Where a `cd` moves to from `at`, or `undefined` for any other command, and for a `cd` to a place nobody knows. */
function movedBy(simple: SimpleCommands[number], at: ShellPlace): ShellPlace | undefined {
  if (simple.program !== 'cd') return undefined;
  const target = cdTarget(simple.args);
  if (target === undefined && at.home !== undefined) return { ...at, workingDirectory: at.home };
  if (target === undefined || target === '-' || UNKNOWN_VARIABLE.test(target)) return undefined;
  return { ...at, workingDirectory: located(target, at) };
}

/** A line read into its simple commands, once, for every reading of it that needs them. */
export type SimpleCommands = ReturnType<typeof simpleCommandsIn>;

/**
 * Where a `cd` goes: its first word that is not an option, or `-` - the folder it was in before, which nobody here knows.
 * `undefined` is `cd` alone, the home. Found by the review of 2026-10-09: `-` was skipped as an option, so `cd -` was read
 * as `cd` alone and its words were tried in the home.
 */
function cdTarget(args: readonly string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-')) ?? (args.includes('-') ? '-' : undefined);
}

/** A variable the shell would put in a word, other than the two `located` reads: its value is not known here. */
export const UNKNOWN_VARIABLE = /\$(?!HOME\b|\{HOME\}|PWD\b|\{PWD\})/;

/** Programs whose words may be read in any folder: one they move to (`pushd`), or ones they walk (`find`, `xargs`). */
const WALKS_ELSEWHERE = new Set(['pushd', 'popd', 'find', 'xargs']);

/** Programs that move where their words are read by a flag of their own, measured in FNB6. */
const MOVES_BY_FLAG: Readonly<Record<string, readonly string[]>> = { env: ['-C', '--chdir'], tar: ['-C', '--directory'], git: ['-C'] };

/** Shells handed code as a string: the words of that code are read wherever it moves, which is not read here. */
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);

/** A shell's option word that hands it code: `-c` alone or among others, as `-lc` or `-ec` are. */
const RUNS_CODE = /^-[a-zA-Z]*c[a-zA-Z]*$/;

/**
 * `2026-10-09-the-file-not-its-name.md` FN6: whether a line may read a word in a folder `placesIn` does not follow - one
 * a program other than `cd` moves to (`pushd`, `env -C`, `tar -C`, `git -C`), one `cd` moves to through a variable or
 * `-`, one a program walks by itself (`find`, its `-exec`, an `xargs` it feeds), or code a shell is handed as a string.
 * Under a rule for a name nothing here mattered, since the name alone was met; under a rule for one file a word placed
 * in the wrong folder let the file through (FNB6, measured live in FNB7).
 */
export function foldersUnknown(command: string, parsed: SimpleCommands = simpleCommandsIn(command)): boolean {
  const listsOnly = findOnlyLists(command, parsed);
  return parsed.some(({ program, args }) => {
    const name = baseName(program);
    if (name === 'find' && listsOnly) return false;
    if (WALKS_ELSEWHERE.has(name) || name === 'eval') return true;
    if (handsShellCode([program, ...args])) return true;
    if (name === 'cd') {
      const target = cdTarget(args);
      return target === '-' || (target !== undefined && UNKNOWN_VARIABLE.test(target));
    }
    return (MOVES_BY_FLAG[name] ?? []).some((flag) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`)));
  });
}

function baseName(program: string): string {
  return program.slice(program.lastIndexOf('/') + 1);
}

/** What makes a `find` open what it finds, or remove it, rather than print where it is. */
const FIND_ACTS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete']);

/** Programs that only filter or count the text they are handed - a list of paths in, lines of that list out. */
const TEXT_FILTERS = new Set(['cd', 'grep', 'egrep', 'fgrep', 'head', 'tail', 'sort', 'uniq', 'wc', 'cut', 'tr']);

/**
 * `2026-10-09-the-file-not-its-name.md` FND9, from FNB23: a `find` that opens nothing - no `-exec`, `-ok` or `-delete`
 * - in a line whose every other program only filters the paths it prints (`| grep`, `| head`, `| sort`), and with no
 * substitution handing those paths to anything. Such a line prints where files are and nothing from inside them, so
 * its words are not met by name (FN6): an agent looking for a tracked `exercise.py` was refused because another
 * lesson's `exercise.py` is blocked, and took the refusal for its own file's. Anything that reads what was found -
 * `-exec cat`, `| xargs`, a loop, `$(find …)` - is not this, and stays met by name.
 */
function findOnlyLists(command: string, parsed: SimpleCommands): boolean {
  if (/`|\$\(/.test(command)) return false;
  return parsed.some(({ program }) => baseName(program) === 'find') && parsed.every(({ program, args }) => {
    const name = baseName(program);
    return name === 'find' ? !args.some((arg) => FIND_ACTS.has(arg)) : TEXT_FILTERS.has(name);
  });
}

/**
 * `2026-10-09-the-file-not-its-name.md` FNB29: the words of a line that are a program's own patterns, never a file it is
 * handed - a search's pattern and globs, and a `find`'s `-name` where the line only lists (FND9). A `find` that reads what
 * it found (`-exec cat`, `| xargs`) keeps its pattern a word met by name, as before.
 */
export function patternWords(command: string, parsed: SimpleCommands = simpleCommandsIn(command)): ReadonlySet<string> {
  const listsOnly = findOnlyLists(command, parsed);
  return new Set([
    ...parsed.flatMap(({ program, args }) => {
      const name = baseName(program);
      if (name === 'find') return listsOnly ? findPatternWords(args) : [];
      return searchPatternWords(name, args);
    }),
    // NX1: a `find` that reads what it found still selects nothing by a name it leaves out.
    ...excludedNames(parsed),
  ]);
}

/**
 * `2026-10-11-a-name-that-is-no-file.md` NX1: the words of a line only a `find` leaves out (`findExcludedAt`) - and no
 * other word of the line, so `find . ! -name note.md …; cat note.md` still names `note.md`.
 */
export function excludedNames(parsed: SimpleCommands): ReadonlySet<string> {
  const excluded = new Set<string>();
  const elsewhere = new Set<string>();
  for (const { program, args } of parsed) {
    elsewhere.add(program);
    const left = baseName(program) === 'find' ? findExcludedAt(args) : new Set<number>();
    args.forEach((word, at) => (left.has(at) ? excluded : elsewhere).add(word));
  }
  return new Set([...excluded].filter((word) => !elsewhere.has(word)));
}

/** Shell control FN11's linear reading cannot follow: an or-else, a subshell or group, a substitution. */
const NOT_ONE_SEQUENCE = /\|\||[(){}`]/;

/** A word that opens a loop or a condition: what follows may run elsewhere, more than once, or not at all. */
const CONTROL_WORDS = new Set(['if', 'then', 'elif', 'else', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', '!', '[[']);

/** A word FN11 could place: relative, and rewritten by nothing before the shell hands it over. */
function placeable(word: string): boolean {
  return word !== '' && !word.startsWith('-') && !word.startsWith('/') && !word.startsWith('~') && !word.includes('$');
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN11, from FNB21: the file each relative word of a line names, where the line
 * itself says which folder it is read in. Claude Code records the folder a line was in **after** it ran (FNB21), so the
 * folder of a word before the line's first `cd` is not known here: certainty starts at a `cd` to an absolute folder,
 * and runs while every `cd` after it can be followed. A word named where nothing is certain, or in two folders, is left
 * out, and a line that is not one sequence (`||`, a subshell, a loop) or hides a folder (`foldersUnknown`) places
 * nothing - its words stay as written, as every word did before FN11 (FNO9).
 */
export function placedWords(commands: readonly string[], home: string | undefined, parsed?: readonly SimpleCommands[]): ReadonlyMap<string, string> {
  const placed = new Map<string, string>();
  const dropped = new Set<string>();
  const drop = (word: string): void => {
    dropped.add(word);
    placed.delete(word);
  };
  const put = (word: string, file: string | undefined): void => {
    if (dropped.has(word)) return;
    if (file === undefined || (placed.has(word) && placed.get(word) !== file)) drop(word);
    else placed.set(word, file);
  };

  commands.forEach((command, at) => {
    const simples = parsed?.[at] ?? simpleCommandsIn(command);
    const followed = !NOT_ONE_SEQUENCE.test(command) && !foldersUnknown(command, simples) &&
      !simples.some(({ program }) => CONTROL_WORDS.has(baseName(program)));
    let current: string | undefined;
    for (const { program, args } of simples) {
      if (followed && baseName(program) === 'cd') {
        const target = cdTarget(args);
        if (target !== undefined && target.startsWith('/') && !UNKNOWN_VARIABLE.test(target)) {
          current = resolve(target);
        } else if (current !== undefined && target !== undefined && target !== '-' && !UNKNOWN_VARIABLE.test(target)) {
          const moved = located(target, { workingDirectory: current, ...(home === undefined ? {} : { home }) });
          current = moved.startsWith('/') ? moved : undefined;
        } else {
          current = undefined;
        }
        continue;
      }
      // A `find`'s words are where it starts and what it matches (`-name f.py`), never a file read in this folder - and
      // since FND9 a `find` that only lists no longer hides the folder, so they would otherwise be placed.
      if (baseName(program) === 'find') continue;
      for (const word of args) {
        if (placeable(word)) put(word, followed && current !== undefined ? resolve(current, word) : undefined);
      }
    }
  });
  return placed;
}

/**
 * Whether a command hands a shell code to run - the shell itself (`bash -lc …`) or a program that runs one (`env bash
 * -c …`, `nohup sh -c …`, `timeout 5 bash -c …`, `sudo sh -c …`). Found by the review of 2026-10-09: only a bare shell
 * followed by the word `-c` counted, and `bash -lc 'cd x && cat f'` let a rule for one file through.
 */
function handsShellCode(words: readonly string[]): boolean {
  const shell = words.findIndex((word) => SHELLS.has(baseName(word)));
  return shell >= 0 && words.slice(shell + 1).some((word) => RUNS_CODE.test(word));
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN16, closing FNO9's second kind: the folder the names a line's listing prints lie
 * in, where the line says it. `ls -la docs` prints `note.md`, which is `docs/note.md`; `cd /p/docs && find . -type f`
 * prints `./note.md`, which is `/p/docs/note.md`. Found 2026-10-10 on three conversations: `ls -la lessons/01_lists`
 * listed a tracked `exercise.py` as the project root's, called it "Not private" and offered to protect a file that does
 * not exist. Relative to where the line starts, or whole after an absolute `cd`. `undefined` where the names stand as
 * printed: no listing, or several, `ls` given more than one folder (it heads each with its name, not read here) or `-d`,
 * and a `cd` this cannot place - a relative one, since the record holds the folder after the line (FNB21), not before.
 */
export function listedFolder(
  command: string, home: string | undefined, recordedDir?: string, parsed: SimpleCommands = simpleCommandsIn(command), start?: string,
): string | undefined {
  const listers = parsed.flatMap((simple, at) => (LISTS.has(simple.program) && !(simple.program === 'rg' && !simple.args.includes('--files')) ? [at] : []));
  // Several listings print into one output: their names lie in one folder only where every one lists there -
  // `cd /p/lesson && find . -type f | sort && for f in $(find . -type f); …` lists `lesson` twice.
  const folders = new Set(listers.map((at) => folderListedAt(parsed, at, home, recordedDir)));
  const [folder, ...more] = [...folders];
  if (more.length > 0 || folder === null) return undefined;
  // `2026-10-11-the-rules-where-the-file-is.md` RW16: where the line is known to start, a name printed from there lies there.
  if (start === undefined || listers.length === 0) return folder;
  return folder === undefined ? start : posix.isAbsolute(folder) ? folder : posix.join(start, folder);
}

/**
 * FN16 as amended 2026-10-11: where an `ls` writes a section per folder - `-R`, or several operands - the line naming the
 * folder (`./01_listy:`, `docs/a b:`, `docs:`) says where the names under it lie, read from where `ls` ran. Found on the
 * maintainer's round of that day: `cd <stage> && ls -laR` listed four lessons' `exercise.py`, and the report put all four
 * in the stage's folder - one row for a file that does not exist, the tracked one among them unsaid. `undefined` where
 * the line's listing writes no sections, or where it is not the line's one listing.
 */
export function listingSections(command: string, home: string | undefined, recordedDir?: string, parsed: SimpleCommands = simpleCommandsIn(command)): { readonly ranIn: string | undefined } | undefined {
  const listers = parsed.flatMap((simple, at) => (LISTS.has(simple.program) && !(simple.program === 'rg' && !simple.args.includes('--files')) ? [at] : []));
  const [at, ...more] = listers;
  const lister = at === undefined ? undefined : parsed[at];
  if (at === undefined || lister === undefined || more.length > 0 || lister.program !== 'ls' || lister.args.some((arg) => /^-[^-]*d/.test(arg))) return undefined;
  const recursive = lister.args.some((arg) => /^-[^-]*R/.test(arg) || arg === '--recursive');
  if (!recursive && lister.args.filter((arg) => !arg.startsWith('-')).length < 2) return undefined;
  const ranIn = placeOfLister(parsed, at, home, recordedDir);
  return ranIn === null ? undefined : { ranIn };
}

/** The folder a section's heading names, written from where `ls` ran (`ranIn`, `undefined` where the line started). */
export function sectionFolder(heading: string, ranIn: string | undefined): string | undefined {
  const written = posix.normalize(heading).replace(/\/+$/, '');
  if (written.startsWith('/')) return written;
  if (ranIn === undefined) return written === '.' ? undefined : written;
  return written === '.' ? ranIn : posix.join(ranIn, written);
}

/** Where the listing at `at` prints its names: `undefined` as printed, `null` where this cannot know. */
function folderListedAt(parsed: SimpleCommands, at: number, home: string | undefined, recordedDir?: string): string | undefined | null {
  const place = placeOfLister(parsed, at, home, recordedDir);
  if (place === null) return null;
  const { program, args } = parsed[at] ?? { program: '', args: [] };
  if (program !== 'ls') return place ?? undefined;
  if (args.some((arg) => /^-[^-]*d/.test(arg))) return null;
  const operands = args.filter((arg) => !arg.startsWith('-'));
  if (operands.length > 1) return null;
  const [operand] = operands;
  if (operand === undefined) return place ?? undefined;
  if (UNKNOWN_VARIABLE.test(operand) || /[*?[]/.test(operand)) return null;
  return place === undefined ? posix.normalize(operand).replace(/\/+$/, '') : located(operand, { workingDirectory: place, ...(home === undefined ? {} : { home }) });
}

/**
 * FN17 as amended 2026-10-11: where a line is when its command at `at` runs - a loop over a glob expands it there - read
 * as FN16 reads a listing's folder: `undefined` where the line started, `null` where it is not known.
 */
export function placeAt(command: string, at: number, home: string | undefined, recordedDir?: string, parsed: SimpleCommands = simpleCommandsIn(command)): string | undefined | null {
  return placeOfLister(parsed, at, home, recordedDir);
}

/** Where the line is when the program at `at` runs, after its cds: `undefined` where it started, `null` where not known. */
function placeOfLister(parsed: SimpleCommands, at: number, home: string | undefined, recordedDir?: string): string | undefined | null {
  // The cds before the lister. An absolute or `~` cd sets the place outright; a relative one accumulates, to be
  // resolved against `recordedDir` - the folder the event was recorded in - once the chain is known (FNB34, FN16).
  let place: string | undefined;
  let relative = '';
  for (const simple of parsed.slice(0, at)) {
    if (simple.program !== 'cd') continue;
    const target = cdTarget(simple.args);
    if (target === undefined || target === '-' || UNKNOWN_VARIABLE.test(target.replace(/^\$(?:HOME\b|\{HOME\})/, ''))) return null;
    const whole = target.startsWith('/') || (home !== undefined && /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.test(target));
    if (whole) { place = located(target, { workingDirectory: '/', ...(home === undefined ? {} : { home }) }); relative = ''; }
    else if (place !== undefined) place = located(target, { workingDirectory: place, ...(home === undefined ? {} : { home }) });
    else relative = relative === '' ? target : posix.join(relative, target);
  }
  // FN18, FNB21: a relative cd runs from where the event was recorded, unless that folder already ends with the chain -
  // Claude Code writes the folder the line ended in for some sessions, the project for others, and resolving an
  // already-applied cd again would double it. `null` where no recorded folder places it.
  if (place === undefined && relative !== '') {
    if (recordedDir === undefined) return null;
    const anchor = recordedDir.replace(/\/+$/, '');
    const chain = posix.normalize(relative).replace(/\/+$/, '');
    place = anchor === chain || anchor.endsWith('/' + chain) ? anchor : located(relative, { workingDirectory: recordedDir, ...(home === undefined ? {} : { home }) });
  }
  return place;
}

/** Programs that print the names of what they list: `rg` only with `--files`. */
const LISTS = new Set(['ls', 'find', 'rg']);

/**
 * FN16: a name a listing printed, in the folder `listedFolder` found. A name already written from where the line started
 * - `ls -la docs/note.md` prints the operand itself - or written whole stays as it is, as do `.` and `..`.
 */
export function placedListed(name: string, folder: string | undefined): string {
  if (folder === undefined || name.startsWith('/') || name.startsWith('~')) return name;
  const bare = name.replace(/^(?:\.\/)+/, '');
  if (bare === '' || bare === '.' || bare === '..' || bare === folder || bare.startsWith(folder + '/')) return name;
  return posix.join(folder, bare);
}

