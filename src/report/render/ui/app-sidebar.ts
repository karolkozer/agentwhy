// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { BRAND_MARK } from './brand-mark.ts';
import { opens } from './popup.ts';
import { DEFAULT_LANG, inLanguages, LANG_NAMES, LANGS, labelAttributes } from '../report-copy.ts';

/** One page the sidebar leads to. */
export interface NavItem {
  /** The word key of its name. */
  readonly name: string;
  readonly href: string;
  readonly active?: boolean;
  /** Absent or zero draws no count: a number says there is something in there to act on. */
  readonly count?: number;
  /** Coral for a count that asks for something to be done (To fix), grey for one that only says how many. */
  readonly countTone?: 'plain' | 'coral';
}

export interface Sidebar {
  /** The project's folder name, or absent on a shared page, which names no machine. */
  readonly project?: string;
  /** Where the folder is - `~/Projects/shop` - drawn under its name (`which-project.md` V1). Absent: the name alone. */
  readonly place?: string;
  /**
   * The window of the person's projects, where the page has one (`which-project.md` V2): the card becomes a button that
   * opens it. Absent: the card only says which project this is.
   */
  readonly projectsWindow?: string;
  /** False draws no project card at all: a page that does not know its project - a report written on its own. */
  readonly showProject?: boolean;
  readonly home: string;
  readonly items: readonly NavItem[];
}

/**
 * The column every page of the new design carries (design file *agentwhy Sessions v2*): the mark and wordmark, the
 * project, the pages, and the one standing fact about where the work happens. The mark is the knot the reports
 * already carry (`BRAND_MARK`), kept at the maintainer's request over the design file's wordmark alone.
 */
export function appSidebar(spec: Sidebar): string {
  const link = spec.project !== undefined && spec.projectsWindow !== undefined;
  return '<aside class="sb">' +
    '<a class="sb-brand" href="' + spec.home + '" aria-label="agentwhy">' + BRAND_MARK + '<span class="sb-word">agent<span class="sb-why">why</span></span></a>' +
    // One line for the name, as every other row of the column is one line: a long folder name ends in an ellipsis and
    // is whole on hover, rather than breaking at a hyphen over two lines of heavier type than the items under it. The
    // place under it is cut the same way, and the tooltip holds it whole, since it says which folder this is.
    (spec.showProject === false ? '' :
      (link ? '<a class="sb-project sb-project-link"' + opens(spec.projectsWindow) : '<div class="sb-project"') +
      (spec.project === undefined ? '' : ' title="' + e(spec.place ?? spec.project) + '"') + '>' +
      '<span class="sb-project-mark" aria-hidden="true">' + (spec.project === undefined ? '↗' : e(initial(spec.project))) + '</span>' +
      '<span class="sb-project-text"><span class="sb-project-label">' +
      inLanguages((t) => t(spec.project === undefined ? 'app.shared' : 'app.project')) + '</span>' +
      (spec.project === undefined ? '' : '<span class="sb-project-name">' + e(spec.project) + '</span>') +
      (spec.project === undefined || spec.place === undefined ? '' : '<span class="sb-project-place">' + e(spec.place) + '</span>') +
      '</span>' + (link ? '<span class="sb-project-go" aria-hidden="true">›</span></a>' : '</div>')) +
    '<nav class="sb-nav"' + labelAttributes((t) => t('app.nav')) + '>' + spec.items.map(item).join('') + '</nav>' +
    '<div class="sb-foot">' + support() +
    '<select class="sb-lang js-only" id="lang"' + labelAttributes((t) => t('app.lang')) + '>' +
    LANGS.map((lang) => '<option value="' + lang + '"' + (lang === DEFAULT_LANG ? ' selected' : '') + '>' + LANG_NAMES[lang] + '</option>').join('') +
    '</select>' +
    '<div class="sb-local"><span class="sb-dot" aria-hidden="true"></span><span>' + inLanguages((t) => t('app.local')) + '</span></div>' +
    '</div></aside>';
}

/**
 * Where a person can support agentwhy (F7, added 2026-10-05 by the maintainer): the project's sponsors page, and its
 * page for companies. Plain links, opened in a new tab with no referrer, as F23's provider links are - a served page's
 * address holds its token - so the page still makes no request of its own, and "Nothing is uploaded" stays true.
 */
const SUPPORT: readonly { readonly name: string; readonly href: string; readonly main?: boolean }[] = [
  { name: 'app.support.sponsor', href: 'https://www.agentwhy.dev/sponsors.html', main: true },
  { name: 'app.support.companies', href: 'https://www.agentwhy.dev/companies.html' },
];

/** The only addresses outside the page any page holds: each a link a person may click, never a request (F7). */
export const SUPPORT_ADDRESSES: readonly string[] = SUPPORT.map((link) => link.href);

/**
 * Quiet by design (the maintainer, 2026-10-05: "subtle, not in the user's eyes, premium"): two small links in the
 * column's muted grey, no card, no colour and no count, that brighten only under the pointer - the page's work stays
 * the one thing that asks for attention (guidelines §1).
 */
