// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { type JsonObject } from '../../../shared/json.ts';
import { HOOK_HASH, USER_HOOKS } from '../contract/hooks.ts';

/** The two events agentwhy's Codex entries run on, by the names the file uses. */
export type HookEvent = keyof typeof HOOK_HASH.eventKeys;

/**
 * One hook entry where it stands in its file: the indices Codex keys its approval by (AOB1 - positional, so counted
 * exactly as Codex counts them), the group's matcher, and the entry as written.
 */
export interface PlacedEntry {
  readonly event: HookEvent;
  readonly group: number;
  readonly handler: number;
  readonly matcher?: string;
  readonly entry: JsonObject;
}

/**
 * The entry's hash as Codex computes it (`2026-10-02-codex-approves-its-own-hook.md` AOB1): compact JSON, keys sorted at
 * every depth, SHA-256. `undefined` where the entry holds something the recipe was not measured over - never a guess
 * that Codex would agree (AO2).
 */
export function entryHash(placed: Pick<PlacedEntry, 'event' | 'matcher' | 'entry'>): string | undefined {
  const { entry } = placed;
  if (entry.type !== 'command' || typeof entry.command !== 'string') return undefined;
  if (HOOK_HASH.unmeasured.some((field) => field in entry)) return undefined;
  const timeout = entry[HOOK_HASH.fields.timeout];
  const asynchronous = entry[HOOK_HASH.fields.async];
  const message = entry[HOOK_HASH.fields.statusMessage];
  if (timeout !== undefined && (typeof timeout !== 'number' || !Number.isInteger(timeout))) return undefined;
  if (asynchronous !== undefined && typeof asynchronous !== 'boolean') return undefined;
  if (message !== undefined && typeof message !== 'string') return undefined;
  const handler: Record<string, unknown> = {
    type: 'command',
    command: entry.command,
    [HOOK_HASH.fields.timeout]: Math.max(1, typeof timeout === 'number' ? timeout : HOOK_HASH.defaultTimeout),
    [HOOK_HASH.fields.async]: asynchronous === true,
    ...(message === undefined ? {} : { [HOOK_HASH.fields.statusMessage]: message }),
  };
  const identity: Record<string, unknown> = { event_name: HOOK_HASH.eventKeys[placed.event], hooks: [handler] };
  // A Stop group's matcher is dropped before hashing; PreToolUse keeps its own (AOB1, `matcher_pattern_for_event`).
  if (placed.event === 'PreToolUse' && placed.matcher !== undefined) identity.matcher = placed.matcher;
  return `${HOOK_HASH.prefix}${createHash('sha256').update(JSON.stringify(sorted(identity))).digest('hex')}`;
}

/** The key Codex files an approval under: the hooks file's absolute path, the event in snake case, the two indices. */
export function approvalKey(hooksPath: string, placed: Pick<PlacedEntry, 'event' | 'group' | 'handler'>): string {
  return `${hooksPath}:${HOOK_HASH.eventKeys[placed.event]}:${placed.group}:${placed.handler}`;
}

/** One approval as `config.toml` holds it. `disabled` is an `enabled = false` a person set in Codex. */
export interface Approval {
  readonly hash?: string;
  readonly disabled: boolean;
}

/** An edit of `config.toml`: the new text, or why it was not made (AO11). */
export type ConfigEdit = { readonly kind: 'edited'; readonly text: string } | { readonly kind: 'unsafe'; readonly reason: string };

/** The approval filed under `key` in the one form this reads, or `undefined` where there is none. */
export function approvalOf(toml: string, key: string): Approval | undefined {
  const table = scan(toml).tables.find((candidate) => candidate.key === key);
  return table === undefined ? undefined : { ...(table.hash === undefined ? {} : { hash: table.hash }), disabled: table.disabled };
}

