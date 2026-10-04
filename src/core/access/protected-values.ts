// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ToolUseId } from '../event.ts';
import { unquote } from '../redaction/value-shapes.ts';
import type { SessionModel } from '../session-model.ts';
import { codeReadsNamedFile, printsContentOnly } from './command-line.ts';
import { readsContentBesideNames, type ProtectedAccess } from './protected-access.ts';

/**
 * A value an agent read out of a protected resource (`specs/2026-09-15-what-came-back.md` R3). **Raw content**, alive only for
 * as long as the caller holds it: a trace keeps salted hashes of runs of it, and nothing else (§5.4 rule 6).
 */
export interface ProtectedValue {
  readonly agentId: string;
  /**
   * The protected paths it may have been read from, as the accesses recorded them - one of them, not all. A
   * single path when the call that printed it named one; several when one call printed several protected files
   * at once and nothing in the output says which of them a line came from.
   */
  readonly paths: readonly string[];
  readonly value: string;
}

const KEYED = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*[=:]\s*(.*)$/;
const JSON_KEYED = /^"[^"]+"\s*:\s*("[^"]*"|[^,\s]+)/;
/**
 * An `.npmrc` setting scoped to a registry, as npm documents it: `//registry.npmjs.org/:_authToken=value`. Found by
 * `docs/detection.md` (`npmrc`): read as a line of its own, the whole setting looked like an address and was dropped as
 * an ordinary value, so a token `cat ~/.npmrc` printed was never traced.
 */
const REGISTRY_KEYED = /^\/\/\S+?:[A-Za-z_][A-Za-z0-9_-]*\s*=\s*(.*)$/;
/** A `Read` numbers the lines it returns. */
const LINE_NUMBER = /^\s*\d+→/;

/**
 * Every value read out of a protected resource by a call that succeeded, each once per agent and file:
 *
 * - from the content a call returned when it named the resource and printed what was in it - a `Read`, a `cat`;
 * - from what an interpreter printed when the code it was handed names the resource - `python3 -c "print(open('.env').read())"`;
 * - from a listing line that names a protected path - `path:line:KEY=value`, the motivating case.
 *
 * A line shaped `KEY=value` or `"key": "value"` gives its value; any other line gives itself.
 *
 * A call's content is read **once for the call**, against every protected path it named. `cat .env .env.local`
 * concatenates two files with nothing between them, and a line of that output came from one of them; recording
 * it once against each, as if each file held it, puts a file in the report that the value was never read from.
 * A listing line carries its own path, so those are attributed one by one and stay exact.
 *
 * **Known limit.** A search that names one file prints its matches without the file's name - `grep KEY .env`
 * answers `12:KEY=value` - and those lines are neither content nor a listing line naming a path, so their values
 * are not read. Recorded rather than guessed at, until a measurement says how often it happens.
 */
export function protectedValues(model: SessionModel, accesses: readonly ProtectedAccess[]): ProtectedValue[] {
  const events = new Map(model.events.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const values: ProtectedValue[] = [];

  const add = (agentId: string, paths: readonly string[], line: string): void => {
    const value = valueOf(line);
    const key = JSON.stringify([agentId, paths, value]);
    if (value === undefined || seen.has(key)) return;
    seen.add(key);
    values.push({ agentId, paths, value });
  };

  for (const [eventId, group] of byEvent(accesses)) {
    const event = events.get(eventId);
    const content = event?.result?.content;
    if (event === undefined || content === undefined) continue;

    const named = [...new Set(group.filter((access) => access.source === 'input').map((access) => access.path))];
    if (named.length > 0 && (event.resultShape === 'content' || printsContentOnly(event.commands))) {
      for (const line of content.split('\n')) add(event.agentId, named, line);
    } else if (named.length > 0 && readsContentBesideNames(event)) {
      // SWO1: a file's text beside a directory's names. Only a `KEY=value` line is the file's: a name `ls` printed is not
      // a value, and tracing one would find it in every answer that mentions the file.
      for (const line of keyedLines(content)) add(event.agentId, named, line);
    } else {
      // An interpreter whose own code opened the file: its output is read as the file's, against the files it named.
      const opened = named.filter((path) => codeReadsNamedFile(event.commands, path));
      if (opened.length > 0) for (const line of content.split('\n')) add(event.agentId, opened, line);
    }

    for (const access of group) {
      if (access.source !== 'result') continue;
      for (const line of listedLines(content, access.path)) add(access.agentId, [access.path], line);
    }
  }
  return values;
}

/**
 * The lines of a call's output shaped `KEY=value`, `"key": "value"` or `//registry/:key=value` (SWO1): where a file's
 * text is printed beside a directory's names, these are the file's, and no line `ls` prints has that shape.
 */
export function keyedLines(content: string): string[] {
  return content.split('\n').filter((raw) => {
    const line = raw.replace(LINE_NUMBER, '').trim();
    return !line.startsWith('#') && (JSON_KEYED.test(line) || KEYED.test(line) || REGISTRY_KEYED.test(line));
  });
}

/** The succeeded accesses of each call, in the order the calls were met: one call's content is read once. */
function byEvent(accesses: readonly ProtectedAccess[]): Map<ToolUseId, ProtectedAccess[]> {
  const groups = new Map<ToolUseId, ProtectedAccess[]>();

  for (const access of accesses) {
    if (access.outcome !== 'succeeded') continue;
    const group = groups.get(access.eventId);
    if (group === undefined) groups.set(access.eventId, [access]);
    else group.push(access);
  }
  return groups;
}

/**
 * The value of a `KEY=value`, `"key": "value"` or `//registry/:key=value` line, or the line itself; nothing for a blank
 * line or a comment.
 */
function valueOf(raw: string): string | undefined {
  const line = raw.replace(LINE_NUMBER, '').trim();
  if (line === '' || line.startsWith('#')) return undefined;

  const json = JSON_KEYED.exec(line);
  const keyed = json === null ? (KEYED.exec(line) ?? REGISTRY_KEYED.exec(line)) : null;
  const value = json !== null ? unquote(json[1] ?? '') : keyed !== null ? unquote((keyed[1] ?? '').trim()) : line;
  return value === '' ? undefined : value;
}

/** The lines of a listing that name this path, with the path and a line number taken off the front. */
function listedLines(content: string, path: string): string[] {
  return content
    .split('\n')
    .filter((line) => line.startsWith(`${path}:`))
    .map((line) => line.slice(path.length + 1).replace(/^\d+:/, ''));
}
