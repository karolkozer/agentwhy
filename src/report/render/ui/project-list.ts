// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import type { FolderState } from '../../../core/project-catalogue.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator, type Translate } from '../report-copy.ts';
import { initial } from './app-sidebar.ts';
import { dayName, localClock } from './local-date.ts';
import { tag } from './tag.ts';

/** One project, as the list draws it (`.ai/specs/2026-09-27-which-project.md` V10). */
export interface ProjectListRow {
  readonly id: string;
  readonly name: string;
  /** Where the folder is, as a person reads it: `~/Projects/shop` - the whole of it on hover. */
  readonly place: string;
  /** Gone, or not - whether it was looked at is the list's business only in what it says of its status (V10b). */
  readonly folder: FolderState;
  readonly conversations: number;
  readonly newest: { readonly modifiedAt: number; readonly title?: string; readonly entryPoint?: EntryPoint };
  /** Absent where it is not known: nothing is said. */
  readonly setUp?: boolean;
  /** The project the page is about. */
  readonly current: boolean;
}

export interface ProjectList {
  /** Newest conversation first. */
  readonly rows: readonly ProjectListRow[];
  readonly unreadable: number;
  /** Projects in the computer's temporary space, not in `rows`: counted, never listed. */
  readonly temporary?: number;
  /** The onboarding's list: projects already set up, not in `rows` - nothing to set up there - counted (2026-10-07). */
  readonly setUp?: number;
  /** When the page was written, and in which zone: "yesterday" is that clock's. */
  readonly now: number;
  readonly timeZone: string;
  /** What a row offers - **Open**, **Set it up →** - where the page offers anything. Never asked of a folder that is gone. */
  readonly action?: (row: ProjectListRow) => string;
  /**
   * The trash of a row (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM4), in a column of its own after the
   * one that offers the way to a project. Absent where nothing can be removed - a page with no script, and the
   * onboarding's step, which offers none of it (RM12).
   */
  readonly remove?: (row: ProjectListRow) => string;
  /**
   * The onboarding's project step (V11), as the maintainer's design draws it: a radio at the start of every row, of the
   * group this names, the project shown on its own and chosen, five others and the rest a click away, and folders that
   * are gone counted rather than listed. It takes the place of `action`.
   */
  readonly pick?: string;
}

/** V10: at most this many rows, then how many older projects there are. */
const ROWS = 30;
/** The design's step shows five, and "Show 3 more projects" for the rest. */
const FIRST = 5;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The list of a person's projects (V10, V11), drawn as the maintainer's design of 2026-09-28 draws it: the project this
 * page is about on its own, under "You're here now"; the others in one table, newest first, each with its status in one
 * column and what can be done in the next - so which project to pick is plain at a glance. A row says the project's
 * name, when it was last used and how many AI chats it has; where it is, whole, on hover. A folder that is no longer
 * there is not listed at all (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM15): nobody can choose it, and
 * a line counting folders somebody deleted is one more thing to read and nothing to do about.
 */
