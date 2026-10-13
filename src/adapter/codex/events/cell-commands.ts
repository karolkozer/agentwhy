// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CELL_COMMANDS, CELL_RESULT, PAIRED_CELL } from '../contract/deliveries.ts';

/**
 * The commands a cell's code hands `tools.exec_command` as written text (XD4, amended 2026-10-05; spec §2.11).
 *
 * Read only where the record keeps no action item of its own: the VS Code panel writes none (101 files, measured), so a
 * cell's code is all there is of what it ran. A command the code builds while it runs is never read - it would be a
 * guess (L005) - and is counted instead, so the caller can say what is missing. Of 180 cells with a call measured, 179
 * passed the command as written text.
 */
export interface CellCommands {
  /** Each command written as text, in the order the code holds them. */
  readonly commands: readonly string[];
  /** Calls whose command is not written text: built at run time, a variable, or a shape not read here. */
  readonly unread: number;
  /**
   * The cell runs this one command and calls no other tool, so what it returned to the model came from this command
   * and from code around it alone: the one case its output can be given to a command.
   */
  readonly alone: boolean;
  /**
   * `2026-10-13-each-command-its-own-result.md`: how the code says which part of the cell's return is which command's -
   * by a label it wrote from each command's place (EC1), or by the order its commands each emit one part (EC6, EC7).
   * Absent for any other code.
   */
  readonly pairing?: CellPairing;
}

export type CellPairing =
  /** EC1: the label's key, and whether the settled result is spread beside it (`{ i, ...r }`) or under `result`. */
  | { readonly by: 'label'; readonly label: string; readonly spread: boolean }
  /**
   * EC6, EC7: part k is command k's, in the code's order - its result object (`result`, wherever the part holds it), or
   * only what it printed (`output`, where the code emitted `r.output`).
   */
  | { readonly by: 'order'; readonly emits: readonly ('result' | 'output')[] };

export function cellCommands(code: string): CellCommands {
  const commands: string[] = [];
  let calls = 0;
  let other = false;
  for (const call of toolCalls(code)) {
    if (call.name !== CELL_COMMANDS.call) {
      other = true;
      continue;
    }
    calls += 1;
    const command = literalProperty(code, call.argumentsAt, CELL_COMMANDS.command).value;
    if (command !== undefined) commands.push(command);
  }
  const unread = calls - commands.length;
  const pairing = other || unread > 0 || calls === 0 ? undefined : pairingOf(withoutComments(code), calls);
  return { commands, unread, alone: calls === 1 && commands.length === 1 && !other, ...(pairing === undefined ? {} : { pairing }) };
}

/** A name a script gives a value, as JavaScript reads one. */
const NAME = '[A-Za-z_$][\\w$]*';

/**
 * How the code says whose each part of its return is, read from the code with its comments made spaces: where it is
 * `const A = await Promise.allSettled([…])` or `Promise.all([…])`, whose array holds the cell's `calls`, each element one
 * of them, and one statement after it - a label written from the place (EC1), or a `forEach` that emits each element
 * once (EC7); otherwise statements that each run one command and emit it at once (EC6). Anything else the code does
 * makes the parts no command's, since one of them could then be another statement's.
 */
function pairingOf(bare: string, calls: number): CellPairing | undefined {
  const head = new RegExp(`^\\s*(?:const|let)\\s+(${NAME})\\s*=\\s*await\\s+(${escaped(PAIRED_CELL.settle)}|${escaped(PAIRED_CELL.all)})\\s*\\(\\s*\\[`).exec(bare);
  if (head === null) return turnForm(bare, calls);
  const list = head[1] as string;
  const settles = head[2] === PAIRED_CELL.settle;
  const close = closingBracket(bare, head[0].length);
  if (close === undefined || arrayElements(bare.slice(head[0].length, close)) !== calls) return undefined;
  const rest = /^\]\s*\)\s*;?\s*/.exec(bare.slice(close));
  if (rest === null) return undefined;
  const statement = bare.slice(close + rest[0].length);
  // A label the code wrote is the stronger word: where it is written, the return is read by it or not at all.
  const label = settles ? labelForm(statement, list) : undefined;
  return label === undefined ? eachForm(statement, list, settles, calls) : { by: 'label', ...label };
}

