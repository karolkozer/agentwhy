// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { addressesNothing, simpleCommandsIn } from './command-line.ts';

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

/** A glob character the shell expands in an unquoted word. */
const GLOB = /[*?[]/;

export function hasGlob(word: string): boolean {
  return GLOB.test(word);
}

/**
 * The searches a command line runs and the words its shell expands. The pattern a search looks for is neither: `grep
 * "KEY.*" src` expands nothing, because the word is quoted and is a pattern. Only the words a program takes as files
 * are offered as globs.
 */
export function reachOf(command: string): CommandReach {
  const searches: RecursiveSearch[] = [];
  const globs: string[] = [];

  for (const { program, args } of simpleCommandsIn(command)) {
    if (addressesNothing(program)) continue;
    const search = GREPS.has(program) ? grepArguments(args) : program === 'rg' ? rgArguments(args) : undefined;
    const files = search === undefined ? args.filter((word) => !word.startsWith('-')) : search.paths;

    globs.push(...files.filter(hasGlob));
    if (search?.recursive === true) {
      const { includes, excludes, excludeDirs, hidden } = search;
      searches.push({ roots: search.paths.length === 0 ? ['.'] : search.paths, includes, excludes, excludeDirs, hidden });
    }
  }
  return { searches, globs };
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