export function projectList(spec: ProjectList): string {
  const clock = localClock(spec.timeZone);
  const today = clock(spec.now).day.number;
  const when = (row: ProjectListRow): string => lastUsed(row.newest.modifiedAt, spec.now, clock, today);
  const here = spec.rows.find((row) => row.current);
  const others = spec.rows.filter((row) => !row.current && row.folder !== 'gone');
  const shown = others.slice(0, ROWS);
  const older = others.length - shown.length;
  if (spec.pick !== undefined) return pickList(spec, spec.pick, when);
  const action = spec.action;
  const trash = spec.remove;
  const row = (one: ProjectListRow): string => '<li class="pjl-row"' + searchable(one) + '>' + cells(one, when, action, trash) + '</li>';

  return '<div class="pjl" data-order="new">' +
    (here === undefined ? '' :
      '<p class="pjl-label">' + inLanguages((t) => t('proj.here')) + '</p>' +
      '<div class="pjl-here' + (here.setUp === true ? ' pjl-here-set' : '') + '">' + cells(here, when, action) + '</div>') +
    '<div class="pjl-label-line"><p class="pjl-label">' +
    (['new', 'az', 'za'] as const).map((order) =>
      '<span class="pjl-order pjl-order-' + order + '">' + inLanguages((t) => t(order === 'new' ? 'proj.others' : 'proj.others.' + order)) + '</span>').join('') +
    '</p>' + (others.length === 0 ? '' : search()) + '</div>' +
    '<p class="pjl-none" data-search-none hidden></p>' +
    (shown.length === 0
      ? '<p class="pjl-none">' + inLanguages((t) => t('proj.none')) + '</p>'
      : '<div class="pjl-table">' +
        (shown.length === 0 ? '' :
          '<div class="pjl-heads"><span aria-hidden="true"></span><span>' + sortByName() + '</span>' +
          '<span aria-hidden="true">' + inLanguages((t) => t('proj.col.status')) + '</span>' +
          '<span class="pjl-head-actions" aria-hidden="true">' + inLanguages((t) => t('proj.col.actions')) + '</span>' +
          (trash === undefined ? '<span aria-hidden="true"></span>'
            : '<span class="pjl-head-remove" aria-hidden="true">' + inLanguages((t) => t('proj.col.remove')) + '</span>') + '</div>' +
          '<ul class="pjl-rows">' + shown.map(row).join('') + '</ul>') +
        '</div>') +
    (spec.temporary === undefined || spec.temporary === 0 ? '' : '<p class="pjl-foot">' + hiddenLine(spec.temporary, 0) + '</p>') +
    feet(older, spec.unreadable) +
    '</div>';
}

/** How many older projects are not drawn, and how many could not be read. */
function feet(older: number, unreadable: number): string {
  return (older === 0 ? '' : '<p class="pjl-foot">' + inLanguages((t) => t('proj.older', { n: older })) + '</p>') +
    (unreadable === 0 ? '' : '<p class="pjl-foot">' + inLanguages((t) => t('proj.unreadable', { n: unreadable })) + '</p>');
}

/**
 * The step's list (V11, the maintainer's design): "Where you started agentwhy" and its row, chosen, where the run is in a
 * listed project; the others under "Other projects" - or "Your projects", where it is in none - five of them, and the rest
 * behind **Show 3 more projects**, which only a script folds; what is not listed, counted beside it. Nothing is chosen
 * where the run is in no listed project.
 */
function pickList(spec: ProjectList, group: string, when: (row: ProjectListRow) => string): string {
  const here = spec.rows.find((row) => row.current && row.folder !== 'gone');
  const others = spec.rows.filter((row) => !row.current && row.folder !== 'gone');
  const gone = spec.rows.filter((row) => row.folder === 'gone').length;
  const shown = others.slice(0, ROWS);
  const more = Math.max(0, shown.length - FIRST);
  const hidden = hiddenLine(spec.temporary ?? 0, gone, spec.setUp ?? 0);
  return '<div class="pjl pjl-picking' + (more > 0 ? ' pjl-folded' : '') + '">' +
    (here === undefined ? '' :
      '<p class="pjl-label">' + inLanguages((t) => t('proj.startedIn')) + '</p>' +
      '<label class="pjl-pick pjl-pick-here">' + pickCells(here, when, group) + '</label>') +
    '<p class="pjl-label">' + inLanguages((t) => t(here === undefined ? 'proj.yours' : 'proj.others')) + '</p>' +
    (shown.length === 0
      ? '<p class="pjl-none">' + inLanguages((t) => t('proj.none')) + '</p>'
      : '<div class="pjl-table"><ul class="pjl-rows">' +
        shown.map((row, at) => '<li class="pjl-row-pick"' + (at >= FIRST ? ' data-pjl-extra' : '') + '><label class="pjl-pick">' + pickCells(row, when, group) + '</label></li>').join('') +
        '</ul>' +
        (more === 0 && hidden === '' ? '' :
          '<div class="pjl-more-line">' +
          (more === 0 ? '<span></span>' : '<button type="button" class="pjl-more js-only" data-pjl-more>' + inLanguages((t) => t('proj.more', { n: more })) + ' ▾</button>') +
          (hidden === '' ? '' : '<span class="pjl-hidden">' + hidden + '</span>') + '</div>') +
        '</div>') +
    feet(others.length - shown.length, spec.unreadable) +
    '</div>';
}

