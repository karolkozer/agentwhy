// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, TABLES, translator } from '../../render/report-copy.ts';
import { APP_SIDEBAR_STYLE } from '../../render/ui/app-sidebar.ts';
import { BUTTON_STYLE } from '../../render/ui/button.ts';
import { dataTable, DATA_TABLE_STYLE, type TableGroup, type TableNote, type TableRow } from '../../render/ui/data-table.ts';
import { foldLine, FOLD_LINE_STYLE } from '../../render/ui/fold-line.ts';
import { guideCard, GUIDE_CARD_STYLE, type Guide } from '../../render/ui/guide-card.ts';
import { hero, HERO_STYLE } from '../../render/ui/hero.ts';
import { dayName } from '../../render/ui/local-date.ts';
import { STATUS_ICON_STYLE } from '../../render/ui/status-icon.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import { LOOKS, type Look } from '../../render/ui/status-look.ts';
import { AIR_DATEPICKER_SCRIPT, AIR_DATEPICKER_STYLE } from '../render/air-datepicker-vendor.ts';
import type { SessionIndex } from '../session-index.ts';
import { CALENDAR_VIEW_STYLE, type PeriodKind } from './calendar-view.ts';
import { CONVERSATION_COLUMNS_STYLE, CONVERSATION_ROW_SCRIPT, conversationRow, CONVERSATION_TABLE } from './conversation-columns.ts';
import { unchecked, type Conversation, type Period } from './periods.ts';
import { PERIODS_SCRIPT } from './periods-script.ts';

/** What a week and a month say differently. `zero` and `whole` are word keys; the rest is written already. */
export interface PeriodSection {
  readonly kind: PeriodKind;
  readonly eyebrow: string;
  readonly view: string;
  /** The heading when nothing happened: "…this week." / "…this month." */
  readonly zero: string;
  /**
   * The ✦ card that names where to start (F9) is drawn only where this, its mint title in every language ("Nothing to
   * fix this week."), is given. This month leaves where to start to its lists.
   */
  readonly clean?: string;
  /** The chip that clears a chosen day: "Show the whole week". None where a day is not chosen but opened. */
  readonly whole?: string;
  /**
   * Whether "Needs your attention" and the folded rest are drawn under the days (F12, F13). This month draws none: a
   * day's conversations are in the drawer it opens.
   */
  readonly lists: boolean;
  /** What a period with no conversation says in place of the counts and the lists; without it, the counts say zero. */
  readonly empty?: EmptyPeriod;
}

/** A period nothing happened in yet, written already: the line under the heading, the card, and what goes under the days. */
export interface EmptyPeriod {
  readonly lead: string;
  /** None where nothing true can be said in one: the page draws no card rather than a guess. */
  readonly guide?: Guide;
  readonly after: string;
}

/**
 * One week or one month (`for-people-who-build-with-ai.md` F8-F14): the answer first, then where to start, then the
 * days, then what needs attention and, folded, the rest. Every period is on the page, one under another; the script
 * shows one at a time.
 */
