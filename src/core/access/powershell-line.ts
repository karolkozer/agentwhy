// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A PowerShell command line read as the POSIX line that does the same to files (`2026-10-12-powershell-on-windows.md`
 * PW2-PW4), so the one reader of command lines - `refuse`'s and the report's - reads it. Claude Code on Windows runs its
 * shell as a tool of its own, `PowerShell` (PWB1), and an agent there prints a file with `Get-Content`, searches it with
 * `Select-String` and lists a folder with `Get-ChildItem`. Read as bash, none of those prints a file, a `\` between two
 * folders is an escape, and `GET-CONTENT` is no `cat`.
 *
 * Only what reaches a file is rewritten: a cmdlet `CMDLETS` names becomes its POSIX twin and keeps only its paths (and a
 * search its patterns), `\` becomes `/`, a program's name is folded to lower case (PowerShell's are case-blind), and
 * PowerShell's own quoting, escapes and blocks are said in bash's. Every other word stays as written, so a program this
 * does not know keeps the reading the bash reader gives any unknown program.
 */

/** A word as PowerShell would hand it on, quoting taken off; `expands` where a `$` in it is a variable's. */
interface Word {
  readonly word: string;
  readonly expands: boolean;
  /** Some of it was quoted: a comma there is a name's, not a list's. */
  readonly quoted?: boolean;
}

/** An operator, as bash writes it; a `{…}` block's braces are its `;`, marked so PW10 can pass over a stage's block. */
type Operator = { readonly operator: string; readonly block?: 'opens' | 'closes' };

type Token = Word | Operator;

/**
 * PW2: the cmdlets and aliases that reach a file, each as the POSIX program that does the same, with the parameters that
 * take a value (PowerShell's own documentation of each; a parameter may be shortened to any prefix that is its alone).
 * `Path` and `LiteralPath` name files, `Pattern` what a search looks for; any other value is dropped with its name.
 */
const READS_FILE = ['Path', 'LiteralPath', 'TotalCount', 'Head', 'First', 'Tail', 'Last', 'ReadCount', 'Encoding', 'Delimiter', 'Stream', 'Filter', 'Include', 'Exclude', 'Credential'];
const LISTS_VALUES = ['Path', 'LiteralPath', 'Filter', 'Include', 'Exclude', 'Depth', 'Attributes'];
const CMDLETS: Readonly<Record<string, { readonly as: 'cat' | 'grep' | 'ls' | 'xxd'; readonly values: readonly string[] }>> = {
  'get-content': { as: 'cat', values: READS_FILE },
  gc: { as: 'cat', values: READS_FILE },
  type: { as: 'cat', values: READS_FILE },
  cat: { as: 'cat', values: READS_FILE },
  'import-csv': { as: 'cat', values: ['Path', 'LiteralPath', 'Delimiter', 'Header', 'Encoding', 'Culture'] },
  ipcsv: { as: 'cat', values: ['Path', 'LiteralPath', 'Delimiter', 'Header', 'Encoding', 'Culture'] },
  'import-clixml': { as: 'cat', values: ['Path', 'LiteralPath', 'First', 'Skip'] },
  'format-hex': { as: 'xxd', values: ['Path', 'LiteralPath', 'Encoding', 'Count', 'Offset', 'InputObject'] },
  fhx: { as: 'xxd', values: ['Path', 'LiteralPath', 'Encoding', 'Count', 'Offset', 'InputObject'] },
  'select-string': { as: 'grep', values: ['Pattern', 'Path', 'LiteralPath', 'Context', 'Encoding', 'Include', 'Exclude', 'Culture', 'InputObject'] },
  sls: { as: 'grep', values: ['Pattern', 'Path', 'LiteralPath', 'Context', 'Encoding', 'Include', 'Exclude', 'Culture', 'InputObject'] },
  'get-childitem': { as: 'ls', values: LISTS_VALUES },
  gci: { as: 'ls', values: LISTS_VALUES },
  dir: { as: 'ls', values: LISTS_VALUES },
  ls: { as: 'ls', values: LISTS_VALUES },
};

/**
 * PW6: the cmdlets and aliases that move where the line is, each read as bash's `cd`, so what runs after them names its
 * files from there. `Set-Location lessons\01; Get-Content exercise.py` printed a blocked file unrefused (PWB4): a program
 * this did not know moves nowhere, and `exercise.py` was looked for where the line started. Their parameters (PowerShell's
 * documentation): `-Path` and `-LiteralPath` name the folder, `-StackName` takes a value that is none, `-PassThru` none.
 */
const MOVES = new Set(['set-location', 'sl', 'chdir', 'cd', 'push-location', 'pushd']);
const MOVE_VALUES = ['Path', 'LiteralPath', 'StackName'];

/** PW4: the home folder as PowerShell writes it, read as bash's `~`. */
const HOME = /^(?:\$env:USERPROFILE|\$env:HOME|\$HOME)(?=\/|$)/i;

/**
 * A word bash reads as itself, unquoted. A wildcard stays unquoted: `-Path` takes one in PowerShell, quoted or not, and
 * `refuse` walks what a glob would open (R21a).
 */
const PLAIN = /^[\w./,:@%+=*?[\]-]+$/;

export function posixReadingOfPowerShell(line: string, depth = 0): string {
  const parts: Part[] = [];
  let command: Word[] = [];
  for (const token of tokensOf(line)) {
    if ('operator' in token) {
      if (command.length > 0) parts.push({ command });
      command = [];
      parts.push(token);
    } else {
      command.push(token);
    }
  }
  if (command.length > 0) parts.push({ command });

  const out: string[] = [];
  for (let at = 0; at < parts.length; at += 1) {
    const part = parts[at] as Part;
    if ('operator' in part) {
      // A line never starts with a separator, and two in a row say no more than one.
      if (!(part.operator === ';' && (out.length === 0 || out.at(-1) === ';'))) out.push(part.operator);
      continue;
    }
    const opened = listingOpened(parts, at);
    if (opened !== undefined) {
      out.push(...opened.words);
      at = opened.end;
      continue;
    }
    const code = depth < MOST_NESTED ? handedCode(part.command) : undefined;
    if (code !== undefined) {
      out.push(posixReadingOfPowerShell(code, depth + 1));
      continue;
    }
    out.push(...rewritten(part.command).map(forBash));
  }
  while (out.at(-1) === ';') out.pop();
  return out.join(' ');
}

type Part = { readonly command: readonly Word[] } | Operator;

/** How deep a shell handed a shell's code is read (PW12): `cmd /c "pwsh -c …"` and no further. */
const MOST_NESTED = 3;

/** Shells a PowerShell line hands code as a string (PW12), each with the flags that hand it. */
const CODE_SHELLS: readonly { readonly names: ReadonlySet<string>; readonly flags: RegExp }[] = [
  { names: new Set(['cmd', 'cmd.exe']), flags: /^\/[ck]$/i },
  { names: new Set(['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe']), flags: /^-(?:c|command)$/i },
];

/**
 * `2026-10-12-powershell-on-windows.md` PW12 (PWB8): the code a command hands a shell to run - `cmd /c "type
 * secret.txt"`, `pwsh -Command "Get-Content secret.txt"` - as the one line it is, read in its place. Quoted, the code
 * was one word holding a space, which named no file, and a blocked one was let through; `cmd`'s `type`, `more` and
 * `copy` are PowerShell's words too, so the code reads as PowerShell does. Anything else, `undefined`.
 */