/** A row of the step: its radio, the project - "Started here" beside the run's own - and its status. */
function pickCells(row: ProjectListRow, when: (row: ProjectListRow) => string, group: string): string {
  return radio(group, row) +
    '<span class="pjl-project"><span class="pjl-name-line"><span class="pjl-name" title="' + e(row.place) + '">' + e(row.name) + '</span>' +
    (row.current ? tag(inLanguages((t) => t('proj.startedHere')), 'grey', 'badge') : '') + '</span>' +
    '<span class="pjl-detail"><span class="pjl-in">' + inParent(row.place) + ' · </span>' + when(row) + ' · ' + inLanguages((t) => t('proj.chats', { n: row.conversations })) + '</span></span>' +
    '<span class="pjl-status">' + status(row) + '</span>';
}

/** "in Projects": the folder a project lies in, as a person reads it - "in your home folder" where that is where. */
function inParent(place: string): string {
  const cut = Math.max(place.lastIndexOf('/'), place.lastIndexOf('\\'));
  const parent = cut <= 0 ? place.slice(0, cut + 1) : place.slice(0, cut);
  if (parent === '~') return inLanguages((t) => t('proj.inHome'));
  return inLanguages((t) => t('proj.in', { place: e(parent.replace(/^~[\\/]/, '')) }));
}

/** "Hidden: 1 temporary folder, 1 that no longer exists": what the list leaves out, counted. Empty where nothing is. */
function hiddenLine(temporary: number, gone: number, setUp = 0): string {
  if (temporary + gone + setUp === 0) return '';
  return inLanguages((t) => t('proj.hidden', {
    what: [
      setUp > 0 ? t('proj.hidden.setUp', { n: setUp }) : '',
      temporary > 0 ? t('proj.hidden.temporary', { n: temporary }) : '',
      gone > 0 ? t('proj.hidden.gone', { n: gone }) : '',
    ].filter((part) => part !== '').join(', '),
  }));
}

/**
 * A small field that narrows the list as it is typed in, by a project's name or where it is (the maintainer, 2026-09-28).
 * Only a script can narrow, so only a page with one shows it; its placeholder is set in the page's language.
 */
function search(): string {
  const words = Object.fromEntries(LANGS.map((lang) => [lang, { placeholder: translator(lang)('proj.search'), none: translator(lang)('proj.noMatch', { q: '{q}' }) }]));
  return '<input type="search" class="pjl-search js-only" data-project-search autocomplete="off" spellcheck="false"' +
    ' aria-label="' + e(translator('en')('proj.search')) + '" data-search-words="' + e(JSON.stringify(words)) + '">';
}

/**
 * A-Z, Z-A, or newest first (the maintainer, 2026-10-05): the head of the Project column is the button that cycles the
 * three, with the order it is in drawn beside the word - up for A-Z, down for Z-A, both ways for the order the list
 * came in. Only a script can sort, so only a page with one offers it, and a page without one keeps the plain word; the
 * line above the table says the order in words, so what changed is never only a glyph.
 */
function sortByName(): string {
  return '<button type="button" class="pjl-sort js-only" data-pjl-sort' + labelAttributes((t) => t('proj.sort')) + '>' +
    '<span class="pjl-sort-word">' + inLanguages((t) => t('proj.col.project')) + '</span>' +
    '<span class="pjl-sort-mark">' +
    (['new', 'az', 'za'] as const).map((order, at) =>
      '<span class="pjl-order pjl-order-' + order + '">' + inLanguages((t) => t('proj.order.' + order)) +
      '<span aria-hidden="true"> ' + ['\u2195', '\u2191', '\u2193'][at] + '</span></span>').join('') +
    '</span></button><span class="nojs-only" aria-hidden="true">' + inLanguages((t) => t('proj.col.project')) + '</span>';
}

/**
 * A row's radio, in the column where the window offers **Open**: a real one, so the keys move between the rows as they do
 * in any group. What the page chooses by is the id, never a path (V17). The row chosen is mint, not coral (the
 * maintainer, 2026-09-29): choosing a project is a safe thing, and coral read as a warning.
 */
function radio(group: string, row: ProjectListRow): string {
  return '<input type="radio" class="pjl-radio-input" name="' + e(group) + '" value="' + e(row.id) + '" data-pick-name="' + e(row.name) + '"' +
    (row.current ? ' data-pick-here checked' : '') + '><span class="pjl-radio" aria-hidden="true"><span class="pjl-radio-dot"></span></span>';
}

