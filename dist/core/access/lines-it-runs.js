// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The further lines a command line runs or reads, which `refuse` judges as if they were written directly
 * (`specs/2026-10-11-every-tool-not-only-the-shell.md` ET15-ET17, measured in §2.5 and §2.8 B).
 *
 * `sh -c 'cat .env'` hands a shell a line as one quoted word, and the reader rightly reads a quoted word as one word: it named
 * no file, and `refuse` let it through where node9 stopped it. The same line is here read again, as the shell will read it.
 * Three shapes, each a reading of the shell's own grammar and never a list of programs that read:
 *
 * - **ET15** the code a shell is handed: after `-c` (alone or among other letters, `-lc`), on standard input from `echo` or
 *   `printf` of literal words, or from a heredoc or a here-string - where the shell is handed no script file - and the line
 *   `env -S` splits.
 * - **ET16** the line with each substitution whose whole command is `echo` or `printf` of literal words replaced by what it
 *   prints: `cat $(echo .env)` reads `.env`. Anything else in a substitution (`$(cat list.txt)`, `$(date)`) stays what R21 says
 *   it is, a value built while the line runs, and the body of a quoted heredoc stays the literal text the shell hands on.
 * - **ET17** a file a sender is handed by `@` or `<`: curl's data and form options, httpie's `@f` and `field@f`. The further line
 *   names it as the file curl sends (`curl -T <file>`), so it is judged as that line is.
 *
 * A further line of ET15 or ET17 starts with the `cd` and `pushd` commands written before it, so it is judged in the folder it
 * runs in (`cd ~/.aws && sh -c 'cat credentials'`). A line that holds none of the three yields nothing, so it is judged exactly
 * as before. What still passes is what §8 of the spec leaves open: a script file a shell is handed (`bash x.sh`), a path built
 * while the line runs, a name read from a file.
 */
import { backtickedText, basename, closingParenthesis, commandsRead } from './command-line.js';
import { RUNS_CODE, SHELLS } from './shell-place.js';
/**
 * Shells whose `-c` line is read here: every shell `shell-place.ts` knows but `fish`, whose grammar is not the POSIX shell's
 * this reader reads. Windows' shells are the PowerShell reader's (PW12).
 */
const POSIX_SHELLS = new Set([...SHELLS].filter((shell) => shell !== 'fish'));
/** A shell's option word that makes it read its line from standard input: `-s` alone or among others. */
const READS_STANDARD_INPUT = /^-[a-zA-Z]*s[a-zA-Z]*$/;
/** A shell's options that take the word after them as their value, so that word is no script and no code. */
const SHELL_OPTIONS_WITH_A_VALUE = new Set(['-o', '+o', '-O', '+O', '--rcfile', '--init-file']);
/**
 * Programs that run the command after them, each with its options that take a value. `env` and `sudo` also take assignments
 * before it, and `timeout` a duration. `env -S` hands a line of its own, read apart (`splitStrings`).
 */