function handedCode(command: readonly Word[]): string | undefined {
  const [first, ...rest] = command;
  if (first === undefined || first.expands) return undefined;
  const program = first.word.split(/[\\/]/).at(-1)?.toLowerCase() ?? '';
  const shell = CODE_SHELLS.find(({ names }) => names.has(program));
  const at = shell === undefined ? -1 : rest.findIndex((word) => shell.flags.test(word.word));
  if (at === -1) return undefined;
  const code = rest.slice(at + 1).map((word) => word.word).join(' ');
  return code === '' ? undefined : code;
}

/** The cmdlets a listing's items are handed one at a time to: `… | ForEach-Object { Get-Content $_ }`. */
const EACH = new Set(['%', 'foreach-object', 'foreach']);

/** `$_` and `$PSItem`: the item a pipeline hands a block. */
const ITEM = /^\$(?:_|PSItem)(?!\w)/i;

/**
 * PW7: a listing piped into a reader opens every file it lists - `Get-ChildItem -Recurse -File | Get-Content` printed the
 * blocked files and nothing stopped it (PWB4): the items go down the pipeline as objects, and read word by word the reader
 * named no file. Read as `find … -type f | xargs cat`, which `refuse` and the report already read as the search it is
 * (FN16): a reader with no path of its own after the listing, or one handed `$_` in a `ForEach-Object` block - straight
 * after it, or after stages that only hand its items on (PW10).
 */
