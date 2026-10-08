// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { textLink } from '../../render/ui/button.ts';
import { dayName } from '../../render/ui/local-date.ts';
import { inLanguages, labelAttributes, type Lang, type Translate } from '../../render/report-copy.ts';
import type { CalendarDay, Period } from './periods.ts';

/** What a week or a month is called on the switcher that steps between them. Every key is a word key. */
export interface PeriodWords {
  readonly heading: string;
  readonly earlier: string;
  readonly later: string;
  readonly back: string;
  readonly pick: string;
  readonly hint: string;
}

/** `week` or `month`: the name of a period's section, and of the address that shows it (`#week-2`, `#month-1`). */
export type PeriodKind = 'week' | 'month';

/**
 * "Your week" / "Your month": the heading, the switcher `‹ {name} ›`, "Back to this …" and the hint (F10). The steps
 * are links to the neighbouring period's section, so with no script they still go there - every period is on the
 * page, one under another; the script shows one at a time. The name opens the calendar a period is chosen in.
 */
export function periodSwitch(kind: PeriodKind, periods: readonly Period[], at: number, words: PeriodWords,
  name: (period: Period, t: Translate, lang: Lang) => string, aside = ''): string {
  const period = periods[at] as Period;
  const older = periods[at + 1];
  const newer = at > 0 ? periods[at - 1] : undefined;
  const step = (target: Period | undefined, targetAt: number, glyph: string, label: string): string =>
    target === undefined
      ? '<span class="cw-step cw-step-off" aria-hidden="true">' + glyph + '</span>'
      : '<a class="cw-step" href="#' + kind + '-' + target.ago + '" data-period-go="' + targetAt + '"' + labelAttributes((t) => t(label)) + '>' + glyph + '</a>';

  return '<div class="cw-week-head"><div class="cw-week-left">' +
    '<h2 class="cw-h2">' + inLanguages((t) => t(words.heading)) + '</h2>' +
    '<div class="cw-switch">' + step(older, at + 1, '‹', words.earlier) +
    // The input under the name is what the calendar is anchored to and writes into; nobody sees or types in it.
    '<button type="button" class="cw-switch-label" data-period-pick' + labelAttributes((t) => t(words.pick)) + '>' +
    inLanguages((t, lang) => name(period, t, lang)) +
    '<input class="cw-pick-anchor" tabindex="-1" aria-hidden="true" readonly></button>' +
    step(newer, at - 1, '›', words.later) + '</div>' +
    (at === 0 ? '' : textLink(inLanguages((t) => t(words.back)), '#' + kind + '-0', ' data-period-go="0"')) +
    // AN1, AN6: the view switch, where a caller gives one, sits in the week's own row - beside the date picker it
    // belongs to, not among the lists it chooses between.
    aside +
    '</div><span class="cw-week-hint js-only">' + inLanguages((t) => t(words.hint)) + '</span></div>';
}

/** What a page adds to its day tiles. */
export interface TileParts {
  /** The id of a window: a tile with conversations opens it, a link to it, so it goes there with no script too. */
  readonly opens?: string;
  /** Written inside the tile, last: what a page shows of the day on hover. */
  readonly extra?: string;
  /**
   * A week's tiles say what is still to come (the maintainer's design, 2026-09-29): today with nothing in it yet is
   * "0 · Nothing yet", a day still ahead "Coming up". A month's tiles leave both unsaid.
   */
  readonly ahead?: true;
}

/**
 * One day (F11): its label, how many conversations, and whether any needs checking. A click narrows the lists to it,
 * or, given `opens`, opens that window.
 */
export function dayTile(day: CalendarDay, label: string, parts: TileParts = {}): string {
  const empty = day.conversations === 0;
  const ahead = parts.ahead === true;
  // A day that has not come yet says nothing about work: "No work" on a Friday that is still ahead is not true - nor on
  // a today that is not over, where a week says "Nothing yet".
  // A read that was fixed still happened: the day is drawn in coral and says so, never "All good" (F11, changed
  // 2026-09-25), outranking conversations this run did not check. Only one still to fix frames the tile.
  // "All good" only where every conversation of the day was checked: one this run did not read is not known to be good.
  const tone = day.future && empty ? 'future' : empty && day.today && ahead ? 'yet' : empty ? 'none'
    : day.toCheck > 0 ? 'bad' : day.fixed > 0 ? 'fixed' : day.unchecked > 0 ? 'unknown' : 'good';
  const said = tone === 'future' ? (ahead ? inLanguages((t) => t('conv.day.ahead')) : '&nbsp;')
    : tone === 'yet' ? inLanguages((t) => t('conv.day.yet'))
      : empty ? inLanguages((t) => t('conv.day.none'))
        : day.toCheck > 0 ? inLanguages((t) => t('conv.day.toCheck', { n: day.toCheck }))
          : day.fixed > 0 ? inLanguages((t) => t('conv.day.fixed', { n: day.fixed }))
            // F17: a day whose unchecked conversations were all read, with gaps, says that, as their list's heading does.
            : day.unchecked > 0 ? inLanguages((t) => t(day.partial === day.unchecked ? 'conv.day.partial' : 'conv.day.unchecked', { n: day.unchecked }))
              : inLanguages((t) => t('conv.day.good'));
  const count = tone === 'future' && ahead ? '&nbsp;' : tone === 'yet' ? '0' : empty ? '—' : String(day.conversations);
  const opens = parts.opens;
  const link = !empty && opens !== undefined;
  return (link ? '<a' : '<button type="button"') + ' class="cw-day cw-day-' + tone + (day.today ? ' cw-day-today' : '') + '" data-day="' + day.day.number + '"' +
    (link ? ' href="#' + opens + '" data-popup-open="' + opens + '"' : empty ? ' disabled' : '') + '>' +
    '<span class="cw-day-label">' + label + '</span>' +
    '<span class="cw-day-count">' + count + '</span>' +
    '<span class="cw-day-state"><span class="cw-day-dot" aria-hidden="true"></span><span class="cw-day-said">' + said + '</span></span>' +
    // What the chip "{day} ×" says once this day is chosen: a whole date, since a month's tile says only its number.
    '<span class="cw-day-name" hidden>' + inLanguages((_t, lang) => dayName(day.day, lang)) + '</span>' + (parts.extra ?? '') + (link ? '</a>' : '</button>');
}

