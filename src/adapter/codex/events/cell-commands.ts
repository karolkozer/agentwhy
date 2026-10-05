// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CELL_COMMANDS } from '../contract/deliveries.ts';

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
}

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
    const command = literalArgument(code, call.argumentsAt);
    if (command !== undefined) commands.push(command);
  }
  return { commands, unread: calls - commands.length, alone: calls === 1 && commands.length === 1 && !other };
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
 * The command of `({ cmd: "…", … })` where it is written text: a quoted string, or a template with no `${`. Anything
 * else - a variable, a call, a template that interpolates, an argument that is no object - is not read.
 */
function literalArgument(code: string, at: number): string | undefined {
  let position = skipSpace(code, at);
  if (code[position] !== '{') return undefined;
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
        if (code[colon] === ':' && key.name === CELL_COMMANDS.command) {
          // The text must be the whole value: `"rg " + pattern` is built while the code runs.
          const value = skipSpace(code, colon + 1);
          const after = code[skipSpace(code, skipQuoted(code, value))];
          return after === ',' || after === '}' ? stringAt(code, value) : undefined;
        }
        position = key.end;
        continue;
      }
    }
    const skipped = skipQuoted(code, position);
    position = skipped !== position ? skipped : position + 1;
  }
  return undefined;
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
