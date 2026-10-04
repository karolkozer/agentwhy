// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const UNIT: Readonly<Record<string, number>> = { h: HOUR, d: DAY, w: 7 * DAY };

/** Where a range of sessions starts, and the words a person used to ask for it. */
export interface Since {
  readonly since: number;
  /** As typed, so the page can say "active since 7d ago" in the terms that were asked for. */
  readonly asked: string;
}

/**
 * `7d`, `12h`, `2w`, or a calendar date. **Now is given, never read**: a filter that looks at the clock for itself
 * gives a different answer to the same command a minute later, and cannot be tested at all.
 *
 * A calendar date is midnight UTC. A local midnight would move with the machine the command runs on, and a
 * range is only worth stating if it means the same thing to whoever reads the page.
 */
export function parseSince(text: string, now: number): Since | { readonly error: string } {
  const relative = /^(\d+)([hdw])$/.exec(text);
  if (relative !== null) {
    const amount = Number(relative[1]);
    const unit = UNIT[relative[2] ?? ''] ?? DAY;
    if (amount <= 0) return { error: `--since must be more than nothing: ${text}` };
    return { since: now - amount * unit, asked: text };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const since = Date.parse(`${text}T00:00:00Z`);
    // The parser rolls an overflowing day into the next month - 2026-02-30 is read as 2 March - so a date is
    // accepted only if it names itself back. Otherwise the sessions the person meant to include fall out of the
    // range without a word. Found by a review; the earlier test tried month 13, which the parser already refused.
    if (Number.isNaN(since) || new Date(since).toISOString().slice(0, 10) !== text) {
      return { error: `--since is not a calendar date: ${text}` };
    }
    return { since, asked: text };
  }

  return { error: `--since takes a span such as 7d, 12h or 2w, or a date such as 2026-09-01: ${text}` };
}

/**
 * Sessions on either side of a start. What is compared is when a session was **last written**, so this means
 * "active since" and not "started since": a session resumed a week later belongs to this week (L008). The page
 * says so in those words, until a start time is in the format contract.
 */
export function splitBySince<T extends { readonly modifiedAt: number }>(
  items: readonly T[],
  since: number,
): { readonly inRange: readonly T[]; readonly outOfRange: readonly T[] } {
  return {
    inRange: items.filter((item) => item.modifiedAt >= since),
    outOfRange: items.filter((item) => item.modifiedAt < since),
  };
}