const RUNS_THE_REST = new Map([
    ['env', new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string'])],
    ['sudo', new Set(['-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt', '-C', '--close-from', '-D', '--chdir', '-r', '--role', '-t', '--type', '-U', '--other-user'])],
    ['timeout', new Set(['-s', '--signal', '-k', '--kill-after'])],
    ['nohup', new Set()],
    ['nice', new Set(['-n', '--adjustment'])],
    ['time', new Set()],
    ['command', new Set()],
    ['exec', new Set(['-a'])],
    ['stdbuf', new Set(['-i', '-o', '-e'])],
]);
/** Programs that move the line to another folder, whose further lines start with them. */
const MOVES = new Set(['cd', 'pushd']);
/** How deep a line inside a line is read: `sh -c "sh -c 'cat .env'"` is two. */
const MOST_DEPTH = 3;
/** How many further lines one line may yield; past this the rest is not read. */
const MOST_LINES = 16;
/** A line longer than this is not read for further lines: a command line is a few kilobytes. */
const LONGEST_LINE = 64 * 1024;
/**
 * What a substitution of `echo` or `printf` may print to be put in its place: words of plain characters, apart by single
 * spaces. A quote, `$`, a backtick, a glob or an operator would be read as the shell's own structure once in the line, so a
 * substitution printing one is left as it is - a miss, as before this reading, never a word the shell would not see.
 */
const PLAIN_PRINT = /^[A-Za-z0-9._/~+@=,:%-]+(?: [A-Za-z0-9._/~+@=,:%-]+)*$/;
/** A word a further line may hold as written: no character the shell reads as structure. */
const PLAIN_WORD = /^[A-Za-z0-9._/~+@=,:%-]+$/;
/**
 * What a line must hold to yield a further line: a substitution (`$(`, a backtick) for ET16, or a word that is a shell or `env`
 * (ET15) or a sender (ET17) - a heredoc or an `@` yields nothing without one of these. A line with none of them - nearly every line (14 of 26 550 measured, plan
 * `2026-11-22-ahead-of-them.md` B) - is answered without being read, since `correlate` asks this of every command of every
 * conversation a page draws.
 */
const MAY_RUN_MORE = /\$\(|`|(?:^|[\s;&|(/])(?:sh|bash|zsh|dash|ksh|env|curl|https?|xhs?)(?=[\s;&|)<]|$)/;
/** `$HOME` or `${HOME}` opening a path: the home directory, written as `~` in the line that prints the file. */
const HOME_VARIABLE = /^\$(?:HOME|\{HOME\})(?=\/|$)/;
/**
 * The further lines `command` runs or reads, each once, at most `MOST_LINES`, read to a depth of `MOST_DEPTH`. Empty for a
 * line with no shell handed a line, no substitution of literal words and no file handed by `@`.
 */
export function linesItRuns(command) {
    if (!MAY_RUN_MORE.test(command))
        return [];
    const found = [];
    const seen = new Set([command]);
    let layer = [command];
    for (let depth = 0; depth < MOST_DEPTH && layer.length > 0; depth += 1) {
        const next = [];
        for (const line of layer) {
            if (line.length > LONGEST_LINE)
                continue;
            for (const further of furtherLines(line)) {
                if (seen.has(further))
                    continue;
                if (found.length >= MOST_LINES)
                    return found;
                seen.add(further);
                found.push(further);
                next.push(further);
            }
        }
        layer = next;
    }
    return found;
}
/**
 * The lines a report reads for `command` (`every-tool-not-only-the-shell` ET15-ET17 by R18, plan `2026-11-22-ahead-of-them.md`
 * B): the line itself, its literal substitutions put in place (ET16); in place of a line that is nothing but a shell handed
 * code - `sh -c 'cat .env'`, `bash <<'EOF' … EOF` - that code, so it is read as the one command it is; and then each further
 * line `linesItRuns` gives of it. A line holding none of the three is `[command]`, read exactly as before.
 */
export function linesReadFor(command) {
    if (command.length > LONGEST_LINE || !MAY_RUN_MORE.test(command))
        return [command];
    let first = withLiteralSubstitutions(command);
    for (let depth = 0; depth < MOST_DEPTH; depth += 1) {
        const code = loneShellCode(first);
        if (code === undefined)
            break;
        first = withLiteralSubstitutions(code);
    }
    return [first, ...linesItRuns(first).filter((further) => further !== first)];
}
/**
 * The code of a line that is one shell and nothing else - no other command, pipe or substitution, and no word after its code
 * (`sh -c 'cat "$1"' _ .env` names `.env` as its own word, which the code alone would lose). `undefined` for any other line.
 */
function loneShellCode(line) {
    const commands = commandsRead(line);
    const [only] = commands;
    if (commands.length !== 1 || only === undefined || only.program === undefined || only.piped === true || only.takes === true)
        return undefined;
    const words = only.words.slice(only.words.indexOf(only.program));
    const shell = shellAt(words);
    if (shell === undefined)
        return undefined;
    const handed = codeOrScript(words.slice(shell + 1));
    if (handed.code !== undefined)
        return handed.after === 0 && only.stdin === undefined ? handed.code : undefined;
    return !handed.script && words.length === shell + 1 ? only.stdin : undefined;
}
/** One line's further lines, one layer deep. */
function furtherLines(line) {
    const literal = withLiteralSubstitutions(line);
    const commands = commandsRead(line);
    return [
        ...(literal === line ? [] : [literal]),
        ...commands.flatMap((simple, at) => {
            const before = commands.slice(0, at).filter((each) => each.substituted === simple.substituted);
            const moved = (further) => movedTo(before, further);
            return [
                ...linesHandedToAShell(simple, before),
                ...splitStrings(simple),
                ...filesHandedByAt(simple).map(sendingLine),
            ].map(moved);
        }),
    ];
}
/**
 * `further` started with the `cd` and `pushd` commands written before it at its own level, so it is judged where it runs.
 * A folder named by a variable stays one (`cd "$D"`), which the place reader takes as a folder it does not know (FN6).
 */
function movedTo(before, further) {
    const moves = before
        .filter((each) => each.program !== undefined && MOVES.has(basename(each.program)))
        .map((each) => each.words.slice(each.words.indexOf(each.program)).map(asWritten).join(' '));
    return moves.length === 0 ? further : [...moves, further].join(' && ');
}
/** A word written back into a line so the shell reads it as the same word. */
function asWritten(word) {
    if (PLAIN_WORD.test(word))
        return word;
    if (word.includes('$'))
        return `"${word.replace(/["\\`]/g, (character) => `\\${character}`)}"`;
    return `'${word.replace(/'/g, "'\\''")}'`;
}
// ET15 ------------------------------------------------------------------------------------------------------------------
/** The line a shell runs in `simple`, or none: after `-c`, or on its standard input where it is handed no script. */
function linesHandedToAShell(simple, before) {
    if (simple.program === undefined)
        return [];
    const words = simple.words.slice(simple.words.indexOf(simple.program));
    const shell = shellAt(words);
    if (shell === undefined)
        return [];
    const handed = codeOrScript(words.slice(shell + 1));
    if (handed.code !== undefined)
        return [handed.code];
    if (handed.script)
        return [];
    if (simple.stdin !== undefined)
        return [simple.stdin];
    if (simple.piped !== true)
        return [];
    // `echo 'cat .env' | sh`: the command just before the shell at its own level - a substitution inside the shell's words is
    // read before the shell and is not what the pipe hands it.
    const feeding = before.at(-1);
    const printed = feeding === undefined ? undefined : printedBy(feeding);
    return printed === undefined ? [] : [printed];
}
/** Where in `words` the shell is, past the programs that run the rest; `undefined` where no shell runs. */
function shellAt(words) {
    let at = 0;
    while (at < words.length) {
        const name = basename(words[at] ?? '');
        if (POSIX_SHELLS.has(name))
            return at;
        const options = RUNS_THE_REST.get(name);
        if (options === undefined)
            return undefined;
        // `command -v sh` asks where `sh` is and runs nothing.
        if (name === 'command' && /^-[a-zA-Z]*[vV]/.test(words[at + 1] ?? ''))
            return undefined;
        at = pastOptions(words, at + 1, options);
        if (name === 'env' || name === 'sudo')
            while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at] ?? ''))
                at += 1;
        if (name === 'timeout')
            at += 1;
    }
    return undefined;
}
/** The index past the options that start at `at`, each option in `withValue` taking the word after it. */
function pastOptions(words, at, withValue) {
    let next = at;
    while (next < words.length) {
        const word = words[next] ?? '';
        if (word === '--')
            return next + 1;
        if (!word.startsWith('-') || word === '-')
            return next;
        next += withValue.has(word) ? 2 : 1;
    }
    return next;
}
/**
 * What a shell is handed after its name: the code after `-c`, or whether a script file is named instead. After `-s` the
 * words are the line's arguments and the line comes on standard input.
 */
