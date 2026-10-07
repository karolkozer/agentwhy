// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EvidenceRef } from '../evidence.ts';
import type { EventOutcome, RefusalSource, ToolEvent, ToolUseId } from '../event.ts';
import { matchesGlob } from '../policy/glob.ts';
import { protectionOf, type Policy, type ProtectedPath } from '../policy/policy.ts';
import type { SessionModel } from '../session-model.ts';
import { commandPathCandidates, fileOperandsIn, printsContentBesideNames, printsContentOnly, simpleCommandsIn } from './command-line.ts';
import { listingPathCandidates, type ListingCandidate } from './listing.ts';
import { located, placesIn, type ShellPlace } from './shell-place.ts';
import { shapedLikePath } from './path-shape.ts';
import { pathTokens, stringsIn } from './path-tokens.ts';
import { outputIsClean, outputShowsReach } from './recorded-effect.ts';
import { hitLines } from './search-output.ts';
import { printedSearch, type PrintedSearch } from './search-reach.ts';

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
export function protectedAccesses(model: SessionModel, policy: Policy, home?: string): ProtectedAccess[] {
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));

  return model.events
    .filter((event) => !delegating.has(event.id))
    .flatMap((event) => accessesOf(event, policy, home));
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP4: the folders a call's words are read in - where it ran, and where each `cd` of
 * its command lines moves - once, each. None where the record does not say where it ran.
 */
function placesOf(event: ToolEvent, home: string | undefined): readonly ShellPlace[] | undefined {
  if (event.workingDirectory === undefined) return undefined;
  const start: ShellPlace = { workingDirectory: event.workingDirectory, ...(home === undefined ? {} : { home }) };
  const all = event.commands.length === 0 ? [start] : event.commands.flatMap((command) => placesIn(command, start));
  return [...new Map(all.map((place) => [place.workingDirectory, place])).values()];
}

