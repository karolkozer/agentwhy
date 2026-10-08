// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The paths a command line could be addressing.
 *
 * A command has structure, which spec §6.5 names as the reason an earlier hook could be fixed: separators, and
 * quoting. Both are used here instead of a list of "commands that read", because such a list is never complete
 * and the first program missing from it passes unseen.
 *
 * Quoting does most of the work. `grep -rn "SECRET" apps` names `apps`; `echo "see .env for the value"` names
 * nothing, and splitting that sentence into words - which is what a plain tokeniser does - is where most of the
 * noise came from. A quoted string stays **one** token, so a sentence mentioning a file no longer matches a
 * path pattern, while a genuinely quoted path (`cat "my file.env"`) still does.
 *
 * **A command is read once, a character at a time, as a shell reads it** (`CommandReader`). It used to be read in
 * passes - lines, then operators, then words - and each pass had to guess what the next one knew: a heredoc body
 * looked like commands, a quoted script was cut at its own semicolons, and a quote spanning lines hid the command
 * after it. Each of those was measured on a real session (`specs/2026-09-15-findings-worth-reading.md` §2).
 *
 * **Code an interpreter is handed on the command line is code** (`specs/2026-09-15-paths-not-fragments.md` R1, added
 * 2026-09-15). `node -e "log('check apps/web/.env')"` names no file, and the string literal inside it was being
 * reported as one. From such a word only a candidate shaped like a whole path is kept.
 *
 * **Known limits.** A path built at runtime (`$DIR/.env`) is not recognised. A quoted string that is exactly a
 * path is counted, which is correct, and a quoted sentence that is exactly a path-shaped word would be too. A
 * string handed to `sh -c` is one word, not a command; none was found on the sessions measured. A heredoc inside
 * `$(...)` can end the substitution early at a `)` in its body. An interpreter's option that takes a value of its
 * own before the code flag (`node -r x -e "…"`) ends the search for its code, and that code then reads as any other
 * argument does - noise, never silence - as does an interpreter started through another program (`npx tsx -e`).
 */

import { shapedLikePath } from './path-shape.ts';

/**
 * Programs whose output is the **content** of what they were pointed at, rather than a list of what they
 * reached. `cat .env` prints a file; the paths inside that file are the file's text, not places the command
 * went. Anything not on this list keeps the conservative reading - its output is treated as a listing - so a
 * program missing from here costs noise, never silence.
 */
const PRINTS_CONTENT = new Set([
  'cat',
  'head',
  'tail',
  'bat',
  'less',
  'more',
  'echo',
  'printf',
  'jq',
  'base64',
  'strings',
  'xxd',
  'od',
  // A filter of the lines it is given: `head customers.csv | cut -c1-80` prints the file's rows, cut short. Found on
  // 2026-10-05 in a Codex session whose agent printed a tracked file's header and first row through it.
  'cut',
]);

/**
 * Programs that print nothing when they succeed (`said-where-the-person-is` SWO1): `cd apps && cat .env` prints the
 * file and nothing else, and reading it as a listing because of `cd` left a key the agent read untraced (SWB4).
 */
const PRINTS_NOTHING = new Set(['cd']);

/**
 * Programs that print the names of what they were pointed at - a directory's entries, the paths a walk found - and
 * never a file's text. Beside a content program (`ls -la && cat .env`, `cat x || find . -name x`) the output is both:
 * its names a listing, its `KEY=value` lines the file's (SWO1). `find` joined on 2026-10-02: `cat <told file> || find
 * …` in one line read the key and traced nothing, so the person heard "no value found" over a value in the chat.
 * Not a search: a search prints a file's lines, and is read as one (`search-hits-are-reads`).
 */
const LISTS_NAMES = new Set(['ls', 'find', 'file']);

