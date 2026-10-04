// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { rangeName, tileName } from '../../render/ui/local-date.ts';
import { inLanguages, type Translate } from '../../render/report-copy.ts';
import { dayTile, periodSwitch, type PeriodWords } from './calendar-view.ts';
import type { Week } from './weeks.ts';

const WEEK_WORDS: PeriodWords = {
  heading: 'conv.week.heading',
  earlier: 'conv.week.earlier',
  later: 'conv.week.later',
  back: 'conv.week.back',
  pick: 'conv.week.pick',
  hint: 'conv.week.hint',
};

/** "This week", "Last week", "3 weeks ago" - counted by the calendar, so a skipped empty week is still counted. */
export function weekName(week: Week, t: Translate): string {
  return week.ago === 0 ? t('conv.week.this') : week.ago === 1 ? t('conv.week.last') : t('conv.week.ago', { n: week.ago });
}

/** "This week · Sep 21 – 27", in every language. */
export function weekTitle(week: Week): string {
  return inLanguages((t, lang) => weekName(week, t) + ' · ' + rangeName(week.first, week.last, lang));
}

/**
 * "Your week" (`for-people-who-build-with-ai.md` F10, F11): the switcher between weeks and one tile per day - today's
 * called "Today", and the days still ahead saying so (the maintainer's design, 2026-09-29).
 */
export function weekView(weeks: readonly Week[], at: number): string {
  const week = weeks[at] as Week;
  return '<section class="cw-week">' +
    periodSwitch('week', weeks, at, WEEK_WORDS, (each, t, lang) =>
      weekName(each, t) + ' <span class="cw-switch-range">· ' + rangeName(each.first, each.last, lang) + '</span>') +
    '<div class="cw-days">' + week.days.map((day) =>
      dayTile(day, inLanguages((t, lang) => (day.today ? t('conv.day.today') : tileName(day.day, lang))), { ahead: true })).join('') + '</div>' +
    '</section>';
}
