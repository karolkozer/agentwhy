// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { addressesNothing, boundedProgram, printsContent, simpleCommandsIn } from './command-line.ts';

/**
 * What a command line will open without naming it: a recursive search, and a word the shell expands into file names
 * before the program runs. Read for `refuse` (`specs/2026-09-16-worth-running-every-day.md` R21a), which has to decide
 * before the command runs - a report finds the same files afterwards, in what the command printed.
 *
 * `grep -rn "SUPABASE_URL" .` names a variable and a directory, and prints `.env:2:SUPABASE_URL=…`. That is the motivating
 * case, and a command-line reader that looks only for protected names passes it every time. What is read here is
 * where such a search starts and which of its own filters narrow it, so that the directories can be walked and the
 * files it would open looked up in the policy.
 *
 * Only the arguments are read. A search whose reach is decided elsewhere - an ignore file, a file of patterns, a type
 * list - is taken to reach more than it may, which costs a refusal the agent can answer, never a file let through.
 */
export interface RecursiveSearch {
  /** Where the search starts, as written. A recursive `grep` given none starts at `.`, as `rg` always does. */
  readonly roots: readonly string[];
  /** Only files whose name matches one of these are read. Empty: every file is. */
  readonly includes: readonly NameGlob[];
  /** Files whose name matches one of these are skipped. */
  readonly excludes: readonly NameGlob[];
  /** Directories whose name matches one of these are not entered. */
  readonly excludeDirs: readonly NameGlob[];
  /** Whether hidden files and directories are entered. `grep -r` enters them; `rg` does not unless told to. */
  readonly hidden: boolean;
  /** Only the files directly in a root are reached, as `ls docs` lists them (FN17). Absent: every level below. */
  readonly shallow?: true;
  /**
   * Where in the line it runs: its place among the line's simple commands, so a `cd` before it moves where it starts
   * (`cd docs && grep -r KEY .` reads `docs`). Absent: where the line starts.
   */
  readonly at?: number;
}

/** A glob a name is matched against. `caseless`: without regard to case, as `rg --iglob` matches. */
export interface NameGlob {
  readonly glob: string;
  readonly caseless?: true;
}

export interface CommandReach {
  readonly searches: readonly RecursiveSearch[];
  /** Words the shell expands into file names before the program runs: `.env*`, `config/*.pem`. */
  readonly globs: readonly string[];
}

const GREPS = new Set(['grep', 'egrep', 'fgrep']);

/** A `find` predicate whose value is its own pattern, matched by `find` as it walks - never a file it is given. */
const FIND_PATTERNS = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-lname', '-ilname']);