function codeOrScript(args) {
    let runsCode = false;
    let readsInput = false;
    for (let at = 0; at < args.length; at += 1) {
        const word = args[at] ?? '';
        if (word === '--') {
            const operand = args[at + 1];
            if (operand === undefined || (readsInput && !runsCode))
                return { script: false };
            return runsCode ? { code: operand, script: false, after: args.length - at - 2 } : { script: true };
        }
        if (RUNS_CODE.test(word)) {
            runsCode = true;
            continue;
        }
        if (READS_STANDARD_INPUT.test(word))
            readsInput = true;
        if (SHELL_OPTIONS_WITH_A_VALUE.has(word)) {
            at += 1;
            continue;
        }
        if ((word.startsWith('-') || word.startsWith('+')) && word.length > 1)
            continue;
        // The first word that is no option: the code `-c` hands over, an argument after `-s`, or a script file - whose content is
        // not read (R21).
        if (runsCode)
            return { code: word, script: false, after: args.length - at - 1 };
        return { script: !readsInput };
    }
    return { script: false };
}
/** `env -S '<line>'`: the line `env` splits and runs, read as a line of its own. */
function splitStrings(simple) {
    if (simple.program === undefined || basename(simple.program) !== 'env')
        return [];
    const args = simple.words.slice(simple.words.indexOf(simple.program) + 1);
    return args.flatMap((word, at) => {
        if (word === '-S' || word === '--split-string')
            return args[at + 1] === undefined ? [] : [args[at + 1]];
        if (word.startsWith('--split-string='))
            return [word.slice('--split-string='.length)];
        if (/^-S./.test(word))
            return [word.slice(2)];
        return [];
    });
}
/**
 * What `echo` or `printf` of literal words prints, or `undefined` for any other command, for one fed by a substitution, a pipe
 * or a heredoc, or for a word holding a variable - a value nobody here knows.
 */