function accessesOf(event: ToolEvent, policy: Policy, home?: string): ProtectedAccess[] {
  // A path parameter is a path. A command line is read for its arguments, and a listing for what it enumerates:
  // both have structure, and using it is what separates a file that was reached from a file that was mentioned.
  // A path parameter and a quoted shell argument are both positional: something said "this is one thing", so a
  // space inside belongs to it. Only guessed candidates - a line of output, a word taken out of prose - have to
  // be whitespace-free.
  const places = placesOf(event, home);
  const where = places === undefined ? {} : { places };
  const fromInput = dedupe([
    ...protectedTargets(event.targets, policy, places),
    ...protectedPathsAmong(event.commands.flatMap(commandPathCandidates), policy, { allowWhitespace: true, ...where }),
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
  const listed = enumerates
    ? stringsIn(event.result?.content).flatMap(listingPathCandidates).map((line) => (clean ? line : line.filter((candidate) => candidate.positional)))
    : [];
  const shown = protectedPathsPerLine(listed, policy);
  // A path the parameters already named is not an `S-result`: the source is what the other tools would miss.
  const fromResult = shown.filter(([path]) => !named.has(path));

  const printed = printedLines(event, [...named]);
  const outcomeOf = targetOutcome(event, printed, new Set(shown.map(([path]) => path)));
  // H1: lines a search printed are text the agent read only where the result is what its model was handed (X10).
  const lines = event.result?.stage === 'model' ? new Map([...printed].map(([path, each]) => [path, each.length])) : new Map<string, number>();
  return [
    ...fromInput.map(([path, pattern]) => toAccess(event, 'input', path, pattern, outcomeOf(path, 'input'), lines.get(path))),
    ...fromResult.map(([path, pattern]) => toAccess(event, 'result', path, pattern, outcomeOf(path, 'result'), lines.get(path))),
  ];
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
    for (const hit of hitLines(numbered, false)) printed.set(hit.path, [...(printed.get(hit.path) ?? []), hit.text]);
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
  for (const hit of hits) printed.set(hit.path, [...(printed.get(hit.path) ?? []), hit.text]);
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

/** How a call reached a file no protected pattern matches: its text came back, or only its name was seen. */
export type EverydayReach = 'read' | 'named';

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
export function everydayReach(event: ToolEvent, policy: Policy): readonly { readonly path: string; readonly how: EverydayReach }[] {
  if (!event.toolKnown) return [];
  const found = new Map<string, EverydayReach>();
  const note = (written: string, how: EverydayReach): void => {
    // `./README.md` and `README.md` are one file, and `./app` the bare folder name `app` (2026-10-05, `find | sed`).
    const path = written.replace(/^(?:\.\/)+/, '');
    if (path === '' || path === '.' || path === '..' || TOOL_FOLDERS.has(path) || NOT_A_NAME.test(path)) return;
    if (!pathLike(path, { allowWhitespace: false }) || protectionOf(policy, path) !== undefined || protectionOf(policy, written) !== undefined) return;
    if (found.get(path) !== 'read') found.set(path, how);
  };
  const read = event.outcome === 'succeeded' && readsContent(event);
  const operands = new Set(fileOperandsIn(event.commands));
  for (const command of event.commands) {
    // The line's own words - the program and its arguments, never the code an interpreter is handed (`python3 -c "…"`
    // held `csv.DictReader`) - each a file where its place says so or its shape does (found 2026-10-05).
    for (const { program, args } of simpleCommandsIn(command)) {
      for (const word of [program, ...args]) {
        if (word.startsWith('-') || COUNT.test(word)) continue;
        // A printer's operand is a file by its place; any other word is one where it holds a name's dot or a folder's
        // slash - `README.md`, `app/page.tsx` - and never a program (`ls`), a folder (`app`) or a pattern (`TODO`).
        if (operands.has(word) || NAMES_A_FILE.test(word.replace(/^(?:\.\/)+/, ''))) note(word, read && operands.has(word) ? 'read' : 'named');
      }
    }
  }
  const content = event.result?.content;
  if (content === undefined || !outputShowsReach(event)) return [...found].map(([path, how]) => ({ path, how }));
  const output = stringsIn(content).join('\n');
  const search = searchOf(event);
  if (search !== undefined) {
    // A hit's path by its shape too: a cell's `Output:` header reads as a hit on the word before its colon.
    for (const hit of hitLines(output, search.context)) {
      if (NAMES_A_FILE.test(hit.path.replace(/^(?:\.\/)+/, ''))) note(hit.path, event.result?.stage === 'model' ? 'read' : 'named');
    }
  } else if (event.resultShape === 'listing' && !readsContent(event)) {
    for (const raw of output.split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      const name = (listingPathCandidates(line)[0] ?? []).find((candidate) =>
        candidate.listed === 'file' || (candidate.listed === undefined && candidate.text === line && shapedLikePath(line) &&
          NAMES_A_FILE.test(line.replace(/^(?:\.\/)+/, ''))));
      if (name !== undefined) note(name.text, 'named');
    }
  }
  return [...found].map(([path, how]) => ({ path, how }));
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
 * Whether what came back holds the text of what the call named beside a directory's names (`said-where-the-person-is`
 * SWO1): `cd apps && ls -la && cat .env`. Its `KEY=value` lines are the files'; the rest is read as a listing, as before.
 */
export function readsContentBesideNames(event: ToolEvent): boolean {
  return event.resultShape === 'listing' && !readsContent(event) && printsContentBesideNames(event.commands);
}

/** A shell word that sends output away rather than naming a file read: `2>/dev/null` is read as `2` and `/dev/null`. */
const SENT_AWAY = /^(?:\d|\/dev\/null)$/;

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
export function protectedPathsInCommand(command: string, policy: Policy, place?: ShellPlace): readonly (readonly [path: string, pattern: string])[] {
  // IP3: read where it runs as well as as written, exactly as `accessesOf` reads a call whose record says where it ran.
  const where = place === undefined ? {} : { places: placesIn(command, place) };
  return dedupe([
    ...protectedPathsAmong(commandPathCandidates(command), policy, { allowWhitespace: true, ...where }),
    // SW17, exactly as `accessesOf` reads it, so the hook and the report never disagree about a bare operand.
    ...protectedPathsAmong(fileOperandsIn([command]), policy, { allowWhitespace: true, positional: true, ...where }),
  ]);
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
        (candidate === target ? placedProtection(policy, candidate, true, places) : undefined);
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
  options: { readonly allowWhitespace?: boolean; readonly positional?: boolean; readonly places?: readonly ShellPlace[] } = {},
): [string, string][] {
  const found = new Map<string, string>();

  const usable = candidates.filter((entry) =>
    pathLike(entry, { allowWhitespace: options.allowWhitespace === true }),
  );

  for (const candidate of usable) {
    if (found.has(candidate)) continue;
    const protection = protectionFor(policy, candidate, options.positional === true) ??
      placedProtection(policy, candidate, options.positional === true, options.places);
    if (protection !== undefined) found.set(candidate, protection.pattern);
  }
  return [...found];
}

/**
 * IP3, IP4: a word read where it was run - against each folder its line ran in, the first that protects it. Only adds
 * to what the word as written already met: a rule naming a place (`/Users/someone/.ssh/**`) meets `cat .ssh/id_rsa` run in
 * the home folder, and a relative rule meets the same file however it was reached.
 */
function placedProtection(policy: Policy, candidate: string, positional: boolean, places: readonly ShellPlace[] | undefined): ProtectedPath | undefined {
  if (places === undefined || candidate.startsWith('-')) return undefined;
  for (const place of places) {
    const absolute = located(candidate, place);
    if (absolute === candidate) continue;
    // Resolving makes every word look like a path; whether it is read as one is still the word as written decides -
    // `grep -n config.env src` names an identifier, and `<folder>/config.env` must not turn it into a file.
    const protection = protectionFor(policy, absolute, positional, looksAddressable(candidate));
    if (protection !== undefined) return protection;
  }
  return undefined;
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
      if (!found.has(candidate)) found.set(candidate, protection.pattern);
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
): ProtectedAccess {
  return {
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