/** A glob character the shell expands in an unquoted word. */
const GLOB = /[*?[]/;

export function hasGlob(word: string): boolean {
  return GLOB.test(word);
}

/** A brace list the shell expands before any glob: `{a,b}`, a comma inside one pair of braces. */
const BRACES = /\{[^{}]*,[^{}]*\}/;

/**
 * `2026-10-09-the-file-not-its-name.md` FNB25: a word the shell rewrites into other words - a glob, or a brace list
 * (`folder/{a.md,b.py}`), which bash expands before any glob. Found when `sed` of `folder/` + `*` + `/{teoria.md,exercise.py}` read a
 * blocked folder's files: neither part was expanded.
 */
export function expandsInShell(word: string): boolean {
  return GLOB.test(word) || BRACES.test(word);
}

/**
 * FNB25: whether a path is one of the names a word the shell expands becomes - part by part, a wildcard matching within
 * one part as the shell's does (`a/*` + `/x` is never `a/b/c/x`), a brace list read as its words. Brackets too (`0[13]*`).
 */
export function matchesShellWord(path: string, word: string): boolean {
  const parts = path.replace(/^(?:\.\/)+/, '').split('/');
  return bracesOf(word).some((one) => {
    const globs = one.replace(/^(?:\.\/)+/, '').split('/');
    return globs.length === parts.length &&
      globs.every((glob, at) => (hasGlob(glob) ? matchesName(parts[at] as string, glob, { period: true }) : glob === parts[at]));
  });
}

/** The most words one brace list is let become: past it, the word is left as written. */
const MOST_BRACED = 64;

/**
 * The words bash makes of a word's brace lists, outermost first, in order: `a/{b,c}/d` is `a/b/d` and `a/c/d`. A range
 * (`{1..3}`) is no list and is left as written; a word past `MOST_BRACED` is left whole.
 */
export function bracesOf(word: string): string[] {
  const match = BRACES.exec(word);
  if (match === null) return [word];
  const before = word.slice(0, match.index);
  const after = word.slice(match.index + match[0].length);
  const words = match[0].slice(1, -1).split(',').flatMap((one) => bracesOf(before + one + after));
  return words.length > MOST_BRACED ? [word] : words;
}

/**
 * The searches a command line runs and the words its shell expands. The pattern a search looks for is neither: `grep
 * "KEY.*" src` expands nothing, because the word is quoted and is a pattern. Only the words a program takes as files
 * are offered as globs.
 */
export function reachOf(command: string): CommandReach {
  const searches: RecursiveSearch[] = [];
  const globs: string[] = [];
  const parsed = simpleCommandsIn(command);

  for (const [at, { program, args, fed }] of parsed.entries()) {
    if (addressesNothing(program)) continue;
    const search = GREPS.has(program) ? grepArguments(args) : program === 'rg' ? rgArguments(args) : undefined;
    // A `find` predicate's value is `find`'s own pattern (`find docs -iname '*note*'`), never a word the shell expands:
    // read as one, it "expanded" to the root's blocked `note.md` and a search for names was refused (FNB28).
    const files = search !== undefined ? search.paths
      : args.filter((word, at) => !word.startsWith('-') && !(program === 'find' && FIND_PATTERNS.has(args[at - 1] ?? '')));

    globs.push(...files.filter(expandsInShell));
    // `2026-10-09-the-file-not-its-name.md` FN13, FNB27: ripgrep given no path searches what it is fed - `rg --files |
    // rg x` reads the names the first prints - and no folder. `grep -r` given none reads the folder, fed or not.
    if (program === 'rg' && fed === true && search?.paths.length === 0) continue;
    if (search?.recursive === true) {
      const { includes, excludes, excludeDirs, hidden } = search;
      searches.push({ roots: search.paths.length === 0 ? ['.'] : search.paths, includes, excludes, excludeDirs, hidden, at });
    }
  }
  return { searches: [...searches, ...handedListings(parsed).map(({ prints: _prints, ...search }) => search)], globs };
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN17: a program that lists names - `find`, `ls`, `rg --files` - whose names the
 * line hands to another program that opens them reaches every file it could list, as a recursive search does (R21a). Found
 * 2026-10-10 in the Claude desktop app: `cd lesson && for f in $(find . -type f); do cat "$f"; done` printed a blocked
 * `exercise.py` whole, and `refuse` let it run, as it let `find lesson -exec cat {} \;`, `find lesson | xargs cat`,
 * `cat $(find lesson)` and `find lesson | while read f; do cat "$f"; done` - eleven shapes measured, where only a loop over
 * a glob was refused. Handed: by `-exec` and its kin, by a substitution to a program that takes it or reads a variable,
 * or down a pipe to `xargs` or to a `read` whose variable a program then reads. A program that only says a name -
 * `echo "$f"`, `basename`, `ls -l "$f"` - opens nothing, and hands nothing on.
 */
function handedListings(parsed: ReturnType<typeof simpleCommandsIn>): (RecursiveSearch & { readonly prints: boolean })[] {
  const opens = (at: number): boolean => {
    const { program, args, takes } = parsed[at] ?? { program: '', args: [] };
    return !NAMES_ONLY.has(program) && !LOOP_WORDS.has(program) && (takes === true || args.some((arg) => arg.includes('$')));
  };
  const someOpens = parsed.some((_, at) => opens(at));
  const printing = printsText;
  const openersPrint = parsed.some(({ program, args }, at) => opens(at) && printing(program, args));
  const handed: (RecursiveSearch & { readonly prints: boolean })[] = [];
  for (const [at, simple] of parsed.entries()) {
    const listing = listingOf(simple.program, simple.args);
    if (listing === undefined) continue;
    // Down the pipe, past programs that only filter the names (`| grep -v pyc | sort`), to what takes them.
    let after = at + 1;
    while (parsed[after]?.fed === true && PIPE_FILTERS.has(parsed[after]?.program ?? '')) after += 1;
    const next = parsed[after];
    const piped = next?.fed === true && !(next.substituted === true && simple.substituted !== true);
    const byExec = simple.program === 'find' && execProgram(simple.args) !== undefined && !NAMES_ONLY.has(execProgram(simple.args) ?? '');
    const bySubstitution = simple.substituted === true && someOpens;
    const byXargs = piped && next.program === 'xargs' && !NAMES_ONLY.has(xargsProgram(next.args) ?? 'echo');
    const byRead = piped && next.program === 'read' && parsed.some((_, later) => later > after && opens(later));
    if (!(byExec || bySubstitution || byXargs || byRead)) continue;
    // Whether what opens the names prints their text, so a report reads each listed name as a file read (FN17).
    const execArgs = simple.args.slice(simple.args.findIndex((arg) => ['-exec', '-execdir', '-ok', '-okdir'].includes(arg)) + 2);
    const xargsArgs = next?.args ?? [];
    const prints = (byExec && printing(execProgram(simple.args), execArgs)) ||
      (byXargs && printing(xargsProgram(xargsArgs), xargsArgs.slice(xargsArgs.indexOf(xargsProgram(xargsArgs) ?? '') + 1))) ||
      ((bySubstitution || byRead) && openersPrint);
    handed.push({ ...listing, at, prints });
  }
  return handed;
}

/**
 * FN17 for a report: whether the line hands the names a listing prints to a program that opens them, so each name it
 * printed is a file the line read - `cd lesson && find . -type f && for f in $(find . -type f); do cat "$f"; done`.
 */
export function handsListedNames(command: string): boolean {
  return handedListings(simpleCommandsIn(command)).length > 0;
}

/** FN17: whether what the line hands a listing's names to prints their text - `cat`, `head`, `sed -n` - not `wc -l`. */
export function printsListedNames(command: string): boolean {
  return handedListings(simpleCommandsIn(command)).some((handed) => handed.prints);
}

/** A program that prints the text of the files it is given: `cat`, `head`, `sed` that edits nothing in place. */
function printsText(program: string | undefined, args: readonly string[] = []): boolean {
  return program !== undefined && ((printsContent(program) && !addressesNothing(program)) || (program === 'sed' && !args.some((arg) => arg.startsWith('-i'))));
}

/**
 * `2026-10-09-the-file-not-its-name.md` FN17 as amended 2026-10-11: the names a line that hands a listing's names to a
 * program printed, and whether that program printed their text. Found on the maintainer's round of that day: a loop
 * `for f in $(find . -type f); do echo "=== $f"; cat "$f"; done` read a tracked file in all six places, and every report
 * said nothing private was read - the listing's own lines are the loop's words, never its output, so no name was found.
 * The names are where the line itself puts them: what its `echo` or `printf` writes around the loop's variable, or the
 * header `head` and `tail` write over each of several files (`==> name <==`) - a place the command defines, as `ls -l`
 * defines its last field, never a path read out of a file's text. A name counts only in the form its listing writes
 * one (`./x` under `find .`, `docs/x` under `find docs`, a bare name under `ls`), so a line of a file that happens to
 * match the `echo` names nothing. `undefined` where the line hands no listing on.
 */
export function printedNames(command: string, texts: readonly string[]): PrintedNames | undefined {
  const parsed = simpleCommandsIn(command);
  const handed = handedListings(parsed);
  if (handed.length === 0) return undefined;
  const lines = texts.flatMap((text) => text.split('\n')).map((line) => line.replace(/\r$/, ''));
  const names = new Set<string>();
  let prints = handed.some((one) => one.prints);
  for (const listing of handed) {
    const at = listing.at;
    const lister = at === undefined ? undefined : parsed[at];
    if (at === undefined || lister === undefined) continue;
    const fits = nameForm(lister.program, listing.roots);
    for (const body of loopBodies(parsed, at)) {
      if (body.prints) prints = true;
      for (const name of namesIn(lines, body.templates, fits)) names.add(name);
    }
    if (headerPrinted(parsed, at)) {
      for (const line of lines) {
        const name = /^==> (.+) <==$/.exec(line)?.[1];
        if (name !== undefined && fits(name)) names.add(name);
      }
    }
  }
  // `cat: ./x: Permission denied` after `=== ./x`: the loop said the name and printed no text of it.
  const unprinted = [...names].filter((name) => lines.some((line) => line.includes(': ' + name + ': ')));
  return { names: [...names], prints, unprinted };
}

export interface PrintedNames {
  /** The names, as the listing wrote them. */
  readonly names: readonly string[];
  /** The line prints the text of what it was handed. */
  readonly prints: boolean;
  /** Names a diagnostic of the output speaks of: said, and not printed. */
  readonly unprinted: readonly string[];
}

/**
 * `2026-10-11-says-only-what-it-knows.md` SK1-SK5: the line printed the text of files whose names it does not write, and
 * its output names none of them. What it read is then not in the record: an access it does not establish (X11), never a
 * call that reached nothing. Found on the rounds of that day, where each new loop a reader did not know said *Nothing
 * private* over a file it had printed; a line's shapes have no end (SKB2), so what one does not know is said.
 */
export function printsUnnamedFiles(command: string, texts: readonly string[]): boolean {
  const parsed = simpleCommandsIn(command);
  if (!printsUnknownNames(parsed, literalVariables(command, parsed))) return false;
  return !outputNamesFiles(command, parsed, texts);
}

/** SK1: a printing program given a file whose name the line does not write, or handed names by a listing or `xargs`. */
function printsUnknownNames(parsed: ReturnType<typeof simpleCommandsIn>, known: ReadonlySet<string>, depth = 0): boolean {
  if (depth > 2) return false;
  return parsed.some((simple) => {
    const { program, args } = simple;
    if (printsText(program, args)) {
      const operands = fileOperands(program, args);
      // `cat $(find docs)`: a substitution's output where no file is written is the files. Beside a written one it is a
      // `sed` script's part far more often than a file - `sed -n "$(grep -n … | cut -d: -f1),+30p" notes.md` (SKB1).
      return (simple.takes === true && operands.length === 0) || operands.some((arg) => unknownName(arg, known));
    }
    const exec = args.findIndex((arg) => ['-exec', '-execdir'].includes(arg));
    if (program === 'find' && exec !== -1) return handsUnknownNames(args.slice(exec + 1), known, depth);
    if (program === 'xargs') {
      const at = args.findIndex((arg) => arg === xargsProgram(args));
      return at !== -1 && handsUnknownNames(args.slice(at), known, depth);
    }
    return false;
  });
}

/** What `find -exec` and `xargs` run with the names they hand on: a printer prints them, a shell's script may. */
function handsUnknownNames(words: readonly string[], known: ReadonlySet<string>, depth: number): boolean {
  const [program, ...args] = words;
  if (program === undefined) return false;
  if (SHELLS_RUNNING_CODE.has(program) && args[0] === '-c') {
    const code = args[1] ?? '';
    return printsUnknownNames(simpleCommandsIn(code), literalVariables(code, simpleCommandsIn(code)), depth + 1);
  }
  return printsText(program, args);
}

/** SK4: the words of a printing program that are files - never `sed`'s script, nor the count beside `head -n`. */
function fileOperands(program: string, args: readonly string[]): string[] {
  const operands: string[] = [];
  const scripted = program === 'sed' && args.some((arg) => ['-e', '--expression', '-f', '--file'].includes(arg) || /^--(?:expression|file)=/.test(arg));
  let scriptSeen = scripted;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? '';
    if (program === 'sed' && ['-e', '--expression', '-f', '--file'].includes(arg)) { at += 1; continue; }
    if ((program === 'head' || program === 'tail') && ['-n', '-c', '--lines', '--bytes'].includes(arg)) { at += 1; continue; }
    if (arg.startsWith('-')) continue;
    if (program === 'sed' && !scriptSeen) { scriptSeen = true; continue; }
    operands.push(arg);
  }
  return operands;
}

/**
 * SK2, SK3: whether a file's own name is unknown to the line - its last part a variable, a glob or `{}`, or a substitution
 * builds it - but for a variable the line itself sets to a literal, whole.
 */
function unknownName(arg: string, known: ReadonlySet<string>): boolean {
  if (arg === '-' || arg.includes('$(') || arg.includes('`')) return arg !== '-';
  const last = arg.replace(/\/+$/, '').split('/').at(-1) ?? arg;
  if (last.includes('{}') || /[*?[]/.test(last)) return true;
  if (!last.includes('$')) return false;
  const whole = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/.exec(last);
  const name = whole?.[1] ?? whole?.[2];
  return name === undefined || !known.has(name);
}

/**
 * SK3: the variables a line sets to a literal - `f=docs/a.md`, `export F=docs/a.md`, a loop over words with no glob - whose
 * value is then a word of the line, met as one. A value of a variable, a substitution or a glob is none.
 */
function literalVariables(command: string, parsed: ReturnType<typeof simpleCommandsIn>): ReadonlySet<string> {
  const known = new Set<string>();
  for (const match of command.matchAll(/(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s;&|]*)/g)) {
    const value = (match[2] ?? '').replace(/^(["'])(.*)\1$/, '$2');
    if (value !== '' && !/[$`*?[]/.test(value) && match[1] !== undefined) known.add(match[1]);
  }
  for (const simple of parsed) {
    const words = simple.args.slice(2);
    if (simple.program === 'for' && simple.args[1] === 'in' && simple.takes !== true && words.length > 0 && words.every((word) => !/[$`*?[]/.test(word))) {
      const variable = simple.args[0];
      if (variable !== undefined) known.add(variable);
    }
  }
  return known;
}

/** SK5: whether the output names a file the line printed - its own `echo`, a header, a line a listing or glob of it writes. */
function outputNamesFiles(command: string, parsed: ReturnType<typeof simpleCommandsIn>, texts: readonly string[]): boolean {
  if ((printedNames(command, texts)?.names.length ?? 0) > 0 || (wordLoopNames(command, texts)?.names.length ?? 0) > 0) return true;
  const lines = texts.flatMap((text) => text.split('\n')).map((line) => line.trim()).filter((line) => line !== '');
  if (lines.some((line) => /^==> .+ <==$/.test(line))) return true;
  const globs = parsed.flatMap((simple) => simple.args.filter((arg) => expandsInShell(arg)));
  return parsed.some((simple) => {
    if (simple.substituted === true || !LISTS_NAMES.has(simple.program)) return false;
    const listing = listingOf(simple.program, simple.args);
    const fits = listing === undefined ? undefined : nameForm(simple.program, listing.roots);
    return fits !== undefined && lines.some((line) => fits(line));
    // A line a glob of the line becomes, path-shaped: `ls *.md` printed `notes.md`. A line of a file that ends like one -
    // `see notes.md` - names nothing, for a glob's `*` would match its words and space alike.
  }) || lines.some((line) => !/\s/.test(line) && globs.some((glob) => matchesShellWord(line, glob)));
}

/** The programs whose own lines name what they list. */
const LISTS_NAMES = new Set(['find', 'ls', 'rg']);

/** Whether a name is one this listing writes: under one of `find`'s roots as it writes them, a bare name for `ls`. */
function nameForm(program: string, roots: readonly string[]): (name: string) => boolean {
  if (program === 'ls') return (name) => !name.includes('/') && name !== '.' && name !== '..' && !/\s$/.test(name);
  const prefixes = roots.map((root) => (root === '.' ? './' : root.replace(/\/+$/, '') + '/'));
  if (program === 'rg' && roots.length === 1 && roots[0] === '.') return (name) => !name.startsWith('/') && !name.split('/').includes('..');
  return (name) => roots.includes(name) || prefixes.some((prefix) => name.startsWith(prefix) && name.length > prefix.length);
}

/** One loop over a listing's names: where its own `echo`/`printf` puts a name, and whether it prints the file's text. */
interface LoopBody {
  readonly templates: readonly ((line: string) => string | undefined)[];
  readonly prints: boolean;
  /** It does nothing but say the name and print the text of the file the name is (`onlyNamesAndPrints`). */
  readonly pure: boolean;
}

/**
 * The loops that take the names of the listing at `at`: `for f in $(find …)`, `find … | while read f`, and the script
 * `find … -exec sh -c '…' sh {} +` runs - over its arguments (`for f; do`) or over `$1`.
 */
function loopBodies(parsed: ReturnType<typeof simpleCommandsIn>, at: number): LoopBody[] {
  const lister = parsed[at];
  if (lister === undefined) return [];
  const bodies: LoopBody[] = [];
  if (lister.substituted === true) {
    const loop = parsed.findIndex((simple, index) => index > at && simple.program === 'for' && simple.takes === true && simple.args[1] === 'in');
    const variable = parsed[loop]?.args[0];
    if (loop !== -1 && variable !== undefined) bodies.push(bodyOf(until(loop + 1, parsed), [variableToken(variable)]));
  }
  let after = at + 1;
  while (parsed[after]?.fed === true && PIPE_FILTERS.has(parsed[after]?.program ?? '')) after += 1;
  const next = parsed[after];
  if (next?.fed === true && next.program === 'read') {
    const variable = next.args.filter((arg) => !arg.startsWith('-')).at(-1);
    if (variable !== undefined) bodies.push(bodyOf(until(after + 1, parsed), [variableToken(variable)]));
  }
  // `xargs -I{} sh -c 'printf "=== %s\n" "{}"; cat "{}"'`: the text `-I` names stands for each name in the script.
  if (next?.fed === true && next.program === 'xargs') {
    const program = next.args.findIndex((arg, index) => arg === xargsProgram(next.args) && !next.args[index - 1]?.match(/^-[IiJ]$/));
    const replaced = replaceString(next.args.slice(0, Math.max(program, 0)));
    const script = scriptBody(next.args.slice(program), replaced);
    if (program !== -1 && script !== undefined) bodies.push(script);
  }
  const exec = lister.args.findIndex((arg) => ['-exec', '-execdir'].includes(arg));
  if (lister.program === 'find' && exec !== -1) {
    const script = scriptBody(lister.args.slice(exec + 1), undefined);
    if (script !== undefined) bodies.push(script);
  }
  return bodies;
}

/**
 * The script a shell is handed with `-c`, each name it is given standing as `xargs -I`'s text, as the variable of its
 * own loop over its arguments (`for f; do`, `for f do`), or as `$1`.
 */
function scriptBody(words: readonly string[], replaced: string | undefined): LoopBody | undefined {
  const [shell, flag, code] = words;
  if (!SHELLS_RUNNING_CODE.has(shell ?? '') || flag !== '-c' || code === undefined) return undefined;
  const parsed = simpleCommandsIn(code);
  if (replaced !== undefined) return bodyOf(parsed, [literalToken(replaced)]);
  const loop = parsed.findIndex((simple) => simple.program === 'for' && simple.args.length === 1);
  const variable = parsed[loop]?.args[0];
  return loop !== -1 && variable !== undefined ? bodyOf(until(loop + 1, parsed), [variableToken(variable)]) : bodyOf(parsed, [variableToken('1'), variableToken('0')]);
}

/** The text `xargs` replaces with each name: `-I{}`, `-I {}`, `-J {}`, `-i`, `--replace`. */
function replaceString(options: readonly string[]): string | undefined {
  for (let at = 0; at < options.length; at += 1) {
    const option = options[at] ?? '';
    if (option === '-I' || option === '-J') return options[at + 1];
    if (/^-[IJ]./.test(option)) return option.slice(2);
    if (option === '-i' || option === '--replace') return '{}';
    if (option.startsWith('--replace=')) return option.slice('--replace='.length);
  }
  return undefined;
}

/** The commands of a loop's body: up to its `done`. */
function until(from: number, commands: ReturnType<typeof simpleCommandsIn>): ReturnType<typeof simpleCommandsIn> {
  const end = commands.findIndex((simple, index) => index >= from && simple.program === 'done');
  return commands.slice(from, end === -1 ? commands.length : end);
}

/** What stands for a name in a loop's body: a variable (`$f`, `${f}`), or the text `xargs -I` replaces (`{}`). */
interface NameToken {
  /** The word, whole, where a program is given the name. */
  readonly words: readonly string[];
  /** Where it stands inside a longer word: `=== $f ===`. */
  readonly place: RegExp;
}

function variableToken(variable: string): NameToken {
  return { words: ['$' + variable, '${' + variable + '}'], place: new RegExp('\\$(?:\\{' + variable + '\\}|' + variable + '(?![A-Za-z0-9_]))', 'g') };
}

function literalToken(text: string): NameToken {
  return { words: [text], place: new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') };
}

/** What a loop's body writes around its name, and whether it prints the text of the file the name is. */
function bodyOf(body: ReturnType<typeof simpleCommandsIn>, tokens: readonly NameToken[]): LoopBody {
  const prints = body.some(({ program, args }) => printsText(program, args) && tokens.some((token) => args.some((arg) => token.words.includes(arg))));
  const templates = body.flatMap(({ program, args }) => tokens.flatMap((token) => {
    const template = program === 'echo' ? echoed(args, token) : program === 'printf' ? printed(args, token) : undefined;
    return template === undefined ? [] : [template];
  }));
  return { templates, prints, pure: body.every((simple) => onlyNamesAndPrints(simple, tokens)) };
}

/**
 * One command of a loop that says its name and prints its file, and nothing else: an `echo` or `printf` of literal text
 * around the name, or a printing program given the name alone (a count of lines, `sed`'s `1,200p`, beside it).
 */
function onlyNamesAndPrints({ program, args }: { readonly program: string; readonly args: readonly string[] }, tokens: readonly NameToken[]): boolean {
  if (program === 'echo' || program === 'printf') {
    return args.every((arg) => {
      const literal = tokens.reduce((text, token) => text.replace(token.place, ''), arg);
      return !literal.includes('$') && !literal.includes('`');
    });
  }
  if (!printsText(program, args)) return false;
  return args.filter((arg) => !arg.startsWith('-')).every((arg) =>
    tokens.some((token) => token.words.includes(arg)) || /^\d+$/.test(arg) || (program === 'sed' && /^\d*(?:,\d*)?p$/.test(arg)));
}

/**
 * `what-codex-wrote` X11 as amended 2026-10-11 (`the-file-not-its-name` FNB44, FND17): a line that hands each name it
 * lists or loops over to a body that says the name - its own `echo` or `printf` - and prints the text of the file it
 * names, and does nothing else: no other program, no other file. Completed with exit 0, it opened what it listed and no
 * more, and each file it opened stands named in what it printed - an effect its record establishes. Found on the
 * maintainer's round: Codex recorded such loops' exit 0, and their reports still said they had no known end.
 */
export function namesEachItPrints(command: string): boolean {
  const parsed = simpleCommandsIn(command);
  const loop = wordLoopAt(parsed);
  const bodies = [
    ...handedListings(parsed).flatMap((listing) => (listing.at === undefined ? [] : loopBodies(parsed, listing.at))),
    ...(loop === -1 ? [] : [bodyOf(until(loop + 1, parsed), [variableToken(parsed[loop]?.args[0] ?? '')])]),
  ];
  if (bodies.length === 0 || !bodies.every((body) => body.pure && body.prints && body.templates.length > 0)) return false;
  const tokens = parsed.flatMap(({ program, args }) => {
    const variable = program === 'for' ? args[0] : program === 'read' ? args.filter((arg) => !arg.startsWith('-')).at(-1) : undefined;
    return variable === undefined ? [] : [variableToken(variable)];
  });
  return parsed.every((simple) => {
    const { program, args, fed } = simple;
    if (['cd', 'for', 'done', 'read'].includes(program)) return true;
    if (fed === true && PIPE_FILTERS.has(program)) return true;
    if (program === 'ls' || (program === 'rg' && args.includes('--files'))) return true;
    if (program === 'find') {
      const exec = execProgram(args);
      return !args.some((arg) => FIND_ACTS.has(arg)) && (exec === undefined || SHELLS_RUNNING_CODE.has(exec));
    }
    if (program === 'xargs') return SHELLS_RUNNING_CODE.has(xargsProgram(args) ?? '');
    return onlyNamesAndPrints(simple, tokens);
  });
}

/** The shells a `-c` script is handed to. */
const SHELLS_RUNNING_CODE = new Set(['sh', 'bash', 'zsh', 'dash']);

/** What a `find` does beside listing: deletes, writes a file, asks. */
const FIND_ACTS = new Set(['-delete', '-fprint', '-fprint0', '-fprintf', '-fls', '-ok', '-okdir']);

/** Where a loop over the words it lists stands in the line: `for f in lessons/01/*`, never over a substitution. */
function wordLoopAt(parsed: ReturnType<typeof simpleCommandsIn>): number {
  return parsed.findIndex((simple) => simple.program === 'for' && simple.args[1] === 'in' && simple.takes !== true && simple.args.length > 2 &&
    simple.args.slice(2).every((word) => !word.includes('$') && !word.includes('`')));
}

/** `echo "=== $f"`: the literal text around the one place the name stands, which must say something of its own. */
function echoed(args: readonly string[], token: NameToken): ((line: string) => string | undefined) | undefined {
  const words = [...args];
  while (/^-[neE]+$/.test(words[0] ?? '')) words.shift();
  return around(words.join(' '), token.place);
}

/** `printf '=== %s\\n' "$f"`: the format around its one `%s`, given the name as its value. */
function printed(args: readonly string[], token: NameToken): ((line: string) => string | undefined) | undefined {
  const [format, value, ...more] = args;
  if (format === undefined || more.length > 0 || value === undefined || !token.words.includes(value)) return undefined;
  return around(format, /%s/g);
}

function around(text: string, place: RegExp): ((line: string) => string | undefined) | undefined {
  const found = [...text.matchAll(place)];
  if (found.length !== 1 || found[0]?.index === undefined) return undefined;
  const prefix = text.slice(0, found[0].index).replace(/^(?:\\n)+/, '');
  const suffix = text.slice(found[0].index + found[0][0].length).replace(/(?:\\n)+$/, '');
  if (prefix.includes('$') || suffix.includes('$') || prefix.includes('\\') || suffix.includes('\\') || (prefix + suffix).trim() === '') return undefined;
  return (line) => (line.length > prefix.length + suffix.length && line.startsWith(prefix) && line.endsWith(suffix) ? line.slice(prefix.length, line.length - suffix.length) : undefined);
}

/** Each name a line of the output gives through one of the templates, in the form `fits` accepts. */
function namesIn(lines: readonly string[], templates: readonly ((line: string) => string | undefined)[], fits: (name: string) => boolean): string[] {
  return lines.flatMap((line) => templates.flatMap((template) => {
    const name = template(line)?.trim();
    return name !== undefined && name !== '' && fits(name) ? [name] : [];
  }));
}

/**
 * FN17 as amended 2026-10-11: the names a loop over the words it lists printed through its own `echo` - `for f in
 * lessons/01/*; do echo "===== $f ====="; cat "$f"; done`, the Claude desktop app's loop of that day's second round - and
 * whether it printed their text. A name counts where it is one of the words, as the shell rewrites them. `at` is the
 * loop's place in the line, which a `cd` before it moves.
 */
export function wordLoopNames(command: string, texts: readonly string[]): (PrintedNames & { readonly at: number }) | undefined {
  const parsed = simpleCommandsIn(command);
  const at = wordLoopAt(parsed);
  const loop = parsed[at];
  const variable = loop?.args[0];
  if (loop === undefined || variable === undefined) return undefined;
  const body = bodyOf(until(at + 1, parsed), [variableToken(variable)]);
  const words = loop.args.slice(2);
  const lines = texts.flatMap((text) => text.split('\n')).map((line) => line.replace(/\r$/, ''));
  const names = [...new Set(namesIn(lines, body.templates, (name) => words.some((word) => word === name || matchesShellWord(name, word))))];
  const unprinted = names.filter((name) => lines.some((line) => line.includes(': ' + name + ': ')));
  return { names, prints: body.prints, unprinted, at };
}

/** `head` and `tail` given several files write `==> name <==` over each - not with `-q`. */
function headerPrinted(parsed: ReturnType<typeof simpleCommandsIn>, at: number): boolean {
  const header = (program: string | undefined, args: readonly string[]) =>
    (program === 'head' || program === 'tail') && !args.some((arg) => ['-q', '--quiet', '--silent'].includes(arg));
  const lister = parsed[at];
  if (lister === undefined) return false;
  const exec = lister.args.findIndex((arg) => ['-exec', '-execdir'].includes(arg));
  if (exec !== -1 && header(lister.args[exec + 1], lister.args.slice(exec + 2)) && lister.args.includes('+')) return true;
  let after = at + 1;
  while (parsed[after]?.fed === true && PIPE_FILTERS.has(parsed[after]?.program ?? '')) after += 1;
  const next = parsed[after];
  if (next?.fed === true && next.program === 'xargs') {
    const program = xargsProgram(next.args);
    if (header(program, next.args.slice(next.args.indexOf(program ?? '') + 1))) return true;
  }
  return lister.substituted === true && parsed.some((simple) => simple.takes === true && header(simple.program, simple.args));
}

/** Programs that say a name, or its place, and open nothing it names (FN17). */
const NAMES_ONLY = new Set(['echo', 'printf', 'basename', 'dirname', 'realpath', 'readlink', 'stat', 'ls', 'test', '[', '[[', 'true', 'false', ':', 'rm', 'rmdir', 'mkdir', 'touch']);

/** Programs that pass on some of the names they are handed, and open none of them. */
const PIPE_FILTERS = new Set(['grep', 'egrep', 'fgrep', 'sort', 'uniq', 'head', 'tail', 'cut', 'tr', 'sed', 'awk']);

/** The words of a loop around what opens a name: they run nothing of their own. */
const LOOP_WORDS = new Set(['for', 'select', 'read', 'done', 'xargs', 'cd']);

/** What a lister reaches, as a search: `find`'s roots below every level, `ls`'s folders one level, `rg --files`'s roots. */
function listingOf(program: string, args: readonly string[]): Omit<RecursiveSearch, 'at'> | undefined {
  if (program === 'find') {
    const end = args.findIndex((arg) => arg.startsWith('-') || arg === '(' || arg === '!' || arg === ')');
    const roots = (end === -1 ? args : args.slice(0, end));
    // A name test narrows it only where nothing turns the test around: `-o`, `!`, `-not` leave every file reached.
    const turned = args.some((arg) => ['-o', '-or', '!', '-not'].includes(arg));
    const includes = turned ? [] : args.flatMap((arg, at) => {
      const value = args[at + 1];
      if (value === undefined) return [];
      return arg === '-name' ? [{ glob: value }] : arg === '-iname' ? [{ glob: value, caseless: true as const }] : [];
    });
    const depth = args[args.indexOf('-maxdepth') + 1];
    return { roots: roots.length === 0 ? ['.'] : roots, includes, excludes: [], excludeDirs: [], hidden: true, ...(args.includes('-maxdepth') && depth === '1' ? { shallow: true as const } : {}) };
  }
  if (program === 'ls') {
    const flags = args.filter((arg) => /^-[^-]/.test(arg)).join('');
    if (flags.includes('d')) return undefined;
    const roots = args.filter((arg) => !arg.startsWith('-'));
    return { roots: roots.length === 0 ? ['.'] : roots, includes: [], excludes: [], excludeDirs: [], hidden: /[aA]/.test(flags), ...(flags.includes('R') ? {} : { shallow: true as const }) };
  }
  if (program === 'rg' && args.includes('--files')) {
    const { options, positionals } = readOptions(args, RG_OPTIONS);
    const names = options.map((option) => option.name);
    const unrestricted = names.filter((name) => name === '-u' || name === '--unrestricted').length;
    return { roots: positionals.length === 0 ? ['.'] : positionals, includes: [], excludes: [], excludeDirs: [], hidden: unrestricted >= 2 || names.includes('--hidden') || names.includes('-.') };
  }
  return undefined;
}

/** The program `find` runs on what it found: the word after `-exec`, `-execdir`, `-ok` or `-okdir`. */
function execProgram(args: readonly string[]): string | undefined {
  const at = args.findIndex((arg) => ['-exec', '-execdir', '-ok', '-okdir'].includes(arg));
  return at === -1 ? undefined : args[at + 1];
}

/** The program `xargs` runs: its first word that is not one of its own options or their values. */
function xargsProgram(args: readonly string[]): string | undefined {
  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? '';
    if (['-I', '-i', '-n', '-L', '-P', '-d', '-E', '-s', '-a', '-J', '-R', '-S'].includes(word)) at += 1;
    else if (!word.startsWith('-')) return word;
  }
  return undefined;
}

/**
 * `what-codex-wrote.md` XD12 (decided by the maintainer 2026-10-10): whether a command line can open nothing but what its
 * own words name, however far it ran - so that a line whose end the record does not give, naming nothing protected,
 * could have opened nothing protected. Found on a Codex cell that ran `if [ -f docs/note.md ]; then cat docs/note.md;
 * else rg --files docs | rg …; fi` and returned `.output` alone: which branch ran is not recorded, and neither could
 * reach a private file. `lists` where a program printed a folder's names, which only its output can show - a caller
 * reads that output whole before it says no private name was among them.
 *
 * `undefined` where any program could reach more: a search that reads a folder's files (`reachOf`'s searches), a word
 * the shell expands into names, or a program `boundedProgram` does not know.
 */
export function boundedReach(commands: readonly string[]): { readonly lists: boolean } | undefined {
  let lists = false;
  for (const command of commands) {
    const reach = reachOf(command);
    if (reach.searches.length > 0 || reach.globs.length > 0) return undefined;
    for (const { program, args } of simpleCommandsIn(command)) {
      // A search given no folder to read, by `reachOf` above: files it names, what it is fed, or names it lists.
      if (program === 'rg' || GREPS.has(program)) {
        if (args.includes('--files')) lists = true;
        continue;
      }
      const kind = boundedProgram(program, args);
      if (kind === undefined) return undefined;
      if (kind === 'lists') lists = true;
    }
  }
  return { lists };
}

/**
 * `2026-10-09-the-file-not-its-name.md` FNB29: the words a search takes as its own patterns and never opens - the pattern
 * itself, `-e`'s, and the globs and types that choose which files it reads. A file a search reads is the walk's to find
 * (`reachOf`), not a word to meet by name: `rg --files -g note.md` lists names and was refused for naming the root's
 * blocked `note.md`. A file of patterns (`-f`) is read, and is no pattern.
 */
export function searchPatternWords(program: string, args: readonly string[]): string[] {
  const table = GREPS.has(program) ? GREP_OPTIONS : program === 'rg' ? RG_OPTIONS : undefined;
  if (table === undefined) return [];
  const { options, positionals } = readOptions(args, table);
  const valued = new Set(['-e', '--regexp', '-g', '--glob', '--iglob', '-t', '-T', '--type', '--type-not', '--include', '--exclude', '--exclude-dir']);
  const given = options.some((option) => ['-e', '-f', '--regexp', '--file'].includes(option.name));
  return [
    ...options.filter((option) => valued.has(option.name) && option.value !== undefined).map((option) => option.value ?? ''),
    ...(given || positionals[0] === undefined ? [] : [positionals[0]]),
  ];
}

/** FNB28, FNB29: the patterns a `find` matches as it walks - `-name`'s, `-path`'s - never files it is given. */
export function findPatternWords(args: readonly string[]): string[] {
  return args.filter((_, at) => at > 0 && FIND_PATTERNS.has(args[at - 1] ?? ''));
}

/**
 * `2026-10-11-a-name-that-is-no-file.md` NX1: where a `find`'s patterns leave out what they match - a name test after an
 * odd run of `!` or `-not` (`! -name note.md`, `-not -iname x`). Such a word selects nothing by that name: a helper's
 * `find . -type f ! -name note.md -exec cat {} +` was refused as naming the very file it excluded (NXB1).
 */
export function findExcludedAt(args: readonly string[]): ReadonlySet<number> {
  const excluded = new Set<number>();
  args.forEach((_, at) => {
    if (at < 2 || !FIND_PATTERNS.has(args[at - 1] ?? '')) return;
    let negations = 0;
    for (let back = at - 2; back >= 0 && (args[back] === '!' || args[back] === '-not'); back -= 1) negations += 1;
    if (negations % 2 === 1) excluded.add(at);
  });
  return excluded;
}

interface SearchArguments {
  readonly recursive: boolean;
  /** The words it takes as files or directories: every positional word but the pattern. */
  readonly paths: readonly string[];
  readonly includes: readonly NameGlob[];
  readonly excludes: readonly NameGlob[];
  readonly excludeDirs: readonly NameGlob[];
  readonly hidden: boolean;
}

/** A program's options, as far as reading its paths needs them. */
export interface OptionTable {
  /** Short options that take a value, attached (`-A3`) or as the next word (`-e KEY`). */
  readonly shortWithValue: ReadonlySet<string>;
  /** Long options that take a value, after `=` or as the next word. */
  readonly longWithValue: ReadonlySet<string>;
}

/** One option met on the command line, with its value when it takes one. */
type Option = { readonly name: string; readonly value?: string };

/**
 * Splits a program's words into its options and its positional words, the way `getopt_long` reads them: options may
 * follow positional words, a cluster (`-rn`) holds several, and `--` ends them.
 */
export function readOptions(args: readonly string[], table: OptionTable): { options: Option[]; positionals: string[] } {
  const options: Option[] = [];
  const positionals: string[] = [];
  let parsing = true;

  for (let at = 0; at < args.length; at += 1) {
    const word = args[at] ?? '';
    if (parsing && word === '--') {
      parsing = false;
    } else if (parsing && word.startsWith('--')) {
      const separator = word.indexOf('=');
      const name = separator === -1 ? word : word.slice(0, separator);
      if (separator !== -1) options.push({ name, value: word.slice(separator + 1) });
      else if (table.longWithValue.has(name)) options.push({ name, value: args[(at += 1)] ?? '' });
      else options.push({ name });
    } else if (parsing && word.startsWith('-') && word.length > 1) {
      for (let index = 1; index < word.length; index += 1) {
        const flag = word.charAt(index);
        if (table.shortWithValue.has(flag)) {
          const value = index + 1 < word.length ? word.slice(index + 1) : (args[(at += 1)] ?? '');
          options.push({ name: `-${flag}`, value });
          break;
        }
        options.push({ name: `-${flag}` });
      }
    } else {
      positionals.push(word);
    }
  }
  return { options, positionals };
}

const GREP_OPTIONS: OptionTable = {
  shortWithValue: new Set(['e', 'f', 'm', 'A', 'B', 'C', 'd', 'D']),
  longWithValue: new Set([
    '--regexp', '--file', '--max-count', '--after-context', '--before-context', '--context', '--directories',
    '--devices', '--include', '--exclude', '--exclude-dir', '--include-dir', '--exclude-from', '--label',
    '--binary-files', '--group-separator',
  ]),
};

/** GNU and BSD `grep`: `-r`, `-R`, `--recursive`, or `-d recurse`; the first positional word is the pattern unless `-e` or `-f` gave one. */
function grepArguments(args: readonly string[]): SearchArguments {
  const { options, positionals } = readOptions(args, GREP_OPTIONS);
  // grep matches `--include` and its kin against a file's base name, and minds case.
  const valuesOf = (...names: string[]): NameGlob[] =>
    options.filter((option) => names.includes(option.name)).map((option) => ({ glob: option.value ?? '' }));
  const recursive = options.some(
    (option) =>
      ['-r', '-R', '--recursive', '--dereference-recursive'].includes(option.name) ||
      (['-d', '--directories'].includes(option.name) && option.value === 'recurse'),
  );
  const patternGiven = options.some((option) => ['-e', '-f', '--regexp', '--file'].includes(option.name));

  return {
    recursive,
    paths: patternGiven ? positionals : positionals.slice(1),
    includes: valuesOf('--include'),
    excludes: valuesOf('--exclude'),
    excludeDirs: valuesOf('--exclude-dir'),
    hidden: true,
  };
}

const RG_OPTIONS: OptionTable = {
  // `-r` is `--replace` here, not "recursive": ripgrep always recurses.
  shortWithValue: new Set(['e', 'f', 'g', 't', 'T', 'm', 'A', 'B', 'C', 'j', 'M', 'E', 'd', 'r']),
  longWithValue: new Set([
    '--regexp', '--file', '--glob', '--iglob', '--type', '--type-not', '--type-add', '--type-clear', '--max-count',
    '--after-context', '--before-context', '--context', '--threads', '--max-columns', '--encoding', '--max-depth',
    '--replace', '--pre', '--pre-glob', '--sort', '--sortr', '--colors', '--color', '--path-separator', '--max-filesize',
    '--ignore-file', '--context-separator', '--field-match-separator', '--field-context-separator', '--engine',
    '--dfa-size-limit', '--regex-size-limit', '--hyperlink-format', '--generate',
  ]),
};

/**
 * ripgrep. It skips hidden files unless `--hidden`, `-.` or `-uu` says otherwise; a `.env` is hidden. A glob of `-g`
 * narrows it, and a `!` in front turns the glob into an exclusion, of files and directories alike. What `.gitignore`
 * leaves out is not read here, so a search it would narrow is taken to reach everything.
 */
function rgArguments(args: readonly string[]): SearchArguments | undefined {
  const { options, positionals } = readOptions(args, RG_OPTIONS);
  const names = options.map((option) => option.name);
  // `--files` lists what would be searched and opens nothing; `--type-list` and friends search nothing at all.
  if (names.some((name) => ['--files', '--type-list', '--help', '-h', '--version', '-V', '--generate'].includes(name))) return undefined;

  const unrestricted = names.filter((name) => name === '-u' || name === '--unrestricted').length;
  // `--glob-case-insensitive` makes every `-g` an `--iglob`; the last of it and its `--no-` form wins.
  const everyCaseless = names.lastIndexOf('--glob-case-insensitive') > names.lastIndexOf('--no-glob-case-insensitive');
  const globs = options
    .filter((option) => ['-g', '--glob', '--iglob'].includes(option.name))
    .map((option) => ({ glob: option.value ?? '', caseless: everyCaseless || option.name === '--iglob' }));
  const nameGlob = (glob: string, caseless: boolean): NameGlob => (caseless ? { glob, caseless: true } : { glob });
  const excluded = globs.filter(({ glob }) => glob.startsWith('!')).map(({ glob, caseless }) => nameGlob(atAnyDepth(glob.slice(1)), caseless));
  const patternGiven = names.some((name) => ['-e', '-f', '--regexp', '--file'].includes(name));

  return {
    recursive: true,
    paths: patternGiven ? positionals : positionals.slice(1),
    includes: globs.filter(({ glob }) => !glob.startsWith('!')).map(({ glob, caseless }) => nameGlob(includedName(glob), caseless)),
    excludes: excluded,
    excludeDirs: excluded,
    hidden: unrestricted >= 2 || names.includes('--hidden') || names.includes('-.'),
  };
}

// ripgrep matches a glob as `.gitignore` does (measured, ripgrep 14.1.1): `**/` in front matches at any depth
// (`**/.env` took every `.env` below the search), and a glob with any other `/` in it is matched against the path, not
// the name (`config/.env` took nothing from a search of `.`, `app/config/.env` took that one file). The walk here meets
// names, so the first is dropped, which is exact. The second is read so that it never leaves out a file ripgrep would
// open: an include keeps its last part, and so takes every file of that name wherever it is; an exclusion keeps the
// `/`, matches no name, and leaves nothing out.
function atAnyDepth(glob: string): string {
  return glob.replace(/^(?:\*\*\/)+/, '');
}

function includedName(glob: string): string {
  const name = atAnyDepth(glob);
  if (!name.includes('/')) return name === '' ? '*' : name;
  const last = name.slice(name.lastIndexOf('/') + 1);
  // A `/` inside an alternative (`{.env,config/.env}`) cannot be cut at, and a glob that ends in one names directories;
  // what either would include is not worked out here, so it includes every file.
  return last === '' || /[{}]/.test(name) ? '*' : last;
}

/**
 * Whether a file name matches a glob the way `fnmatch` and a shell match one: `*` and `?` within the name, `[...]`
 * classes, and `{a,b}` alternatives, which a shell expands in an unquoted word before the program sees it.
 *
 * `period`: a shell does not let a wildcard match the dot that starts a hidden name, so `cat *` leaves `.env` out while
 * `cat .env*` does not. A program matching its own `--include` has no such rule.
 *
 * `caseless`: `rg --iglob '*.ENV'` opens `.env`.
 */
export function matchesName(name: string, glob: string, options: { readonly period: boolean; readonly caseless?: boolean }): boolean {
  if (options.period && name.startsWith('.') && !glob.startsWith('.')) return false;
  return nameGlobToRegExp(glob, options.caseless === true ? 'i' : '').test(name);
}

const SPECIAL = /[.+^$()|\\/]/g;

function nameGlobToRegExp(glob: string, flags: string): RegExp {
  let source = '';
  let braces = 0;

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob.charAt(index);
    if (character === '*') source += '.*';
    else if (character === '?') source += '.';
    else if (character === '[') {
      const close = glob.indexOf(']', index + 2);
      if (close === -1) {
        source += '\\[';
      } else {
        const body = glob.slice(index + 1, close).replace(/^[!^]/, '^').replace(/\\/g, '\\\\');
        source += `[${body}]`;
        index = close;
      }
    } else if (character === '{') {
      braces += 1;
      source += '(?:';
    } else if (character === '}' && braces > 0) {
      braces -= 1;
      source += ')';
    } else if (character === ',' && braces > 0) source += '|';
    else if (character === '}' || character === '{') source += `\\${character}`;
    else source += character.replace(SPECIAL, '\\$&');
  }
  // An alternative left open is not one, and a class a regular expression cannot hold (`[z-a]`) is not a class a shell
  // would expand either: both are read as the text they are. Any word may arrive here - a sed script, inline code - and
  // a hook that threw over one would be a hook that failed on an ordinary command.
  if (braces > 0) return literally(glob, flags);
  try {
    return new RegExp(`^${source}$`, flags);
  } catch {
    return literally(glob, flags);
  }
}

function literally(text: string, flags: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, flags);
}

/** A search that prints what it matched, as `printedSearch` reads it from its command. */
export interface PrintedSearch {
  /** It prints the lines around each hit too (`-A`, `-B`, `-C`), as `path-number-text`. */
  readonly context: boolean;
  /**
   * Whether its lines start with a file's name (H3). `never`: `-h`, one file searched without recursing - `grep KEY
   * .env` - or what was piped to a grep. `maybe`: one operand a recursive search may find is a file or a directory,
   * which only the lines can tell. `always` otherwise.
   */
  readonly names: SearchNames;
  /** `-n`: a line starts with its number, where it carries no name to start with. */
  readonly numbered?: true;
}

/**
 * Whether a command line runs a search that prints the lines it matched (`search-hits-are-reads` H1), and how. Undefined
 * where it runs no search, or only ones that print no text - names (`-l`, `-L`), counts (`-c`), nothing (`-q`), or the
 * files it would search (`rg --files`). Several searches in one line (`grep -rn KEY . | grep -v test`) are bare only
 * when all are: the first one's names are still on the lines the last one prints.
 */
export function printedSearch(command: string): PrintedSearch | undefined {
  let found: { context: boolean; names: SearchNames; numbered: boolean } | undefined;
  for (const { program, args } of simpleCommandsIn(command)) {
    const git = program === 'git' && args[0] === 'grep';
    const searched = git || GREPS.has(program) ? GREP_PRINTS : program === 'ag' || program === 'ack' ? LISTER_PRINTS : program === 'rg' ? RG_PRINTS : undefined;
    if (searched === undefined) continue;
    const { options, positionals } = readOptions(git ? args.slice(1) : args, searched.table);
    const names = options.map((option) => option.name);
    if (names.some((name) => searched.quiet.has(name))) continue;
    const operands = names.some((name) => PATTERN_GIVEN.has(name)) ? positionals.length : positionals.length - 1;
    // grep recurses when asked to; ripgrep, ag and ack always do.
    const recursive = searched !== GREP_PRINTS || options.some((option) => RECURSIVE.has(option.name) || ((option.name === '-d' || option.name === '--directories') && option.value === 'recurse'));
    const said: SearchNames = names.some((name) => searched.unnamed.has(name)) ? 'never'
      : git || names.some((name) => searched.named.has(name)) || operands > 1 ? 'always'
        // With no file, grep reads what was piped to it, and a recursive search the directory it is in.
        : operands === 0 ? (recursive ? 'always' : 'never')
          : recursive ? 'maybe' : 'never';
    found = {
      context: (found?.context ?? false) || names.some((name) => CONTEXT.has(name)),
      names: found === undefined ? said : NAMES_RANK.indexOf(said) < NAMES_RANK.indexOf(found.names) ? said : found.names,
      numbered: (found?.numbered ?? false) || names.includes('-n') || names.includes('--line-number'),
    };
  }
  return found === undefined ? undefined
    : { context: found.context, names: found.names, ...(found.numbered ? { numbered: true as const } : {}) };
}

export type SearchNames = 'always' | 'maybe' | 'never';
/** In a pipeline, a name any search puts on the lines stays on them through the searches after it. */
const NAMES_RANK: readonly SearchNames[] = ['always', 'maybe', 'never'];
const RECURSIVE = new Set(['-r', '-R', '--recursive', '--dereference-recursive']);

interface SearchPrints {
  readonly table: OptionTable;
  /** Options that print names, counts or nothing, never a line of a file. */
  readonly quiet: ReadonlySet<string>;
  /** Options that put the file's name on every line, and that take it off. */
  readonly named: ReadonlySet<string>;
  readonly unnamed: ReadonlySet<string>;
}

const QUIET = ['-l', '-L', '--files-with-matches', '--files-without-match', '--files-without-matches', '--name-only', '-c', '--count', '-q', '--quiet', '--silent'];
const GREP_PRINTS: SearchPrints = {
  table: GREP_OPTIONS, quiet: new Set(QUIET), named: new Set(['-H', '--with-filename']), unnamed: new Set(['-h', '--no-filename']),
};
/** ag and ack: `-g` and ack's `-f` list the files a search would read. */
const LISTER_PRINTS: SearchPrints = { ...GREP_PRINTS, quiet: new Set([...QUIET, '-g', '-f']), named: new Set(['-H', '--with-filename', '--filename']) };
/** ripgrep: `-f` is a file of patterns, and `-I`, not `-h`, drops the name. */
const RG_PRINTS: SearchPrints = {
  table: RG_OPTIONS,
  quiet: new Set(['-l', '--files-with-matches', '--files-without-match', '-c', '--count', '--count-matches', '-q', '--quiet', '--files', '--type-list']),
  named: new Set(['-H', '--with-filename']),
  unnamed: new Set(['-I', '--no-filename']),
};
const PATTERN_GIVEN = new Set(['-e', '-f', '--regexp', '--file']);
const CONTEXT = new Set(['-A', '-B', '-C', '--after-context', '--before-context', '--context']);

/** `2026-10-11-a-folder-found-while-it-runs.md` FW1: programs whose output is the paths they found on disk. */
const PATH_FINDERS = new Set(['find', 'fd', 'fdfind', 'locate', 'ls', 'rg', 'grep']);

/** A variable filled from a substitution: `d=$(…)`, `` d=`…` ``, `export d=$(…)`, up to where its substitution opens. */
const FILLED = /(?:^|[\s;&|(])(?:(?:export|local|declare|readonly)\s+)?([A-Za-z_][A-Za-z0-9_]*)=["']?(\$\(|`)/g;

/** A loop over a substitution: `for d in $(…)`, up to where its substitution opens. */
const LOOPED = /(?:^|[\s;&|(])for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+["']?(\$\(|`)/g;

/** FW1: where a program that finds paths looked - its folders as written, and how far below them, where it says. */
export interface FoundIn {
  /** Where in the line the variable is filled: what comes before it decides the folder its program runs in. */
  readonly offset: number;
  readonly roots: readonly string[];
  /** `ls` lists one level, `ls -d` its operands alone, `find -maxdepth N` N levels; absent, any depth. */
  readonly depth?: number;
  /** It prints names starting with a dot: `find` does, `ls` only with `-a`, `fd` only with `-H`. */
  readonly hidden: boolean;
  /** It prints each name from its folder (`ls docs` prints `guide.md`), not from where the line runs (`find docs`). */
  readonly relative: boolean;
}

/** FW1: a variable a line fills from paths a program found, and where each program filling it looked. */
export interface FoundVariable {
  readonly name: string;
  readonly from: readonly FoundIn[];
}

/**
 * `2026-10-11-a-folder-found-while-it-runs.md` FW1: the variables a line fills from what a program that finds paths
 * printed, and uses after - the folder of `d=$(find . -type d -name lessons | head -1); cat "$d"/*`, which no word of the
 * line names and `refuse` could not follow (FWB1) - each with where that program looked: `find lib …` finds nothing
 * outside `lib`, and `for f in $(find lib -type f); do cat "$f"; done` reads `lib` alone. A count, a commit or a new
 * temporary folder is no such variable.
 */
export function foundVariables(command: string): FoundVariable[] {
  const found = new Map<string, FoundIn[]>();
  for (const pattern of [FILLED, LOOPED]) {
    for (const match of command.matchAll(pattern)) {
      const [, name, opens] = match;
      if (name === undefined || opens === undefined) continue;
      const body = substitutionAt(command, (match.index ?? 0) + match[0].length, opens === '`');
      const [first] = simpleCommandsIn(body);
      const program = first?.program.slice(first.program.lastIndexOf('/') + 1);
      if (first === undefined || program === undefined || !PATH_FINDERS.has(program)) continue;
      found.set(name, [...(found.get(name) ?? []), { offset: match.index ?? 0, ...foundIn(program, first.args) }]);
    }
  }
  return [...found]
    .filter(([name]) => new RegExp(`\\$\\{?${name}(?![A-Za-z0-9_])`).test(command))
    .map(([name, from]) => ({ name, from }));
}

/** The text of a substitution that opens at `start`, to its closing `)` or backtick. */
function substitutionAt(command: string, start: number, backtick: boolean): string {
  if (backtick) {
    const end = command.indexOf('`', start);
    return command.slice(start, end < 0 ? undefined : end);
  }
  let depth = 1;
  for (let index = start; index < command.length; index += 1) {
    if (command[index] === '(') depth += 1;
    else if (command[index] === ')' && (depth -= 1) === 0) return command.slice(start, index);
  }
  return command.slice(start);
}

/**
 * FW1: where a program that finds paths looks - `find`'s starting points, `fd`'s paths after its pattern, `ls`'s operands
 * up to their first wildcard - or where the line runs, for any other or a place a variable writes; and how deep: `ls`
 * lists one level (`for f in $(ls); do cat "$f"; done` reads no deeper), `ls -d` names its operands, `find -maxdepth N`.
 */
function foundIn(program: string, args: readonly string[]): Omit<FoundIn, 'offset'> {
  const roots = rootsOf(program, args);
  const max = args.indexOf('-maxdepth');
  const flag = (letter: string, long: string): boolean => args.some((arg) => new RegExp(`^-[A-Za-z]*${letter}`).test(arg) || arg === long);
  const named = program === 'ls' && flag('d', '--directory');
  const depth = program === 'ls'
    ? flag('R', '--recursive') ? undefined : named ? 0 : 1
    : program === 'find' && max >= 0 && /^\d+$/.test(args[max + 1] ?? '') ? Number(args[max + 1]) : undefined;
  const hidden = program === 'ls' ? flag('a', '--all') || flag('A', '--almost-all') : program === 'fd' || program === 'fdfind' ? flag('H', '--hidden') : true;
  const relative = program === 'ls' && !named;
  return { roots, ...(depth === undefined ? {} : { depth }), hidden, relative };
}

function rootsOf(program: string, args: readonly string[]): string[] {
  const expression = args.findIndex((arg) => arg.startsWith('-') || arg === '(' || arg === '!');
  const operands = program === 'find'
    ? args.slice(0, expression < 0 ? args.length : expression)
    : program === 'fd' || program === 'fdfind'
      ? args.filter((arg) => !arg.startsWith('-')).slice(1)
      : program === 'ls' ? args.filter((arg) => !arg.startsWith('-')) : [];
  const roots = operands.map((operand) => {
    const parts = operand.split('/');
    const wild = parts.findIndex((part) => hasGlob(part));
    return parts.slice(0, wild < 0 ? parts.length : wild).join('/') || '.';
  });
  return roots.length === 0 || roots.some((root) => root.includes('$') || root.includes('`')) ? ['.'] : roots;
}