export function periodSection(periods: readonly Period[], at: number, index: SessionIndex, spec: PeriodSection): string {
  const period = periods[at] as Period;
  const total = period.conversations.length;
  // Put before the person: a read still to fix, and a read of files the person let the AI read (the maintainer,
  // 2026-09-25) - which asks for nothing, and whose row leads to its report. The first is "Needs your attention"; the
  // second, since the same day, "For your info" under it, so a list that asks for work holds only work.
  const need = period.conversations.filter((item) => LOOKS[item.look].attention);
  const fix = need.filter((item) => LOOKS[item.look].needsFix);
  const info = need.filter((item) => !LOOKS[item.look].needsFix);
  const asks = fix.length > 0;
  // What this run did not read, or read with gaps, is neither to fix nor "nothing private": it is listed apart, with
  // the command that includes it, and never folded under the line that says there is nothing to fix (F17, O4).
  const listedApart = period.conversations.filter(unchecked);
  const others = period.conversations.filter((item) => !unchecked(item) && !LOOKS[item.look].attention);
  // F8, changed 2026-09-25: what was read and then fixed is still counted as read - it happened - and asks for nothing;
  // so is what the person let it read (F57a).
  const fixed = period.conversations.filter((item) => item.look === 'fixed').length;
  const allowed = period.conversations.filter((item) => item.look === 'allowed').length;
  const read = need.length + fixed;
  // What a calm period says of what it read: nothing, fixed, let be read, or both - never "didn't read anything private".
  const after = fixed > 0 && allowed > 0 ? 'fixedAllowed' : fixed > 0 ? 'fixed' : allowed > 0 ? 'allowed' : undefined;
  // F8, changed 2026-09-24: a period whose every conversation was checked and none read anything says so in mint - and,
  // since 2026-09-25, one whose every read was fixed.
  const clean = total > 0 && need.length === 0 && listedApart.length === 0;
  // F17: conversations read with gaps alone - every Codex record has one - are named as that, not as ones never checked.
  const lead = uncheckedLead(listedApart, index.shared);
  const partial = lead === 'conv.unchecked.partial';

  // Every period opens whole (F10, changed 2026-09-24); a day is chosen only by a tap.
  const open = '<section class="cw' + (at === 0 ? ' cw-current' : '') + '" id="' + spec.kind + '-' + period.ago + '" data-period-at="' + at + '"' +
    ' data-kind="' + spec.kind + '" data-first="' + period.first.number + '">';
  // Nothing yet (the maintainer's design, 2026-09-29): one line of heading, and no count of what was read - coral
  // "Nothing private was read." over an empty week said a reassurance about nothing.
  if (total === 0 && spec.empty !== undefined) {
    return open + hero({ eyebrow: spec.eyebrow, fact: inLanguages((t) => t(spec.zero)), action: '', lead: spec.empty.lead }) +
      (spec.empty.guide === undefined ? '' : guideCard(spec.empty.guide)) + spec.view + spec.empty.after + '</section>';
  }
  return open +
    hero({
      eyebrow: spec.eyebrow,
      fact: inLanguages((t) => (total === 0 ? t(spec.zero) : t('conv.hero.fact', { n: total }))),
      action: inLanguages((t) => (need.length > 0 ? t('conv.hero.times', { n: read })
        : listedApart.length > 0 ? t(partial ? 'conv.hero.partial' : 'conv.hero.unchecked', { n: listedApart.length })
          : read > 0 ? t('conv.hero.times', { n: read }) : t('conv.hero.none'))),
      // "The ones marked in coral" only where one is: a period with nothing to fix says so, and what is grey.
      lead: inLanguages((t) => t(asks ? 'conv.hero.lead' : listedApart.length > 0 ? 'conv.hero.lead.unchecked'
        : after === undefined ? 'conv.hero.lead.clean' : 'conv.hero.lead.' + after)),
      ...(clean ? { calm: true } : {}),
    }) +
    (spec.clean === undefined ? '' : guideCard(guideOf(period, spec.clean, after, listedApart.length, index.widen, lead, spec.lists))) +
    spec.view +
    (!spec.lists ? '' : dayChip(spec.whole)) +
    (!spec.lists || fix.length === 0 ? '' :
      '<section class="cw-need" data-need data-need-fix><div class="cw-need-head"><span class="cw-need-dot" aria-hidden="true"></span>' +
      '<h2 class="cw-h2">' + inLanguages((t) => t('conv.need')) + '</h2><span class="cw-need-count" data-need-count>' + fix.length + '</span></div>' +
      dataTable({ ...CONVERSATION_TABLE, rows: fix.map((item) => conversationRow(item, index.widen, !index.shared)) }) +
      '</section>') +
    (!spec.lists || info.length === 0 ? '' : forYourInfo(info, index)) +
    (!spec.lists || listedApart.length === 0 ? '' : notFullyChecked(listedApart, partial, lead, index)) +
    (!spec.lists || others.length === 0 ? '' : theRest(others, need.length === 0, index)) +
    '</section>';
}

/**
 * "For your info (n) — your AI read files you track. Nothing to fix." (the maintainer, 2026-09-25): the conversations
 * whose AI read only files the person chose Track for (F57a), under a line of their own in Track's sand, open, and shut
 * with **Hide**. The script narrows it to the day chosen as it does "Needs your attention" (`data-need`).
 */
