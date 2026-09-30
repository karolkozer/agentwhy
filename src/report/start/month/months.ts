import type { SessionIndex } from '../session-index.ts';
import { dayOf, monthOf } from '../../render/ui/local-date.ts';
import { bucketed, conversationsOf, period, type Period } from '../conversations/periods.ts';

/** A calendar month: `first` is the 1st, `last` its last day. */
export type Month = Period;

/**
 * The months the This month page is read through (`.ai/plans/2026-09-23-month-redesign.md` T2): calendar months in the
 * time zone of the machine that ran `start` (O2), the current month first, then every earlier month that holds a
 * conversation.
 */
export function conversationMonths(index: SessionIndex): readonly Month[] {
  const { today, conversations } = conversationsOf(index);
  const counted = today.year * 12 + today.month;
  const byMonth = bucketed(conversations, (item) => counted - (item.day.year * 12 + item.day.month));

  return [...byMonth].map(([ago, those]) => {
    // `Date.UTC` carries a month below 0 into the years before, so any `ago` names its month.
    const { first, last } = monthOf(dayOf(Math.floor(Date.UTC(today.year, today.month - 1 - ago, 1) / 86_400_000)));
    return period(ago, first.number, last.number, today.number, those);
  });
}