/**
 * EC7: `A.forEach(R => text(E))` - or `(R, I) =>`, its body in braces, or `A.forEach(text)` - and nothing after it.
 * `forEach` visits its array from the first element to the last and calls the body once for each, so part k is command
 * k's. `E` may be any expression that neither emits, calls a tool nor holds a function of its own; where it is `R.output`
 * over `Promise.all`, a part is what its command printed, and otherwise the result object it holds, if it holds one.
 */
function eachForm(statement: string, list: string, settles: boolean, calls: number): CellPairing | undefined {
  const each = `^${escaped(list)}\\s*\\.\\s*${PAIRED_CELL.each}\\s*\\(\\s*`;
  if (new RegExp(`${each}${PAIRED_CELL.emit}\\s*\\)\\s*;?\\s*$`).test(statement)) return { by: 'order', emits: Array(calls).fill('result') };
  const head = new RegExp(`${each}(?:\\(\\s*(${NAME})\\s*(?:,\\s*${NAME}\\s*)?\\)|(${NAME}))\\s*=>\\s*(\\{\\s*)?${PAIRED_CELL.emit}\\s*\\(`).exec(statement);
  if (head === null) return undefined;
  const element = (head[1] ?? head[2]) as string;
  const close = closingBracket(statement, head[0].length, ')');
  if (close === undefined) return undefined;
  const expression = statement.slice(head[0].length, close);
  if (new RegExp(`\\b${PAIRED_CELL.emit}\\s*\\(|\\b${CELL_COMMANDS.toolsObject}\\s*\\.|=>|\\bfunction\\b`).test(expression)) return undefined;
  const tail = head[3] === undefined ? /^\)\s*\)\s*;?\s*$/ : /^\)\s*;?\s*\}\s*\)\s*;?\s*$/;
  if (!tail.test(statement.slice(close))) return undefined;
  const printed = !settles && new RegExp(`^\\s*${escaped(element)}\\s*\\.\\s*${CELL_RESULT.output}\\s*$`).test(expression);
  return { by: 'order', emits: Array(calls).fill(printed ? 'output' : 'result') };
}

/**
 * EC6: statements one after another, each running one command and emitting it at once - `text(await C)`,
 * `text((await C).output)`, or `const R = await C;` then `text(R)` or `text(R.output)` - and nothing else. Each waits for
 * its command before the next starts, and emits one part, so part k is command k's.
 */
function turnForm(bare: string, calls: number): CellPairing | undefined {
  const emits: ('result' | 'output')[] = [];
  const call = `${CELL_COMMANDS.toolsObject}\\s*\\.\\s*${CELL_COMMANDS.call}\\s*\\(`;
  const output = `\\.\\s*${CELL_RESULT.output}\\s*`;
  for (let at = skipSeparators(bare, 0); at < bare.length; at = skipSeparators(bare, at)) {
    const rest = bare.slice(at);
    const emitted = new RegExp(`^${PAIRED_CELL.emit}\\s*\\(\\s*(\\(\\s*)?await\\s+${call}`).exec(rest);
    const named = emitted === null ? new RegExp(`^(?:const|let)\\s+(${NAME})\\s*=\\s*await\\s+${call}`).exec(rest) : null;
    const step = emitted ?? named;
    if (step === null) return undefined;
    const end = closingBracket(rest, step[0].length, ')');
    if (end === undefined) return undefined;
    const after = emitted !== null
      ? new RegExp(emitted[1] === undefined ? '^\\)\\s*\\)' : `^\\)\\s*\\)\\s*${output}\\)`).exec(rest.slice(end))
      : new RegExp(`^\\)\\s*;?\\s*${PAIRED_CELL.emit}\\s*\\(\\s*${escaped(named?.[1] as string)}\\s*(${output})?\\)`).exec(rest.slice(end));
    if (after === null) return undefined;
    emits.push((emitted !== null ? emitted[1] !== undefined : after[1] !== undefined) ? 'output' : 'result');
    at += end + after[0].length;
  }
  return emits.length === calls ? { by: 'order', emits } : undefined;
}