function forYourInfo(info: readonly Conversation[], index: SessionIndex): string {
  return '<section class="cw-need cw-info" data-need data-need-info>' + foldLine({
    summary: '<strong>' + inLanguages((t) => t('conv.info')) + ' (<span data-need-count>' + info.length + '</span>)</strong> <span class="fold-rest">' +
      inLanguages((t) => t('conv.info.rest')) + '</span>',
    mark: { glyph: MODE_SVG.tell, tone: 'sand' },
    attributes: ' open',
    body: dataTable({ ...CONVERSATION_TABLE, rows: info.map((item) => conversationRow(item, index.widen, !index.shared)) }),
  }) + '</section>';
}

/**
 * "Couldn't check fully (n)" (the maintainer, 2026-10-05): what this run could not read, or read with gaps, in a fold
 * of its own - a solid grey line with the look's ?, shut, and opened with **Show**. Every Codex record has a gap
 * (`2026-09-27-what-codex-wrote.md` X23), so on a project worked in with Codex this list holds the whole week, asks
 * for nothing, and was the longest thing on the page; the maintainer asked for it shut on arrival (2026-10-05), not
 * only shuttable. Shut it still says all of it the page owes: the heading, how many, and in brief why - and the
 * period's card above says the number too. The sentence of the reason and the command that would include them go
 * inside, with the rows; the list is still apart from what is to fix and is never a group of the rest's table
 * (F17, F13, O4). The script narrows it to the day chosen as it does the other lists (`data-need`), and the count it
 * rewrites is the one in the line, which is in view whether the fold is open or not.
 */
function notFullyChecked(unchecked: readonly Conversation[], partial: boolean, lead: string, index: SessionIndex): string {
  return '<section class="cw-need cw-unchecked" data-need>' + foldLine({
    summary: '<strong>' + inLanguages((t) => t(partial ? 'look.unchecked' : 'conv.unchecked')) +
      ' (<span data-need-count>' + unchecked.length + '</span>)</strong> <span class="fold-rest">' +
      inLanguages((t) => t(lead + '.rest')) + '</span>',
    mark: { glyph: LOOKS.unchecked.glyph, tone: 'grey' },
    body: '<p class="cw-unchecked-lead">' + inLanguages((t) => t(lead, { command: '<code>' + e(index.widen) + '</code>' })) + '</p>' +
      dataTable({ ...CONVERSATION_TABLE, rows: unchecked.map((item) => conversationRow(item, index.widen, !index.shared)) }),
  }) + '</section>';
}

/** The looks of the rest, in the order of F16's ladder: the groups of F13 and F14, and the order they are listed in. */
const REST: readonly Look[] = ['fixed', 'name', 'stopped', 'none'];

/** A group's table rows past this many wait behind "Show all" while the whole period is shown (F14). */
const CAP = 5;

/**
 * F12's day chip, over both lists (F10, changed 2026-09-24): which day is chosen and how many conversations it holds,
 * and × to bring the week back. Only a script chooses a day, so only a script shows it.
 */
function dayChip(whole: string | undefined): string {
  if (whole === undefined) return '';
  return '<div class="cw-daybar js-only" data-day-bar hidden><button type="button" class="cw-day-chip" data-day-clear' +
    labelAttributes((t) => t(whole)) + '><span data-day-label></span><span class="cw-chip-count"> · ' + countedLine('conv.day.count', 0, ' data-day-count') + '</span>' +
    '<span class="cw-day-x" aria-hidden="true">×</span></button></div>';
}

/**
 * F13, F14 (changed 2026-09-24): everything with nothing to fix, in groups by what the AI did. Under "Needs your
 * attention" it is folded, and its line says what it holds - each group's look and count, said and not pressed (the
 * maintainer, 2026-09-25: chips that opened the list read as filters; the list's own pills filter it).
 * With nothing above it, it is open under a heading of its own (`bare`): a fold with nothing to set it apart from was
 * the whole page, shut. A day chosen that leaves nothing to fix lays it bare the same way (the script).
 */