function listingOpened(parts: readonly Part[], at: number): { readonly words: readonly string[]; readonly end: number } | undefined {
  const listing = commandAt(parts, at);
  if (listing === undefined || CMDLETS[nameOf(listing) ?? '']?.as !== 'ls' || operatorAt(parts, at + 1) !== '|') return undefined;
  let next = at + 2;
  let kept: Word | undefined;
  for (let stage = passedOn(parts, next); stage !== undefined && operatorAt(parts, stage.end + 1) === '|'; stage = passedOn(parts, next)) {
    kept ??= stage.kept;
    next = stage.end + 2;
  }
  const found = foundBy(listing, kept);
  const command = commandAt(parts, next);
  const reader = command === undefined ? undefined : readerOf(command, false);
  if (reader !== undefined) return { words: [...found, '|', 'xargs', ...reader.map(forBash)], end: next };

  // `| % { gc $_.FullName }`: the block's first command, handed each item.
  const each = command !== undefined && EACH.has(nameOf(command) ?? '') && command.slice(1).every((word) => /^-p(?:r(?:o(?:c(?:e(?:s(?:s)?)?)?)?)?)?$/i.test(word.word));
  const inBlock = each && operatorAt(parts, next + 1) === ';' ? commandAt(parts, next + 2) : undefined;
  const itemReader = inBlock === undefined ? undefined : readerOf(inBlock, true);
  return itemReader === undefined ? undefined : { words: [...found, '|', 'xargs', ...itemReader.map(forBash)], end: next + 2 };
}

/**
 * PW10: the cmdlets that hand a listing's items on - some or all, in another order - so a reader after them still opens
 * what the listing found: `Get-ChildItem -Recurse -File | Where-Object Length -gt 0 | Get-Content` printed both blocked
 * files (PWB6). `Select-Object` hands the items on only with the parameters that keep them, or a property of each
 * (`-ExpandProperty FullName`); its others make new objects (PowerShell's documentation of each).
 */
const FILTERS = new Set(['where-object', 'where', '?']);
const ORDERS = new Set(['sort-object', 'sort', 'get-unique', 'gu']);
const SELECTS = new Set(['select-object', 'select']);
const SELECT_PARAMETERS = ['First', 'Last', 'Skip', 'SkipLast', 'Index', 'Unique', 'Wait', 'CaseInsensitive', 'ExpandProperty', 'Property', 'ExcludeProperty', 'InputObject'];
const SELECT_KEEPS = new Set(['First', 'Last', 'Skip', 'SkipLast', 'Index', 'Unique', 'Wait', 'CaseInsensitive', 'ExpandProperty']);
const SELECT_SWITCHES = new Set(['Unique', 'Wait', 'CaseInsensitive']);

/**
 * PW10: where the part at `at` is a stage that hands a listing's items on, the last part it takes - its block's closing
 * brace where it has one - and the one name a `Where-Object` comparison keeps. `undefined` for anything else.
 */
