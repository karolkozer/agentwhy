import type { EvidenceRef } from '../evidence.ts';
import type { EventOutcome, ToolEvent, ToolUseId } from '../event.ts';
import { matchesGlob } from '../policy/glob.ts';
import { protectionOf, type Policy, type ProtectedPath } from '../policy/policy.ts';
import type { SessionModel } from '../session-model.ts';
import { commandPathCandidates, printsContentOnly } from './command-line.ts';
import { listingPathCandidates, type ListingCandidate } from './listing.ts';
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
export function protectedAccesses(model: SessionModel, policy: Policy): ProtectedAccess[] {
  const delegating = new Set(model.delegations.map((delegation) => delegation.id));

  return model.events
    .filter((event) => !delegating.has(event.id))
    .flatMap((event) => accessesOf(event, policy));
}

function accessesOf(event: ToolEvent, policy: Policy): ProtectedAccess[] {
  // A path parameter is a path. A command line is read for its arguments, and a listing for what it enumerates:
  // both have structure, and using it is what separates a file that was reached from a file that was mentioned.
  // A path parameter and a quoted shell argument are both positional: something said "this is one thing", so a
  // space inside belongs to it. Only guessed candidates - a line of output, a word taken out of prose - have to
  // be whitespace-free.
  const fromInput = dedupe([
    ...protectedTargets(event.targets, policy),
    ...protectedPathsAmong(event.commands.flatMap(commandPathCandidates), policy, { allowWhitespace: true }),
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
 * The protected paths one command line names, with the pattern that protects each - read exactly as a report reads the
 * command of a call, so a hook refusing a command and the report on the session cannot disagree about whether it named
 * a protected path (`specs/2026-09-16-worth-running-every-day.md` R18). Only what the line names: what the command would
 * print is not known before it runs.
 */
export function protectedPathsInCommand(command: string, policy: Policy): readonly (readonly [path: string, pattern: string])[] {
  return protectedPathsAmong(commandPathCandidates(command), policy, { allowWhitespace: true });
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
function protectionFor(policy: Policy, candidate: string, positional: boolean): ProtectedPath | undefined {
  const protection = protectionOf(policy, candidate);
  if (protection === undefined || positional || looksAddressable(candidate)) return protection;
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
function protectedTargets(targets: readonly string[], policy: Policy): [string, string][] {
  const found = new Map<string, string>();

  for (const target of targets) {
    for (const candidate of [target, ...pathTokens(target)]) {
      // Whitespace disqualifies a token guessed out of text, never the value the tool was given.
      if (!pathLike(candidate, { allowWhitespace: candidate === target })) continue;

      const protection = protectionFor(policy, candidate, candidate === target);
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
  options: { readonly allowWhitespace?: boolean } = {},
): [string, string][] {
  const found = new Map<string, string>();

  const usable = candidates.filter((entry) =>
    pathLike(entry, { allowWhitespace: options.allowWhitespace === true }),
  );

  for (const candidate of usable) {
    if (found.has(candidate)) continue;
    const protection = protectionFor(policy, candidate, false);
    if (protection !== undefined) found.set(candidate, protection.pattern);
  }
  return [...found];
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