function theRest(others: readonly Conversation[], bare: boolean, index: SessionIndex): string {
  const count = (look: Look): number => others.filter((item) => item.look === look).length;
  const looks = REST.filter((look) => count(look) > 0);
  const label = (look: Look): string => inLanguages((t) => t(LOOKS[look].label));
  const mix = '<span class="cw-mix-row">' + looks.map((look) =>
    '<span class="cw-mix cw-mix-' + LOOKS[look].tone + '" data-mix-look="' + look + '">' +
    '<span class="cw-mix-glyph" aria-hidden="true">' + LOOKS[look].glyph + '</span>' + label(look) +
    ' <span class="cw-mix-n" data-look-n="' + look + '">' + count(look) + '</span></span>').join('') + '</span>';

  const pills = '<div class="cw-pills" role="group"' + labelAttributes((t) => t('conv.filter.label')) + '>' +
    ['all' as const, ...looks].map((look) =>
      '<button type="button" class="cw-pill" data-pick-look="' + look + '" aria-pressed="' + String(look === 'all') + '" data-live-keep>' +
      (look === 'all' ? inLanguages((t) => t('conv.filter.all')) : label(look)) +
      ' <span class="cw-pill-n" data-look-n="' + look + '">' + (look === 'all' ? others.length : count(look)) + '</span></button>').join('') + '</div>';

  // Newest first inside each group, as the period lists them; a group's heading counts its rows, its note what is past five.
  const rows = looks.flatMap((look): (TableRow | TableGroup | TableNote)[] => {
    const those = others.filter((item) => item.look === look);
    return [
      { group: label(look), tone: LOOKS[look].tone, count: those.length, attributes: ' data-look-head="' + look + '"' },
      ...those.map((item) => conversationRow(item, index.widen, !index.shared)),
      ...(those.length <= CAP ? [] : [{
        note: '<button type="button" class="cw-more" data-look-more="' + look + '" aria-pressed="false" data-live-keep>' +
          '<span class="cw-more-all">' + inLanguages((t) => t('conv.more.all', { n: '<span data-look-n="' + look + '">' + those.length + '</span>' })) + '</span>' +
          '<span class="cw-more-less">' + inLanguages((t) => t('conv.more.less')) + '</span></button>' +
          '<span class="cw-more-rest">' + inLanguages((t) => t('conv.more.rest', { n: '<span data-look-past="' + look + '">' + (those.length - CAP) + '</span>' })) +
          ' · ' + label(look) + '</span>',
        attributes: ' data-look-note="' + look + '" hidden',
      }]),
    ];
  });

  return '<section class="cw-others' + (bare ? ' cw-bare' : '') + '">' + foldLine({
    summary: '<strong>' + countedLine('conv.others.count', others.length) + '</strong> <span class="fold-rest">' +
      inLanguages((t) => t('conv.others.rest')) + '</span>' + mix,
    // live-pages L9: opened, it stays open across an update. Laid bare, it is open with no script too.
    attributes: ' data-others data-live-keep' + (bare ? ' open' : ''),
    body: '<div class="cw-list-head" data-list-head><h2 class="cw-h2">' + inLanguages((t) => t('conv.list')) + '</h2>' +
      '<span class="cw-list-count" data-look-n="all">' + others.length + '</span></div>' +
      '<div class="cw-tools js-only">' + pills +
      '<input class="cw-search" type="search" data-search-input data-live-keep placeholder="' + e(translator('en')('conv.search')) + '"' +
      LANGS.map((lang) => ' data-placeholder-' + lang + '="' + e(translator(lang)('conv.search')) + '"').join('') +
      labelAttributes((t) => e(t('conv.search'))) + '></div>' +
      dataTable({ ...CONVERSATION_TABLE, rows, empty: inLanguages((t) => t('conv.empty')) }) +
      '<div class="cw-foot"><span class="cw-shown">' +
      inLanguages((t) => t('conv.shown', { shown: '<span data-shown>' + others.length + '</span>', total: others.length })) +
      '<span class="cw-zone"> ' + inLanguages((t) => t('conv.tech.zone', { zone: e(index.timeZone ?? 'UTC') })) + '</span></span>' +
      '<label class="cw-tech-toggle" for="conv-tech"><span class="cw-tech-off">' + inLanguages((t) => t('conv.tech.show')) +
      '</span><span class="cw-tech-on">' + inLanguages((t) => t('conv.tech.hide')) + '</span></label></div>',
  }) + '</section>';
}

/**
 * Where to start (F9): the newest conversation of the period whose AI read something private that is still to fix;
 * else, where some were not checked, what includes them - a card that only says, with no button; else the mint card,
 * which says the AI read nothing only where that is true (changed 2026-09-25: a period whose reads were all fixed, or
 * were of files the person let it read, F57a).
 */
