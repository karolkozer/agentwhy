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
 * string handed to `sh -c` is one word, not a command, here; `refuse` reads it again as the line it is
 * (`lines-it-runs.ts`, every-tool ET15), and so does a report, from the lines `correlate` hands it (`linesReadFor`). A heredoc inside
 * `$(...)` can end the substitution early at a `)` in its body. An interpreter's option that takes a value of its
 * own before the code flag (`node -r x -e "…"`) ends the search for its code, and that code then reads as any other
 * argument does - noise, never silence - as does an interpreter started through another program (`npx tsx -e`).
 */
var _a;
import { placesOfName, shapedLikePath } from './path-shape.js';
import { onlyInPythonText } from './python-strings.js';
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
/** `NAME=value` before a program sets a variable; it runs nothing. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/**
 * The shell's reserved words that open a compound command's part where a command would begin: the word after one is the
 * program (2026-10-10, `what-codex-wrote.md` §2.17). Found when `if true; then grep -rn TOKEN .; fi` passed `refuse`
 * while `grep -rn TOKEN .` was refused - `then` was read as the program, so the recursive search was never seen; and an
 * `if [ -f f ]; then cat f; fi` cell read no `cat` at all. Recognised only in a command's first place, as the shell
 * recognises them: `echo then` is an argument. The words that close one (`fi`, `done`, `}`) stay the command they are,
 * so a redirection after them - `done < list.txt` - keeps its file a word of that command, as `cat < .env` does.
 */