export const CALENDAR_VIEW_STYLE = String.raw`
.cw-week{margin-bottom:36px}
.cw-week-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cw-week-left{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.cw-h2{margin:0;font-size:20px;font-weight:650}
.cw-switch{display:flex;align-items:center;gap:4px;padding:3px;border-radius:999px;background:var(--card);border:1px solid var(--white-10)}
.cw-step{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text);font-size:16px}
a.cw-step:hover{background:var(--white-06);color:var(--text)}
a.cw-day{text-decoration:none}
.cw-step-off{color:var(--text-4);cursor:default}
.cw-switch-label{position:relative;min-width:170px;text-align:center;font:inherit;font-size:14px;font-weight:600;white-space:nowrap;padding:6px 8px;border:0;border-radius:999px;background:transparent;color:var(--text)}
.js .cw-switch-label{cursor:pointer}.js .cw-switch-label:hover{background:var(--white-06)}
.cw-pick-anchor{position:absolute;left:50%;bottom:-4px;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none}
.cw-switch-range{color:var(--text-3);font-weight:500}
.cw-week-hint{font-size:14px;color:var(--text-3)}
.cw-days{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px}
.cw-day{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:14px;border-radius:14px;background:var(--card);border:1px solid var(--white-09);color:inherit;font:inherit;text-align:left;cursor:pointer}
.cw-day:hover:not(:disabled){border-color:var(--white-28)}
.cw-day:disabled{cursor:default}
.cw-day-bad{border-color:var(--coral-25)}
.cw-day-on,.cw-day-on:hover:not(:disabled){background:var(--coral-08);border-color:var(--coral-50)}
.cw-day-label{font-size:13px;font-weight:600;color:var(--text-2)}
.cw-day-count{font-size:22px;font-weight:650;line-height:1}
.cw-day-state{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.cw-day-dot{flex:none;width:7px;height:7px;border-radius:50%;background:currentColor}
.cw-day-future{opacity:.5}.cw-day-future .cw-day-dot{visibility:hidden}
.cw-days .cw-day-today .cw-day-label{color:var(--text)}
.cw-days .cw-day-today:not(.cw-day-bad):not(.cw-day-on){border-color:var(--white-25)}
.cw-day-yet .cw-day-state{color:var(--text-soft)}
.cw-days .cw-day-future{opacity:1;background:transparent;border-style:dashed;border-color:var(--white-08)}
.cw-days .cw-day-future .cw-day-dot{visibility:visible}
.cw-days .cw-day-future .cw-day-label,.cw-days .cw-day-future .cw-day-state{color:var(--text-4)}
.cw-day-none .cw-day-state{color:var(--text-4)}.cw-day-unknown .cw-day-state{color:var(--text-3)}.cw-day-good .cw-day-state{color:var(--mint)}.cw-day-bad .cw-day-state,.cw-day-fixed .cw-day-state{color:var(--coral-text)}
.air-datepicker{--adp-font-family:var(--sans);--adp-background-color:var(--panel);--adp-background-color-hover:var(--white-06);--adp-background-color-active:var(--white-08);
--adp-border-color:var(--white-10);--adp-border-color-inner:var(--white-07);--adp-border-color-inline:var(--white-10);--adp-color:var(--text);--adp-color-secondary:var(--text-2);
--adp-accent-color:var(--coral);--adp-color-current-date:var(--coral-text);--adp-color-other-month:var(--text-4);--adp-color-other-month-hover:var(--text);--adp-day-name-color:var(--text-3);
--adp-nav-arrow-color:var(--text-2);--adp-nav-color-secondary:var(--text-2);--adp-cell-background-color-hover:var(--white-06);--adp-cell-background-color-selected:var(--coral);
--adp-cell-background-color-selected-hover:var(--coral-hover);--adp-cell-background-color-in-range:var(--coral-16);--adp-cell-background-color-in-range-hover:var(--coral-25);
--adp-cell-border-color-in-range:var(--coral-35);--adp-color-disabled:var(--text-4);--adp-color-disabled-in-range:var(--text-3);--adp-border-radius:12px;--adp-cell-border-radius:8px}
.air-datepicker--pointer:after{background:var(--panel)}
.air-datepicker-cell:is(.-day-,.-month-):is(.-range-from-,.-range-to-,.-selected-){background:var(--coral);color:var(--on-coral)}
.air-datepicker-cell:is(.-day-,.-month-).cw-has-data{box-shadow:inset 0 -3px 0 var(--coral)}
.air-datepicker-cell:is(.-day-,.-month-).cw-has-data:is(.-selected-,.-range-from-,.-range-to-){box-shadow:none}
.air-datepicker-cell.-day-.cw-week-hover:not(.-disabled-):not(.-selected-):not(.-in-range-):not(.-range-from-):not(.-range-to-){background:var(--white-08)}
`;
