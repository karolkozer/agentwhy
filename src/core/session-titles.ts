// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from './entry-point.ts';
import type { Redacted } from './redaction/redacted.ts';
import type { SessionSummary } from './session-catalogue.ts';

/** What a person recognises a session by: its title, and where it was held. Each is absent where it was not found. */
export interface SessionRecognition {
  /** The session's title, already past the redactor. */
  readonly title?: Redacted;
  /** Which way into the agent the session was started by (`which-project.md` V4). */
  readonly entryPoint?: EntryPoint;
}

/**
 * What a person recognises a session by. Kept apart from the catalogue on purpose: listing sessions reads nothing
 * inside them, and only a list a person finds a session in pays for reading one - the chooser of `sessions` and the
 * index of `start`, never `report`. Both parts come from one read of the transcript's end.
 */
export interface SessionTitles {
  /** A transcript that is missing or unreadable is recognised by nothing; it is not an error. */
  recognise(session: SessionSummary): Promise<SessionRecognition>;
}

/**
 * How many transcripts are read for a title at once. Each read holds up to a megabyte of a transcript, and a
 * descriptor for it, until it answers; a project with hundreds of sessions asked for all of them at once would
 * hold all of that at the same moment, for a list that is one line per session.
 */
const TITLES_AT_ONCE = 8;

/**
 * What every session is recognised by, in the order given, read a few at a time. A row whose title could not be read
 * is a row a person reads one line slower, never a list that failed: `recognise` answers nothing only for the failures
 * the file system port translates, and a descriptor limit reached while reading a long list, or a read that fails part
 * way, would otherwise unwind the whole list. Found by a review: `start` read titles this way and `sessions` asked for
 * every one at once, with nothing caught.
 */
export async function recogniseAll(titles: SessionTitles, sessions: readonly SessionSummary[]): Promise<readonly SessionRecognition[]> {
  const recognised: SessionRecognition[] = [];
  for (let from = 0; from < sessions.length; from += TITLES_AT_ONCE) {
    const batch = sessions.slice(from, from + TITLES_AT_ONCE);
    recognised.push(...(await Promise.all(batch.map((session) => titles.recognise(session).catch((): SessionRecognition => ({}))))));
  }
  return recognised;
}