const OPENING_WORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{']);
/** The reserved words that close a compound command: they run nothing, and a redirection after one feeds the loop. */
const CLOSING_WORDS = new Set(['fi', 'done', 'esac', '}']);
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
function readCommand(command) {
    return new CommandReader(command).read();
}
class CommandReader {
    #text;
    #at = 0;
    #simples = [];
    /** Heredocs opened on the current line. Their bodies begin after its newline, in the order they were opened. */
    #pending = [];
    #current = { words: [] };
    #word = '';
    #next = 'argument';
    /** A redirection whose word is still to come (ER10). */
    #redirect;
    constructor(text) {
        this.#text = text;
    }
    read() {
        const text = this.#text;
        while (this.#at < text.length) {
            const character = text.charAt(this.#at);
            const following = text.charAt(this.#at + 1);
            if (this.#readSubstitution())
                continue;
            if (character === '\\') {
                // Before a newline it joins two lines; before anything else it makes that character plain.
                if (following !== '\n')
                    this.#word += following;
                this.#at += 2;
            }
            else if (character === "'") {
                this.#singleQuoted();
            }
            else if (character === '"') {
                this.#doubleQuoted();
            }
            else if (character === '#' && this.#word === '') {
                this.#skipComment();
            }
            else if (character === '\n') {
                this.#at += 1;
                this.#endCommand();
                this.#skipHeredocBodies();
            }
            else if (BLANK.has(character)) {
                this.#at += 1;
                this.#endWord();
            }
            else if (character === '<' && following === '<') {
                this.#openHeredoc();
            }
            else if (character === '<' || character === '>' || (character === '&' && following === '>')) {
                this.#skipRedirection();
            }
            else if (character === '|') {
                // `||` runs the next command where this one failed and hands it nothing; `|` and `|&` hand it what this printed.
                const pipe = following !== '|';
                this.#at += following === '|' || following === '&' ? 2 : 1;
                this.#endCommand();
                if (pipe)
                    this.#current.piped = true;
            }
            else if (ENDS_A_COMMAND.has(character)) {
                this.#at += 1;
                this.#endCommand();
            }
            else {
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
    #readSubstitution() {
        const text = this.#text;
        if (text.charAt(this.#at) === '`') {
            this.#at += 1;
            this.#substituted(this.#backticked());
            return true;
        }
        if (text.charAt(this.#at) === '$' && text.charAt(this.#at + 1) === '(') {
            this.#at += 2;
            const inner = this.#parenthesised();
            // `$((...))` is arithmetic: nothing in it runs.
            if (!inner.startsWith('('))
                this.#substituted(inner);
            return true;
        }
        return false;
    }
    /** FN17: a substitution's commands, each marked as one, and the command around it marked as taking their output. */
    #substituted(inner) {
        this.#current.takes = true;
        this.#simples.push(...new _a(inner).read().map((simple) => ({ ...simple, substituted: true })));
    }
    /** The text of a backtick substitution, its closing backtick consumed. Inside, an escaped backtick is one. */
    #backticked() {
        const { inner, end } = backtickedText(this.#text, this.#at);
        this.#at = end;
        return inner;
    }
    /** The text of `$(...)`, its closing parenthesis consumed. A parenthesis inside quotes does not count. */
    #parenthesised() {
        const text = this.#text;
        const start = this.#at;
        const close = closingParenthesis(text, start);
        this.#at = close === -1 ? text.length : close + 1;
        return text.slice(start, close === -1 ? text.length : close);
    }
    /** Nothing is special inside single quotes, a newline included. Left open, the quote runs to the end. */
    #singleQuoted() {
        const close = this.#text.indexOf("'", this.#at + 1);
        const end = close === -1 ? this.#text.length : close;
        this.#word += this.#text.slice(this.#at + 1, end);
        this.#at = end + 1;
    }
    /** Inside double quotes a backslash escapes a few characters, and `$(...)` and backticks still run. */
    #doubleQuoted() {
        const text = this.#text;
        this.#at += 1;
        while (this.#at < text.length) {
            const character = text.charAt(this.#at);
            const following = text.charAt(this.#at + 1);
            if (character === '"') {
                this.#at += 1;
                return;
            }
            if (this.#readSubstitution())
                continue;
            if (character === '\\' && ESCAPED_IN_DOUBLE_QUOTES.has(following)) {
                if (following !== '\n')
                    this.#word += following;
                this.#at += 2;
                continue;
            }
            this.#word += character;
            this.#at += 1;
        }
    }
    /** A comment runs to the end of its line. The newline is left to end the command. */
    #skipComment() {
        const end = this.#text.indexOf('\n', this.#at);
        this.#at = end === -1 ? this.#text.length : end;
    }
    /** `<<WORD` and `<<-WORD` open a body after this line; `<<<` hands the next word to the program as input. */
    #openHeredoc() {
        this.#endWord();
        const third = this.#text.charAt(this.#at + 2);
        if (third === '<') {
            this.#at += 3;
            this.#next = 'data';
            return;
        }
        this.#at += third === '-' ? 3 : 2;
        this.#next = { stripTabs: third === '-', expands: !/^[ \t]*['"\\]/.test(this.#text.slice(this.#at, this.#at + 16)) };
    }
    /** `<`, `>`, `>>`, `2>&1`, `&>`: a redirection ends a word and ends no command. Its target is still a word. */
    #skipRedirection() {
        // ER10: a descriptor written against it - `2>` - is its own, and the next word its target; both stay words.
        const fd = /^\d+$/.test(this.#word) ? this.#word : undefined;
        this.#endWord();
        const start = this.#at;
        this.#at += 1;
        while (REDIRECTION.has(this.#text.charAt(this.#at)))
            this.#at += 1;
        this.#redirect = { op: this.#text.slice(start, this.#at), ...(fd === undefined ? {} : { fd }) };
    }
    /**
     * Called just past a newline: the bodies of the heredocs opened on the line before, each kept as the standard input
     * of the command that opened it and never as words of the line. One with no terminator runs to the end.
     */
    #skipHeredocBodies() {
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
            }
            else
                body += `${line}\n`;
        }
        const open = this.#pending[0];
        if (open !== undefined && body !== '')
            feed(open.owner, body);
    }
    #endWord() {
        const word = this.#word;
        this.#word = '';
        if (word === '')
            return;
        const next = this.#next;
        this.#next = 'argument';
        // A reserved word where the command begins is the shell's own structure, never the program it runs.
        if (next === 'argument' && this.#current.words.length === 0 && OPENING_WORDS.has(word))
            return;
        // `for name do …`: right after a loop's name `do` is reserved, and the command after it begins there. Codex wrote every
        // loop of the round of 2026-10-11 so - `for file do printf …; cat "$file"; done` - read as one `for` holding them all.
        if (next === 'argument' && word === 'do' && this.#current.words.length === 2 && this.#current.words[0] === 'for') {
            this.#endCommand();
            return;
        }
        if (next === 'argument') {
            this.#current.words.push(word);
            if (this.#redirect !== undefined)
                (this.#current.redirects ??= []).push({ ...this.#redirect, target: word });
            this.#redirect = undefined;
        }
        else if (next === 'data')
            feed(this.#current, word);
        else {
            this.#pending.push({ marker: word, stripTabs: next.stripTabs, expands: next.expands, owner: this.#current });
            if (next.expands)
                this.#current.expands = true;
        }
    }
    #endCommand() {
        this.#endWord();
        // A `<<` with no marker before the command ended opens nothing, nor a redirection with no word.
        this.#next = 'argument';
        this.#redirect = undefined;
        const command = this.#current;
        // A pipe whose next command starts on the next line, or after `(`, still feeds that command.
        this.#current = command.words.length === 0 && command.piped === true ? { words: [], piped: true } : { words: [] };
        if (command.words.length === 0)
            return;
        const program = command.words.find((word) => !ASSIGNMENT.test(word));
        if (program !== undefined)
            command.program = program;
        this.#simples.push(command);
    }
}
_a = CommandReader;
/**
 * The text of a backtick substitution whose text begins at `start`, an escaped backtick inside it read as one, and the index
 * just past its closing backtick - past the end of the text where none closes it.
 */
export function backtickedText(text, start) {
    let inner = '';
    let at = start;
    while (at < text.length && text.charAt(at) !== '`') {
        if (text.charAt(at) === '\\' && text.charAt(at + 1) === '`') {
            inner += '`';
            at += 2;
            continue;
        }
        inner += text.charAt(at);
        at += 1;
    }
    return { inner, end: at + 1 };
}
/**
 * Where the `$(...)` whose text begins at `start` closes: the index of its `)`, or -1 where it runs to the end of the text. A
 * parenthesis inside quotes does not count, and a backslash makes the character after it plain - in double quotes and out.
 */
export function closingParenthesis(text, start) {
    let at = start;
    let depth = 1;
    let quote = '';
    while (at < text.length) {
        const character = text.charAt(at);
        at += 1;
        if (quote !== '') {
            if (character === '\\' && quote === '"')
                at += 1;
            else if (character === quote)
                quote = '';
        }
        else if (character === '\\') {
            at += 1;
        }
        else if (character === "'" || character === '"') {
            quote = character;
        }
        else if (character === '(') {
            depth += 1;
        }
        else if (character === ')') {
            depth -= 1;
            if (depth === 0)
                return at - 1;
        }
    }
    return -1;
}
/**
 * Each simple command a line runs, as read: its words, its program, and what the line hands it - a heredoc's body, a
 * here-string, a pipe. For `lines-it-runs.ts`, which reads the line a shell is handed (`every-tool-not-only-the-shell`
 * ET15); every other reader asks `simpleCommandsIn`.
 */
export function commandsRead(command) {
    return readCommand(command);
}
/** Standard input the line hands a command, in the order it was written. */
function feed(command, text) {
    command.stdin = (command.stdin ?? '') + text;
}
/**
 * The programs a command line runs, by name. A program name is structure, not content: it is what makes
 * "ran a search" sayable in a report without quoting the command, which §7.3 does not allow.
 */
export function programsIn(command) {
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
export function simpleCommandsIn(command) {
    return readCommand(command).flatMap((simple) => simple.program === undefined
        ? []
        : [{
                program: basename(simple.program),
                args: simple.words.slice(simple.words.indexOf(simple.program) + 1),
                // FN13: its standard input is given - a pipe, a heredoc, a here-string - rather than the terminal's.
                ...(simple.piped === true || simple.stdin !== undefined ? { fed: true } : {}),
                // FN17: what it prints is another command's words, or it takes such words.
                ...(simple.substituted === true ? { substituted: true } : {}),
                ...(simple.takes === true ? { takes: true } : {}),
            }]);
}
/** Options git takes before its subcommand that consume the word after them. */
const GIT_OPTIONS_WITH_A_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
/**
 * Whether the line runs `git commit` (`specs/2026-09-15-where-the-value-went.md` R7): the first word past git's own
 * options is the subcommand. A message that says "commit", or `git log --grep commit`, does not commit anything.
 */
export function commitsIn(command) {
    return readCommand(command).some((simple) => {
        if (simple.program === undefined || basename(simple.program) !== 'git')
            return false;
        const words = simple.words.slice(simple.words.indexOf(simple.program) + 1);
        for (let at = 0; at < words.length; at += 1) {
            const word = words[at] ?? '';
            if (GIT_OPTIONS_WITH_A_VALUE.has(word))
                at += 1;
            else if (!word.startsWith('-'))
                return word === 'commit';
        }
        return false;
    });
}
/** True when every command in the line only prints what it was given, so its output enumerates nothing. */
export function printsContentOnly(commands) {
    const programs = printingPrograms(commands);
    return programs.length > 0 && programs.every((program) => PRINTS_CONTENT.has(program));
}
/**
 * True when the line prints files' text beside a directory's names, and nothing else (SWO1): `cd apps && ls -la && cat
 * .env`. Its output is neither content only nor a listing only, so a caller reads its `KEY=value` lines as the files'
 * and every other line as the listing's.
 */
export function printsContentBesideNames(commands) {
    const programs = printingPrograms(commands);
    return programs.some((program) => PRINTS_CONTENT.has(program)) && programs.some((program) => LISTS_NAMES.has(program)) &&
        programs.every((program) => PRINTS_CONTENT.has(program) || LISTS_NAMES.has(program));
}
/**
 * The files a line's printers printed the text of where every other program on it prints no file's text
 * (`2026-10-08-every-tab-says-read.md` ER10): each printer's own operands (`ownOperands` - no option, option's value,
 * redirection's word or jq filter). Found 2026-11-22 in the maintainer's run: `head -60 plan.md; echo ----; cat main.py;
 * wc -l plan.md` printed both files, and with `wc` beside them the line was neither a printer alone (`printsContentOnly`)
 * nor one beside a listing (`printsContentBesideNames`), so every surface said their names were all it saw. The others may
 * print their own words (`echo ----`), a fact about a file (`wc -l`), names (`ls`), where the line is (`pwd`) or nothing.
 * Nothing is claimed for a printer whose output went to a file or nowhere (`cat .env.example > .env`), whose text was piped
 * into a program that does not print what it is handed (`cat a | wc -l`, or `| head -5 notes.md`, which prints its own
 * file), or that was handed the line's own text (a heredoc); nor anything on a line with a substitution, a process
 * substitution or any other program (the review of 2026-11-23). Per file: a name the printed text held is never read by it.
 * Whether the call ran and its output reached the model is the caller's to ask (`printedBesideOthers`).
 */
export function printedAmongOthers(commands) {
    const printed = [];
    for (const command of commands) {
        // Process substitution - `<(cat .env)`, `>(wc -l)` - hands its text to another program: not claimed.
        if (/[<>]\(/.test(command))
            return [];
        const simples = readCommand(command);
        if (simples.some((simple) => simple.substituted === true || simple.takes === true))
            return [];
        for (const [at, simple] of simples.entries()) {
            if (simple.program === undefined)
                continue;
            const program = basename(simple.program);
            if (!PRINTS_CONTENT.has(program)) {
                if (printsNothingOfAFile(program))
                    continue;
                return [];
            }
            // Its own words, or the line's own text - a heredoc, a here-string: `cat > notes.md <<'EOF'` writes, and the file
            // its redirection names is still a word of it (measured 2026-11-22: 9 of 166 such calls wrote a file, then counted it).
            // Nor one whose output went to a file or nowhere (the review of 2026-11-23: `cat .env.example > .env`).
            if (ADDRESSES_NOTHING.has(program) || simple.stdin !== undefined || outputSentAway(simple))
                continue;
            // Its text reaches the output only where each program it is piped into prints what it is handed - not a file of
            // its own (`cat .env | head -5 notes.md` printed notes.md), and not into a file (`… | head > out.txt`).
            let next = at + 1;
            let reaches = true;
            for (let receiver = simples[next]; receiver?.piped === true; receiver = simples[++next]) {
                const name = receiver.program === undefined ? undefined : basename(receiver.program);
                if (name === undefined || !PRINTS_CONTENT.has(name) || ADDRESSES_NOTHING.has(name) || outputSentAway(receiver) ||
                    ownOperands(name, receiver).length > 0)
                    reaches = false;
            }
            if (reaches)
                printed.push(...ownOperands(program, simple));
        }
    }
    return printed;
}
/**
 * The files a command line writes, as written (`2026-10-25-the-ai-changed-its-own-guard.md` OG1): each target a redirection
 * writes to (`> f`, `>> f`, `2> f`, `&> f`; never a descriptor's copy or a device), each file `tee` is handed, each file
 * `sed -i` edits in place, and the destination of `mv` and `cp`. Asked of a line by its words alone: a program that writes
 * a file its words do not name - a script, `npm run` - is not seen (OGO1). `leaveOut` names simple commands whose writes are
 * not asked: agentwhy's own (OG3), and only those - the rest of the line is read.
 */
export function filesWrittenIn(command, leaveOut) {
    return readCommand(command).flatMap((simple) => {
        if (simple.program !== undefined && leaveOut?.(basename(simple.program), simple.words.slice(simple.words.indexOf(simple.program) + 1)) === true)
            return [];
        const redirected = (simple.redirects ?? []).flatMap(({ op, target }) => !op.includes('>') || (op.endsWith('&') && /^(?:\d+|-)$/.test(target)) || target.startsWith('/dev/') ? [] : [target]);
        if (simple.program === undefined)
            return redirected;
        const program = basename(simple.program);
        const redirectTargets = new Set((simple.redirects ?? []).flatMap(({ fd, target }) => (fd === undefined ? [target] : [fd, target])));
        const args = simple.words.slice(simple.words.indexOf(simple.program) + 1).filter((word) => !redirectTargets.has(word));
        const operands = args.filter((word) => !word.startsWith('-'));
        if (program === 'tee')
            return [...redirected, ...operands];
        if (program === 'mv' || program === 'cp')
            return [...redirected, ...(operands.length >= 2 ? [operands.at(-1)] : [])];
        if (program === 'sed' && args.some((word) => /^-[a-zA-Z]*i/.test(word) || word.startsWith('--in-place'))) {
            // Its script is the first operand unless `-e` or `-f` gives it; every operand after is a file it edits.
            const scripted = args.some((word) => word === '-e' || word === '-f' || word.startsWith('--expression') || word.startsWith('--file'));
            const values = new Set(args.flatMap((word, at) => (word === '-e' || word === '-f' ? [args[at + 1] ?? ''] : [])));
            const files = operands.filter((word) => !values.has(word));
            return [...redirected, ...(scripted ? files : files.slice(1))];
        }
        return redirected;
    });
}
/** Where `/dev/stdout` and `/dev/stderr` go: the call's own output, which the model is handed. */
const SHOWN_DEVICES = new Set(['/dev/stdout', '/dev/stderr', '/dev/fd/1', '/dev/fd/2', '/dev/tty']);
/**
 * Whether a command's standard output went to a file, or to nowhere - `> out`, `>> log`, `&> both`, `1> out`, `> /dev/null`
 * - rather than to what the call hands back. Not its errors (`2> err.log`), not a descriptor's copy (`>&2`, `2>&1`).
 */
function outputSentAway(simple) {
    return (simple.redirects ?? []).some(({ op, fd, target }) => {
        if (!op.includes('>') || (fd !== undefined && fd !== '1'))
            return false;
        if (op.endsWith('&') && /^\d+$/.test(target))
            return false;
        return !SHOWN_DEVICES.has(target);
    });
}
/**
 * The options of a printing program that take the next word as their value - `head -n 60`, `cut -d , -f 1` - so the value
 * is never read as a file it printed (the review of 2026-11-23: `-d ,` made a row called `,`).
 */
const OPTION_VALUES = {
    head: new Set(['-n', '-c', '--lines', '--bytes']),
    tail: new Set(['-n', '-c', '--lines', '--bytes']),
    cut: new Set(['-d', '-f', '-c', '-b', '--delimiter', '--fields', '--characters', '--bytes']),
    bat: new Set(['-r', '-l', '-H', '--line-range', '--language', '--highlight-line', '--theme', '--style']),
    xxd: new Set(['-l', '-s', '-c', '-g', '-o']),
    od: new Set(['-N', '-j', '-t', '-A', '-w']),
    base64: new Set(['-w', '-b', '-i', '-o']),
    strings: new Set(['-n', '-t', '-e']),
    jq: new Set(['--indent', '-L', '--arg', '--argjson', '--slurpfile', '--rawfile']),
};
/** jq's options that take two words: a name and its value. */
const JQ_PAIRS = new Set(['--arg', '--argjson', '--slurpfile', '--rawfile']);
/**
 * The files a printing program was given: its operands in order, without its options, an option's value, a word one of
 * its redirections names, the descriptor written against one, or jq's filter - its first operand, unless `-f` names one.
 * Past `--`, every word is an operand.
 */
function ownOperands(program, simple) {
    const args = simple.words.slice(simple.words.indexOf(simple.program ?? '') + 1);
    const redirected = new Set((simple.redirects ?? []).flatMap(({ fd, target }) => (fd === undefined ? [target] : [fd, target])));
    const valued = OPTION_VALUES[program] ?? new Set();
    const operands = [];
    let skip = 0;
    let ended = false;
    let filterTaken = program !== 'jq';
    for (const word of args) {
        if (skip > 0) {
            skip -= 1;
            continue;
        }
        if (redirected.has(word))
            continue;
        if (!ended && word === '--') {
            ended = true;
            continue;
        }
        // `-` is standard input, no file.
        if (!ended && word === '-')
            continue;
        if (!ended && word.startsWith('-')) {
            if (program === 'jq' && (word === '-f' || word === '--from-file'))
                filterTaken = true;
            if (valued.has(word))
                skip = program === 'jq' && JQ_PAIRS.has(word) ? 2 : 1;
            continue;
        }
        if (!filterTaken) {
            filterTaken = true;
            continue;
        }
        operands.push(word);
    }
    return operands;
}
/**
 * A program that prints no file's text beside a printer (ER10): its own words, a fact about a file, names, where the line
 * is, or a name's parts - and so says nothing of what the printers printed.
 */
function printsNothingOfAFile(program) {
    return ADDRESSES_NOTHING.has(program) || OPENS_WITHOUT_PRINTING.has(program) || LISTS_NAMES.has(program) || PRINTS_NOTHING.has(program) ||
        NAMES_ONLY.has(program);
}
/** Where the line is, and a path's parts: printed, and no file's text. */
const NAMES_ONLY = new Set(['pwd', 'basename', 'dirname']);
/** Whether a program, by its base name, prints the text of what it is given. */
export function printsContent(program) {
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
export function openedWithoutPrinting(commands) {
    const simples = commands.flatMap(simpleCommandsIn).filter((simple) => !PRINTS_NOTHING.has(simple.program));
    if (simples.length === 0 || !simples.every((simple) => OPENS_WITHOUT_PRINTING.has(simple.program)))
        return [];
    return simples.flatMap((simple) => simple.args).filter((word) => !word.startsWith('-') && !/^\d+$/.test(word));
}
/**
 * The words a line's printing programs are given to open: the non-option arguments of `cat`, `head` and the others
 * that print a file's text, leaving out the programs whose arguments are text (`echo`). Each is a file by position -
 * `cat demo.env` names one whatever it looks like - which is what lets a bare name match a wildcard rule
 * (`said-where-the-person-is` SW17): read as guessed text, `cat demo.env` under the blocked `.env` wildcard named no
 * file, the key it printed was never traced, and the line said nothing was opened.
 */
export function fileOperandsIn(commands) {
    return commands.flatMap(simpleCommandsIn)
        .filter((simple) => printsContent(simple.program) && !addressesNothing(simple.program))
        .flatMap((simple) => simple.args)
        .filter((word) => !word.startsWith('-'));
}
/** The programs a line runs that print something, by base name: `cd` prints nothing, and says nothing of the output. */
function printingPrograms(commands) {
    return commands.flatMap((command) => readCommand(command).flatMap((simple) => (simple.program === undefined ? [] : [basename(simple.program)]))).filter((program) => !PRINTS_NOTHING.has(program));
}
/** A program's name without the folder it was named from: `/bin/sh` is `sh`. */
export function basename(program) {
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
export function addressesNothing(program) {
    return ADDRESSES_NOTHING.has(basename(program));
}
/** Programs that test or name what they are given and open nothing else: `[ -f x ]`, `pwd`, `basename a/b`. */
const TESTS_ONLY = new Set(['[', '[[', 'test', 'pwd', 'basename', 'dirname']);
/** `find` actions that run a program, delete, or write a file: with one, a walk reaches what that does. */
const FIND_ACTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls']);
/** Filters that, at the receiving end of a pipe, read only what it hands them. */
const PIPE_FILTERS = new Set(['sort', 'uniq', 'head', 'tail', 'wc', 'cut', 'tr', 'grep', 'egrep', 'fgrep', 'sed', 'awk', 'column', 'nl']);
/** A line's own words for where it goes next, never a program that opens a file. */
const SHELL_WORDS = new Set(['for', 'while', 'until', 'do', 'done', 'if', 'then', 'elif', 'else', 'fi', 'case', 'esac', '!', '{', '}']);
/**
 * `2026-10-11-a-listing-reads-no-file.md` LN1: every program of every line prints no file's text - it lists names (`ls`,
 * `du`, `tree`, a `find` with no action, an `fd` that runs nothing, `rg --files`), says something of its own (`pwd`,
 * `echo`, `cd`, `test`), or filters only what a pipe hands it. Such a line read no file, however it ended: Codex's
 * desktop app recorded `ls -la <folder> && rg --files <folder>` as failed, its panel a cell of listings with no exit, and
 * both rows said nothing about a private file was known.
 */
export function printsNoFileText(commands) {
    return commands.length > 0 && commands.every((command) => {
        const simples = simpleCommandsIn(command);
        return simples.length > 0 && simples.every(({ program, args, fed }) => {
            const name = basename(program);
            if (name === 'find')
                return !args.some((word) => FIND_ACTIONS.has(word));
            if (name === 'fd' || name === 'fdfind')
                return !args.some((word) => ['-x', '--exec', '-X', '--exec-batch'].includes(word));
            if (name === 'rg')
                return args.includes('--files');
            if (fed === true && PIPE_FILTERS.has(name))
                return !args.some((word) => word === '-f' || word.startsWith('--file'));
            return ['ls', 'du', 'tree'].includes(name) || ADDRESSES_NOTHING.has(name) || TESTS_ONLY.has(name) || PRINTS_NOTHING.has(name) ||
                CLOSING_WORDS.has(name) || SHELL_WORDS.has(name);
        });
    });
}
/**
 * `what-codex-wrote.md` XD12: what one program can reach, where that is the words it is given and no more - `operands`
 * for one that prints, tests or counts the files it names, or opens nothing; `lists` for one that prints the names of a
 * folder it names (`ls`, a `find` that runs nothing, `du`). `undefined` for every other program: an interpreter, a
 * script, a shell, anything not listed - absence costs a gap, never a file let through. A search is the caller's to
 * judge, since only its arguments say whether it reads a folder, and so is a `sed`, whose script may open a file.
 */
export function boundedProgram(program, args) {
    const name = basename(program);
    if (name === 'find')
        return args.some((word) => FIND_ACTIONS.has(word)) ? undefined : 'lists';
    if (name === 'ls' || name === 'du')
        return 'lists';
    // `2026-10-13-a-printing-sed-reaches-its-file.md` PS2: `nl` prints the files it is given, numbered, and no option of
    // GNU's or BSD's names another - X11 already counts it among the programs that read every operand.
    if (name === 'nl')
        return 'operands';
    if (PRINTS_CONTENT.has(name) || ADDRESSES_NOTHING.has(name) || PRINTS_NOTHING.has(name) || TESTS_ONLY.has(name) || CLOSING_WORDS.has(name))
        return 'operands';
    return OPENS_WITHOUT_PRINTING.has(name) || name === 'file' ? 'operands' : undefined;
}
/**
 * `2026-10-13-each-command-its-own-result.md` EC4: the languages whose interpreter a line can run, each by the program's
 * own name - the ones `HANDS_OVER_CODE` lists, whose code, handed over or in a script, reaches what it builds and not
 * what the line names. A closed list, in the order a page names them, so nothing of a command line reaches a page.
 */
export const CODE_LANGUAGES = ['python', 'node', 'bun', 'deno', 'ruby', 'perl', 'php'];
/** The language whose interpreter `program` is (EC4): `python3.12` is Python's; `undefined` for any other program. */
export function codeLanguageOf(program) {
    const name = basename(program);
    if (/^python(?:\d+(?:\.\d+)*)?$/.test(name))
        return 'python';
    if (name === 'nodejs')
        return 'node';
    return CODE_LANGUAGES.find((language) => language === name);
}
/**
 * Interpreters, and the words that hand them code rather than a file to open. `deno` takes a subcommand where the
 * others take a flag, and the search is the same either way.
 */
const HANDS_OVER_CODE = new Map([
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
function inlineCodeOf(simple) {
    const program = simple.program;
    if (program === undefined)
        return [];
    const flags = HANDS_OVER_CODE.get(basename(program));
    if (flags === undefined)
        return [];
    const words = simple.words.slice(simple.words.indexOf(program) + 1);
    for (let at = 0; at < words.length; at += 1) {
        const word = words[at] ?? '';
        // The whole word is returned for `--eval=…`, because that is what the caller matches its words against.
        const separator = word.indexOf('=');
        if (flags.has(word))
            return words[at + 1] === undefined ? [] : [words[at + 1] ?? ''];
        if (separator > 0 && flags.has(word.slice(0, separator)))
            return [word];
        if (!word.startsWith('-'))
            return [];
    }
    return simple.stdin === undefined ? [] : [simple.stdin];
}
/**
 * Whether every program the line runs is an interpreter handed code, or prints only what it was given, and the code
 * names `path` - `python3 -c "print(open('.env').read())"`, alone or piped to `head`. Such output is read for values
 * as a `cat`'s is (`docs/detection.md`, `python-open`). An interpreter can print anything, so this holds only where its
 * own code names the file: a script that is a file of its own, or a path built while it runs, stays out, and an
 * ordinary line it printed is dropped by the same shape rules as any other value. A name that is only text of the code
 * - of a file it writes - is no file it opened (NX5, `namedOnlyInCodeText`).
 */
export function codeReadsNamedFile(commands, path) {
    const simples = commands.flatMap((command) => readCommand(command)).filter((simple) => simple.program !== undefined);
    const code = simples.flatMap(inlineCodeOf);
    return (code.some((words) => words.includes(path)) &&
        !namedOnlyInCodeText(commands, path) &&
        simples.every((simple) => inlineCodeOf(simple).length > 0 || PRINTS_CONTENT.has(basename(simple.program ?? ''))));
}
/**
 * Whether the lines hold this name nowhere but in the text of code they hand an interpreter - inside a longer string of
 * that code, or a comment of it (`2026-10-11-a-name-that-is-no-file.md` NX5): an AI that edits a file with
 * `python3 - <<'PY'` quotes what it writes there, and the code opens no file of that name. What the line printed is then
 * never that file's text; the name stays a name the call saw, and `refuse` still judges it, since neither asks this.
 *
 * Python's strings alone are read (`python-strings.ts`): 27 of the 49 files a search's lines were credited to in the
 * maintainer's records were names in such text, every one of them Python's (NXB4). Any other language's code, and an
 * unquoted heredoc that runs something, is never called text - what is not certain keeps the reading it had.
 */
export function namedOnlyInCodeText(commands, path) {
    let held = false;
    for (const simple of commands.flatMap((command) => readCommand(command))) {
        const code = inlineCodeOf(simple);
        if (simple.words.some((word) => !code.includes(word) && placesOfName(word, path).length > 0))
            return false;
        for (const text of code) {
            if (placesOfName(text, path).length === 0)
                continue;
            if (codeLanguageOf(simple.program ?? '') !== 'python' || (simple.expands === true && /\$\(|`/.test(text)))
                return false;
            if (!onlyInPythonText(text, path))
                return false;
            held = true;
        }
    }
    return held;
}
/** The code a command line hands to an interpreter, as words. For the measurement, which counts where a path sat. */
export function inlineCode(command) {
    return readCommand(command).flatMap(inlineCodeOf);
}
/**
 * The paths a command line could be addressing: the words of every simple command it runs, unless the program
 * addresses nothing. Read through `readCommand`, so a heredoc body contributes no word at all (R4). From a word
 * that is code an interpreter was handed, only a candidate shaped like a whole path is kept (R1).
 */
export function commandPathCandidates(command) {
    return readCommand(command)
        .flatMap((simple) => {
        if (simple.program !== undefined && ADDRESSES_NOTHING.has(basename(simple.program)))
            return [];
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
export function handsOverCodeOnly(commands) {
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
function codeCandidatesOf(code) {
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
function candidatesOf(token) {
    const separator = token.indexOf('=');
    if (separator === -1 && token.startsWith('-'))
        return [];
    const value = separator === -1 ? token : token.slice(separator + 1);
    return value.split(HOLDS_A_PATH).filter((candidate) => candidate !== '');
}
