// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { WORKSPACE } from '../contract/session.ts';

/** What `workspace.yaml` says of its session. Internal source data: its path and title cross redaction before output. */
export interface CopilotWorkspace {
  readonly id?: string;
  readonly project?: string;
  /** The title the apps show (CPB35); absent where `name` is empty or not read. */
  readonly title?: string;
  readonly client?: string;
  readonly forkCount?: number;
}

const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*):(?:[ \t]+(.*))?$/;

/**
 * Reads the top-level `key: value` lines (spec §2.8, §2.16) and nothing nested: an indented line, a list item and a
 * comment are passed over. A value is plain, or quoted the way YAML quotes - `'…'` with `''` for a quote, `"…"` with
 * JSON's escapes. A value of another form - a block (`|`, `>`), an anchor, a flow collection - is not read: no title
 * that needed one has been measured, and a guess would put the wrong words on a row.
 */
export function parseWorkspace(text: string): CopilotWorkspace {
  const values = new Map<string, string | undefined>();
  for (const line of text.split(/\r?\n/)) {
    const match = KEY_LINE.exec(line);
    if (match !== null && match[1] !== undefined) values.set(match[1], scalarOf(match[2] ?? ''));
  }
  const valueOf = (key: string): string | undefined => {
    const value = values.get(key);
    return value === undefined || value === '' ? undefined : value;
  };
  const forks = valueOf(WORKSPACE.forkCount);
  const forkCount = forks !== undefined && /^\d+$/.test(forks) ? Number(forks) : undefined;
  const id = valueOf(WORKSPACE.id);
  const project = valueOf(WORKSPACE.workingDirectory);
  const title = valueOf(WORKSPACE.title);
  const client = valueOf(WORKSPACE.client);
  return {
    ...(id === undefined ? {} : { id }),
    ...(project === undefined ? {} : { project }),
    ...(title === undefined ? {} : { title }),
    ...(client === undefined ? {} : { client }),
    ...(forkCount === undefined ? {} : { forkCount }),
  };
}

/** One value: plain text up to the end of the line, or a whole quoted scalar; anything else is unread. */
function scalarOf(raw: string): string | undefined {
  const value = raw.trim();
  if (value === '') return '';
  if (value.startsWith("'")) return value.length >= 2 && value.endsWith("'") ? value.slice(1, -1).replaceAll("''", "'") : undefined;
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'string' ? parsed : undefined;
    } catch (error) {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
  }
  if (/^[|>&*!{[]/.test(value)) return undefined;
  // A plain scalar ends where a comment starts.
  const comment = value.search(/\s#/);
  return comment === -1 ? value : value.slice(0, comment).trimEnd();
}