function guideOf(period: Period, clean: string, after: string | undefined, unchecked: number, widen: string, lead: string, listed: boolean): Guide {
  const start = period.start;
  if (start === undefined || start.entry.report.kind !== 'generated') {
    if (unchecked > 0) {
      return {
        tone: 'coral',
        title: inLanguages((t) => t(lead === 'conv.unchecked.partial' || lead === 'conv.unchecked.mixed' ? 'conv.unchecked.partial.title' : 'conv.unchecked.title', { n: unchecked })),
        // The list below says why, beside its rows; the card says only where they are, not the same sentence twice.
        body: inLanguages((t) => (listed ? t('conv.unchecked.below', { n: unchecked }) : t(lead, { command: '<code>' + e(widen) + '</code>' }))),
      };
    }
    return { tone: 'mint', title: clean, body: inLanguages((t) => t(after === undefined ? 'conv.clean.body' : 'conv.clean.' + after)) };
  }
  const title = start.entry.title === undefined ? undefined : e(start.entry.title as string);
  return {
    tone: 'coral',
    title: inLanguages((t, lang) => t('conv.guide.title', {
      when: start.relative === undefined ? dayName(start.day, lang) : t('conv.guide.' + start.relative),
      time: start.time,
    })),
    body: inLanguages((t) =>
      (title === undefined ? '' : t('conv.guide.asked', { ask: title }) + ' ') +
      t('conv.guide.read', { what: start.read > 0 ? t('conv.guide.files', { n: start.read }) : t('conv.guide.something') })),
    action: { label: inLanguages((t) => t('conv.guide.go')), href: e(start.entry.report.file) },
  };
}

/**
 * What the lines about unchecked conversations say: where each can be checked on request (F55) - older than the run, on
 * a page that is not shared - the button first; otherwise, what the run could not read and the command that includes it.
 */
function uncheckedLead(unchecked: readonly { readonly look: string; readonly partial: boolean }[], shared: boolean): string {
  // F17: a record with gaps was read - what it cannot show is said, never that the run did not read it. Every Codex record
  // is one (`2026-09-27-what-codex-wrote.md` X23), so a list of them alone is common.
  if (unchecked.every((item) => item.partial)) return 'conv.unchecked.partial';
  if (!shared && unchecked.every((item) => item.look === 'outside')) return 'conv.unchecked.check';
  return unchecked.some((item) => item.partial) ? 'conv.unchecked.mixed' : 'conv.unchecked.lead';
}

/**
 * A count the script may change - the day chosen narrows the rest of the period to that day - written with every
 * plural form of its language beside it, so the words follow the number: "1 other conversation", "3 inne rozmowy".
 */
function countedLine(key: string, n: number, attributes = ''): string {
  return LANGS.map((lang) => {
    const forms = Object.entries(TABLES[lang]).filter(([name]) => name.startsWith(key + '.'));
    return '<span class="i18n" lang="' + lang + '" data-counted' + attributes +
      forms.map(([name, text]) => ' data-form-' + name.slice(key.length + 1) + '="' + e(text) + '"').join('') + '>' +
      translator(lang)(key, { n }) + '</span>';
  }).join('');
}

/** The checkbox "Show technical details" toggles, once per page, before every period that reads it. */
export const TECH_TOGGLE = '<input type="checkbox" id="conv-tech" class="sr-only">';

