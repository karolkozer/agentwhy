import { dataTable } from '../../render/ui/data-table.ts';
import { closeButton, pill } from '../../render/ui/button.ts';
import { CLOSES, popup, popupFoot } from '../../render/ui/popup.ts';
import { dayName, monthName, weekdayNames } from '../../render/ui/local-date.ts';
import { inLanguages, labelAttributes, type Translate } from '../../render/report-copy.ts';
import { statusIcon } from '../../render/ui/status-icon.ts';
import { LOOKS, type Look } from '../../render/ui/status-look.ts';
import { dayTile, periodSwitch, type PeriodWords } from '../conversations/calendar-view.ts';
import { CONVERSATION_TABLE, conversationRow } from '../conversations/conversation-columns.ts';
import type { CalendarDay, Conversation } from '../conversations/periods.ts';
import type { Month } from './months.ts';

const MONTH_SWITCH_WORDS: PeriodWords = {
  heading: 'month.heading',
  earlier: 'month.earlier',
  later: 'month.later',
  back: 'month.back',
  pick: 'month.pick',
  hint: 'month.hint',
};

/** "This month", "Last month", "3 months ago" - counted by the calendar, so a skipped empty month is still counted. */
export function monthAgo(month: Month, t: Translate): string {
  return month.ago === 0 ? t('month.this') : month.ago === 1 ? t('month.last') : t('month.ago', { n: month.ago });
}

/** "This month · September 2026", in every language. */
export function monthTitle(month: Month): string {
  return inLanguages((t, lang) => monthAgo(month, t) + ' · ' + monthName(month.first, lang));
}

/** The window a day opens in. Day numbers are unique on the page, whichever month they fall in. */
const dayWindow = (day: CalendarDay): string => 'day-' + day.day.number;

/**
 * "Your month": the switcher between months and a calendar, Monday first, one tile per day - the week's tiles
 * (F11), laid out as the month falls. A tile names only its day's number; the weekdays head the columns. A day
 * with work opens in a window over the page (guidelines §1.4: details after a click, in a popup); nothing is listed
 * under the calendar.
 */
export function monthView(months: readonly Month[], at: number, widen: string, include = false): string {
  const month = months[at] as Month;
  return '<section class="cw-week">' +
    periodSwitch('month', months, at, MONTH_SWITCH_WORDS, (each, t, lang) =>
      monthAgo(each, t) + ' <span class="cw-switch-range">· ' + monthName(each.first, lang) + '</span>') +
    '<div class="mv-cal">' +
    '<div class="mv-head" aria-hidden="true">' +
    Array.from({ length: 7 }, (_unused, weekday) => '<span>' + inLanguages((_t, lang) => weekdayNames(lang)[weekday] ?? '') + '</span>').join('') +
    '</div>' +
    '<div class="mv-grid">' +
    '<span class="mv-blank" aria-hidden="true"></span>'.repeat(month.first.weekday) +
    month.days.map((day) => dayTile(day, String(day.day.day), { opens: dayWindow(day), extra: dayTip(day) })).join('') +
    '</div></div>' +
    month.days.filter((day) => day.conversations > 0).map((day) => dayWindowOf(day, month.conversations, widen, include)).join('') +
    '</section>';
}

/**
 * What a day held, on hover or keyboard focus: its date and how many conversations, then how many in each look - read
 * something private, only saw a name, stopped, nothing private - in the icons and colours the rows use, and that a
 * click shows them. Drawn with no script; hidden from a screen reader, which is given the same in the window a click opens.
 */
function dayTip(day: CalendarDay): string {
  if (day.conversations === 0) return '';
  // Near the calendar's edges the summary opens inward, so it is never cut by the window.
  const side = day.day.weekday < 2 ? 'start' : day.day.weekday > 4 ? 'end' : 'middle';
  const rows = lookCounts(day).map(([look, n]) => '<span class="mv-tip-row">' + statusIcon(look) + '<b>' + String(n) + '</b></span>').join('');
  return '<span class="mv-tip mv-tip-' + side + '" aria-hidden="true">' +
    '<span class="mv-tip-head">' + inLanguages((t, lang) => dayName(day.day, lang) + ' · ' + t('month.day.count', { n: day.conversations })) + '</span>' +
    rows +
    '<span class="mv-tip-hint">' + inLanguages((t) => t('month.tip.open')) + '</span></span>';
}

/** The looks a day holds, in the order of `LOOKS`, each with how many of its conversations are in it. */
function lookCounts(day: CalendarDay): readonly (readonly [Look, number])[] {
  return (Object.keys(LOOKS) as Look[]).flatMap((look) => ((day.looks[look] ?? 0) > 0 ? [[look, day.looks[look] ?? 0] as const] : []));
}

/**
 * One day, opened in a wide window over the page: its date, how many conversations and how many to check, the same
 * count by look the tile's summary gives, and those conversations in the rows Conversations lists them in - the ones
 * that read something private first, then the rest, each newest first. A row's "See all {n} files" opens the page's
 * one files window over this one, as it does on Conversations (F58).
 */