function support(): string {
  return '<div class="sb-support">' +
    SUPPORT.map((link) => '<a class="sb-support-link' + (link.main === true ? ' sb-support-main' : '') + '" href="' + link.href + '"' +
      ' target="_blank" rel="noopener noreferrer"><span>' + inLanguages((t) => t(link.name)) + '</span><span class="sb-support-go" aria-hidden="true">↗</span></a>').join('') +
    '</div>';
}

/** The first letter or digit of a folder's name, for its mark: `test-project` is T, `_scratch` is S. */
export function initial(name: string): string {
  return (/[\p{L}\p{N}]/u.exec(name)?.[0] ?? '·').toUpperCase();
}

function item(nav: NavItem): string {
  const count = nav.count === undefined || nav.count === 0 ? '' :
    '<span class="sb-count' + (nav.countTone === 'coral' ? ' sb-count-coral' : '') + '">' + nav.count + '</span>';
  return '<a class="sb-item' + (nav.active === true ? ' sb-active' : '') + '" href="' + nav.href + '"' +
    (nav.active === true ? ' aria-current="page"' : '') + '><span>' + inLanguages((t) => t(nav.name)) + '</span>' + count + '</a>';
}

export const APP_SIDEBAR_STYLE = String.raw`
.sb{flex:none;width:232px;display:flex;flex-direction:column;border-right:1px solid var(--white-07);padding:22px 14px;position:sticky;top:0;height:100vh;z-index:1}
.sb-brand{display:flex;align-items:center;gap:9px;padding:0 10px 22px;color:var(--coral)}
.sb-brand:hover{color:var(--coral)}
.sb-brand .brand-mark{width:24px;height:24px;flex:none}
.sb-word{font-size:21px;font-weight:650;letter-spacing:-0.02em;color:var(--text)}
.sb-why{color:var(--coral)}
.sb-project{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--card);border:1px solid var(--white-09);margin-bottom:22px}
.sb-project-link{color:inherit;transition:background .15s,border-color .15s}
.sb-project-link:hover{color:inherit;background:var(--raised);border-color:var(--white-16)}
.sb-project-go{margin-left:auto;flex:none;align-self:center;color:var(--text-3);font-size:18px;line-height:1}
.sb-project-link:hover .sb-project-go{color:var(--text)}
.sb-project-mark{flex:none;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--white-06);border:1px solid var(--white-10);color:var(--text);font-size:13px;font-weight:650}
.sb-project-text{min-width:0;display:flex;flex-direction:column;gap:1px}
.sb-project-label{font-size:12px;font-weight:600;color:var(--text-3)}
.sb-project-name{font-size:14px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-project-place{font-family:var(--mono);font-size:12.5px;line-height:1.4;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-nav{display:flex;flex-direction:column;gap:4px}
.sb-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid transparent;color:var(--text-2);font-size:15px;font-weight:500}
.sb-item:hover{color:var(--text);background:var(--white-02)}
.sb-active{background:var(--coral-08);border-color:var(--coral-30);color:var(--text)}
.sb-active:hover{background:var(--coral-08)}
.sb-count{font-size:12.5px;font-weight:600;border-radius:999px;padding:2px 8px;color:var(--text-2);background:var(--white-06)}
.sb-count-coral{color:var(--on-coral);background:var(--coral)}
.sb-foot{margin-top:auto;display:flex;flex-direction:column;gap:14px}
.sb-lang{align-self:flex-start;margin:0 10px;background:var(--card);color:var(--text-2);border:1px solid var(--white-10);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px}
.sb-local{padding:16px 10px 0;border-top:1px solid var(--white-07);display:flex;gap:10px;font-size:13px;line-height:1.5;color:var(--text-2)}
.sb-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--mint);margin-top:6px}
.sb-support{display:flex;flex-direction:column;gap:2px;padding:0 10px}
.sb-support-link{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:3px 0;font-size:12.5px;font-weight:500;letter-spacing:0.01em;color:var(--text-3);transition:color .15s}
.sb-support-link:hover{color:var(--text-soft)}
.sb-support-main:hover{color:var(--coral-text)}
.sb-support-go{font-size:11px;opacity:.7;transition:transform .15s}
.sb-support-link:hover .sb-support-go{transform:translate(1px,-1px)}
@media (max-width:860px){
.sb{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--white-07);padding:16px}
.sb-brand{padding:0 4px 14px}.sb-project{margin-bottom:12px}
.sb-nav{flex-direction:row;overflow-x:auto;gap:6px}.sb-item{white-space:nowrap}
.sb-foot{flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 14px;margin-top:12px}.sb-local{border-top:0;padding:0}.sb-lang{margin:0}
.sb-support{flex-direction:row;flex-wrap:wrap;gap:4px 16px;padding:0;flex-basis:100%}
}
`;