/**
 * The config with agentwhy's own approvals in place (AO2, AO3): each wanted key's table holds the wanted hash - its
 * `trusted_hash` line replaced, or added to the table, or a table appended at the end - and a stale table is removed:
 * one under the same hooks file, at a key no longer wanted, holding one of the wanted hashes, which is agentwhy's own
 * approval left behind when its entries' positions shifted. A person's `enabled = false` on such a table moves with it
 * to the new key of the same event. Every other line stays as it was. `unsafe` where agentwhy's key, or `hooks`
 * itself, is written in a form a line edit cannot extend without making the file invalid (AO11) - its own table
 * holding a `trusted_hash`, or an `enabled` the carried choice would replace, in a form this does not read, included:
 * a second line of the same key is invalid TOML, and Codex would not start on it.
 */
export function withOwnApprovals(toml: string, hooksPath: string, wanted: ReadonlyArray<{ readonly key: string; readonly hash: string }>): ConfigEdit {
  const keys = new Set(wanted.map((approval) => approval.key));
  const hashes = new Set(wanted.map((approval) => approval.hash));
  const scanned = scan(toml);
  const stale = scanned.tables.filter((table) => table.key.startsWith(`${hooksPath}:`) && !keys.has(table.key) && table.hash !== undefined && hashes.has(table.hash));
  const unsafe = unsafeFor(scanned, [...keys, ...stale.map((table) => table.key)]);
  if (unsafe !== undefined) return { kind: 'unsafe', reason: unsafe };

  // A disabled stale table hands its choice to the wanted key of the same event.
  const carried = new Set<string>();
  for (const table of stale) {
    if (!table.disabled) continue;
    const event = eventOf(table.key, hooksPath);
    const target = wanted.find((approval) => eventOf(approval.key, hooksPath) === event)?.key;
    if (target !== undefined) carried.add(target);
  }

  // A key written in a form the line regexes do not read is not absent: adding the line beside it duplicates the key.
  for (const approval of wanted) {
    const table = scanned.tables.find((candidate) => candidate.key === approval.key);
    if (table === undefined) continue;
    if (table.otherHash) return { kind: 'unsafe', reason: WRITTEN_OTHERWISE };
    if (carried.has(approval.key) && !table.disabled && table.enabled) return { kind: 'unsafe', reason: WRITTEN_OTHERWISE };
  }

  const lines = [...scanned.lines];
  const removed = new Set<number>();
  for (const table of stale) for (const at of rangeOf(scanned, table)) removed.add(at);

  const inserted = new Map<number, string[]>();
  const appended: string[] = [];
  for (const approval of wanted) {
    const table = scanned.tables.find((candidate) => candidate.key === approval.key);
    const hashLine = `${USER_HOOKS.trustedHash} = "${approval.hash}"`;
    if (table === undefined) {
      appended.push([headerFor(approval.key), OWN_COMMENT, ...(carried.has(approval.key) ? [`${USER_HOOKS.enabled} = false`] : []), hashLine].join('\n'));
      continue;
    }
    if (table.hashLine !== undefined) lines[table.hashLine] = hashLine;
    else inserted.set(table.start, [...(inserted.get(table.start) ?? []), hashLine]);
    if (carried.has(approval.key) && !table.disabled) inserted.set(table.start, [...(inserted.get(table.start) ?? []), `${USER_HOOKS.enabled} = false`]);
  }

  const out: string[] = [];
  lines.forEach((line, at) => {
    if (removed.has(at)) return;
    out.push(line);
    for (const extra of inserted.get(at) ?? []) out.push(extra);
  });
  let text = out.join('\n');
  if (appended.length > 0) {
    const base = text === '' ? '' : text.endsWith('\n') ? text : `${text}\n`;
    text = `${base}${base === '' ? '' : '\n'}${appended.join('\n\n')}\n`;
  }
  return { kind: 'edited', text };
}