function passedOn(parts: readonly Part[], at: number): { readonly end: number; readonly kept?: Word } | undefined {
  const stage = commandAt(parts, at);
  const name = stage === undefined ? undefined : nameOf(stage);
  if (stage === undefined || name === undefined) return undefined;
  const block = blockAfter(parts, at);
  if (block === null) return undefined;
  if (FILTERS.has(name)) {
    if (block !== undefined) return { end: block };
    const kept = keptBy(stage.slice(1));
    return { end: at, ...(kept === undefined ? {} : { kept }) };
  }
  if (ORDERS.has(name)) return { end: block ?? at };
  return SELECTS.has(name) && block === undefined && keepsItems(stage.slice(1)) ? { end: at } : undefined;
}

/** The closing brace of a `{…}` block that opens right after the part at `at`; `undefined` where none opens, `null` unclosed. */
function blockAfter(parts: readonly Part[], at: number): number | null | undefined {
  const opening = parts[at + 1];
  if (opening === undefined || !('operator' in opening) || opening.block !== 'opens') return undefined;
  let depth = 0;
  for (let index = at + 1; index < parts.length; index += 1) {
    const part = parts[index] as Part;
    if (!('operator' in part)) continue;
    if (part.block === 'opens') depth += 1;
    if (part.block === 'closes' && (depth -= 1) === 0) return index;
  }
  return null;
}

/**
 * PW10: the one name a `Where-Object` comparison written as parameters keeps - `Name -like 'notes*'`, `Extension -eq .md`
 * (as `*.md`), `-Property` and `-Value` named or not - or `undefined`, keeping every file: any other property or operator,
 * a value a variable holds, or a wildcard an `-eq` would take as written.
 */
function keptBy(words: readonly Word[]): Word | undefined {
  const { named, positional } = givenTo(words, ['Property', 'Value']);
  const operators = words.filter((word) => !word.expands && /^-[A-Za-z]/.test(word.word) && parameterNamed(splitOnce(word.word.slice(1), ':')[0], ['Property', 'Value']) === undefined);
  const [operator] = operators;
  const like = operator !== undefined && operators.length === 1 ? /^-[ic]?(like|eq)$/i.exec(operator.word)?.[1]?.toLowerCase() : undefined;
  const property = named.find(([name]) => name === 'Property')?.[1] ?? positional[0];
  const value = named.find(([name]) => name === 'Value')?.[1] ?? positional[named.some(([name]) => name === 'Property') ? 0 : 1];
  if (like === undefined || property === undefined || value === undefined || property.expands || value.expands || value.word.includes('/')) return undefined;
  if (like === 'eq' && /[*?[]/.test(value.word)) return undefined;
  const of = property.word.toLowerCase();
  if (of === 'name') return { word: value.word, expands: false };
  return of === 'extension' && value.word.startsWith('.') ? { word: `*${value.word}`, expands: false } : undefined;
}

/** PW10: whether a `Select-Object` is given only parameters that keep the items, or a property of each. */
function keepsItems(words: readonly Word[]): boolean {
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] as Word;
    // A word no parameter takes is a property list: new objects, with no file for a reader to open.
    if (word.expands || !/^-[A-Za-z]/.test(word.word)) return false;
    const [given, inline] = splitOnce(word.word.slice(1), ':');
    const name = parameterNamed(given, SELECT_PARAMETERS);
    if (name === undefined || !SELECT_KEEPS.has(name)) return false;
    if (!SELECT_SWITCHES.has(name) && inline === undefined) at += 1;
  }
  return true;
}

function commandAt(parts: readonly Part[], at: number): readonly Word[] | undefined {
  const part = parts[at];
  return part !== undefined && 'command' in part ? part.command : undefined;
}

function operatorAt(parts: readonly Part[], at: number): string | undefined {
  const part = parts[at];
  return part !== undefined && 'operator' in part ? part.operator : undefined;
}

/** A command's name as PowerShell finds it, folded; `undefined` where it is a variable or no name at all. */
function nameOf(command: readonly Word[]): string | undefined {
  const [first] = command;
  if (first === undefined || first.expands) return undefined;
  return /^(?:[A-Za-z][\w-]*|%|\?)$/.test(first.word) ? first.word.toLowerCase() : undefined;
}

/**
 * PW7: a reader cmdlet's POSIX words without files - where it names none of its own (handed the listing itself), or,
 * `item`, where each it names is the pipeline's item. `undefined` for anything else.
 */