/** Past white space and the `;` that ends a statement. */
function skipSeparators(text: string, at: number): number {
  let position = at;
  while (position < text.length && /[\s;]/.test(text[position] ?? '')) position += 1;
  return position;
}

/** The form that hands each settled result to the model, labelled by its place (EC1); `undefined` for any other code. */
function labelForm(statement: string, results: string): { readonly label: string; readonly spread: boolean } | undefined {
  const list = escaped(results);
  const body = (label: string, result: string): string => {
    const named = `${label}(?:\\s*:\\s*${label})?`;
    const settled = `(?:${PAIRED_CELL.result}\\s*:\\s*${result}|\\.\\.\\.\\s*${result})`;
    const object = `\\{\\s*(?:${named}\\s*,\\s*${settled}|${settled}\\s*,\\s*${named})\\s*,?\\s*\\}`;
    const emitted = `${PAIRED_CELL.emit}\\s*\\(\\s*(?:${escaped(PAIRED_CELL.serialise)}\\s*\\(\\s*${object}\\s*\\)|${object})\\s*\\)`;
    return `(?:\\{\\s*${emitted}\\s*;?\\s*\\}|${emitted})`;
  };
  const loop = new RegExp(
    `^for\\s*\\(\\s*let\\s+(?<i>${NAME})\\s*=\\s*0\\s*;\\s*\\k<i>\\s*<\\s*${list}\\s*\\.\\s*length\\s*;\\s*` +
    `(?:\\k<i>\\s*\\+\\+|\\+\\+\\s*\\k<i>|\\k<i>\\s*\\+=\\s*1)\\s*\\)\\s*${body('\\k<i>', `${list}\\s*\\[\\s*\\k<i>\\s*\\]`)}\\s*;?\\s*$`,
  ).exec(statement);
  const each = new RegExp(
    `^${list}\\s*\\.\\s*forEach\\s*\\(\\s*\\(\\s*(?<r>${NAME})\\s*,\\s*(?<i>${NAME})\\s*\\)\\s*=>\\s*${body('\\k<i>', '\\k<r>')}\\s*\\)\\s*;?\\s*$`,
  ).exec(statement);
  const found = loop ?? each;
  const label = found?.groups?.['i'];
  // A label that is the result's own key, or the element's own name, says nothing of the place.
  if (found === null || label === undefined || label === PAIRED_CELL.result || label === found.groups?.['r'] || label === results) return undefined;
  return { label, spread: found[0].includes('...') };
}

/** How many elements an array literal's text holds, each split at a comma outside a string or a bracket. */
function arrayElements(text: string): number {
  let elements = 0;
  let current = '';
  for (let at = 0, depth = 0; at < text.length;) {
    const skipped = skipQuoted(text, at);
    if (skipped !== at) {
      current += text.slice(at, skipped);
      at = skipped;
      continue;
    }
    const character = text[at] as string;
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      if (!isCall(current)) return -1;
      elements += 1;
      current = '';
    } else {
      current += character;
    }
    at += 1;
  }
  if (current.trim() === '') return elements;
  return isCall(current) ? elements + 1 : -1;
}

/** One element of the settled array that is a call of `tools.exec_command` and nothing around it. */
function isCall(element: string): boolean {
  const text = element.trim();
  const call = new RegExp(`^${CELL_COMMANDS.toolsObject}\\s*\\.\\s*${CELL_COMMANDS.call}\\s*\\(`).exec(text);
  return call !== null && closingBracket(text, call[0].length, ')') === text.length - 1;
}

/**
 * Where the bracket opened just before `at` closes, past strings and nested brackets; `undefined` where it never does,
 * or a bracket of another kind closes it first.
 */
function closingBracket(text: string, at: number, closing = ']'): number | undefined {
  const pairs: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
  const open: string[] = [closing];
  for (let position = at; position < text.length;) {
    const skipped = skipQuoted(text, position);
    if (skipped !== position) {
      position = skipped;
      continue;
    }
    const character = text[position] as string;
    if (character in pairs) open.push(pairs[character] as string);
    else if (')]}'.includes(character)) {
      if (open.pop() !== character) return undefined;
      if (open.length === 0) return position;
    }
    position += 1;
  }
  return undefined;
}

