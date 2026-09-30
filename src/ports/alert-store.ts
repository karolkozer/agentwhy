/**
 * What is remembered about one finished agent between the hook that finds an alert and the hook that says it
 * (`specs/2026-09-16-a-notice-in-the-conversation.md` R7): the agent's id, the level, and the words the other
 * channels already show. No path, no value, no task description - the words are held to that by the tests of the
 * renderer that wrote them, so the file discloses nothing a notification would not.
 */
export interface RememberedAlert {
  readonly agentId: string;
  readonly level: string;
  readonly words: string;
  /**
   * How much this session has already had said about it, for the one record the display keeps about the session
   * itself (`the-agent-tells-you.md` R6, R7): a turn that found nothing new is not a session that found nothing,
   * and a line saying "nothing reached" over a session with a value in it would be the one untruth that matters.
   * Counts only - no path, no value, nothing that says which file - so the file still discloses nothing a
   * notification would not. An alert about one agent carries none of this.
   */
  readonly counts?: SessionCounts;
}

/** What a session has had said about it so far, by level. */
export interface SessionCounts {
  readonly values: number;
  readonly reached: number;
}

/**
 * The little that is kept between two hook runs of one session. Never throws: a hook that failed loudly would hand
 * its error to an agent or hold a turn open, so a store that could not write is an answer, not an exception.
 */
export interface AlertStore {
  /** One record per agent: a hook firing several times for one finished agent leaves one alert (R8). */
  remember(sessionId: string, alert: RememberedAlert): Promise<void>;
  /** Everything remembered for this session, and forgets it. Empty is the common answer, and not an error. */
  take(sessionId: string): Promise<readonly RememberedAlert[]>;
}