function readerOf(command: readonly Word[], item: boolean): Word[] | undefined {
  const cmdlet = CMDLETS[nameOf(command) ?? ''];
  if (cmdlet === undefined || cmdlet.as === 'ls') return undefined;
  const words = rewritten(command);
  const end = words.findIndex((word) => word.word === '--' && !word.expands);
  const files = end < 0 ? [] : words.slice(end + 1);
  if (item ? files.length === 0 || !files.every((file) => ITEM.test(file.word)) : files.length > 0) return undefined;
  return end < 0 ? words : words.slice(0, end);
}

/**
 * PW7: a `Get-ChildItem` as the `find` that lists the same files - where it looks, as deep as it goes (one folder, or
 * `-Depth` more, or all with `-Recurse`), and the one name its `-Filter`, `-Include` or a wildcard in its path keeps
 * (`-iname`, as PowerShell's are case-blind). Two names, or `-Exclude`, keep every file: `refuse` reads `find`'s `-o` and
 * `!` as reaching all, so a block is never lifted by them. `also`: the name a `Where-Object` after it keeps (PW10), taken
 * where the listing keeps none of its own - a file has to pass both, so either one alone reaches no less.
 */
function foundBy(listing: readonly Word[], also?: Word): string[] {
  const { named, positional, recurse } = givenTo(listing.slice(1), LISTS_VALUES);
  const roots = [...named.filter(([name]) => name === 'Path' || name === 'LiteralPath').map(([, value]) => value), ...positional].flatMap(listed).map(homed);
  const depthGiven = named.find(([name]) => name === 'Depth')?.[1];
  const depth = depthGiven !== undefined && /^\d+$/.test(depthGiven.word) ? String(Number(depthGiven.word) + 1) : recurse || depthGiven !== undefined ? undefined : '1';
  const names = named.filter(([name]) => name === 'Filter' || name === 'Include').flatMap(([, value]) => listed(value));

  let [root] = roots;
  let kept = names.length === 1 ? names[0] : undefined;
  // `Get-ChildItem *.md`, `Get-ChildItem docs\*.md`: a wildcard in the path's last part is the name it keeps.
  if (roots.length === 1 && root !== undefined && names.length === 0 && /[*?[]/.test(root.word.split('/').at(-1) ?? '')) {
    const cut = root.word.lastIndexOf('/');
    kept = { word: root.word.slice(cut + 1), expands: root.expands };
    root = { word: cut < 0 ? '.' : root.word.slice(0, cut) || '/', expands: root.expands };
  }
  kept ??= also;
  const where = roots.length === 1 && root !== undefined ? [root] : roots.length === 0 ? [{ word: '.', expands: false }] : roots;
  return [
    'find', ...where.map(forBash),
    ...(depth === undefined ? [] : ['-maxdepth', depth]),
    '-type', 'f',
    // Quoted, so the line's own shell is never read as expanding the name before `find` is handed it.
    ...(kept === undefined || kept.expands ? [] : ['-iname', `'${kept.word.replaceAll("'", `'\\''`)}'`]),
  ];
}

/** PW2, PW3: one command, its program named as PowerShell would find it - a cmdlet as its POSIX twin, any name folded. */
function rewritten(command: readonly Word[]): Word[] {
  const [first, ...rest] = command;
  if (first === undefined) return [];
  const name = first.expands || !/^[A-Za-z][\w-]*$/.test(first.word) ? undefined : first.word.toLowerCase();
  if (name !== undefined && MOVES.has(name)) return movedTo(rest);
  const cmdlet = name === undefined ? undefined : CMDLETS[name];
  if (cmdlet === undefined) return [name === undefined ? homed(first) : { word: name, expands: false }, ...rest.map(homed)];

  const given = givenTo(rest, cmdlet.values);
  const positional = [...given.positional];
  const recurse = given.recurse;
  const paths = given.named.filter(([name]) => name === 'Path' || name === 'LiteralPath').flatMap(([, value]) => listed(value));
  const patterns = given.named.filter(([name]) => name === 'Pattern').map(([, value]) => value);
  if (cmdlet.as === 'grep' && patterns.length === 0) {
    const pattern = positional.shift();
    if (pattern !== undefined) patterns.push(pattern);
  }
  paths.push(...positional.flatMap(listed));

  const program: Word = { word: cmdlet.as, expands: false };
  const files = paths.map(homed);
  if (cmdlet.as === 'grep') return [program, ...patterns.flatMap((pattern) => [{ word: '-e', expands: false }, pattern]), ...ended(files)];
  if (cmdlet.as === 'ls') return [program, ...(recurse ? [{ word: '-R', expands: false }] : []), ...ended(files)];
  return [program, ...ended(files)];
}

/**
 * PW6: a move as bash's `cd` to the folder it names. With none, `cd -`: a place nobody here knows - PowerShell 5.1 stays
 * where it was and 7 goes home - so the words after it are read where the line was, as after any `cd` to an unknown place.
 */
function movedTo(rest: readonly Word[]): Word[] {
  const { named, positional } = givenTo(rest, MOVE_VALUES);
  const folder = named.filter(([name]) => name !== 'StackName').at(-1)?.[1] ?? positional[0];
  return [{ word: 'cd', expands: false }, folder === undefined ? { word: '-', expands: false } : homed(folder)];
}

/** What a command was given: each value-taking parameter with its value, in order, the words no parameter took, `-Recurse`. */
interface Given {
  readonly named: readonly (readonly [string, Word])[];
  readonly positional: readonly Word[];
  readonly recurse: boolean;
}

/** PW2: a parameter by its whole name or a prefix that is its alone, its value inline (`-Path:x`) or the next word. */
function givenTo(rest: readonly Word[], values: readonly string[]): Given {
  const named: (readonly [string, Word])[] = [];
  const positional: Word[] = [];
  let recurse = false;
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] as Word;
    const parameter = !word.expands && /^-[A-Za-z]/.test(word.word) ? word.word.slice(1) : undefined;
    if (parameter === undefined) {
      positional.push(word);
      continue;
    }
    const [given, inline] = splitOnce(parameter, ':');
    const name = parameterNamed(given, values);
    if (name === undefined) {
      if (/^r(?:e(?:c(?:u(?:r(?:s(?:e)?)?)?)?)?)?$/i.test(given)) recurse = true;
      continue;
    }
    const value = inline !== undefined ? { word: inline, expands: word.expands } : rest[(at += 1)];
    if (value !== undefined) named.push([name, value]);
  }
  return { named, positional, recurse };
}

/** The parameter a name given on the line is, by its whole name or a prefix no other value-taking parameter shares. */
function parameterNamed(given: string, values: readonly string[]): string | undefined {
  const lower = given.toLowerCase();
  const exact = values.find((value) => value.toLowerCase() === lower);
  if (exact !== undefined) return exact;
  const prefixed = values.filter((value) => value.toLowerCase().startsWith(lower));
  return prefixed.length === 1 ? prefixed[0] : undefined;
}

/** `a.md,b.md` - PowerShell's array of two paths - unquoted; a quoted comma is a name's. */
function listed(word: Word): Word[] {
  return word.word.includes(',') && !word.expands && word.quoted !== true ? word.word.split(',').filter((part) => part !== '').map((part) => ({ word: part, expands: false })) : [word];
}

/** `--` before the paths, so a name that starts with a dash is still a name. */
function ended(files: readonly Word[]): Word[] {
  return files.length === 0 ? [] : [{ word: '--', expands: false }, ...files];
}

/** PW4: `$HOME/.aws/credentials` as `~/.aws/credentials`, which the bash reader places in the home folder. */
function homed(word: Word): Word {
  return HOME.test(word.word) ? { word: word.word.replace(HOME, '~'), expands: /\$/.test(word.word.replace(HOME, '')) } : word;
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}

/** A word as bash reads it back: unquoted where plain, `~` kept outside quotes, a `$` left to expand where it did. */
function forBash(word: Word): string {
  const home = word.word.startsWith('~/') ? '~/' : word.word === '~' ? '~' : '';
  const rest = word.word.slice(home.length);
  if (rest === '' || PLAIN.test(word.expands ? rest.replaceAll('$', '') : rest)) return home + rest;
  if (word.expands) return `${home}"${rest.replace(/["\\`]/g, '\\$&')}"`;
  return `${home}'${rest.replaceAll("'", `'\\''`)}'`;
}

/**
 * PowerShell's words and the places a command ends (PW3). `'…'` is literal, a doubled quote inside it one quote; `"…"`
 * expands `$`, and a backtick escapes the next character there and outside; `\` is a separator, never an escape; `#`
 * at a word's start comments out the line. A block - `(…)`, `$(…)`, `@(…)`, `{…}` - and the call operator `&` end the
 * command before them, so what runs inside is read as a command of its own. A redirection is kept as bash writes it.
 */
function tokensOf(line: string): Token[] {
  const tokens: Token[] = [];
  let word = '';
  let expands = false;
  let quoted = false;
  let started = false;
  const end = (): void => {
    if (started) tokens.push({ word, expands, ...(quoted ? { quoted } : {}) });
    word = '';
    expands = false;
    quoted = false;
    started = false;
  };
  const add = (text: string): void => {
    word += text.replaceAll('\\', '/');
    started = true;
  };

  for (let at = 0; at < line.length; at += 1) {
    const char = line.charAt(at);
    const next = line.charAt(at + 1);
    if (char === '`') {
      if (next === '\r' || next === '\n') at += next === '\r' && line.charAt(at + 2) === '\n' ? 2 : 1;
      else if (next !== '') {
        add(next);
        at += 1;
      }
      continue;
    }
    if (char === "'") {
      let text = '';
      let close = at + 1;
      for (; close < line.length; close += 1) {
        if (line.charAt(close) !== "'") text += line.charAt(close);
        else if (line.charAt(close + 1) === "'") {
          text += "'";
          close += 1;
        } else break;
      }
      add(text);
      quoted = true;
      at = close;
      continue;
    }
    if (char === '"') {
      let text = '';
      let close = at + 1;
      for (; close < line.length; close += 1) {
        const inside = line.charAt(close);
        if (inside === '`' && close + 1 < line.length) {
          text += line.charAt(close + 1);
          close += 1;
        } else if (inside === '"' && line.charAt(close + 1) === '"') {
          text += '"';
          close += 1;
        } else if (inside === '"') break;
        else {
          if (inside === '$') expands = true;
          text += inside;
        }
      }
      add(text);
      quoted = true;
      at = close;
      continue;
    }
    if (char === '#' && !started) {
      while (at + 1 < line.length && line.charAt(at + 1) !== '\n') at += 1;
      continue;
    }
    if (char === ' ' || char === '\t') {
      end();
      continue;
    }
    if (char === '>' || char === '<') {
      const stream = /^(?:[1-6]|\*)$/.test(word) && !expands ? word : '';
      if (stream !== '') {
        word = '';
        started = false;
      }
      end();
      let operator = (stream === '*' ? '&' : stream) + char;
      if (char === '>' && next === '>') operator += line.charAt((at += 1));
      if (char === '>' && line.charAt(at + 1) === '&' && /[1-6]/.test(line.charAt(at + 2))) operator += line.slice(at + 1, (at += 2) + 1);
      tokens.push({ operator });
      continue;
    }
    if (char === '|' || char === '&') {
      end();
      if (next === char) {
        tokens.push({ operator: char + char });
        at += 1;
      } else tokens.push({ operator: char === '|' ? '|' : ';' });
      continue;
    }
    if (char === ';' || char === '\n' || char === '\r' || char === '(' || char === ')' || char === '{' || char === '}' || ((char === '$' || char === '@') && next === '(')) {
      end();
      if (char === '$' || char === '@') at += 1;
      tokens.push(char === '{' ? { operator: ';', block: 'opens' } : char === '}' ? { operator: ';', block: 'closes' } : { operator: ';' });
      continue;
    }
    if (char === '$') expands = true;
    add(char);
  }
  end();
  return tokens;
}
