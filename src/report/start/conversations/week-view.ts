// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { rangeName, tileName } from '../../render/ui/local-date.ts';
import { inLanguages, labelAttributes, type Translate } from '../../render/report-copy.ts';
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
 * AN1, AN6: Sectioned or All, newest first - beside the date picker it switches alongside, not among the lists it
 * chooses between (period-section.ts's `flatSection`, shown by the `data-view` the click sets on the period itself).
 * Only where there is a second view to switch to: an empty week never calls this (`weekView`'s own check).
 */
function viewSwitch(): string {
  return '<div class="cw-viewbar js-only" data-view-bar role="group"' + labelAttributes((t) => t('conv.view.label')) + '>' +
    '<button type="button" class="cw-view" data-view-pick="sectioned" aria-pressed="true">' + inLanguages((t) => t('conv.view.sectioned')) + '</button>' +
    '<button type="button" class="cw-view" data-view-pick="flat" aria-pressed="false">' + inLanguages((t) => t('conv.view.flat')) + '</button>' +
    '</div>';
}

/**
 * "Your week" (`for-people-who-build-with-ai.md` F10, F11): the switcher between weeks and one tile per day - today's
 * called "Today", and the days still ahead saying so (the maintainer's design, 2026-09-29).
 */
export function weekView(weeks: readonly Week[], at: number): string {
  const week = weeks[at] as Week;
  return '<section class="cw-week">' +
    periodSwitch('week', weeks, at, WEEK_WORDS, (each, t, lang) =>
      weekName(each, t) + ' <span class="cw-switch-range">· ' + rangeName(each.first, each.last, lang) + '</span>',
      week.conversations.length === 0 ? '' : viewSwitch()) +
    '<div class="cw-days">' + week.days.map((day) =>
      dayTile(day, inLanguages((t, lang) => (day.today ? t('conv.day.today') : tileName(day.day, lang))), { ahead: true })).join('') + '</div>' +
    '</section>';
}