/** What a period section lays out: the list headings, the search row and the line under the rest. */
export const PERIOD_SECTION_STYLE = String.raw`
.js .cw:not(.cw-current){display:none}
.cw+.cw{margin-top:72px;padding-top:40px;border-top:1px solid var(--white-07)}
.js .cw+.cw{margin-top:0;padding-top:0;border-top:0}
.cw-need{margin-bottom:28px}
.cw-need[hidden]{display:none}
.cw-need-head{display:flex;align-items:baseline;gap:10px;margin-bottom:12px}
.cw-need-dot{width:10px;height:10px;border-radius:50%;background:var(--coral);align-self:center}
.cw-need-count{font-size:15px;font-weight:650;color:var(--coral-text)}
.cw-unchecked-lead{margin:0 0 12px;font-size:14px;line-height:1.5;color:var(--text-2)}
.cw-unchecked-lead code,.guide code{font-family:var(--mono);font-size:13px;color:var(--text);background:var(--white-07);border-radius:6px;padding:1px 6px}
.cw-tools{display:none;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.js .cw-tools{display:flex}
.cw-search{flex:1 1 220px;margin-left:auto;max-width:320px;min-width:0;background:var(--card);border:1px solid var(--white-10);border-radius:999px;padding:9px 16px;color:var(--text);font:inherit;font-size:14px;outline:none}
.cw-search:focus-visible{border-color:var(--coral-50)}
.cw-daybar{margin:0 0 20px}.cw-daybar[hidden]{display:none}
.cw-day-chip{display:inline-flex;align-items:center;gap:6px;background:var(--white-07);border:1px solid var(--white-10);border-radius:999px;color:var(--text);font:inherit;font-size:14px;font-weight:600;cursor:pointer;padding:6px 8px 6px 14px}
.cw-day-chip:hover{border-color:var(--white-25)}
.cw-chip-count{color:var(--text-2);font-weight:500}
.cw-day-x{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--white-10);color:var(--text-2);margin-left:4px}
.cw-mix-row{display:flex;gap:6px 18px;flex-wrap:wrap;margin-top:8px}
.cw-mix{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600}
.cw-mix[hidden]{display:none}
.cw-mix-blue{color:var(--blue)}.cw-mix-mint{color:var(--mint)}.cw-mix-grey{color:var(--text-2)}
.cw-mix-n{opacity:.8}
.cw-list-head{display:none;align-items:baseline;gap:10px;margin-bottom:12px}
.cw-bare .cw-list-head{display:flex}.cw-bare .fold-line{display:none}
.cw-list-count{font-size:15px;font-weight:650;color:var(--text-3)}
.cw-pills{display:flex;gap:8px;flex-wrap:wrap}
.cw-pill{display:flex;align-items:center;gap:8px;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--white-12);background:transparent;color:var(--text-soft)}
.cw-pill[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}
.cw-pill[hidden]{display:none}.cw-pill-n{opacity:.7}
.cw-more{border:1px solid var(--white-14);background:transparent;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;color:var(--text-soft);cursor:pointer}
.cw-more:hover{background:var(--white-05);color:var(--text)}
.cw-more-less{display:none}.cw-more[aria-pressed="true"] .cw-more-less{display:inline}.cw-more[aria-pressed="true"] .cw-more-all{display:none}
.cw-more[aria-pressed="true"]+.cw-more-rest{display:none}
.cw-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}
.cw-shown{font-size:13px;color:var(--text-3)}
.cw-zone{display:none}.shell-main:has(#conv-tech:checked) .cw-zone{display:inline}
.cw-tech-toggle{color:var(--text-2);font-size:13.5px;font-weight:600;cursor:pointer;padding:4px 0}
.cw-tech-toggle:hover{color:var(--text)}
.cw-tech-on{display:none}
.shell-main:has(#conv-tech:checked) .cw-tech-on{display:inline}.shell-main:has(#conv-tech:checked) .cw-tech-off{display:none}
.shell-main:has(#conv-tech:focus-visible) .cw-tech-toggle{outline:2px solid var(--coral);outline-offset:2px;border-radius:4px}
`;

/** Every style a page read through periods is made of: Conversations, and This month. */
export const PERIOD_PAGE_STYLES: readonly string[] = [APP_SIDEBAR_STYLE, HERO_STYLE, GUIDE_CARD_STYLE, BUTTON_STYLE, AIR_DATEPICKER_STYLE,
  CALENDAR_VIEW_STYLE, DATA_TABLE_STYLE, STATUS_ICON_STYLE, CONVERSATION_COLUMNS_STYLE, FOLD_LINE_STYLE, PERIOD_SECTION_STYLE];

/** The calendar a period is chosen in is the one the earlier page used, vendored (`air-datepicker-vendor.ts`). */
export const PERIOD_PAGE_LIBRARIES: readonly string[] = [AIR_DATEPICKER_SCRIPT];
export const PERIOD_PAGE_SCRIPTS: readonly string[] = [PERIODS_SCRIPT, CONVERSATION_ROW_SCRIPT];