/** One simple command as a shell would run it: the words it carries, and the one that names what runs. */
interface SimpleCommand {
  /** Every word, quoting removed. Heredoc markers, here-string operands and redirections are not among them. */
  readonly words: readonly string[];
  /** The first word that is not an assignment. Absent for a line that only assigns. */
  readonly program?: string;
  /**
   * What the line itself hands the program on standard input: a heredoc's body, a here-string's word. Data to every
   * program but an interpreter reading its program from there (`findings-worth-reading` R1 as amended 2026-10-07):
   * `python3 - <<'PY' … PY` runs the body as `python3 -c '…'` runs its argument, and it is read as that code is.
   */
  readonly stdin?: string;
}

/** The command being read: the one shape `SimpleCommand` has, before it is handed out read-only. */
interface OpenCommand {
  readonly words: string[];
  program?: string;
  stdin?: string;
}

interface PendingHeredoc {
  readonly marker: string;
  /** `<<-` lets the terminating line be indented with tabs. */
  readonly stripTabs: boolean;
  /** The command whose standard input the body is. */
  readonly owner: OpenCommand;
}

/** What the next word is when it is not an argument: a heredoc's marker after `<<`, or data after `<<<`. */
type NextWord = 'argument' | 'data' | { readonly stripTabs: boolean };

/** `NAME=value` before a program sets a variable; it runs nothing. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Unquoted, each of these ends a simple command. `&` directly before `>` redirects instead (`&>file`). */
const ENDS_A_COMMAND = new Set([';', '|', '&', '(', ')']);

/** Unquoted, each of these ends a word and nothing more. A newline ends the command too, and is read apart. */
const BLANK = new Set([' ', '\t', '\r', '\f', '\v']);

/** What may follow the first character of a redirection and still belong to it: `>>`, `>|`, `2>&1`. */
const REDIRECTION = new Set(['<', '>', '&', '|']);

/** Inside double quotes a backslash escapes only these; before anything else it is itself. */
const ESCAPED_IN_DOUBLE_QUOTES = new Set(['"', '\\', '$', '`', '\n']);

/**
 * A command line read the way a shell reads it, as far as the questions asked of it need.
 *
 * **Added 2026-09-14** (`specs/2026-09-15-findings-worth-reading.md` R1-R4b), in three measured steps. A heredoc body is
 * **data** - a script, a JSON document, prose on standard input - and splitting the command on newlines had made
 * each of its lines a command: `import`, `const` and `x` were reported as programs, the largest single source of
 * findings that named no file. Operators were then cut before quoting was known, so a quoted `node -e` script fell
 * apart at its own semicolons. And a reading that fixed that line by line still lost the command after a quote
 * spanning lines, and every program inside a quoted `$(...)`.
 *
 * A heredoc body with no terminator runs to the end of the command, as a quote left open does.
 *
 * **Amended 2026-10-07** (R1 of `findings-worth-reading`, `paths-not-fragments` R1): a body stays out of the line's words,
 * and is kept as the standard input of the command that opened it. Only an interpreter reading its program from there
 * turns it into code (`inlineCodeOf`): the maintainer's Codex read a tracked file through `python3 - <<'PY'`, which
 * `refuse` let through and the report never saw, while the same code after `-c` was read by both.
 */
function readCommand(command: string): SimpleCommand[] {
  return new CommandReader(command).read();
}

class CommandReader {
  readonly #text: string;
  #at = 0;
  readonly #simples: SimpleCommand[] = [];
  /** Heredocs opened on the current line. Their bodies begin after its newline, in the order they were opened. */
  readonly #pending: PendingHeredoc[] = [];
  #current: OpenCommand = { words: [] };
  #word = '';
  #next: NextWord = 'argument';

  constructor(text: string) {
    this.#text = text;
  }