/** The code with each comment made one space, its strings kept whole. */
function withoutComments(code: string): string {
  let bare = '';
  for (let at = 0; at < code.length;) {
    const skipped = skipQuoted(code, at);
    if (skipped === at) {
      bare += code[at];
      at += 1;
      continue;
    }
    bare += code[at] === '/' ? ' ' : code.slice(at, skipped);
    at = skipped;
  }
  return bare;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One `tools.exec_command` call of a cell: its command as written text, and the folder its `workdir` names. */
export interface CellCommandPlace {
  readonly command: string;
  /** The `workdir` written as text; absent where the call names none and runs in the turn's folder. */
  readonly workdir?: string;
  /** The call names a `workdir` that is not written text - a variable, a built string - so where it runs is not known. */
  readonly workdirUnread?: true;
}

/**
 * `2026-10-11-the-rules-where-the-file-is.md` RW15, RWB7: each command a cell's code hands `tools.exec_command` as written
 * text, with the folder the call says it runs in - measured on Codex 0.162.1, `tools.exec_command({cmd:"cat notes.txt",
 * workdir:"<project>/sub"})` ran in `sub` while the hook was told the session's folder. A command not written as text is
 * not read, as `cellCommands` reads none.
 */
export function cellCommandPlaces(code: string): readonly CellCommandPlace[] {
  return toolCalls(code).flatMap((call): CellCommandPlace[] => {
    if (call.name !== CELL_COMMANDS.call) return [];
    const command = literalProperty(code, call.argumentsAt, CELL_COMMANDS.command).value;
    if (command === undefined) return [];
    const workdir = literalProperty(code, call.argumentsAt, CELL_COMMANDS.workdir);
    if (!workdir.present) return [{ command }];
    return [workdir.value === undefined ? { command, workdirUnread: true } : { command, workdir: workdir.value }];
  });
}

/** Every `tools.<name>(` the code holds outside a string or a comment, with where its arguments start. */
function toolCalls(code: string): { readonly name: string; readonly argumentsAt: number }[] {
  const found: { name: string; argumentsAt: number }[] = [];
  const prefix = CELL_COMMANDS.toolsObject + '.';
  for (let at = 0; at < code.length;) {
    const skipped = skipQuoted(code, at);
    if (skipped !== at) {
      at = skipped;
      continue;
    }
    if (code.startsWith(prefix, at) && !isWordCharacter(code[at - 1])) {
      let end = at + prefix.length;
      while (end < code.length && isWordCharacter(code[end])) end += 1;
      const name = code.slice(at + prefix.length, end);
      let open = end;
      while (open < code.length && /\s/.test(code[open] ?? '')) open += 1;
      if (name !== '' && code[open] === '(') found.push({ name, argumentsAt: open + 1 });
      at = end;
      continue;
    }
    at += 1;
  }
  return found;
}

/**
 * The value of one key of `({ cmd: "…", … })` where it is written text: a quoted string, or a template with no `${`.
 * Anything else - a variable, a call, a template that interpolates, an argument that is no object - is not read, and
 * `present` says whether the key was there at all.
 */
function literalProperty(code: string, at: number, wanted: string): { readonly present: boolean; readonly value?: string } {
  let position = skipSpace(code, at);
  if (code[position] !== '{') return { present: false };
  position += 1;
  for (let depth = 1; position < code.length && depth > 0;) {
    position = skipSpace(code, position);
    const character = code[position];
    if (character === '}') {
      depth -= 1;
      position += 1;
      continue;
    }
    if (character === '{' || character === '[' || character === '(') {
      depth += 1;
      position += 1;
      continue;
    }
    if (character === ']' || character === ')') {
      depth -= 1;
      position += 1;
      continue;
    }
    if (depth === 1) {
      const key = keyAt(code, position);
      if (key !== undefined) {
        const colon = skipSpace(code, key.end);
        if (code[colon] === ':' && key.name === wanted) {
          // The text must be the whole value: `"rg " + pattern` is built while the code runs.
          const value = skipSpace(code, colon + 1);
          const after = code[skipSpace(code, skipQuoted(code, value))];
          const text = after === ',' || after === '}' ? stringAt(code, value) : undefined;
          return text === undefined ? { present: true } : { present: true, value: text };
        }
        position = key.end;
        continue;
      }
    }
    const skipped = skipQuoted(code, position);
    position = skipped !== position ? skipped : position + 1;
  }
  return { present: false };
}

/** A key of an object literal: a bare name, or a quoted one. */
function keyAt(code: string, at: number): { readonly name: string; readonly end: number } | undefined {
  const quote = code[at];
  if (quote === '"' || quote === "'") {
    const end = skipQuoted(code, at);
    const name = stringAt(code, at);
    return name === undefined ? undefined : { name, end };
  }
  let end = at;
  while (end < code.length && isWordCharacter(code[end])) end += 1;
  return end === at ? undefined : { name: code.slice(at, end), end };
}

/** The value of a string literal starting at `at`, or `undefined` where there is none, or it interpolates. */
function stringAt(code: string, at: number): string | undefined {
  const quote = code[at];
  if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
  let text = '';
  for (let position = at + 1; position < code.length; position += 1) {
    const character = code[position] as string;
    if (character === quote) return text;
    if (quote === '`' && character === '$' && code[position + 1] === '{') return undefined;
    if (quote !== '`' && character === '\n') return undefined;
    if (character !== '\\') {
      text += character;
      continue;
    }
    const escaped = escapeAt(code, position);
    if (escaped === undefined) return undefined;
    text += escaped.text;
    position = escaped.end - 1;
  }
  return undefined;
}

/** One escape of a JavaScript string, as the language reads it: `\n`, `é`, `\x41`, a line continuation, `\q` as `q`. */
function escapeAt(code: string, at: number): { readonly text: string; readonly end: number } | undefined {
  const next = code[at + 1];
  if (next === undefined) return undefined;
  const simple: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (next in simple && !(next === '0' && /\d/.test(code[at + 2] ?? ''))) return { text: simple[next] as string, end: at + 2 };
  if (next === '\n') return { text: '', end: at + 2 };
  if (next === 'x') {
    const hex = code.slice(at + 2, at + 4);
    return /^[0-9a-fA-F]{2}$/.test(hex) ? { text: String.fromCharCode(parseInt(hex, 16)), end: at + 4 } : undefined;
  }
  if (next === 'u') {
    const braced = /^\{([0-9a-fA-F]{1,6})\}/.exec(code.slice(at + 2));
    if (braced !== null) {
      const point = parseInt(braced[1] as string, 16);
      return point > 0x10ffff ? undefined : { text: String.fromCodePoint(point), end: at + 2 + braced[0].length };
    }
    const hex = code.slice(at + 2, at + 6);
    return /^[0-9a-fA-F]{4}$/.test(hex) ? { text: String.fromCharCode(parseInt(hex, 16)), end: at + 6 } : undefined;
  }
  // An octal escape is legacy and a strict module refuses it: not read.
  if (/[1-9]/.test(next)) return undefined;
  return { text: next, end: at + 2 };
}

/** Past a string, a template or a comment that starts at `at`; `at` itself where none does. */
function skipQuoted(code: string, at: number): number {
  const character = code[at];
  if (character === '/' && code[at + 1] === '/') {
    const end = code.indexOf('\n', at);
    return end === -1 ? code.length : end + 1;
  }
  if (character === '/' && code[at + 1] === '*') {
    const end = code.indexOf('*/', at + 2);
    return end === -1 ? code.length : end + 2;
  }
  if (character !== '"' && character !== "'" && character !== '`') return at;
  for (let position = at + 1; position < code.length; position += 1) {
    if (code[position] === '\\') {
      position += 1;
      continue;
    }
    if (code[position] === character) return position + 1;
  }
  return code.length;
}

function skipSpace(code: string, at: number): number {
  let position = at;
  while (position < code.length && /\s/.test(code[position] ?? '')) position += 1;
  return position;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}
