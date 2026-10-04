// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import type { Redactor } from '../../../core/redaction/redactor.ts';
import type { SessionRecognition } from '../../../core/session-titles.ts';
import { parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { oneLine } from '../../../shared/printable.ts';
import { ENTRY_POINT_VALUES } from '../contract/entry-points.ts';
import { FIELDS } from '../contract/fields.ts';
import { SESSION_TITLE } from '../contract/session-title.ts';

/*
 * What the end of a transcript says about the session, read from the text `FileTailReader` hands over. The rules are
 * the same for every part: a record ends at `\n` alone (lesson L010); the first line of a tail is usually cut and the
 * last may still be being written (L008), so a line that does not parse is not a record; and a field counts only on the
 * record itself, never as text quoted inside another record - a prompt that pastes one (L009). A megabyte of tool
 * results is not parsed line by line: a line is parsed only where it names the field it is searched for.
 */

/**
 * What a person recognises the session by (`which-project.md` V4): its latest title, only once it has passed the
 * redactor, and which way into Claude Code it was held.
 */
export function recognitionIn(tail: string, redactor: Pick<Redactor, 'scan'>): SessionRecognition {
  const title = lastTitleIn(tail);
  const entryPoint = lastEntryPointIn(tail);
  return {
    ...(title === undefined ? {} : { title: redactor.scan(title) }),
    ...(entryPoint === undefined ? {} : { entryPoint }),
  };
}

/** The session's latest title, as one line of plain words: its last `ai-title` record. */
export function lastTitleIn(tail: string): string | undefined {
  for (const record of recordsFromTheEnd(tail, SESSION_TITLE.lineType)) {
    if (record[FIELDS.lineType] !== SESSION_TITLE.lineType) continue;
    const title = record[SESSION_TITLE.field];
    if (typeof title !== 'string') continue;
    const shown = oneLine(title);
    if (shown !== '') return shown;
  }
  return undefined;
}

/**
 * Which way into Claude Code the session was started by, from the last record that says so (`entry-points.ts`). A
 * value the contract does not list is `unknown`; a tail with no such record says nothing.
 */
export function lastEntryPointIn(tail: string): EntryPoint | undefined {
  for (const record of recordsFromTheEnd(tail, keyOf(FIELDS.entryPoint))) {
    const value = record[FIELDS.entryPoint];
    if (typeof value !== 'string') continue;
    const known = (Object.keys(ENTRY_POINT_VALUES) as (keyof typeof ENTRY_POINT_VALUES)[]).find((kind) => ENTRY_POINT_VALUES[kind] === value);
    return known ?? 'unknown';
  }
  return undefined;
}

/**
 * The latest working directory the tail's records carry that `accept` takes. One session can carry more than one
 * (contract v12, 14 of 244 tails): which of them names the project is the caller's to decide by the project's directory,
 * so the latest is never taken on its own. The search stops at the first taken, since nearly every record carries one.
 */
export function workingDirectoryIn(tail: string, accept: (directory: string) => boolean): string | undefined {
  for (const record of recordsFromTheEnd(tail, keyOf(FIELDS.workingDirectory))) {
    const value = record[FIELDS.workingDirectory];
    if (typeof value === 'string' && value !== '' && accept(value)) return value;
  }
  return undefined;
}

/** The tail's whole records, the last first, among the lines holding `mark` - a cheap filter before any parse. */
function* recordsFromTheEnd(tail: string, mark: string): Generator<JsonObject> {
  const lines = tail.split('\n');
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = lines[at] ?? '';
    if (!line.includes(mark)) continue;
    const record = parseJsonObject(line);
    if (record !== undefined) yield record;
  }
}

/** A field's name as a record writes it, quoted: `"cwd"`, which a path or a word in the text rarely is. */
function keyOf(field: string): string {
  return `"${field}"`;
}
