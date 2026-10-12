// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, relative, resolve } from 'node:path';
import type { EvidenceRef } from '../evidence.ts';
import type { EventOutcome, RefusalSource, ToolEvent, ToolUseId } from '../event.ts';
import { matchesGlob } from '../policy/glob.ts';
import { protectionOf, type Policy, type ProtectedPath } from '../policy/policy.ts';
import type { SessionModel } from '../session-model.ts';
import type { ContentFingerprints } from './content-fingerprints.ts';
import { addressesNothing, codeReadsNamedFile, commandPathCandidates, fileOperandsIn, openedWithoutPrinting, printsContent, printsContentBesideNames, printsContentOnly, simpleCommandsIn } from './command-line.ts';
import { listingPathCandidates, type ListingCandidate } from './listing.ts';
import { excludedNames, foldersUnknown, listedFolder, listingSections, located, patternWords, placeAt, placedListed, placedWords, placesIn, sectionFolder, UNKNOWN_VARIABLE, type ShellPlace, type SimpleCommands } from './shell-place.ts';
import { shapedLikePath } from './path-shape.ts';
import { pathTokens, stringsIn } from './path-tokens.ts';
import { outputIsClean, outputShowsReach } from './recorded-effect.ts';
import { hitLines } from './search-output.ts';
import { handsListedNames, matchesShellWord, printedNames, printedSearch, printsListedNames, reachOf, wordLoopNames, type PrintedSearch } from './search-reach.ts';

/**
 * Where the protected path was named. The distinction is the whole argument of this project (spec §5.4):
 *
 * - `input`  — a parameter of the call named it. Every tool on the market sees this one.
 * - `result` — **no parameter named it**; it appeared only in what came back. This is how the motivating case
 *   went: `grep -rn "<SECRET_NAME>" <repo>` names a variable, not a file, and the file and its value appear
 *   only in the output. A tool that reads inputs alone walks past it.
 */
export type AccessSource = 'input' | 'result';

export interface ProtectedAccess {
  readonly eventId: ToolUseId;
  readonly agentId: string;
  readonly toolName: string;
  readonly source: AccessSource;
  /** The path as the transcript had it. Verbatim by default; aliasing belongs to `--share` (§7.3). */
  readonly path: string;
  /** The policy entry that made it protected, so a reader can check the rule and not only the verdict. */
  readonly pattern: string;
  readonly outcome: EventOutcome;
  /** Who refused the call, where it was refused and the record says who (`who-stopped-it` WS2). */
  readonly refusedBy?: RefusalSource;
  readonly evidence: EvidenceRef;
  /**
   * How many lines of this file the call printed, where it is a search that prints what it matched
   * (`.ai/specs/2026-09-25-search-hits-are-reads.md` H1-H3): the file's text reached the agent, not only its name.
   * Absent where the call printed none of its lines.
   */
  readonly lines?: number;
  /**
   * The call opened this file and printed no text of it - `wc -l`, `stat`, a checksum (decided 2026-10-07). The file
   * was opened, which a name seen in a listing never means, and what is inside it did not reach the agent, which a
   * read does. Absent where the record does not establish both.
   */
  readonly opened?: true;
  /**
   * FN11: the word as the line wrote it, where `path` is that word placed by the line's own absolute `cd` (FNB21:
   * `cd "<abs>" && cat <relative>` stood beside the Read tool's path as a second file). Every question asked of the
   * call itself - which of its words a program printed, which file its code opened, where in its output a name
   * stands - is asked with this word; `path` is what pages, counts and messages carry. Absent where they are one.
   */
  readonly word?: string;
  /**
   * `2026-10-11-the-file-by-its-text.md` CT1: this file's own lines are in what the call showed its model - a read,
   * whatever the command was. Absent where its text was not found, or not looked for.
   */
  readonly seen?: true;
}

/**
 * Every touch of a protected path in a session, from both sides.
 *
 * Delegating calls are left out: handing work to another agent reaches no file, and reading a **prompt** for
 * intent is the detector's job, which this milestone does not do. Their effects appear here through the events
 * of the agent they started.
 *
 * Outcome is carried, not judged. §5.4 attaches `SUCCEEDED` to its definition of `S-input`, but that belongs to
 * a verdict, and a refused attempt is worth reading too - it says the policy held.
 */
export function protectedAccesses(model: SessionModel, policy: Policy, home?: string, fingerprints?: ContentFingerprints): ProtectedAccess[] {
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));

  const accesses = model.events
    .filter((event) => !delegating.has(event.id))
    .flatMap((event) => accessesOf(event, policy, home, model.projectRoot.kind === 'known' ? model.projectRoot.path : undefined));
  return fingerprints === undefined ? accesses : withTextSeen(model, accesses, policy, fingerprints, delegating, home);
}

/**
 * `2026-10-11-the-file-by-its-text.md` CT1, CT5: a private file whose own lines are in what a call showed its model was
 * read by that call - its access reached and `seen` where the call named it, a new one where it did not, named by the
 * output as a listing's line is. It adds a read and takes none away: a read the command establishes stands without it.
 */