/**
 * The config without agentwhy's approvals (AO7): under the given hooks file, every table at one of `keys` or holding
 * one of `hashes` goes whole - an `enabled = false` in it included, since it named agentwhy's entry and would otherwise
 * apply to whatever lands at that position next. Every other line stays as it was.
 */
export function withoutOwnApprovals(toml: string, hooksPath: string, keys: ReadonlySet<string>, hashes: ReadonlySet<string>): ConfigEdit {
  const scanned = scan(toml);
  const ours = scanned.tables.filter((table) => table.key.startsWith(`${hooksPath}:`) && (keys.has(table.key) || (table.hash !== undefined && hashes.has(table.hash))));
  const unsafe = unsafeFor(scanned, [...keys, ...ours.map((table) => table.key)]);
  if (unsafe !== undefined) return { kind: 'unsafe', reason: unsafe };
  const removed = new Set<number>();
  for (const table of ours) for (const at of rangeOf(scanned, table)) removed.add(at);
  return { kind: 'edited', text: scanned.lines.filter((_, at) => !removed.has(at)).join('\n') };
}

/**
 * The lines a table's removal takes: its header through its last non-blank line - the blank lines after it stay, as
 * the separator before whatever follows, or the file's last newline - and the blank line before it where agentwhy wrote
 * that one with it.
 */
function rangeOf(scanned: Scanned, table: StateTable): number[] {
  let last = table.end - 1;
  while (last > table.start && (scanned.lines[last] ?? '').trim() === '') last -= 1;
  const range: number[] = [];
  for (let at = table.start; at <= last; at += 1) range.push(at);
  if (table.start > 0 && scanned.lines[table.start - 1] === '' && scanned.lines[table.start + 1] === OWN_COMMENT) range.push(table.start - 1);
  return range;
}

/**
 * AO16: whether `config.toml` defines hooks of its own - a `[hooks.<Event>]` or `[[hooks.<Event>]]` table, a key of
 * `[hooks]` other than `state`, or `hooks` written inline or dotted at the root with anything but `state`. Codex would
 * then load hooks from both it and a `hooks.json` agentwhy created, and warn about it in every session.
 */
