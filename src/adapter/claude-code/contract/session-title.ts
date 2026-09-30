import type { SKIPPED_LINE_TYPES } from './line-types.ts';

/**
 * The title Claude Code gives a session - the one its own session list shows. Measured for contract v7: every
 * `ai-title` line of the measured session is `{type, aiTitle, sessionId}` with a string `aiTitle`, and the title
 * is written again as the session goes on, so the last such line is the latest.
 *
 * A model writes it from what the user typed. That makes it **content**, not structure (lesson L009): it crosses
 * the redaction boundary before anything shows it (spec §13.2, pitfall 7).
 */
export const SESSION_TITLE = {
  lineType: 'ai-title' satisfies (typeof SKIPPED_LINE_TYPES)[number],
  field: 'aiTitle',
  /**
   * How much of the end of a transcript is read to find it. In the corpus, the redacted measured session, the last
   * title ended 17 KB before the end of the file and no two titles were more than 30 KB apart. Redaction changes the
   * length of content, so those distances are indicative, and the window is a megabyte - a session smaller than that
   * is read whole. A session whose last title lies further back shows no title, which a person can see, rather than
   * an older one.
   */
  tailBytes: 1024 * 1024,
} as const;