  read(): SimpleCommand[] {
    const text = this.#text;

    while (this.#at < text.length) {
      const character = text.charAt(this.#at);
      const following = text.charAt(this.#at + 1);

      if (this.#readSubstitution()) continue;

      if (character === '\\') {
        // Before a newline it joins two lines; before anything else it makes that character plain.
        if (following !== '\n') this.#word += following;
        this.#at += 2;
      } else if (character === "'") {
        this.#singleQuoted();
      } else if (character === '"') {
        this.#doubleQuoted();
      } else if (character === '#' && this.#word === '') {
        this.#skipComment();
      } else if (character === '\n') {
        this.#at += 1;
        this.#endCommand();
        this.#skipHeredocBodies();
      } else if (BLANK.has(character)) {
        this.#at += 1;
        this.#endWord();
      } else if (character === '<' && following === '<') {
        this.#openHeredoc();
      } else if (character === '<' || character === '>' || (character === '&' && following === '>')) {
        this.#skipRedirection();
      } else if (ENDS_A_COMMAND.has(character)) {
        this.#at += 1;
        this.#endCommand();
      } else {
        this.#word += character;
        this.#at += 1;
      }
    }
    this.#endCommand();
    return this.#simples;
  }

  /**
   * `$(...)` or a backtick at the current position, read as a command in its own right (R4b). It adds no word to
   * the command around it: its text is not what the shell passes on, and offered as a candidate, `$(cat x/.env)`
   * would become a finding named `cat x/.env`. False when no substitution starts here.
   */
  #readSubstitution(): boolean {
    const text = this.#text;

    if (text.charAt(this.#at) === '`') {
      this.#at += 1;
      this.#simples.push(...new CommandReader(this.#backticked()).read());
      return true;
    }
    if (text.charAt(this.#at) === '$' && text.charAt(this.#at + 1) === '(') {
      this.#at += 2;
      const inner = this.#parenthesised();
      // `$((...))` is arithmetic: nothing in it runs.
      if (!inner.startsWith('(')) this.#simples.push(...new CommandReader(inner).read());
      return true;
    }
    return false;
  }

  /** The text of a backtick substitution, its closing backtick consumed. Inside, an escaped backtick is one. */
  #backticked(): string {
    const text = this.#text;
    let inner = '';

    while (this.#at < text.length && text.charAt(this.#at) !== '`') {
      if (text.charAt(this.#at) === '\\' && text.charAt(this.#at + 1) === '`') {
        inner += '`';
        this.#at += 2;
        continue;
      }
      inner += text.charAt(this.#at);
      this.#at += 1;
    }
    this.#at += 1;
    return inner;
  }

  /** The text of `$(...)`, its closing parenthesis consumed. A parenthesis inside quotes does not count. */
  #parenthesised(): string {
    const text = this.#text;
    const start = this.#at;
    let depth = 1;
    let quote = '';

    while (this.#at < text.length) {
      const character = text.charAt(this.#at);
      this.#at += 1;

      if (quote !== '') {
        if (character === '\\' && quote === '"') this.#at += 1;
        else if (character === quote) quote = '';
      } else if (character === '\\') {
        this.#at += 1;
      } else if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
        if (depth === 0) return text.slice(start, this.#at - 1);
      }
    }
    return text.slice(start);
  }

  /** Nothing is special inside single quotes, a newline included. Left open, the quote runs to the end. */
  #singleQuoted(): void {
    const close = this.#text.indexOf("'", this.#at + 1);
    const end = close === -1 ? this.#text.length : close;
    this.#word += this.#text.slice(this.#at + 1, end);
    this.#at = end + 1;
  }

  /** Inside double quotes a backslash escapes a few characters, and `$(...)` and backticks still run. */
  #doubleQuoted(): void {
    const text = this.#text;
    this.#at += 1;

    while (this.#at < text.length) {
      const character = text.charAt(this.#at);
      const following = text.charAt(this.#at + 1);

      if (character === '"') {
        this.#at += 1;
        return;
      }
      if (this.#readSubstitution()) continue;
      if (character === '\\' && ESCAPED_IN_DOUBLE_QUOTES.has(following)) {
        if (following !== '\n') this.#word += following;
        this.#at += 2;
        continue;
      }
      this.#word += character;
      this.#at += 1;
    }
  }

  /** A comment runs to the end of its line. The newline is left to end the command. */
  #skipComment(): void {
    const end = this.#text.indexOf('\n', this.#at);
    this.#at = end === -1 ? this.#text.length : end;
  }

  /** `<<WORD` and `<<-WORD` open a body after this line; `<<<` hands the next word to the program as input. */
  #openHeredoc(): void {
    this.#endWord();
    const third = this.#text.charAt(this.#at + 2);

    if (third === '<') {
      this.#at += 3;
      this.#next = 'data';
      return;
    }
    this.#at += third === '-' ? 3 : 2;
    this.#next = { stripTabs: third === '-' };
  }

  /** `<`, `>`, `>>`, `2>&1`, `&>`: a redirection ends a word and ends no command. Its target is still a word. */
  #skipRedirection(): void {
    this.#endWord();
    this.#at += 1;
    while (REDIRECTION.has(this.#text.charAt(this.#at))) this.#at += 1;
  }

  /**
   * Called just past a newline: the bodies of the heredocs opened on the line before, each kept as the standard input
   * of the command that opened it and never as words of the line. One with no terminator runs to the end.
   */
  #skipHeredocBodies(): void {
    const text = this.#text;
    let body = '';

    while (this.#pending.length > 0 && this.#at < text.length) {
      const end = text.indexOf('\n', this.#at);
      const raw = text.slice(this.#at, end === -1 ? text.length : end);
      this.#at = end === -1 ? text.length : end + 1;

      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      const open = this.#pending[0];
      if (open !== undefined && (open.stripTabs ? line.replace(/^\t+/, '') : line) === open.marker) {
        this.#pending.shift();
        feed(open.owner, body);
        body = '';
      } else body += `${line}\n`;
    }
    const open = this.#pending[0];
    if (open !== undefined && body !== '') feed(open.owner, body);
  }

  #endWord(): void {
    const word = this.#word;
    this.#word = '';
    if (word === '') return;

    const next = this.#next;
    this.#next = 'argument';
    if (next === 'argument') this.#current.words.push(word);
    else if (next === 'data') feed(this.#current, word);
    else this.#pending.push({ marker: word, stripTabs: next.stripTabs, owner: this.#current });
  }

  #endCommand(): void {
    this.#endWord();
    // A `<<` with no marker before the command ended opens nothing.
    this.#next = 'argument';

    const command = this.#current;
    this.#current = { words: [] };
    if (command.words.length === 0) return;
    const program = command.words.find((word) => !ASSIGNMENT.test(word));
    if (program !== undefined) command.program = program;
    this.#simples.push(command);
  }
}

/** Standard input the line hands a command, in the order it was written. */
function feed(command: OpenCommand, text: string): void {
  command.stdin = (command.stdin ?? '') + text;
}

/**
 * The programs a command line runs, by name. A program name is structure, not content: it is what makes
 * "ran a search" sayable in a report without quoting the command, which §7.3 does not allow.
 */
export function programsIn(command: string): string[] {
  return readCommand(command)
    .flatMap((simple) => (simple.program === undefined ? [] : [basename(simple.program)]))
    // A program is named like one: letters, and no dot. Reading heredocs as data removed most of what used to
    // slip through here; this stays for what that cannot know, and it costs `python3.11`, worth less than noise.
    .filter((program) => /^[A-Za-z][A-Za-z0-9_-]*$/.test(program));
}

/**
 * Each simple command a line runs: the program by its base name, and the words after it, quoting removed. For a
 * reader that needs one program's arguments in order - which ones are options, which one is a pattern - rather than
 * every word as a possible path.
 */
export function simpleCommandsIn(command: string): { readonly program: string; readonly args: readonly string[] }[] {
  return readCommand(command).flatMap((simple) =>
    simple.program === undefined
      ? []
      : [{ program: basename(simple.program), args: simple.words.slice(simple.words.indexOf(simple.program) + 1) }],
  );
}

/** Options git takes before its subcommand that consume the word after them. */
const GIT_OPTIONS_WITH_A_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * Whether the line runs `git commit` (`specs/2026-09-15-where-the-value-went.md` R7): the first word past git's own
 * options is the subcommand. A message that says "commit", or `git log --grep commit`, does not commit anything.
 */
export function commitsIn(command: string): boolean {
  return readCommand(command).some((simple) => {
    if (simple.program === undefined || basename(simple.program) !== 'git') return false;
    const words = simple.words.slice(simple.words.indexOf(simple.program) + 1);
    for (let at = 0; at < words.length; at += 1) {
      const word = words[at] ?? '';
      if (GIT_OPTIONS_WITH_A_VALUE.has(word)) at += 1;
      else if (!word.startsWith('-')) return word === 'commit';
    }
    return false;
  });
}

/** True when every command in the line only prints what it was given, so its output enumerates nothing. */
export function printsContentOnly(commands: readonly string[]): boolean {
  const programs = printingPrograms(commands);
  return programs.length > 0 && programs.every((program) => PRINTS_CONTENT.has(program));
}

/**
 * True when the line prints files' text beside a directory's names, and nothing else (SWO1): `cd apps && ls -la && cat
 * .env`. Its output is neither content only nor a listing only, so a caller reads its `KEY=value` lines as the files'
 * and every other line as the listing's.
 */
export function printsContentBesideNames(commands: readonly string[]): boolean {
  const programs = printingPrograms(commands);
  return programs.some((program) => PRINTS_CONTENT.has(program)) && programs.some((program) => LISTS_NAMES.has(program)) &&
    programs.every((program) => PRINTS_CONTENT.has(program) || LISTS_NAMES.has(program));
}

/** Whether a program, by its base name, prints the text of what it is given. */
export function printsContent(program: string): boolean {
  return PRINTS_CONTENT.has(basename(program));
}

/**
 * Programs that open every file operand they are given and print a fact about it rather than what is inside: a count of
 * lines, a size, a checksum. The file was opened, and its text did not reach the agent - which is neither of the two
 * things a report could say before (decided by the maintainer 2026-10-07, after `wc -l customers.csv` read "Only saw a
 * name" over a file the command had opened). Each is listed because its own documentation says it opens its operands;
 * a program not listed here says nothing, as `cat` said nothing until it was listed.
 */
const OPENS_WITHOUT_PRINTING = new Set(['wc', 'stat', 'du', 'cksum', 'md5', 'md5sum', 'shasum', 'sha1sum', 'sha256sum', 'sha512sum', 'wc -l']);

/**
 * The files a line's commands opened without printing: the non-option arguments of those programs, by position, as
 * `fileOperandsIn` reads a printer's. A line that also runs anything else says nothing here: what the agent was handed
 * then came from more than one program, and which of them is not the record's to say.
 */
export function openedWithoutPrinting(commands: readonly string[]): string[] {
  const simples = commands.flatMap(simpleCommandsIn).filter((simple) => !PRINTS_NOTHING.has(simple.program));
  if (simples.length === 0 || !simples.every((simple) => OPENS_WITHOUT_PRINTING.has(simple.program))) return [];
  return simples.flatMap((simple) => simple.args).filter((word) => !word.startsWith('-') && !/^\d+$/.test(word));
}

/**
 * The words a line's printing programs are given to open: the non-option arguments of `cat`, `head` and the others
 * that print a file's text, leaving out the programs whose arguments are text (`echo`). Each is a file by position -
 * `cat demo.env` names one whatever it looks like - which is what lets a bare name match a wildcard rule
 * (`said-where-the-person-is` SW17): read as guessed text, `cat demo.env` under the blocked `.env` wildcard named no
 * file, the key it printed was never traced, and the line said nothing was opened.
 */
export function fileOperandsIn(commands: readonly string[]): string[] {
  return commands.flatMap(simpleCommandsIn)
    .filter((simple) => printsContent(simple.program) && !addressesNothing(simple.program))
    .flatMap((simple) => simple.args)
    .filter((word) => !word.startsWith('-'));
}

/** The programs a line runs that print something, by base name: `cd` prints nothing, and says nothing of the output. */
function printingPrograms(commands: readonly string[]): string[] {
  return commands.flatMap((command) =>
    readCommand(command).flatMap((simple) => (simple.program === undefined ? [] : [basename(simple.program)])),
  ).filter((program) => !PRINTS_NOTHING.has(program));
}

function basename(program: string): string {
  const parts = program.split('/');
  return parts[parts.length - 1] ?? program;
}

/**
 * Programs whose arguments are text and never a file they open. `echo "check apps/web/.env"` addresses
 * nothing, and reading its argument as a path is how a sentence about a file became a file that was read.
 * Unknown programs keep the conservative reading, so absence from this list costs noise, never silence.
 */
const ADDRESSES_NOTHING = new Set(['echo', 'printf', 'true', 'false', ':', 'sleep']);

/** Whether a program, by its base name, takes only text and never opens a file its arguments name. */
export function addressesNothing(program: string): boolean {
  return ADDRESSES_NOTHING.has(basename(program));
}

/**
 * Interpreters, and the words that hand them code rather than a file to open. `deno` takes a subcommand where the
 * others take a flag, and the search is the same either way.
 */
const HANDS_OVER_CODE = new Map<string, ReadonlySet<string>>([
  ['python', new Set(['-c'])],
  ['python3', new Set(['-c'])],
  ['node', new Set(['-e', '-p', '--eval', '--print'])],
  ['bun', new Set(['-e', '-p', '--eval', '--print'])],
  ['deno', new Set(['eval'])],
  ['ruby', new Set(['-e'])],
  ['perl', new Set(['-e', '-E'])],
  ['php', new Set(['-r'])],
]);

/**
 * The word a simple command hands its program as code, if it does. The search passes over the interpreter's own
 * options and stops at the first word that is neither an option nor the code flag: that word is a script to run,
 * and everything after it belongs to the script, not to the interpreter - `node script.js -e x` opens `x` as the
 * script's own argument. Past every option with no flag and no script, the program reads its code from standard
 * input, and what the line handed it there - a heredoc's body, a here-string - is that code (`findings-worth-reading`
 * R1 as amended 2026-10-07): `python3 - <<'PY' … PY`, `node <<'JS' … JS`. A script with a heredoc after it keeps the
 * body as the script's data, as before.
 */
function inlineCodeOf(simple: SimpleCommand): string[] {
  const program = simple.program;
  if (program === undefined) return [];
  const flags = HANDS_OVER_CODE.get(basename(program));
  if (flags === undefined) return [];

  const words = simple.words.slice(simple.words.indexOf(program) + 1);
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? '';
    // The whole word is returned for `--eval=…`, because that is what the caller matches its words against.
    const separator = word.indexOf('=');
    if (flags.has(word)) return words[at + 1] === undefined ? [] : [words[at + 1] ?? ''];
    if (separator > 0 && flags.has(word.slice(0, separator))) return [word];
    if (!word.startsWith('-')) return [];
  }
  return simple.stdin === undefined ? [] : [simple.stdin];
}

/**
 * Whether every program the line runs is an interpreter handed code, or prints only what it was given, and the code
 * names `path` - `python3 -c "print(open('.env').read())"`, alone or piped to `head`. Such output is read for values
 * as a `cat`'s is (`docs/detection.md`, `python-open`). An interpreter can print anything, so this holds only where its
 * own code names the file: a script that is a file of its own, or a path built while it runs, stays out, and an
 * ordinary line it printed is dropped by the same shape rules as any other value.
 */
export function codeReadsNamedFile(commands: readonly string[], path: string): boolean {
  const simples = commands.flatMap((command) => readCommand(command)).filter((simple) => simple.program !== undefined);
  const code = simples.flatMap(inlineCodeOf);
  return (
    code.some((words) => words.includes(path)) &&
    simples.every((simple) => inlineCodeOf(simple).length > 0 || PRINTS_CONTENT.has(basename(simple.program ?? '')))
  );
}

/** The code a command line hands to an interpreter, as words. For the measurement, which counts where a path sat. */
export function inlineCode(command: string): string[] {
  return readCommand(command).flatMap(inlineCodeOf);
}

/**
 * The paths a command line could be addressing: the words of every simple command it runs, unless the program
 * addresses nothing. Read through `readCommand`, so a heredoc body contributes no word at all (R4). From a word
 * that is code an interpreter was handed, only a candidate shaped like a whole path is kept (R1).
 */
export function commandPathCandidates(command: string): string[] {
  return readCommand(command)
    .flatMap((simple) => {
      if (simple.program !== undefined && ADDRESSES_NOTHING.has(basename(simple.program))) return [];
      const code = inlineCodeOf(simple);
      const codeWords = new Set(code);

      const fromWords = simple.words.flatMap((word) => (codeWords.has(word) ? codeCandidatesOf(word) : candidatesOf(word)));
      // Code the interpreter reads on standard input is no word of the line: it gives what inline code gives, and
      // standard input that is data to its program - a heredoc for `cat`, for a script - gives nothing (R1, R2).
      const fromStdin = simple.stdin !== undefined && codeWords.has(simple.stdin) && !simple.words.includes(simple.stdin)
        ? codeCandidatesOf(simple.stdin)
        : [];
      return [...fromWords, ...fromStdin];
    })
    .filter((candidate) => candidate !== '');
}

/**
 * Whether every program the line runs is an interpreter handed code - after a flag, or on standard input - and nothing
 * else: `python3 - <<'PY' … PY`, `node -e "…"`. What such a call reached is its code's to say (`codeReadsNamedFile`).
 */
export function handsOverCodeOnly(commands: readonly string[]): boolean {
  const simples = commands.flatMap((command) => readCommand(command)).filter((simple) => simple.program !== undefined);
  return simples.length > 0 && simples.every((simple) => inlineCodeOf(simple).length > 0);
}

/**
 * The candidates in a piece of code (R1 of `paths-not-fragments`): split where a path is held, and kept only where
 * shaped like a whole path. An `=` inside code is an assignment of the code's own - `x = 1; print(open('.env').read())`
 * - never a flag's value, so none of the code is cut away before it; only a word that is itself a flag with a value
 * (`--eval=…`) gives what follows its `=`. Found 2026-10-07: a heredoc of fourteen lines lost the file it opened to an
 * assignment on its first line, as `-c` code with an assignment before the path always had.
 */
function codeCandidatesOf(code: string): string[] {
  const separator = code.indexOf('=');
  const value = code.startsWith('-') && separator > 0 ? code.slice(separator + 1) : code;
  return value.split(HOLDS_A_PATH).filter((candidate) => candidate !== '' && shapedLikePath(candidate));
}

/**
 * Brackets and quotes hold a path inside an expression. `python3 -c "print(open('apps/web/.env').read())"` reads
 * a file, and the token that survives quoting is the whole expression - which was being reported, verbatim, as
 * the name of a file. Splitting on them keeps the finding and loses the noise around it.
 *
 * Only brackets and quotes: splitting on commas and semicolons as well would cut a quoted sentence into
 * fragments and hand each one to the policy, which is the noise this module exists to avoid.
 */
const HOLDS_A_PATH = /[()'"`]+/;

/**
 * A flag is not a path, but `--file=.env` carries one. An assignment before the program - `FOO=bar cmd` - is
 * not a path either, and its value is treated the same way: what follows the first `=` is the candidate.
 */
function candidatesOf(token: string): string[] {
  const separator = token.indexOf('=');
  if (separator === -1 && token.startsWith('-')) return [];
  const value = separator === -1 ? token : token.slice(separator + 1);

  return value.split(HOLDS_A_PATH).filter((candidate) => candidate !== '');
}