function withTextSeen(
  model: SessionModel,
  accesses: readonly ProtectedAccess[],
  policy: Policy,
  fingerprints: ContentFingerprints,
  delegating: ReadonlySet<string>,
  home: string | undefined,
): ProtectedAccess[] {
  const root = model.projectRoot.kind === 'known' ? model.projectRoot.path : undefined;
  const found = [...accesses];
  for (const event of model.events) {
    if (delegating.has(event.id) || event.outcome === 'blocked' || event.result?.stage !== 'model') continue;
    const outputs = [...stringsIn(event.result.content), ...(event.result.printedText === undefined ? [] : [event.result.printedText]),
      ...(event.execution?.printed === undefined ? [] : [event.execution.printed]), ...(event.result.cellText === undefined ? [] : [event.result.cellText])];
    const from = event.workingDirectory ?? root;
    const whole = (path: string): string | undefined => {
      const homed = home !== undefined && /^~(?=\/|$)/.test(path) ? home + path.slice(1) : path;
      return isAbsolute(homed) ? homed : from === undefined ? undefined : resolve(from, homed);
    };
    for (const file of fingerprints.filesShown(outputs)) {
      let named = false;
      found.forEach((access, at) => {
        if (access.eventId !== event.id || whole(access.path) !== file) return;
        named = true;
        found[at] = { ...access, outcome: 'succeeded', seen: true };
      });
      if (named) continue;
      const inside = root === undefined ? file : relative(root, file);
      const protection = protectionOf(policy, inside) ?? protectionOf(policy, file);
      if (protection !== undefined) found.push(toAccess(event, 'result', inside, protection.pattern, 'succeeded', undefined, { seen: true }));
    }
  }
  return found;
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP4: the folders a call's words are read in - where it ran, and where each `cd` of
 * its command lines moves - once, each. None where the record does not say where it ran.
 */
function placesOf(event: ToolEvent, home: string | undefined, parsed: readonly SimpleCommands[]): readonly ShellPlace[] | undefined {
  if (event.workingDirectory === undefined) return undefined;
  const start: ShellPlace = { workingDirectory: event.workingDirectory, ...(home === undefined ? {} : { home }) };
  const all = event.commands.length === 0 ? [start] : event.commands.flatMap((command, at) => placesIn(command, start, parsed[at]));
  return [...new Map(all.map((place) => [place.workingDirectory, place])).values()];
}

function accessesOf(event: ToolEvent, policy: Policy, home?: string, root?: string): ProtectedAccess[] {
  // A path parameter is a path. A command line is read for its arguments, and a listing for what it enumerates:
  // both have structure, and using it is what separates a file that was reached from a file that was mentioned.
  // A path parameter and a quoted shell argument are both positional: something said "this is one thing", so a
  // space inside belongs to it. Only guessed candidates - a line of output, a word taken out of prose - have to
  // be whitespace-free.
  // Each line read into its simple commands once, for the folders it moves to and for whether it hides one.
  const parsed = event.commands.map((command) => simpleCommandsIn(command));
  const places = placesOf(event, home, parsed);
  // FN6: a word read in a folder no line here follows is met by its name, as `refuse` meets it, so the two agree.
  const where = { ...(places === undefined ? {} : { places }), unplaced: event.commands.some((command, at) => foldersUnknown(command, parsed[at])) };
  const fromInput = dedupe([
    ...protectedTargets(event.targets, policy, places),
    // NX1: a name a `find` leaves out is no name the call saw.
    ...protectedPathsAmong(event.commands.flatMap((command, at) => {
      const left = excludedNames(parsed[at] ?? []);
      return commandPathCandidates(command).filter((candidate) => !left.has(candidate));
    }), policy, { allowWhitespace: true, ...where }),
    // SW17: what a printing program was given to open is a file by position, so a bare name still meets a wildcard
    // rule - `cat demo.env` read a key under the `.env` wildcard, and nothing here called it a file.
    ...protectedPathsAmong(fileOperandsIn(event.commands), policy, { allowWhitespace: true, positional: true, ...where }),
  ]);
  const named = new Set(fromInput.map(([path]) => path));
  // Only a listing says the call reached what it names. The content of a file that mentions `.env` says the
  // file mentions it - counting that was worth 316 findings on a session that had a handful.
  // A tool's declared shape is refined by what was actually run: `cat` through a shell prints a file, and the
  // paths in that file are its text. The shape belongs to the command, one level below the tool.
  const enumerates = event.resultShape === 'listing' && !readsContent(event);
  // X11: a process that did not complete cleanly may have printed diagnostics naming what it could not open, so of its
  // output only a field in a search hit's position names a file it reached.
  const clean = outputIsClean(event.execution);
  // FN16: a name a listing printed lies in the folder it listed - `ls docs` prints `note.md`, which is `docs/note.md`.
  const looped = loopNamesOf(event, home);
  const listed = [
    ...(enumerates
      ? listedLines(event, home, root).flatMap(({ line, folder: lying }) => listingPathCandidates(line)
        .map((candidates) => (clean ? candidates : candidates.filter((candidate) => candidate.positional)).map((candidate) => ({ ...candidate, text: placedListed(candidate.text, lying) }))))
      : []),
    // FN17 as amended 2026-10-11: a name a loop printed through its own `echo`, where it lies.
    ...(looped?.names ?? []).map((name) => [{ text: name, positional: true }]),
  ];
  const shown = protectedPathsPerLine(listed, policy);
  // FNB25: a name the output printed that a word the line's shell expands becomes - `cat a/*` + `/x`, a loop's list - was
  // named by the line, through the shell: an input, so a line that printed it is read as having read it. FN17: so is
  // every name a listing printed on a line that hands those names to a program that opens them.
  const expands = shellExpanded(event.commands);
  const handed = event.commands.some(handsListedNames);
  // FN17 as amended: a name a loop printed through its own `echo` was put there by the line.
  const loopNamed = new Set((looped?.names ?? []).map(sameFile));
  const byShell = shown.filter(([path]) => !named.has(path) && (handed || loopNamed.has(path) || expands.some((word) => matchesShellWord(path, word))));
  for (const [path, pattern] of byShell) {
    fromInput.push([path, pattern]);
    named.add(path);
  }
  // A path the parameters already named is not an `S-result`: the source is what the other tools would miss.
  const fromResult = shown.filter(([path]) => !named.has(path));

  const printed = printedLines(event, [...named]);
  const outcomeOf = targetOutcome(event, printed, new Set(shown.map(([path]) => path)));
  // H1: lines a search printed are text the agent read only where the result is what its model was handed (X10).
  const lines = event.result?.stage === 'model' ? new Map([...printed].map(([path, each]) => [path, each.length])) : new Map<string, number>();
  // A file a program opened and printed nothing of: said only of a call that succeeded, since a line that did not run
  // opened nothing.
  const quiet = new Set(openedWithoutPrinting(event.commands).map(sameFile));
  const openedBy = (path: string, outcome: EventOutcome): { readonly opened?: true } =>
    outcome === 'succeeded' && quiet.has(path) && lines.get(path) === undefined ? { opened: true } : {};
  // FN11: a word the line's own absolute `cd` placed is recorded as the file it names there, the word kept beside -
  // everything above asked the word, as the line's output and operands speak of it; pages and counts carry the file.
  // RW16: and a word of a line the record places elsewhere than the root is the file it names there.
  const placements = wordsPlaced(event, home, root, parsed);
  const fileOf = (word: string): string | undefined => placements.get(word);
  return [
    ...fromInput.map(([word, pattern]) => toAccess(event, 'input', fileOf(word) ?? word, pattern, outcomeOf(word, 'input'), lines.get(word),
      { ...openedBy(word, outcomeOf(word, 'input')), ...(fileOf(word) !== undefined ? { word } : {}) })),
    ...fromResult.map(([path, pattern]) => toAccess(event, 'result', path, pattern, outcomeOf(path, 'result'), lines.get(path), openedBy(path, outcomeOf(path, 'result')))),
  ];
}

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW16: the folder a call's lines ran in, where its record names one other than
 * the conversation's root and the lines move nowhere - no `cd` or other move, nothing this cannot follow (FN6) - so every
 * relative word, and every name a listing printed from where it ran, lies there: Codex's `workdir` (RWB7), a `cd` Claude
 * Code's desktop app kept from an earlier line (FN18). Read as written, `cat note.md` run in a project from the Codex app's
 * own folder was the app folder's `note.md`, "Not blocked" with **Protect it** (RWB9). A record with no root names no
 * folder a word could be shown from, so nothing is placed there.
 */
export function ranElsewhere(event: ToolEvent, root: string | undefined, parsed: readonly SimpleCommands[] = event.commands.map((command) => simpleCommandsIn(command))): string | undefined {
  const at = event.workingDirectory;
  if (root === undefined || at === undefined || at === root || event.commands.length === 0) return undefined;
  const moves = event.commands.some((command, index) => foldersUnknown(command, parsed[index]) || placesIn(command, { workingDirectory: at }, parsed[index]).length > 1);
  return moves ? undefined : at;
}

/**
 * The file each word of a call's lines names, where its place is known: an absolute `cd` of the line (FN11), else the
 * folder the record says the line ran in (RW16). One answer for an access, a Files row and a step.
 */
export function wordsPlaced(event: ToolEvent, home: string | undefined, root: string | undefined, parsed: readonly SimpleCommands[] = event.commands.map((command) => simpleCommandsIn(command))): ReadonlyMap<string, string> {
  const placed = new Map(placedWords(event.commands, home, parsed));
  const ran = ranElsewhere(event, root, parsed);
  if (ran === undefined) return placed;
  for (const { program, args } of parsed.flat()) {
    for (const word of [program, ...args]) {
      if (!placed.has(word) && placeableHere(word)) placed.set(word, resolve(ran, word));
    }
  }
  // The line's candidates beyond its simple words - a path inside code an interpreter is handed - are placed alike.
  for (const word of event.commands.flatMap(commandPathCandidates)) if (!placed.has(word) && placeableHere(word)) placed.set(word, resolve(ran, word));
  return placed;
}

/** RW16: a word read in a folder by its place there - relative, and rewritten by nothing the shell does to it. */
function placeableHere(word: string): boolean {
  return word !== '' && !word.startsWith('-') && !isAbsolute(word) && !word.startsWith('~') && !UNKNOWN_VARIABLE.test(word);
}

/**
 * The outcome of one target of a call (X11). The call's own outcome where the record establishes it - or where the format
 * keeps no process record, as Claude Code's does not. Where a process ran and its effect is not established, what its
 * output shows it reached it reached: a line naming the file, printed by a search or a listing. Any other target is an
 * attempt whose effect is unknown - never counted as reached because the command ran.
 */
function targetOutcome(
  event: ToolEvent,
  printed: ReadonlyMap<string, readonly string[]>,
  shown: ReadonlySet<string>,
): (path: string, source: AccessSource) => EventOutcome {
  return (path, source) => {
    if (event.outcome !== 'unknown' || event.execution === undefined || event.result?.content === undefined) return event.outcome;
    return source === 'result' || printed.has(path) || shown.has(path) ? 'succeeded' : 'unknown';
  };
}

/** A search hit with its line number: `path:12:text`. A diagnostic `path: message` has none. */
const NUMBERED_HIT = /^[^:]+:\d+:/;

/** A hit of a search of one file, numbered and with no name: `12:text`. */
const NUMBERED_LINE = /^\d+:/;

/** How many lines of each file a succeeded search printed (H1, H2, H12): `printedLines`, counted. */
export function linesPrinted(event: ToolEvent, named: readonly string[]): ReadonlyMap<string, number> {
  return new Map([...printedLines(event, named)].map(([path, lines]) => [path, lines.length]));
}

/**
 * The lines of each file a succeeded search printed, per file (H1, H2, H12). Where the search puts no file's name on its
 * lines and the call named exactly one protected file - `grep KEY .env` - its whole output is that file's lines (H3), as
 * a `cat` of it is. Whether it puts one there is the command's to say (`PrintedSearch.names`), not the output's: a
 * colon in a line of `.env` is not a file name before it. **Raw content**: for the redactor, and nothing else (H11).
 */
export function printedLines(event: ToolEvent, named: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const printed = new Map<string, string[]>();
  const search = searchOf(event);
  if (search === undefined || !outputShowsReach(event)) return printed;
  // X11: a process that did not complete cleanly may have printed `.env: Permission denied`, which reads as a hit. Only a
  // numbered hit line is taken from it, and its whole output is never one named file's (H3).
  if (!outputIsClean(event.execution)) {
    const numbered = stringsIn(event.result?.content).join('\n').split('\n').filter((line) => NUMBERED_HIT.test(line)).join('\n');
    for (const hit of hitLines(numbered, false)) printed.set(sameFile(hit.path), [...(printed.get(sameFile(hit.path)) ?? []), hit.text]);
    // H3 where the exit is not known clean (XD4: a cell records none): a numbered search of the one protected file the
    // call named prints `12:text` for each hit, and no diagnostic opens with a line number - `rg: x: No such file` names
    // its program first. Those lines are that file's, and nothing else of the output is.
    const one = [...new Set(named)];
    if (printed.size === 0 && search.numbered === true && search.names !== 'always' && one.length === 1) {
      const lines = stringsIn(event.result?.content).join('\n').split('\n').filter((line) => NUMBERED_LINE.test(line))
        .map((line) => line.replace(NUMBERED_LINE, ''));
      if (lines.length > 0) printed.set(one[0] as string, lines);
    }
    return printed;
  }
  const output = stringsIn(event.result?.content).join('\n');
  const only = [...new Set(named)];
  const whole = (): string[] => output.split('\n')
    .filter((line) => line.trim() !== '' && line !== '--')
    .map((line) => (search.numbered === true ? line.replace(/^\d+[:-]/, '') : line));
  // H3: lines with no name on them are the one file the call named - or no one's that can be told.
  if (search.names === 'never') {
    if (only.length === 1 && whole().length > 0) printed.set(only[0] as string, whole());
    return printed;
  }
  const hits = hitLines(output, search.context);
  // Keyed as a path is recorded, so a hit a search wrote `./x` meets the file the call named `x` (`sameFile`).
  for (const hit of hits) printed.set(sameFile(hit.path), [...(printed.get(sameFile(hit.path)) ?? []), hit.text]);
  // One operand that may be a file: where it is the one protected file named and no line names it, no line names any.
  if (search.names === 'maybe' && only.length === 1 && !printed.has(only[0] as string)) {
    printed.clear();
    if (whole().length > 0) printed.set(only[0] as string, whole());
  }
  return printed;
}

/** A word that names a file by its own shape: a name with an extension or a leading dot, or a path with a folder in it. */
const NAMES_A_FILE = /[^.]\.[^.]|^\.[^./]|\//;

/** A count given to an option: `head -n 2 f.csv` reads one file, not a file called `2`. */
const COUNT = /^\d+$/;

/** What a pattern or a script holds and a file name does not: `sed 's#^./##'` names no file. */
const NOT_A_NAME = /[#^$\\|<>!&;]/;

/**
 * Folders every tool that makes them makes as folders, named like a file with a leading dot. A listing that does not say
 * which is which - `find . -maxdepth 1` - lists them beside `.env` and `.npmrc`, and only the name is left to tell.
 */
const TOOL_FOLDERS = new Set(['.git', '.claude', '.codex', '.cursor', '.vscode', '.idea', '.github', '.next', '.cache', '.turbo']);

/**
 * How a call reached a file no protected pattern matches: its text came back, a program opened it and printed a fact
 * about it instead (2026-10-07), a program that prints a file was given it and the record does not say how the command
 * ended (`unknown`, 2026-10-10), or only its name was seen.
 */
export type EverydayReach = 'read' | 'unknown' | 'opened' | 'named';

/** Strongest first, as a protected file's row is: read, then not known whether read, then opened, then a name seen. */
const EVERYDAY_RANK: Readonly<Record<EverydayReach, number>> = { read: 3, unknown: 2, opened: 1, named: 0 };

/**
 * What one call shows of files no protected pattern matches (`the-report-page.md` P32, changed 2026-10-05 by the
 * maintainer: every file of a session is a row, so a person sees what else the AI was among, and may make it private).
 * Read by the rules that find a protected path, so no prose becomes a file:
 *
 * - a word of a shell line shaped like a path is a file the call named; the operand of a program that prints a file,
 *   where the call succeeded, one it read;
 * - a search hit's path is a file whose lines came back - read where they are what the model was handed (X10);
 * - a listing's name, by its place: the last field of `ls -l` where its line is no directory's, or a line that is a path
 *   whole (`ls -1`, `find`, `rg --files`). A word before a colon is a search hit's place, and outside a search it is a
 *   diagnostic's (`ls: x: No such file`), so it names no file here.
 *
 * `.` and `..` are no files. A tool the adapter has no profile for names nothing (R12b).
 */
export function everydayReach(
  event: ToolEvent, policy: Policy, placements?: ReadonlyMap<string, string>, home?: string, root?: string,
): readonly { readonly path: string; readonly how: EverydayReach; readonly written?: true; readonly word?: string }[] {
  if (!event.toolKnown) return [];
  const found = new Map<string, EverydayReach>();
  // `2026-10-11-a-name-that-is-no-file.md` NX2: the names the record shows - what an output printed - apart from those only
  // the line's own text gave, which say nothing of whether such a file is there; and each of those as the line wrote it,
  // where a folder the line moved to placed it (FN11) - a guess for a search's pattern as much as for a file.
  const recorded = new Set<string>();
  const words = new Map<string, string>();
  const result = () => [...found].map(([path, how]) => ({
    path, how, ...(how === 'named' && !recorded.has(path) ? { written: true as const, word: words.get(path) ?? path } : {}),
  }));
  const note = (written: string, how: EverydayReach, placeable = false, listed = false): void => {
    // FN11: a word of the line an absolute `cd` placed is the file it names there, as `accessesOf` records it. A name the
    // output printed is placed by the listing's own folder, where the line says it (FN16) - a folder's path, spaces and all.
    const placed = placeable ? placements?.get(written) : listed && written.includes('/') ? written : undefined;
    // `./README.md` and `README.md` are one file, and `./app` the bare folder name `app` (2026-10-05, `find | sed`).
    const path = placed ?? sameFile(written);
    // Where a line sends its output is no file it opened: `find … 2>/dev/null` listed a file called `null` on the
    // maintainer's report (2026-10-07), as `printsOnly` has known since the review that added `SENT_AWAY`.
    if (sameFile(written) === '' || path === '.' || path === '..' || TOOL_FOLDERS.has(sameFile(written)) || NOT_A_NAME.test(path) || SENT_AWAY.test(sameFile(written))) return;
    if (!pathLike(path, { allowWhitespace: placed !== undefined }) || protectionOf(policy, path) !== undefined || protectionOf(policy, written) !== undefined) return;
    // Only the line's own words are noted placeable; everything else here was printed by the call.
    if (!placeable) recorded.add(path);
    else if (!words.has(path)) words.set(path, sameFile(written));
    const known = found.get(path);
    if (known === undefined || EVERYDAY_RANK[how] > EVERYDAY_RANK[known]) found.set(path, how);
  };
  const read = event.outcome === 'succeeded' && readsContent(event);
  // 2026-10-10: a printer's operand on a line whose end the record does not give may have been read - `if [ -f f ];
  // then cat f; …` returned `.output` alone - and a name only seen would say it was not (the maintainer: "Not known").
  const unsure = event.outcome === 'unknown';
  const operands = new Set(fileOperandsIn(event.commands));
  // A program that opened its operands and printed a fact about them instead of their text (2026-10-07).
  const quiet = new Set(event.outcome === 'succeeded' ? openedWithoutPrinting(event.commands).map(sameFile) : []);
  for (const command of event.commands) {
    // The line's own words - the program and its arguments, never the code an interpreter is handed (`python3 -c "…"`
    // held `csv.DictReader`) - each a file where its place says so or its shape does (found 2026-10-05).
    const simples = simpleCommandsIn(command);
    // NX1: never a name a `find` leaves out.
    const left = excludedNames(simples);
    for (const { program, args } of simples) {
      for (const word of [program, ...args]) {
        if (word.startsWith('-') || COUNT.test(word) || left.has(word)) continue;
        // A printer's operand is a file by its place; any other word is one where it holds a name's dot or a folder's
        // slash - `README.md`, `app/page.tsx` - and never a program (`ls`), a folder (`app`) or a pattern (`TODO`).
        if (operands.has(word) || quiet.has(sameFile(word)) || NAMES_A_FILE.test(sameFile(word))) {
          note(word, read && operands.has(word) ? 'read' : unsure && operands.has(word) ? 'unknown' : quiet.has(sameFile(word)) ? 'opened' : 'named', true);
        }
      }
    }
  }
  const content = event.result?.content;
  if (content === undefined || !outputShowsReach(event)) return result();
  const output = stringsIn(content).join('\n');
  const search = searchOf(event);
  if (search !== undefined) {
    // A hit's path by its shape too: a cell's `Output:` header reads as a hit on the word before its colon.
    for (const hit of hitLines(output, search.context)) {
      if (NAMES_A_FILE.test(sameFile(hit.path))) note(hit.path, event.result?.stage === 'model' ? 'read' : 'named');
    }
  } else if (event.resultShape === 'listing' && !readsContent(event)) {
    // FN16: in the folder it listed. FN17: read, where the line hands what it listed to a program that opens it.
    const how: EverydayReach = event.commands.some(handsListedNames) && event.result?.stage === 'model' ? 'read' : 'named';
    for (const { line: raw, folder: lying } of listedLines(event, home, root)) {
      const line = raw.trim();
      if (line === '') continue;
      const name = (listingPathCandidates(line)[0] ?? []).find((candidate) =>
        candidate.listed === 'file' || (candidate.listed === undefined && candidate.text === line && shapedLikePath(line) &&
          NAMES_A_FILE.test(line.replace(/^(?:\.\/)+/, ''))));
      if (name !== undefined) note(placedListed(name.text, lying), how, false, lying !== undefined);
    }
  }
  // FN17 as amended 2026-10-11: a loop's names where its own `echo` printed them - read where it printed their text, and
  // whether the rest of what it printed reads as a listing or as text.
  const looped = loopNamesOf(event, home);
  for (const name of looped?.names ?? []) note(name, looped?.read.includes(name) === true && event.result?.stage === 'model' ? 'read' : 'named', false, name.startsWith('/'));
  return result();
}

/**
 * The call is a search that prints what it matched: a shell search read from its command, or a tool that said so. The
 * Grep tool may or may not name the file on its lines, so that is left to what it printed.
 */
export function searchOf(event: ToolEvent): PrintedSearch | undefined {
  if (event.printsMatches === true) return { context: true, names: 'maybe' };
  if (event.commands.length === 0) return undefined;
  return event.commands.map(printedSearch).find((search) => search !== undefined);
}

/**
 * Whether what came back is the text of what the call named - a `Read`, or a shell line that only prints (`cat`) -
 * rather than a list of what it found. A tool's declared shape is refined by what was actually run, as `accessesOf`
 * reads it: this is the one place that decision is made.
 */
export function readsContent(event: ToolEvent): boolean {
  return event.resultShape === 'content' || (event.resultShape === 'listing' && printsContentOnly(event.commands));
}

/**
 * Whether what came back is the text of **this** file: the call printed what it named (`readsContent`), or the code an
 * interpreter was handed named this file and printed what it opened - the `python-open` route, whose output
 * `protectedValues` has read as the file's since the first measurement (`docs/detection.md`).
 *
 * Per file, where `readsContent` is per call: code may name one file and say nothing of another the same line named.
 * Found 2026-10-07 by the maintainer: Codex answered a question about a tracked file with a row of it, printed by
 * `python3 -c`, and the page said "Only saw a name" - a read was a read only where a value in it could be traced, and
 * a line of ordinary words is traced as prose (§5.2). What the agent was handed is not decided by how secret it looks.
 */
export function readsContentOf(event: ToolEvent, path: string): boolean {
  return readsContent(event) || (event.outcome === 'succeeded' && codeReadsNamedFile(event.commands, path));
}

/**
 * Whether what came back holds the text of what the call named beside a directory's names (`said-where-the-person-is`
 * SWO1): `cd apps && ls -la && cat .env`. Its `KEY=value` lines are the files'; the rest is read as a listing, as before.
 */
export function readsContentBesideNames(event: ToolEvent): boolean {
  return event.resultShape === 'listing' && !readsContent(event) && printsContentBesideNames(event.commands);
}

/**
 * Whether this call handed back the text of this one file (S3): it printed what it named, an interpreter's code opened
 * it, or - beside a directory's names - a printing program was given it. `readsContentBesideNames` is asked of the call,
 * so `ls -la .ssh && cat .env` read as a read of both, which the row could not show and the Files tab would have
 * (2026-10-08). The one answer a story's `read` and a flow step's `shown` both ask.
 */
export function printsTextOf(event: ToolEvent, path: string): boolean {
  if (readsContentOf(event, path)) return true;
  // Asked of an access already found succeeded - a story's, a flow's - so a cell with no exit code (XD4) whose output shows
  // the loop's names is a loop that ran; a refused line ran nothing, and its access says so.
  if (event.outcome !== 'blocked' && loopPrints(event.commands, path)) return true;
  if (event.outcome !== 'blocked' && listedPrints(event, path)) return true;
  return readsContentBesideNames(event) && fileOperandsIn(event.commands).some((word) => sameFile(word) === sameFile(path));
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN17: a line that hands a listing's names to a program printing their text printed
 * the text of each name its output listed - `for f in $(find . -type f); do cat "$f"; done` printed every file it listed,
 * in the folder it listed (FN16).
 */
function listedPrints(event: ToolEvent, path: string): boolean {
  const [only, ...more] = event.commands;
  if (only === undefined || more.length > 0) return false;
  // FN17 as amended 2026-10-11: or each name its own `echo` printed beside the text, but one a diagnostic speaks of.
  if ((loopNamesOf(event)?.read ?? []).some((name) => sameFile(name) === sameFile(path))) return true;
  if (!printsListedNames(only)) return false;
  return listedLines(event, undefined).some(({ line, folder: lying }) =>
    listingPathCandidates(line).some((candidates) => candidates.some((candidate) => sameFile(placedListed(candidate.text, lying)) === sameFile(path))));
}

/**
 * FN17 as amended 2026-10-11: the names an event's one line printed through its own `echo` - of a listing it handed a
 * program (`printedNames`), in the folder it listed (FN16), or of a loop over the words it lists (`wordLoopNames`), where
 * the line is when the loop runs - and of those, the ones whose text it printed. Read from what it printed: the result's
 * text, and the text a Codex result object carries escaped (XD11). A cell of several lines prints them all together, so
 * which line printed a name is not known.
 */
export function loopNamesOf(event: ToolEvent, home?: string): { readonly names: readonly string[]; readonly read: readonly string[] } | undefined {
  const [only, ...more] = event.commands;
  if (only === undefined || more.length > 0 || !outputShowsReach(event)) return undefined;
  const texts = stringsIn(event.result?.content);
  const printed = event.result?.printedText === undefined ? texts : [...texts, event.result.printedText];
  const listing = printedNames(only, printed);
  const words = wordLoopNames(only, printed);
  if (listing === undefined && words === undefined) return undefined;
  const folder = listingFolderOf(event, home);
  const here = words === undefined ? null : placeAt(only, words.at, home, event.workingDirectory);
  const placed = [
    ...(listing?.names ?? []).map((name) => ({ name: placedListed(name, folder), read: listing?.prints === true && !listing.unprinted.includes(name) })),
    ...(words?.names ?? []).map((name) => ({ name: here === null ? name : placedListed(name, here), read: words?.prints === true && !words.unprinted.includes(name) })),
  ];
  return { names: placed.map(({ name }) => name), read: placed.filter(({ read }) => read).map(({ name }) => name) };
}

/**
 * FNB25: the words of a line the shell rewrites into names - `cat a/*` + `/x`, a loop's list - and not a `find`
 * predicate's pattern (`find . -iname "*notes*"`), which `reachOf` leaves to `find` (FNB28).
 */
function shellExpanded(commands: readonly string[]): string[] {
  return commands.flatMap((command) => reachOf(command).globs);
}

/**
 * `2026-10-09-the-file-not-its-name.md` FNB25: a loop that prints each file its list names - `for f in a/*` +
 * `/{x.md,y.py}; do sed -n 1,55p "$f"; done` - printed this one where a word of its list, as the shell rewrites it, is
 * this path. A printing program is one of `PRINTS_CONTENT` that addresses something, or `sed` that edits nothing in place.
 */
function loopPrints(commands: readonly string[], path: string): boolean {
  return commands.some((command) => {
    const simples = simpleCommandsIn(command);
    return simples.some((simple, at) => {
      if (simple.program !== 'for' || simple.args[1] !== 'in') return false;
      const variable = simple.args[0] ?? '';
      if (!simple.args.slice(2).some((word) => word === path || matchesShellWord(path, word))) return false;
      for (const next of simples.slice(at + 1)) {
        if (next.program === 'done') return false;
        // `do head "$f"` is read as a program `do`: the program is its first word.
        const [program, args] = next.program === 'do' ? [next.args[0] ?? '', next.args.slice(1)] : [next.program, next.args];
        const prints = (printsContent(program) && !addressesNothing(program)) || (program === 'sed' && !args.some((arg) => arg.startsWith('-i')));
        if (prints && args.some((arg) => arg === '$' + variable || arg === '${' + variable + '}')) return true;
      }
      return false;
    });
  });
}

/** A shell word that sends output away rather than naming a file read: `2>/dev/null` is read as `2` and `/dev/null`. */
const SENT_AWAY = /^(?:\d|\/dev\/null)$/;

/**
 * One file, however a line wrote it. A `find` prints what it found as `./customers.csv`, and the command that counted
 * the same file names it `customers.csv`: kept apart, one file stood twice in the maintainer's report, once read and
 * once as a name, and every count of it was two (2026-10-07). A leading `./` is how a program prints a path, never part
 * of a name, and `everydayReach` has dropped it since 2026-10-05. Only the spelling recorded changes: which rule
 * protects a path is still read from the word as the line wrote it.
 */
function sameFile(path: string): string {
  return path.replace(/^(?:\.\/)+/, '');
}

/**
 * Whether what came back is the text of `paths` and of nothing else (`2026-10-02-said-where-the-person-is.md` SW14):
 * the call prints what it named (`readsContent`), and every file it names - each target of a tool, each word of a
 * shell line that is not an option - is one of them. Found by review: any call that named a private file was taken
 * for one that printed it, so `ls -a .env && printenv` hid a key printed from the environment, and `cat .env notes.txt`
 * one from `notes.txt`.
 */
export function printsOnly(event: ToolEvent, paths: ReadonlySet<string>): boolean {
  if (paths.size === 0 || !(readsContent(event) || readsContentBesideNames(event))) return false;
  // The files a shell line printed are the words of its programs that print a file: `cd`'s folder and `ls`'s print
  // none, and `echo`'s words are text.
  const words = fileOperandsIn(event.commands).filter((word) => !SENT_AWAY.test(word));
  const named = [...event.targets.filter((target) => target !== ''), ...words];
  return named.length > 0 && named.every((word) => paths.has(word) || pathTokens(word).some((token) => paths.has(token)));
}

/**
 * The protected paths one command line names, with the pattern that protects each - read exactly as a report reads the
 * command of a call, so a hook refusing a command and the report on the session cannot disagree about whether it named
 * a protected path (`specs/2026-09-16-worth-running-every-day.md` R18). Only what the line names: what the command would
 * print is not known before it runs.
 */
export function protectedPathsInCommand(command: string, policy: Policy, place?: ShellPlace): readonly (readonly [path: string, pattern: string, byName?: true])[] {
  return pathsInCommand(command, policy, place, false);
}

/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW2: of those, only what a program that prints what it is given was handed
 * - placed as the line places it, after its `cd`s - and never a word only named (`cd`, `test -d`, `ls`).
 */
export function protectedOperandsInCommand(command: string, policy: Policy, place?: ShellPlace): readonly (readonly [path: string, pattern: string, byName?: true])[] {
  return pathsInCommand(command, policy, place, true);
}

function pathsInCommand(
  command: string, policy: Policy, place: ShellPlace | undefined, operandsOnly: boolean,
): readonly (readonly [path: string, pattern: string, byName?: true])[] {
  // IP3: read where it runs as well as as written, exactly as `accessesOf` reads a call whose record says where it ran;
  // FN6: and a word in a folder the line does not let this follow is met by its name, as `accessesOf` meets it.
  const parsed = simpleCommandsIn(command);
  const how = new Map<string, 'exact' | 'name'>();
  const where = { ...(place === undefined ? {} : { places: placesIn(command, place, parsed) }), unplaced: foldersUnknown(command, parsed), how };
  // FND9: which were met only by their name, so a refusal can say the file it protects is another one of that name.
  return dedupe([
    // FNB29: a search's own pattern, and a listing `find`'s, open no file - for the hook, which stops what would. The report
    // keeps them: a name the agent looked for is the name it saw (P32a).
    ...(operandsOnly ? [] : protectedPathsAmong(withoutPatterns(command, parsed), policy, { allowWhitespace: true, ...where })),
    // SW17, exactly as `accessesOf` reads it, so the hook and the report never disagree about a bare operand.
    ...protectedPathsAmong(fileOperandsIn([command]), policy, { allowWhitespace: true, positional: true, ...where }),
  ]).map(([path, pattern]) => (how.get(path) === 'name' ? [path, pattern, true] as const : [path, pattern] as const));
}

/** FNB29: the words of a line that may name a file, less the programs' own patterns (`patternWords`). */
function withoutPatterns(command: string, parsed: SimpleCommands = simpleCommandsIn(command)): string[] {
  const patterns = patternWords(command, parsed);
  return commandPathCandidates(command).filter((candidate) => !patterns.has(candidate));
}

/**
 * A candidate holding whitespace is not offered to the policy. A path may legitimately contain a space, and
 * that is the cost; what is bought is every banner, diff header and sentence that happens to end in a path -
 * `--- apps/web/.npmrc` was reported as a file, and prose that trails off into a path was reported as one too.
 * Measured on one session: it is the difference between 85 findings and 76.
 */
function hasNoWhitespace(candidate: string): boolean {
  return !/\s/.test(candidate);
}

/**
 * A backslash in a candidate is an escape, and an escape belongs to a regular expression or to shell quoting -
 * `grep '\.env'` was being reported as a file called `\.env`. A path may legally hold one, and almost never
 * does on the systems this reads.
 */
function isNotEscaped(candidate: string): boolean {
  return !candidate.includes('\\');
}

/**
 * A name with no separator in it is a path only if it is a dotfile. Without this, the `env` property that every
 * TypeScript repository reads off Node's global process object is reported as a file called `.env`, and so is
 * `import.meta.env`. Dotted code and a dotted filename look alike; where the dot sits is what tells them apart.
 *
 * The cost is a file called `config.env` sitting in the working directory and named without a path. That is
 * rarer than the code, and it is a rule rather than a list of identifiers to keep extending.
 *
 * *Narrowed 2026-09-24* (`protectionFor`): it holds for a guessed candidate only. A person who wrote a rule naming
 * `customers.csv` had an agent run `cat customers.csv` and `grep -r … .`, whose hit came back as `customers.csv:6:…`
 * with a customer's name, e-mail and phone in it - and the report said "nothing private" of both.
 */
function looksAddressable(candidate: string): boolean {
  return candidate.includes('/') || candidate.startsWith('.');
}

/**
 * The entry that protects a candidate, where a candidate of its shape may be a file at all. A bare name - no separator,
 * no leading dot - is one where either:
 *
 * - **its position says so**: the value a tool was handed, or the field before a search hit's first colon, is a file
 *   name because of where it sits, whatever it looks like; or
 * - **a rule names it exactly**: a pattern whose last part holds no wildcard - one ending in `customers.csv` - was
 *   written for that one file. The `env` read off Node's process object is matched only by a wildcard (`*.env`),
 *   which is what the rule above is for.
 */
function protectionFor(policy: Policy, candidate: string, positional: boolean, addressable = looksAddressable(candidate)): ProtectedPath | undefined {
  const protection = protectionOf(policy, candidate);
  if (protection === undefined || positional || addressable) return protection;
  return policy.protected.find((entry) => namesOneFile(entry.pattern) && matchesGlob(candidate, entry.pattern));
}

/** A pattern whose last part is a name, not a wildcard: it was written for one file. */
function namesOneFile(pattern: string): boolean {
  const last = pattern.slice(pattern.lastIndexOf('/') + 1);
  return last !== '' && !GLOB.test(last);
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN6, FND2: a word whose folder is not known - in a line `foldersUnknown` names,
 * or holding a variable nobody can read here - met by the name its last part carries. A rule for one file then holds
 * where only that name can be seen, exactly as a rule for the name held there; a word that can be placed is still met
 * exactly, which is what lets the same name elsewhere through. The cost is the other files of that name in such a line,
 * refused as a rule for the name refused them (FNB6).
 */
function protectionByName(policy: Policy, candidate: string): ProtectedPath | undefined {
  const name = candidate.split(/[\s/]/).pop() ?? '';
  if (name === '' || GLOB.test(name)) return undefined;
  const named = policy.protected.filter((entry) => namesOneFile(entry.pattern) && entry.pattern.slice(entry.pattern.lastIndexOf('/') + 1) === name);
  // FND9, from FNB23: a file blocked and another of the same name on Track - the line is met by the blocked one, as
  // `refuse` (which reads Block alone) met it. Found when a stopped search showed as "Stopped" under a Track rule.
  return named.find((entry) => entry.mode !== 'tell') ?? named[0];
}

/**
 * A bracket or a quote left in a candidate means it is an expression, not a file. A command line has its paths
 * lifted out of such expressions before they get here (`command-line.ts`); a line of output does not, because
 * the text of a file is not something this tool is entitled to parse.
 */
const CODE_PUNCTUATION = /[()'"`]/;
const GLOB = /[*?]/;

/**
 * A search hit is not a path. `grep -n` prints `path:12:KEY=value`, and that whole string was being reported as the
 * name of a file - in a report, and then as a line of `check`, where it also carried a redacted value into a column of
 * paths. The path is the field before the first colon, and `listing.ts` already lifts it out for a result; this rejects
 * what is left when such a line arrives from somewhere else. Measured on real sessions.
 */
const SEARCH_HIT = /:\d+:/;

/**
 * An assignment is not a path either: `KEY=value` is what a file holds, not a file. A path may legally contain `=`,
 * and practically never does.
 */
const ASSIGNMENT = /=/;

/**
 * Everything that has to be true before a string is offered to the policy as a path someone reached. Each part
 * was written for a false positive that was actually measured on a real session, and is named for it.
 */
function pathLike(candidate: string, options: { readonly allowWhitespace: boolean }): boolean {
  return (
    candidate !== '' &&
    isNotEscaped(candidate) &&
    !CODE_PUNCTUATION.test(candidate) &&
    // A leading dash is an option or a diff marker: `--- apps/web/.npmrc` is a banner above a file, not a file.
    !candidate.startsWith('-') &&
    // A glob is a question, not an answer. `ls .env*` names no file, and reporting `.env*` as one reached puts
    // a string in the report that exists nowhere on disk. What such a command actually opened, if anything,
    // comes back in its output and is found there instead.
    !GLOB.test(candidate) &&
    !SEARCH_HIT.test(candidate) &&
    !ASSIGNMENT.test(candidate) &&
    (options.allowWhitespace || hasNoWhitespace(candidate))
  );
}

/**
 * A target is not text that happens to contain a path - it is the value the tool was handed, and the tool's
 * profile says that value names the file. So the whole value is offered first, and only if the policy does not
 * protect it are its tokens tried.
 *
 * Splitting first was wrong in a way that showed up in a report: a project at `/Users/someone/Client Name/app` had
 * every finding under it cut at the space, so `Client Name/app/apps/web/.env` was reported as a file called
 * `Name/app/apps/web/.env` - a path that exists nowhere. One target names one file, so the first match wins.
 */
function protectedTargets(targets: readonly string[], policy: Policy, places?: readonly ShellPlace[]): [string, string][] {
  const found = new Map<string, string>();

  for (const target of targets) {
    for (const candidate of [target, ...pathTokens(target)]) {
      // Whitespace disqualifies a token guessed out of text, never the value the tool was given.
      if (!pathLike(candidate, { allowWhitespace: candidate === target })) continue;

      // IP4: a tool given a relative path read it where the call ran; an absolute one is the same either way.
      const protection = protectionFor(policy, candidate, candidate === target) ??
        (candidate === target ? placedMatch(policy, candidate, true, places)?.protection : undefined);
      if (protection === undefined) continue;
      if (!found.has(candidate)) found.set(candidate, protection.pattern);
      break;
    }
  }
  return [...found];
}

/** Each path once, keeping the pattern it was first matched by. */
function dedupe(entries: readonly [string, string][]): [string, string][] {
  return [...new Map(entries.map(([path, pattern]) => [path, pattern] as const))];
}

/** Pairs of the path and the pattern that protects it, each path once, in the order they were met. */
function protectedPathsAmong(
  candidates: readonly string[],
  policy: Policy,
  options: {
    readonly allowWhitespace?: boolean;
    readonly positional?: boolean;
    readonly places?: readonly ShellPlace[];
    /** FN6: the line reads words in a folder this does not follow (`foldersUnknown`). */
    readonly unplaced?: boolean;
    /** FND9: told, for each path found, whether it was met as itself or only by its name - as itself anywhere wins. */
    readonly how?: Map<string, 'exact' | 'name'>;
  } = {},
): [string, string][] {
  const found = new Map<string, string>();

  const usable = candidates.filter((entry) =>
    pathLike(entry, { allowWhitespace: options.allowWhitespace === true }),
  );

  for (const candidate of usable) {
    if (found.has(sameFile(candidate))) continue;
    const written = protectionFor(policy, candidate, options.positional === true);
    const placed = written === undefined ? placedMatch(policy, candidate, options.positional === true, options.places) : undefined;
    const exact = written ?? placed?.protection;
    const protection = exact ?? (options.unplaced === true || UNKNOWN_VARIABLE.test(candidate) ? protectionByName(policy, candidate) : undefined);
    if (protection === undefined) continue;
    // FNB25: a word holding a variable (`"$f"`) names no file anyone can show; where its place put it inside a protected
    // folder, what it reached is that folder - the report said `$f` was a private file, *Not blocked*.
    const key = placed !== undefined && UNKNOWN_VARIABLE.test(candidate) ? folderBefore(placed.absolute) : sameFile(candidate);
    if (found.has(key)) continue;
    found.set(key, protection.pattern);
    if (exact !== undefined) options.how?.set(key, 'exact');
    else if (options.how?.get(key) !== 'exact') options.how?.set(key, 'name');
  }
  return [...found];
}

/**
 * IP3, IP4: a word read where it was run - against each folder its line ran in, the first that protects it. Only adds
 * to what the word as written already met: a rule naming a place (`/Users/someone/.ssh/**`) meets `cat .ssh/id_rsa` run in
 * the home folder, and a relative rule meets the same file however it was reached.
 */
function placedMatch(policy: Policy, candidate: string, positional: boolean, places: readonly ShellPlace[] | undefined): { readonly protection: ProtectedPath; readonly absolute: string } | undefined {
  if (places === undefined || candidate.startsWith('-')) return undefined;
  for (const place of places) {
    const absolute = located(candidate, place);
    if (absolute === candidate) continue;
    // Resolving makes every word look like a path; whether it is read as one is still the word as written decides -
    // `grep -n config.env src` names an identifier, and `<folder>/config.env` must not turn it into a file.
    const protection = protectionFor(policy, absolute, positional, looksAddressable(candidate));
    if (protection !== undefined) return { protection, absolute };
  }
  return undefined;
}

/** FNB25: a placed path up to the first part a variable stands in - the folder the word was read in. */
function folderBefore(absolute: string): string {
  const parts = absolute.split('/');
  const at = parts.findIndex((part) => part.includes('$'));
  return at <= 0 ? absolute : parts.slice(0, at).join('/') || '/';
}

/** One line of a listing names one file: the first candidate that the policy protects, and no more. */
function protectedPathsPerLine(lines: readonly (readonly ListingCandidate[])[], policy: Policy): [string, string][] {
  const found = new Map<string, string>();

  for (const candidates of lines) {
    // Whitespace disqualifies a guessed candidate but not a positional one: the field before a search hit's
    // first colon is a path because of where it sits, space in a directory name and all.
    const usable = candidates.filter((entry) => pathLike(entry.text, { allowWhitespace: entry.positional }));

    for (const { text: candidate, positional } of usable) {
      const protection = protectionFor(policy, candidate, positional);
      if (protection === undefined) continue;
      if (!found.has(sameFile(candidate))) found.set(sameFile(candidate), protection.pattern);
      break;
    }
  }
  return [...found];
}

function toAccess(
  event: ToolEvent,
  source: AccessSource,
  path: string,
  pattern: string,
  outcome: EventOutcome,
  lines: number | undefined,
  marks: { readonly opened?: true; readonly word?: string; readonly seen?: true } = {},
): ProtectedAccess {
  return {
    ...marks,
    ...(lines === undefined ? {} : { lines }),
    ...(outcome === 'blocked' && event.result?.refusedBy !== undefined ? { refusedBy: event.result.refusedBy } : {}),
    eventId: event.id,
    agentId: event.agentId,
    toolName: event.toolName,
    source,
    path,
    pattern,
    outcome,
    evidence: source === 'input' ? event.evidence : (event.result?.evidence ?? event.evidence),
  };
}

/**
 * FN16: the folder the names an event's listing printed lie in - read from its line where the event ran one line, since
 * a cell of several lines prints them all together and which one printed a name is not known.
 */
function listingFolderOf(event: ToolEvent, home: string | undefined, root?: string): string | undefined {
  const [only, ...more] = event.commands;
  // RW16: a listing run where the record says, other than the root, prints its names from there.
  return only === undefined || more.length > 0 ? undefined : listedFolder(only, home, event.workingDirectory, undefined, ranElsewhere(event, root));
}

/**
 * Each line an event's listing printed, with the folder its names lie in: the folder it listed (FN16), or, under the
 * heading of a section an `ls` wrote, the folder the heading names (FN16 as amended 2026-10-11). A heading - a line ending
 * in `:` at the top or after an empty line - is no name: `./04_lessons/__pycache__:` stood as a file of its own.
 */
function listedLines(event: ToolEvent, home: string | undefined, root?: string): readonly { readonly line: string; readonly folder: string | undefined }[] {
  const top = listingFolderOf(event, home, root);
  const ran = ranElsewhere(event, root);
  const [only, ...more] = event.commands;
  const sections = only === undefined || more.length > 0 ? undefined : listingSections(only, home, event.workingDirectory);
  const lines = stringsIn(event.result?.content).flatMap((text) => text.split('\n')).map((line) => line.replace(/\r$/, ''));
  if (sections === undefined) return lines.map((line) => ({ line, folder: top }));
  let folder = top;
  return lines.flatMap((line, index) => {
    const heading = /^(.+):$/.exec(line);
    if (heading?.[1] === undefined || (index > 0 && lines[index - 1]?.trim() !== '')) return [{ line, folder }];
    const section = sectionFolder(heading[1], sections.ranIn);
    // RW16: a section written from where the line ran, other than the root, lies there.
    folder = ran === undefined ? section : section === undefined ? ran : resolve(ran, section);
    return [];
  });
}