function printedBy(simple) {
    if (simple.program === undefined || simple.takes === true || simple.stdin !== undefined || simple.piped === true)
        return undefined;
    const name = basename(simple.program);
    const args = simple.words.slice(simple.words.indexOf(simple.program) + 1);
    if (args.some((word) => word.includes('$')))
        return undefined;
    if (name === 'echo') {
        let first = 0;
        let escapes = false;
        while (/^-[neE]+$/.test(args[first] ?? '')) {
            if ((args[first] ?? '').includes('e'))
                escapes = true;
            first += 1;
        }
        const text = args.slice(first).join(' ');
        return escapes ? withEscapes(text) : text;
    }
    if (name === 'printf') {
        const [format, ...values] = args;
        if (format === undefined || format.startsWith('-'))
            return undefined;
        // Only `%s` and `%%`: any other directive formats a value in a way not read here. `%%s` is a `%` and an `s`.
        if (/%(?!s|%)/.test(format.replace(/%%/g, '')))
            return undefined;
        const slots = format.replace(/%%/g, '').match(/%s/g)?.length ?? 0;
        const once = (from) => {
            let next = from;
            return format.replace(/%%|%s/g, (directive) => (directive === '%%' ? '%' : values[next++] ?? ''));
        };
        if (slots === 0)
            return withEscapes(once(0));
        // printf repeats its format until every value is used.
        let printed = '';
        for (let next = 0; next === 0 || next < values.length; next += slots)
            printed += once(next);
        return withEscapes(printed);
    }
    return undefined;
}
/** The escapes `printf` and `echo -e` turn into characters. Any other backslash is left as written. */
function withEscapes(text) {
    return text.replace(/\\([nt\\])/g, (_, letter) => (letter === 'n' ? '\n' : letter === 't' ? '\t' : '\\'));
}
// ET16 ------------------------------------------------------------------------------------------------------------------
/** A heredoc's opening: `<<` or `<<-`, then its marker - quoted (`'X'`, `"X"`, `\X`) where the shell expands nothing in it. */
const HEREDOC = /^<<(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\([^\s;&|<>()]+)|([^\s;&|<>()'"]+))/;
/**
 * `line` with each substitution of literal words - `$(echo .env)`, `` `printf .env` `` - replaced by what it prints, the
 * innermost first. A substitution of anything else, or one printing a character the shell would read, is left as written.
 * Single-quoted text and the body of a quoted heredoc are the shell's literal text, and are copied untouched.
 */
function withLiteralSubstitutions(line) {
    let out = '';
    let at = 0;
    let inDoubleQuotes = false;
    /** Quoted heredocs opened on the current line, whose bodies follow its newline. */
    const quotedBodies = [];
    while (at < line.length) {
        const character = line.charAt(at);
        const heredoc = !inDoubleQuotes && character === '<' && line.charAt(at + 2) !== '<' ? HEREDOC.exec(line.slice(at)) : null;
        if (heredoc !== null) {
            // An unquoted marker's body is expanded by the shell, so its substitutions are read on as the rest of the line's are.
            const [opening, dash, single, double, escaped] = heredoc;
            const marker = single ?? double ?? escaped;
            if (marker !== undefined)
                quotedBodies.push({ marker, stripTabs: dash === '-' });
            out += opening;
            at += opening.length;
        }
        else if (character === '\n' && !inDoubleQuotes && quotedBodies.length > 0) {
            // Each quoted body, copied as written up to and with its terminating line.
            out += '\n';
            at += 1;
            for (const { marker, stripTabs } of quotedBodies.splice(0)) {
                while (at < line.length) {
                    const end = line.indexOf('\n', at);
                    const raw = line.slice(at, end === -1 ? line.length : end + 1);
                    out += raw;
                    at += raw.length;
                    const text = raw.replace(/\r?\n$/, '');
                    if ((stripTabs ? text.replace(/^\t+/, '') : text) === marker)
                        break;
                }
            }
        }
        else if (character === "'" && !inDoubleQuotes) {
            const close = line.indexOf("'", at + 1);
            const end = close === -1 ? line.length : close + 1;
            out += line.slice(at, end);
            at = end;
        }
        else if (character === '\\') {
            out += line.slice(at, at + 2);
            at += 2;
        }
        else if (character === '"') {
            inDoubleQuotes = !inDoubleQuotes;
            out += character;
            at += 1;
        }
        else if (character === '$' && line.charAt(at + 1) === '(' && line.charAt(at + 2) !== '(') {
            const close = closingParenthesis(line, at + 2);
            const end = close === -1 ? line.length : close;
            const printed = printedLiterally(withLiteralSubstitutions(line.slice(at + 2, end)));
            out += printed ?? line.slice(at, Math.min(end + 1, line.length));
            at = end + 1;
        }
        else if (character === '`') {
            const { inner, end } = backtickedText(line, at + 1);
            const printed = printedLiterally(withLiteralSubstitutions(inner));
            out += printed ?? line.slice(at, Math.min(end, line.length));
            at = end;
        }
        else {
            out += character;
            at += 1;
        }
    }
    return out;
}
/** What a substitution's text prints when it is one `echo` or `printf` of literal words, held to `PLAIN_PRINT`. */
function printedLiterally(inner) {
    // An operator or a redirection makes it more than one command, or sends its output elsewhere.
    if (/[|;&<>\n]/.test(withoutQuotedText(inner)))
        return undefined;
    const commands = commandsRead(inner);
    const [only] = commands;
    if (commands.length !== 1 || only === undefined)
        return undefined;
    const printed = printedBy(only);
    return printed !== undefined && PLAIN_PRINT.test(printed) ? printed : undefined;
}
/** The text with each quoted part taken out, so an operator inside quotes is not read as one. */
function withoutQuotedText(text) {
    return text.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '');
}
// ET17 ------------------------------------------------------------------------------------------------------------------
/** curl's options whose value is a file where it starts with `@`. */
const CURL_DATA = new Set(['-d', '--data', '--data-binary', '--data-ascii', '--json']);
/** curl's option whose value is a file where it reads `@f` or `name@f`, and no `=` comes first. */
const CURL_URLENCODE = '--data-urlencode';
/** curl's options whose value is a file where it reads `name=@f` or `name=<f`, cut at the first `;`. */
const CURL_FORM = new Set(['-F', '--form']);
/** httpie and its kin: an item `@f`, `field@f`, `field=@f` or `field:=@f` after the address sends that file. */
const HTTPIE = new Set(['http', 'https', 'xh', 'xhs']);
/** httpie's options that take the word after them as their value, which is never an item. */
const HTTPIE_OPTIONS_WITH_A_VALUE = new Set([
    '-a', '--auth', '-A', '--auth-type', '--session', '--session-read-only', '-o', '--output', '--verify', '--cert', '--cert-key',
    '--proxy', '--timeout', '--max-redirects', '-p', '--print', '--pretty', '-s', '--style', '--format-options',
    '--response-charset', '--response-mime', '--boundary', '--ssl', '--ciphers', '--default-scheme',
]);
/** The files `simple` hands a sender by `@` or `<`. Standard input (`@-`) is none. */
function filesHandedByAt(simple) {
    if (simple.program === undefined)
        return [];
    const name = basename(simple.program);
    const args = simple.words.slice(simple.words.indexOf(simple.program) + 1);
    const files = name === 'curl' ? curlFiles(args) : HTTPIE.has(name) ? httpieFiles(args) : [];
    return files.filter((file) => file !== '' && file !== '-');
}
function curlFiles(args) {
    const files = [];
    for (let at = 0; at < args.length; at += 1) {
        const word = args[at] ?? '';
        // Attached to a short option, as `-d@.env` and `-Ff=@.env` are.
        const option = /^-[dF]./.test(word) ? word.slice(0, 2) : word;
        const value = option === word ? args[at + 1] : word.slice(2);
        if (value === undefined)
            continue;
        const file = CURL_DATA.has(option)
            ? (value.startsWith('@') ? value.slice(1) : undefined)
            : option === CURL_URLENCODE
                ? /^[^=@]*@(.+)$/.exec(value)?.[1]
                : CURL_FORM.has(option)
                    ? /^[^=]+=[@<]([^;]+)/.exec(value)?.[1]
                    : undefined;
        if (option === word && (CURL_DATA.has(option) || option === CURL_URLENCODE || CURL_FORM.has(option)))
            at += 1;
        if (file !== undefined)
            files.push(file);
    }
    return files;
}
/** httpie's items: the words after its method and address, its options' values left out. */
function httpieFiles(args) {
    const positional = [];
    for (let at = 0; at < args.length; at += 1) {
        const word = args[at] ?? '';
        if (HTTPIE_OPTIONS_WITH_A_VALUE.has(word))
            at += 1;
        else if (!word.startsWith('-'))
            positional.push(word);
    }
    // `http [METHOD] URL [ITEM...]`: a method is a word in capitals.
    const items = positional.slice(/^[A-Z]+$/.test(positional[0] ?? '') ? 2 : 1);
    return items.flatMap((word) => {
        const file = /^@(.+)$/.exec(word)?.[1] ?? /^[^=:@\s]+(?:=|:=)?@(.+)$/.exec(word)?.[1];
        return file === undefined ? [] : [file];
    });
}
/**
 * The line in which a sender names `file` as the file it sends - `curl -T <file>` - so both `refuse` and a report read it as
 * the same line written directly: a file the command opened and sent, never one whose text it printed to the agent.
 */
function sendingLine(file) {
    const path = file.replace(HOME_VARIABLE, '~');
    if (PLAIN_WORD.test(path))
        return `curl -T ${path}`;
    // Single quotes: nothing in them is the shell's, and `~` is not the home directory - as for a quoted path after `@`.
    return `curl -T '${path.replace(/'/g, "'\\''")}'`;
}