function dayWindowOf(day: CalendarDay, conversations: readonly Conversation[], widen: string, include: boolean): string {
  const those = conversations.filter((item) => item.day.number === day.day.number);
  const ordered = [...those.filter((item) => LOOKS[item.look].attention), ...those.filter((item) => !LOOKS[item.look].attention)];
  const id = dayWindow(day);
  const head = '<div class="mv-pp-head">' +
    '<div class="mv-pp-top"><span class="mv-pp-dot mv-pp-dot-' + (day.toCheck > 0 || day.fixed > 0 ? 'coral' : 'mint') + '" aria-hidden="true"></span>' +
    '<span class="mv-pp-sub">' + inLanguages((t) => t('month.day.count', { n: day.conversations }) + ' · ' +
      (day.toCheck > 0 ? t('conv.day.toCheck', { n: day.toCheck }) : day.fixed > 0 ? t('conv.day.fixed', { n: day.fixed }) : t('conv.day.good'))) + '</span>' +
    closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
    '<h2 class="mv-pp-title" id="' + id + '-title">' + inLanguages((_t, lang) => dayName(day.day, lang)) + '</h2>' +
    '<div class="mv-pp-looks">' + lookCounts(day).map(([look, n]) => '<span class="mv-pp-look">' + statusIcon(look) + '<b>' + String(n) + '</b></span>').join('') + '</div>' +
    '</div>';
  const body = '<div class="mv-pp-body">' +
    dataTable({ ...CONVERSATION_TABLE, rows: ordered.map((item) => conversationRow(item, widen, include)) }) + '</div>';
  const foot = popupFoot(inLanguages((t) => t('month.window.note')),
    pill({ label: inLanguages((t) => t('app.close')), tone: 'outline', size: 'md', button: true, attributes: CLOSES }));
  return popup({ id, size: 'wide', labelledBy: id + '-title', body: head + body + foot });
}

/**
 * Seven columns at every width: a calendar that wraps is no calendar. Where a column grows too narrow for "2 to
 * check", the words give way to the dot, which carries the same colour.
 */
export const MONTH_VIEW_STYLE = String.raw`
.mv-cal{container-type:inline-size}
.mv-head,.mv-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.mv-head{margin-bottom:8px}
.mv-head span{font-size:12.5px;font-weight:600;color:var(--text-3);padding-left:14px}
.mv-grid .cw-day{min-width:0;min-height:108px;gap:8px}
.mv-grid .cw-day-state{min-height:1.4em}
.mv-grid .cw-day-said{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mv-grid .cw-day-today .cw-day-label{color:var(--text)}
.mv-grid .cw-day{position:relative}
.mv-tip{position:absolute;bottom:calc(100% + 8px);z-index:5;width:250px;display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:14px;
background:var(--popup);border:1px solid var(--white-10);box-shadow:0 24px 60px var(--shadow);text-align:left;white-space:normal;
opacity:0;visibility:hidden;pointer-events:none;transition:opacity .12s,visibility .12s}
.mv-tip-start{left:0}.mv-tip-end{right:0}.mv-tip-middle{left:50%;translate:-50% 0}
.cw-day:hover .mv-tip,.cw-day:focus-visible .mv-tip{opacity:1;visibility:visible}
.mv-tip-head{font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:2px}
.mv-tip-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mv-tip-row .look-label{font-size:13.5px}
.mv-tip-row b{font-size:15px;font-weight:650;color:var(--text)}
.mv-tip-hint{font-size:12.5px;color:var(--text-3);padding-top:8px;border-top:1px solid var(--white-07)}
@media (hover:none){.mv-tip{display:none}}
.mv-pp-head{padding:28px 32px 20px}
.mv-pp-top{display:flex;align-items:center;gap:12px}
.mv-pp-dot{flex:none;width:10px;height:10px;border-radius:50%}
.mv-pp-dot-coral{background:var(--coral)}.mv-pp-dot-mint{background:var(--mint)}
.mv-pp-sub{flex:1;font-size:14px;font-weight:600;color:var(--text-2)}
.mv-pp-title{margin:10px 0 0;font-size:30px;line-height:1.15;font-weight:650;letter-spacing:-0.01em}
.mv-pp-looks{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:18px}
.mv-pp-look{display:flex;align-items:center;gap:10px}
.mv-pp-look b{font-size:15px;font-weight:650;color:var(--text)}
.mv-pp-body{padding:0 32px 28px;overflow-x:auto}
@media (max-width:640px){.mv-pp-head{padding:20px 18px 16px}.mv-pp-title{font-size:24px}.mv-pp-body{padding:0 18px 20px}}
@container (max-width:760px){
.mv-head span{padding-left:0;text-align:center}
.mv-grid{gap:5px}
.mv-grid .cw-day{min-height:0;padding:8px 4px;align-items:center;gap:6px;border-radius:10px}
.mv-grid .cw-day-count{font-size:16px}
.mv-grid .cw-day-said{display:none}
}
`;