/** What the field matches a row by: its name and where it is, in lower case - and the name alone, what it sorts by. */
function searchable(row: ProjectListRow): string {
  return ' data-search="' + e((row.name + ' ' + row.place).toLowerCase()) + '" data-sort-name="' + e(row.name.toLowerCase()) + '"';
}

/**
 * A row's five cells: the folder's initial, the project, its status, what it offers (**Open**, **Set it up →**) and the
 * trash - the last two columns of their own, so a row's two controls never read as one (the maintainer, 2026-10-06,
 * RM2). Every row drawn is a folder that is there (RM15), so nothing here says one is missing.
 */
function cells(row: ProjectListRow, when: (row: ProjectListRow) => string, action: ProjectList['action'], trash?: (row: ProjectListRow) => string): string {
  const detail = when(row) + ' · ' + inLanguages((t) => t('proj.chats', { n: row.conversations }));
  return '<span class="pjl-mark" aria-hidden="true">' + e(initial(row.name)) + '</span>' +
    '<span class="pjl-project"><span class="pjl-name" title="' + e(row.place) + '">' + e(row.name) + '</span>' +
    '<span class="pjl-detail">' + detail + '</span></span>' +
    '<span class="pjl-status">' + status(row) + '</span>' +
    '<span class="pjl-action">' + (action === undefined ? '' : action(row)) + '</span>' +
    (trash === undefined ? '' : '<span class="pjl-remove">' + trash(row) + '</span>');
}

/** Set up (mint), not set up yet (amber); nothing where it is not known - a folder not looked at (V10b). */
function status(row: ProjectListRow): string {
  return row.setUp === undefined ? ''
    : row.setUp ? tag(inLanguages((t) => t('proj.setUp')), 'mint') : tag(inLanguages((t) => t('proj.notSetUp')), 'amber');
}

/** "Last used 2 hours ago", "…yesterday", "…Mon, Sep 21": as near as the moment is, in the page's clock. */
function lastUsed(at: number, now: number, clock: ReturnType<typeof localClock>, today: number): string {
  const since = Math.max(0, now - at);
  const day = clock(at).day;
  const ago = (t: Translate, lang: Parameters<typeof dayName>[1]): string =>
    since < MINUTE ? t('proj.ago.now')
      : since < HOUR ? t('proj.ago.minutes', { n: Math.floor(since / MINUTE) })
        : day.number === today ? t('proj.ago.hours', { n: Math.floor(since / HOUR) })
          : day.number === today - 1 ? t('proj.ago.yesterday')
            : dayName(day, lang);
  return inLanguages((t, lang) => t('proj.used', { when: ago(t, lang) }));
}

