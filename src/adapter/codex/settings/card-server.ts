// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { USER_HOOKS } from '../contract/hooks.ts';
import { isPlainInvocation } from '../../../shared/plain-invocation.ts';
import { tomlLines, type ConfigEdit } from './hook-approval.ts';

/**
 * The server of agentwhy's card as `~/.codex/config.toml` names it (`2026-11-25-the-card-in-codex.md` CCX1, CCX4): agentwhy's own table
 * with what it runs, one a person wrote, none, or a form a line edit does not read.
 */
export type CardServer =
  | { readonly kind: 'absent' }
  | { readonly kind: 'own'; readonly run: readonly string[]; readonly disabled: boolean }
  | { readonly kind: 'yours'; readonly disabled: boolean }
  | { readonly kind: 'unsafe'; readonly reason: string };

/** For whoever reads the file. Codex drops comments from these tables when it writes one itself, so nothing is told from it. */
const OWN_COMMENT = '# agentwhy\'s card in Codex\'s desktop app; `agentwhy init --remove --codex-card` takes it out.';
const HEADER = /^\s*\[/;
const OWN_HEADER = /^\[mcp_servers\.agentwhy\]\s*(?:#.*)?$/;
/** Any other header that names it: quoted, spaced, an array, or a table under it. */
const NAMED_HEADER = /^\s*\[\[?\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\.\s*(?:agentwhy|"agentwhy"|'agentwhy')\s*(?:\.|\])/;
const SUB_HEADER = /^\[mcp_servers\.agentwhy\./;
const SERVERS_HEADER = /^\s*\[\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*\]/;
export const DISABLED = /^\s*("?)enabled\1\s*=\s*false\s*(?:#.*)?$/;
const COMMAND = /^command\s*=\s*("(?:[^"\\]|\\.)*")\s*$/;
const ARGS = /^args\s*=\s*(\[.*\])\s*$/;
const STARTUP_SECONDS = 30;
/** As agentwhy writes it, and as Codex writes it again. */
const STARTUP = /^startup_timeout_sec\s*=\s*30(?:\.0+)?\s*$/;
/** An answer may wait 40 s for a first reading (CV17), and a report 45. */
const TOOL_SECONDS = 120;
const OTHERWISE = 'a server named agentwhy is written there in a form agentwhy does not edit';

interface Found {
  readonly lines: readonly string[];
  /** Inside a multi-line string, or an array written over several lines: no header, whatever it starts with. */
  readonly opaque: readonly boolean[];
  /** Its table and every table under it, as line ranges; the first is its own. */
  readonly ranges: ReadonlyArray<readonly [number, number]>;
}

export function cardServerIn(toml: string): CardServer {
  const found = find(toml);
  if (typeof found === 'string') return { kind: 'unsafe', reason: found };
  const own = found.ranges[0];
  if (own === undefined) return { kind: 'absent' };
  const body = found.lines.slice(own[0] + 1, own[1]);
  const disabled = body.some((line, at) => !found.opaque[own[0] + 1 + at] && DISABLED.test(line));
  const command = textOf(body.map((line) => COMMAND.exec(line)?.[1]).find((one) => one !== undefined));
  const args = listOf(body.map((line) => ARGS.exec(line)?.[1]).find((one) => one !== undefined));
  // agentwhy's own by what it holds: agentwhy in plain words, run as the setup runs it. Anything else there is the person's.
  const ours = command !== undefined && args !== undefined && isCardRun([command, ...args]) && body.some((line) => STARTUP.test(line));
  return ours ? { kind: 'own', run: [command, ...args], disabled } : { kind: 'yours', disabled };
}

/** Whether these words run agentwhy's card, named in plain words (J4). */
export function isCardRun(run: readonly string[]): boolean {
  return run.at(-1) === 'cards' && isPlainInvocation(run.slice(0, -1).join(' '));
}

/** The file with agentwhy's table running this, added at its end or brought up to date; every other line as it was. */
export function withCardServer(toml: string, run: readonly string[]): ConfigEdit {
  const held = cardServerIn(toml);
  if (held.kind === 'unsafe') return held;
  if (!isCardRun(run)) return { kind: 'unsafe', reason: 'what would run the card is not agentwhy in plain words' };
  if (held.kind === 'yours') return { kind: 'unsafe', reason: 'a server named agentwhy is there already, added by you' };
  const command = `command = ${quoted(run[0] ?? '')}`;
  const args = `args = [${run.slice(1).map(quoted).join(', ')}]`;
  if (held.kind === 'own') {
    const { lines, ranges } = find(toml) as Found;
    const [start, end] = ranges[0] as readonly [number, number];
    return { kind: 'edited', text: lines.map((line, at) => (at <= start || at >= end ? line : COMMAND.test(line) ? command : ARGS.test(line) ? args : line)).join('\n') };
  }
  const base = toml === '' || toml.endsWith('\n') ? toml : `${toml}\n`;
  const table = ['[mcp_servers.agentwhy]', OWN_COMMENT, command, args, `startup_timeout_sec = ${STARTUP_SECONDS}`, `tool_timeout_sec = ${TOOL_SECONDS}`].join('\n');
  return { kind: 'edited', text: `${base}${base === '' ? '' : '\n'}${table}\n` };
}

/**
 * The file without agentwhy's table and the tables Codex may have written under it - left behind, they would be a server with no command,
 * on which Codex does not start. A person's own stays.
 */
export function withoutCardServer(toml: string): ConfigEdit {
  const held = cardServerIn(toml);
  if (held.kind === 'unsafe') return held;
  if (held.kind !== 'own') return { kind: 'edited', text: toml };
  const { lines, opaque, ranges } = find(toml) as Found;
  const gone = new Set<number>();
  for (const [start, end] of ranges) {
    // Up to its last key: a comment or a blank after that is the person's, or the next table's.
    let last = end - 1;
    while (last > start && !opaque[last] && /^\s*(?:#.*)?$/.test(lines[last] ?? '')) last -= 1;
    for (let at = start; at <= last; at += 1) gone.add(at);
    // The blank line before it was written with it.
    if (start > 0 && (lines[start - 1] ?? '').trim() === '') gone.add(start - 1);
  }
  return { kind: 'edited', text: lines.filter((_, at) => !gone.has(at)).join('\n') };
}

/** Where agentwhy's table and those under it are; why a line edit would not read the file, where it would not. */
function find(toml: string): Found | string {
  const read = structureOf(toml);
  if (read === undefined) return 'it holds a list written in a form agentwhy does not read';
  const { lines, opaque } = read;
  const ranges: Array<readonly [number, number]> = [];
  let context: 'root' | 'servers' | 'other' = 'root';
  let sub = false;
  lines.forEach((line, at) => {
    if (opaque[at]) return;
    if (!HEADER.test(line)) return;
    const own = OWN_HEADER.test(line);
    if (!own && !SUB_HEADER.test(line)) return;
    let end = at + 1;
    while (end < lines.length && (opaque[end] || !HEADER.test(lines[end] ?? ''))) end += 1;
    if (own) ranges.unshift([at, end]);
    else {
      sub = true;
      ranges.push([at, end]);
    }
  });
  const owns = lines.filter((line, at) => !opaque[at] && OWN_HEADER.test(line)).length;
  if (owns > 1 || (owns === 0 && sub)) return OTHERWISE;
  for (let at = 0; at < lines.length; at += 1) {
    if (opaque[at]) continue;
    const line = lines[at] ?? '';
    if (HEADER.test(line)) {
      if (NAMED_HEADER.test(line) && !OWN_HEADER.test(line) && !SUB_HEADER.test(line)) return OTHERWISE;
      context = SERVERS_HEADER.test(line) ? 'servers' : 'other';
      continue;
    }
    if (context === 'root' && /^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*[=.]/.test(line)) return 'its servers are written inline there';
    if (context === 'servers' && /^\s*(?:agentwhy|"agentwhy"|'agentwhy')\s*[=.]/.test(line)) return OTHERWISE;
  }
  return { lines, opaque, ranges };
}

/**
 * The file's lines, and which are inside a multi-line string or a list written over several lines - a line of a list may start with `[` as
 * a header does. Nothing where the two meet, or a list is never closed: a wrong reading there could write a file Codex does not start on.
 */
function structureOf(toml: string): { readonly lines: readonly string[]; readonly opaque: readonly boolean[] } | undefined {
  const { lines, opaque } = tomlLines(toml);
  const inside: boolean[] = [];
  let depth = 0;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? '';
    inside.push(opaque[at] === true || depth > 0);
    if (opaque[at]) {
      if (depth > 0) return undefined;
      continue;
    }
    if (depth === 0 && HEADER.test(line)) continue;
    const after = depthAfter(line, depth);
    if (after === undefined) return undefined;
    depth = after;
  }
  return depth === 0 ? { lines, opaque: inside } : undefined;
}

/** How many lists and inline tables are open after a line; nothing where a multi-line string opens inside one. */
function depthAfter(line: string, before: number): number | undefined {
  let depth = before;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at];
    if (char === '#') break;
    if (char === '"' || char === "'") {
      if (line.startsWith(char.repeat(3), at)) {
        if (depth > 0) return undefined;
        const close = line.indexOf(char.repeat(3), at + 3);
        if (close < 0) break;
        at = close + 2;
        continue;
      }
      at += 1;
      while (at < line.length && line[at] !== char) at += char === '"' && line[at] === '\\' ? 2 : 1;
      continue;
    }
    if (char === '[' || char === '{') depth += 1;
    if (char === ']' || char === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/** A TOML basic string, whose escapes JSON's are. */
const quoted = (text: string): string => JSON.stringify(text);

function textOf(raw: string | undefined): string | undefined {
  try {
    const value: unknown = raw === undefined ? undefined : JSON.parse(raw);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function listOf(raw: string | undefined): readonly string[] | undefined {
  try {
    const value: unknown = raw === undefined ? undefined : JSON.parse(raw);
    return Array.isArray(value) && value.every((one) => typeof one === 'string') ? value : undefined;
  } catch {
    return undefined;
  }
}

/** CCX5: the card as a page may say it. A file that is there and cannot be read for it says nothing either way. */
export async function codexCardState(files: FileReader, home: string): Promise<'on' | 'yours' | 'off' | 'unknown'> {
  let toml: string;
  try {
    toml = await files.readText(join(home, USER_HOOKS.directory, USER_HOOKS.config));
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return error.failure === 'not-found' ? 'off' : 'unknown';
  }
  const held = cardServerIn(toml);
  if (held.kind === 'unsafe') return 'unknown';
  if (held.kind === 'yours') return 'yours';
  return held.kind === 'absent' || held.disabled ? 'off' : 'on';
}
