import type { Provider } from './session-format.ts';

/** One session as the catalogue sees it, before anything is read from inside it. */
export interface SessionSummary {
  readonly id: string;
  /** What `--input` would be given for this session. */
  readonly path: string;
  /** Milliseconds since the epoch, for ordering only - never for correlating anything. */
  readonly modifiedAt: number;
  /** How many agents this session delegated to, counted from its index files. */
  readonly delegations: number;
  /**
   * Which AI wrote it (`2026-09-27-what-codex-wrote.md` X28): a row says it, and a key that names a session names it with
   * its provider, since two AIs may give two sessions one id.
   */
  readonly provider: Provider;
}

export interface SessionListing {
  /** Where the catalogue looked, so a reader can tell "none here" from "looked in the wrong place". */
  readonly directory: string;
  readonly found: boolean;
  /**
   * Every place looked in, each with whether it was there: one per AI where listings are combined, so a folder that is
   * missing for one AI is never hidden by another AI's sessions. `found` says whether any of them was there, and
   * `directory` is that one, or the first.
   */
  readonly searched: readonly SearchedPlace[];
  /** Newest first. */
  readonly sessions: readonly SessionSummary[];
}

/** Finds the sessions of a project without reading their contents. */
export interface SessionCatalogue {
  list(workingDirectory: string): Promise<SessionListing>;
}

export interface SearchedPlace {
  readonly provider: Provider;
  readonly directory: string;
  readonly found: boolean;
}

/**
 * What names a session wherever two AIs' sessions meet - a row, a file, a cached report, `report --input`: its id where
 * Claude Code wrote it, as it always was, and the id after its AI's name otherwise, so equal ids never overwrite each
 * other (`.ai/plans/2026-09-29-what-codex-wrote.md` step 5). A Claude Code id is a UUID and never starts with an AI's name.
 */
export function sessionKey(session: Pick<SessionSummary, 'id' | 'provider'>): string {
  return session.provider === 'claude-code' ? session.id : `${session.provider}-${session.id}`;
}

/** Every AI whose name `sessionKey` puts before an id: a record, so that an AI added to `Provider` must be named here. */
const NAMED_IN_KEY: Readonly<Record<Exclude<Provider, 'claude-code'>, true>> = { codex: true };

/**
 * The id a key was made from. A short form is cut from it, not from the key: the key of every Codex session starts with
 * the same `codex-`, and so, for minutes at a time, does a UUIDv7 - its first characters are a timestamp. Anything that
 * is no key, like a `--share` position, is returned as it is.
 */
export function idInKey(key: string): string {
  const named = Object.keys(NAMED_IN_KEY).find((provider) => key.startsWith(`${provider}-`));
  return named === undefined ? key : key.slice(named.length + 1);
}