export const PROJECT_LIST_STYLE = String.raw`
.pjl{--pjl-columns:44px minmax(0,1fr) 164px 132px 52px}
.pjl-label{margin:22px 4px 10px;font-size:13.5px;font-weight:600;color:var(--text-3)}
.pjl-label:first-child{margin-top:4px}
.pjl-label-line{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:34px}
.pjl-label-line .pjl-label{margin-top:0}
.pjl-order{display:none}
.pjl[data-order="new"] .pjl-order-new,.pjl[data-order="az"] .pjl-order-az,.pjl[data-order="za"] .pjl-order-za{display:inline}
.pjl-sort{display:inline-flex;align-items:center;gap:9px;margin:-5px 0;padding:5px 11px;border:1px solid var(--white-14);border-radius:999px;background:var(--white-06);font:inherit;font-size:12.5px;font-weight:600;color:var(--text-2);cursor:pointer}
.pjl-sort:hover{color:var(--text);background:var(--white-10);border-color:var(--white-28)}
.pjl-sort:focus-visible{outline:2px solid var(--coral);outline-offset:1px}
.pjl-sort-word{color:var(--text)}
.pjl-sort-mark{padding:2px 8px;border-radius:999px;background:var(--white-08);font-size:11px;line-height:1.45;font-weight:650;letter-spacing:.02em;color:var(--text-2);white-space:nowrap}
.pjl-sort:hover .pjl-sort-mark{background:var(--white-14);color:var(--text)}
.pjl-head-actions{text-align:right}
.pjl-head-remove{text-align:center}
.pjl-search{width:200px;margin:0 0 8px;padding:7px 12px;border-radius:999px;border:1px solid var(--white-14);background:var(--card);color:var(--text);font:inherit;font-size:13.5px}
.pjl-search::placeholder{color:var(--text-3)}
.pjl-search:focus{outline:none;border-color:var(--white-32)}
.pjl [hidden]{display:none!important}
.pjl-here,.pjl-row{display:grid;grid-template-columns:var(--pjl-columns);gap:18px;align-items:center}
.pjl-here{grid-template-columns:44px minmax(0,1fr) auto;padding:18px 20px;border-radius:16px;background:var(--raised);border:1px solid var(--white-28)}
.pjl-here .pjl-action:empty{display:none}
.pjl-here-set{border-color:var(--mint-50);background:var(--mint-05)}
.pjl-here-set .pjl-mark{background:var(--mint-14);border-color:var(--mint-30);color:var(--mint)}
.pjl-table{border:1px solid var(--white-09);border-radius:16px;background:var(--card);overflow:hidden}
.pjl-heads{display:grid;grid-template-columns:var(--pjl-columns);gap:18px;padding:13px 20px;font-size:12.5px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--white-07)}
.pjl-rows{list-style:none;margin:0;padding:0}
.pjl-row{padding:14px 20px;border-top:1px solid var(--white-07)}
.pjl-rows>.pjl-row:first-child{border-top:0}
.pjl-mark{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--white-06);border:1px solid var(--white-10);color:var(--text);font-size:16px;font-weight:650}
.pjl-project{min-width:0;display:flex;flex-direction:column;gap:3px}
.pjl-name{font-size:16.5px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pjl-detail{font-size:14px;line-height:1.4;color:var(--text-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pjl-status{display:flex;align-items:center}
.pjl-action{display:flex;align-items:center;justify-content:flex-end}
.pjl-remove{display:flex;align-items:center;justify-content:center}
.pjl-trash{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:1px solid var(--white-09);border-radius:10px;background:none;color:var(--text-3);cursor:pointer}
.pjl-trash:hover{color:var(--coral-text);border-color:var(--coral-30);background:var(--coral-07)}
.pjl-trash:focus-visible{outline:2px solid var(--coral);outline-offset:1px}
.pjl-trash svg{width:18px;height:18px}
.pjl-picking .pjl-label{margin:18px 4px 8px}
.pjl-pick{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:16px;align-items:center;padding:13px 18px;cursor:pointer;transition:background .15s,border-color .2s}
.pjl-pick:hover{background:var(--white-04)}
.pjl-pick:has(:checked){background:var(--mint-05)}
.pjl-pick-here{border-radius:14px;background:var(--card);border:1px solid var(--white-09)}
.pjl-pick-here:has(:checked){border-color:var(--mint-50)}
.pjl-row-pick{border-top:1px solid var(--white-07)}
.pjl-rows>.pjl-row-pick:first-child{border-top:0}
.pjl-name-line{display:flex;align-items:center;gap:8px;min-width:0}
.pjl-picking .pjl-name{font-size:15.5px}
.pjl-picking .pjl-detail{font-size:13px;color:var(--text-3)}
.js .pjl-folded [data-pjl-extra]{display:none}
.pjl-more-line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid var(--white-07);font-size:13px}
.pjl-more{background:none;border:0;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:var(--text-soft);cursor:pointer}
.pjl-more:hover{color:var(--text)}
.js .pjl-picking:not(.pjl-folded) .pjl-more{display:none}
.pjl-hidden{color:var(--text-3);text-align:right}
.pjl-radio-input{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.pjl-radio{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--white-30);display:flex;align-items:center;justify-content:center;transition:border-color .2s,box-shadow .2s}
.pjl-radio-dot{width:11px;height:11px;border-radius:50%;transform:scale(0);transition:transform .2s cubic-bezier(.2,.9,.3,1.3),background .2s}
.pjl-radio-input:checked+.pjl-radio{border-color:var(--mint)}
.pjl-radio-input:checked+.pjl-radio .pjl-radio-dot{background:var(--mint);transform:scale(1)}
.pjl-radio-input:focus-visible+.pjl-radio{box-shadow:0 0 0 3px var(--coral-45)}
.pjl-foot,.pjl-none{margin:12px 4px 0;font-size:13px;line-height:1.5;color:var(--text-3)}
@media (max-width:720px){
.pjl{--pjl-columns:40px minmax(0,1fr) auto auto}
.pjl-search{width:150px}
.pjl-heads{display:none}
.pjl-here,.pjl-row,.pjl-pick{gap:6px 12px;padding:14px 16px}
.pjl-picking .pjl-pick{grid-template-columns:22px minmax(0,1fr)}
.pjl-picking .pjl-radio{grid-row:span 2}
.pjl-in{display:none}
.pjl-more-line{flex-direction:column;align-items:flex-start}.pjl-hidden{text-align:left}
.pjl-mark{width:40px;height:40px;grid-row:span 2}
/* Narrow: the name has the row to itself and its two controls stand beside the status under it, each in its own column
   still - at 390px a status pill and a pill beside it in the same line ran into each other (2026-10-06). */
.pjl-project{grid-column:2 / span 3}
.pjl-status{grid-column:2;grid-row:2}
.pjl-action{grid-column:3;grid-row:2;justify-content:flex-start}
.pjl-remove{grid-column:4;grid-row:2}
.pjl-row .pjl-detail{display:none}
.pjl-here .pjl-status{grid-row:auto}
}
/* A phone: a status pill and a pill beside it do not fit one line, so a row is the name, its status, and its two
   controls under them - one line each, the trash still in a column of its own (2026-10-06). */
@media (max-width:480px){
.pjl-row{gap:8px 12px}
.pjl-mark{grid-row:1 / span 3}
.pjl-project{grid-column:2 / span 2;grid-row:1}
.pjl-status{grid-column:2 / span 2;grid-row:2}
.pjl-action{grid-column:2;grid-row:3;justify-content:flex-start}
.pjl-remove{grid-column:3;grid-row:3}
}
`;