export function tomlDefinesHooks(toml: string): boolean {
  const scanned = scan(toml);
  let context: 'root' | 'hooks' | 'other' = 'root';
  for (let at = 0; at < scanned.lines.length; at += 1) {
    if (scanned.opaque[at]) continue;
    const line = scanned.lines[at] ?? '';
    if (HEADER.test(line)) {
      const event = HOOKS_SUBTABLE.exec(line)?.[2];
      if (event !== undefined && event !== 'state') return true;
      context = HOOKS_TABLE.test(line) ? 'hooks' : 'other';
      continue;
    }
    if (context === 'root' && /^\s*hooks\s*=/.test(line)) return true;
    const dotted = /^\s*hooks\s*\.\s*("?)(\w+)\1/.exec(line)?.[2];
    if (context === 'root' && dotted !== undefined && dotted !== 'state') return true;
    const key = /^\s*("?)(\w+)\1\s*[=.]/.exec(line)?.[2];
    if (context === 'hooks' && key !== undefined && key !== 'state') return true;
  }
  return false;
}

const HOOKS_SUBTABLE = /^\s*\[\[?\s*hooks\s*\.\s*("?)(\w+)\1/;

/** Why a line edit is refused where agentwhy's own approval is written in a form this does not read (AO11). */
const WRITTEN_OTHERWISE = 'agentwhy\'s approval is written there in a form agentwhy does not edit';

/** The comment agentwhy writes under its own header, so a person reading the file knows what it is and how to undo it. */
const OWN_COMMENT = '# agentwhy approved its own check here; `agentwhy init --remove --codex` takes it out.';

/** One `[hooks.state."…"]` table: where it starts and ends, its key, its hash line and whether it is disabled. */
interface StateTable {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly hash?: string;
  readonly hashLine?: number;
  readonly disabled: boolean;
  /** It holds a `trusted_hash` line `TRUSTED_HASH` does not read - a literal string, a value over several lines. */
  readonly otherHash: boolean;
  /** It holds an `enabled` line of any value, so one more cannot be added beside it. */
  readonly enabled: boolean;
}

interface Scanned {
  readonly lines: readonly string[];
  /** Whether each line is inside a multi-line string, so not TOML structure at all. */
  readonly opaque: readonly boolean[];
  readonly tables: readonly StateTable[];
}

const HEADER = /^\s*\[/;
const STATE_HEADER = /^\s*\[\s*hooks\s*\.\s*state\s*\.\s*"((?:[^"\\]|\\.)*)"\s*\]\s*(?:#.*)?$/;
const HOOKS_TABLE = /^\s*\[\s*hooks\s*\]\s*(?:#.*)?$/;
const STATE_TABLE = /^\s*\[\s*hooks\s*\.\s*state\s*\]\s*(?:#.*)?$/;
const TRUSTED_HASH = new RegExp(`^\\s*${USER_HOOKS.trustedHash}\\s*=\\s*"([^"\\\\]*)"\\s*(?:#.*)?$`);
const DISABLED = new RegExp(`^\\s*${USER_HOOKS.enabled}\\s*=\\s*false\\s*(?:#.*)?$`);
/** The two keys as a line names one, whatever its value is written like: what a line edit would duplicate. */
const HASH_KEY = new RegExp(`^\\s*("?)${USER_HOOKS.trustedHash}\\1\\s*=`);
const ENABLED_KEY = new RegExp(`^\\s*("?)${USER_HOOKS.enabled}\\1\\s*=`);

/** The file as lines, which of them are inside multi-line strings, and every `hooks.state` table in the form written. */
function scan(toml: string): Scanned {
  const lines = toml.split('\n');
  const opaque: boolean[] = [];
  let open: MultiLine | undefined;
  for (const line of lines) {
    opaque.push(open !== undefined);
    open = afterLine(line, open);
  }
  const tables: StateTable[] = [];
  for (let at = 0; at < lines.length; at += 1) {
    if (opaque[at]) continue;
    const raw = STATE_HEADER.exec(lines[at] ?? '')?.[1];
    if (raw === undefined) continue;
    let end = at + 1;
    while (end < lines.length && (opaque[end] || !HEADER.test(lines[end] ?? ''))) end += 1;
    let hash: string | undefined;
    let hashLine: number | undefined;
    let disabled = false;
    let otherHash = false;
    let enabled = false;
    for (let inner = at + 1; inner < end; inner += 1) {
      if (opaque[inner]) continue;
      const line = lines[inner] ?? '';
      const found = TRUSTED_HASH.exec(line)?.[1];
      if (found !== undefined) {
        hash = found;
        hashLine = inner;
      } else if (HASH_KEY.test(line)) otherHash = true;
      if (DISABLED.test(line)) disabled = true;
      if (ENABLED_KEY.test(line)) enabled = true;
    }
    tables.push({
      key: unescapeBasic(raw),
      start: at,
      end,
      ...(hash === undefined ? {} : { hash }),
      ...(hashLine === undefined ? {} : { hashLine }),
      disabled,
      otherHash,
      enabled,
    });
  }
  return { lines, opaque, tables };
}

/** The two delimiters a string can stay open across lines with. */
type MultiLine = '"""' | "'''";

/**
 * The multi-line string still open at the end of `line`, given the one open at its start. The line is read the way
 * TOML reads it, so a delimiter that is not one holds nothing open: `"""` after a `#` is a comment, `'''` inside a
 * quoted Windows path is part of the path, and a backslash escapes the character after it in a basic string. Counting
 * delimiters per line instead would let one odd occurrence mark the rest of the file opaque, hiding an existing
 * approval and appending a second table under the same key (AO11).
 */
function afterLine(line: string, open: MultiLine | undefined): MultiLine | undefined {
  let inside = open;
  let at = 0;
  while (at < line.length) {
    if (inside !== undefined) {
      if (inside === '"""' && line[at] === '\\') {
        at += 2;
        continue;
      }
      if (line.startsWith(inside, at)) {
        inside = undefined;
        at += 3;
        continue;
      }
      at += 1;
      continue;
    }
    const char = line[at];
    // Outside a string a `#` starts a comment, and nothing after it on the line is structure.
    if (char === '#') return undefined;
    if (char === '"' || char === "'") {
      const triple = char.repeat(3) as MultiLine;
      if (line.startsWith(triple, at)) {
        inside = triple;
        at += 3;
        continue;
      }
      at = afterSingle(line, at + 1, char);
      continue;
    }
    at += 1;
  }
  return inside;
}

/** The index just past a single-line string opened at `at` with `quote`, or the line's end where it is unterminated. */
function afterSingle(line: string, at: number, quote: '"' | "'"): number {
  let index = at;
  while (index < line.length) {
    if (quote === '"' && line[index] === '\\') {
      index += 2;
      continue;
    }
    if (line[index] === quote) return index + 1;
    index += 1;
  }
  return line.length;
}

/**
 * AO11: why a line edit of these keys would make the file invalid, or `undefined` where it would not. `hooks` written
 * inline or as a dotted key at the root, `state` defined inside `[hooks]`, one of the keys as a key of `[hooks.state]`
 * or in any header but the plain `[hooks.state."<key>"]`, or that header twice.
 */
function unsafeFor(scanned: Scanned, keys: readonly string[]): string | undefined {
  const quoted = keys.flatMap((key) => [`"${escapeBasic(key)}"`, `'${key}'`]);
  let context: 'root' | 'hooks' | 'state' | 'other' = 'root';
  const seen = new Map<string, number>();
  for (let at = 0; at < scanned.lines.length; at += 1) {
    if (scanned.opaque[at]) continue;
    const line = scanned.lines[at] ?? '';
    if (HEADER.test(line)) {
      const state = STATE_HEADER.exec(line)?.[1];
      if (state !== undefined) {
        const key = unescapeBasic(state);
        seen.set(key, (seen.get(key) ?? 0) + 1);
        if ((seen.get(key) ?? 0) > 1 && keys.includes(key)) return 'agentwhy\'s approval appears twice there';
        context = 'other';
        continue;
      }
      if (quoted.some((text) => line.includes(text))) return WRITTEN_OTHERWISE;
      context = HOOKS_TABLE.test(line) ? 'hooks' : STATE_TABLE.test(line) ? 'state' : 'other';
      continue;
    }
    if (context === 'root' && /^\s*hooks\s*[=.]/.test(line)) return 'its hooks are written inline there';
    if (context === 'hooks' && /^\s*state\s*[=.]/.test(line)) return 'its hooks are written inline there';
    if (context === 'state' && quoted.some((text) => line.trimStart().startsWith(text))) return WRITTEN_OTHERWISE;
  }
  return undefined;
}

function headerFor(key: string): string {
  return `[hooks.state."${escapeBasic(key)}"]`;
}

/** The event part of a key under `hooksPath`: `pre_tool_use` or `stop`. */
function eventOf(key: string, hooksPath: string): string | undefined {
  return key.slice(hooksPath.length + 1).split(':')[0];
}

/** A TOML basic string's escapes for a path: backslashes and quotes. Other characters are written as they are. */
function escapeBasic(key: string): string {
  return key.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function unescapeBasic(raw: string): string {
  return raw.replaceAll(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, escape: string) => {
    if (escape.length > 1) return String.fromCodePoint(Number.parseInt(escape.slice(1), 16));
    return { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r' }[escape] ?? escape;
  });
}

/** Object keys ordered at every depth, as the hash is taken over (AOB1). */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sorted(record[key])]),
    );
  }
  return value;
}
