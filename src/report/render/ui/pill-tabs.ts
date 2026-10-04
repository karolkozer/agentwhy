// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The segmented pills of the design (Helpers Diagram · List, Advanced's two tables, a window's Story · Diagram · Full
 * record). With a script, one panel shows and the pills switch it; with none, every panel is on the page under its own
 * heading, in order (report page spec P45).
 *
 * `page` is the pill row a view carries; `inset` the darker one inside a window.
 */
export interface Tab {
  /** Already written in every language and escaped. */
  readonly label: string;
  readonly panel: string;
  /** A state dot before the label, on the `state` row (Settings: mint for on, grey for off). */
  readonly dot?: 'mint' | 'grey';
}

/** `state` is the page row whose pills say, with a dot, whether what each one opens is on (Settings). */
export function pillTabs(tabs: readonly Tab[], variant: 'page' | 'inset' | 'state', selected = 0, aside = ''): string {
  return '<div class="tabs" data-tabs>' + (aside === '' ? '' : '<div class="tabs-top">') +
    '<div class="tabs-bar tabs-' + variant + ' js-only" role="tablist">' + tabs.map((tab, at) =>
      '<button type="button" class="tabs-pill' + (at === selected ? ' tabs-on' : '') + '" role="tab" data-tab="' + at + '"' +
      ' aria-selected="' + String(at === selected) + '">' +
      (tab.dot === undefined ? '' : '<span class="tabs-dot tabs-dot-' + tab.dot + '" aria-hidden="true"></span>') + tab.label + '</button>').join('') + '</div>' +
    // Beside the pills, what belongs to the whole row rather than to one tab (To fix: "Your protection worked").
    (aside === '' ? '' : aside + '</div>') +
    tabs.map((tab, at) =>
      '<section class="tabs-panel' + (at === selected ? ' tabs-on' : '') + '" role="tabpanel" data-tab-panel="' + at + '">' +
      '<h3 class="tabs-fallback">' + tab.label + '</h3>' + tab.panel + '</section>').join('') +
    '</div>';
}

export const PILL_TABS_STYLE = String.raw`
.tabs-bar{display:flex;padding:3px;border-radius:999px;width:fit-content}
.js .tabs-bar.js-only{display:flex}
.tabs-page{background:var(--card);border:1px solid var(--white-09);margin-bottom:22px}
.tabs-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:22px}
.tabs-top .tabs-bar{margin-bottom:0}
.tabs-inset{gap:4px;background:var(--panel);border:1px solid var(--white-08);margin-bottom:24px}
.tabs-pill{border:none;border-radius:999px;font:inherit;font-size:14px;cursor:pointer;background:transparent;color:var(--text-2)}
.tabs-page .tabs-pill{padding:8px 18px;font-weight:600}
.tabs-inset .tabs-pill{padding:7px 16px;font-weight:500}
.tabs-state{padding:4px;background:var(--card);border:1px solid var(--white-09);margin-bottom:22px}
.tabs-state .tabs-pill{display:flex;align-items:center;gap:8px;padding:9px 18px;font-size:14.5px;font-weight:600;white-space:nowrap}
@media (max-width:420px){.tabs-state .tabs-pill{padding:9px 13px}}
.tabs-dot{width:7px;height:7px;border-radius:50%}.tabs-dot-mint{background:var(--mint)}.tabs-dot-grey{background:var(--white-25)}
.tabs-pill.tabs-on{background:var(--text);color:var(--bg)}
.js .tabs-panel:not(.tabs-on){display:none}
.tabs-fallback{margin:24px 0 12px;font-size:16px;font-weight:650}
.js .tabs-fallback{display:none}
`;

/** Switches the panel of the tab row it was pressed in, and nothing else. */
export const PILL_TABS_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (!tab) return;
  const group = tab.closest('[data-tabs]');
  const at = tab.getAttribute('data-tab');
  // The pills are the row's own, whether or not something stands beside them (an aside, in .tabs-top).
  group.querySelectorAll(':scope > .tabs-bar [data-tab], :scope > .tabs-top > .tabs-bar [data-tab]').forEach((each) => {
    const on = each === tab;
    each.classList.toggle('tabs-on', on);
    each.setAttribute('aria-selected', String(on));
  });
  group.querySelectorAll(':scope > [data-tab-panel]').forEach((panel) => panel.classList.toggle('tabs-on', panel.getAttribute('data-tab-panel') === at));
});
`;