/**
 * The field narrows the rows to those whose name or place holds what is typed. Nothing matching is said, with the
 * words typed.
 */
export const PROJECT_LIST_SCRIPT = String.raw`
(() => {
  // The step's list: the rest of the projects, a click away.
  document.querySelectorAll('[data-pjl-more]').forEach((button) => button.addEventListener('click', () => {
    const list = button.closest('.pjl');
    if (list) list.classList.remove('pjl-folded');
  }));
  // A-Z, Z-A, newest first: the order the rows came in is kept, so the third press is not a guess at it.
  document.querySelectorAll('[data-pjl-sort]').forEach((button) => {
    const list = button.closest('.pjl');
    if (!list) return;
    const after = { new: 'az', az: 'za', za: 'new' };
    const groups = [...list.querySelectorAll('.pjl-table .pjl-rows')].map((rows) => ({ rows, came: [...rows.children] }));
    button.addEventListener('click', () => {
      const order = after[list.dataset.order] || 'az';
      list.dataset.order = order;
      groups.forEach(({ rows, came }) => {
        const put = came.slice();
        if (order !== 'new') {
          const way = order === 'az' ? 1 : -1;
          put.sort((one, two) => way * String(one.dataset.sortName || '').localeCompare(String(two.dataset.sortName || '')));
        }
        put.forEach((row) => rows.appendChild(row));
      });
    });
  });
  document.querySelectorAll('[data-project-search]').forEach((input) => {
    const list = input.closest('.pjl');
    if (!list) return;
    const rows = [...list.querySelectorAll('[data-search]')];
    const none = list.querySelector('[data-search-none]');
    const words = JSON.parse(input.getAttribute('data-search-words'));
    const said = () => words[document.documentElement.dataset.lang] || words.en;
    const place = () => { input.placeholder = said().placeholder; };
    place();
    const language = document.getElementById('lang');
    if (language) language.addEventListener('change', () => setTimeout(place, 0));
    input.addEventListener('input', () => {
      const typed = input.value.trim();
      const wanted = typed.toLowerCase();
      let found = 0;
      rows.forEach((row) => {
        const hit = wanted === '' || row.getAttribute('data-search').includes(wanted);
        row.hidden = !hit;
        if (hit) found += 1;
      });
      if (none) {
        none.hidden = wanted === '' || found > 0;
        none.textContent = said().none.replace('{q}', typed);
      }
    });
  });
})();
`;
