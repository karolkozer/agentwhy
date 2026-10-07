// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The report page's views (the report page spec P2, P45): one section per sidebar item. With a script the one the
 * address names is shown - the first where it names none - and its sidebar item is the active one; with none, every
 * view is on the page in sidebar order, and the sidebar's links go down to them.
 *
 * Only the report page has views today; it goes into the kit when a second page does (the plan's rule 2).
 */
export const REPORT_VIEWS_SCRIPT = String.raw`
(() => {
  const views = [...document.querySelectorAll('[data-view]')];
  if (views.length === 0) return;
  const links = [...document.querySelectorAll('.sb-nav a[href^="#"]')];
  const pick = () => {
    const wanted = views.find((view) => '#' + view.id === location.hash);
    if (!wanted && views.some((view) => view.classList.contains('rv-on'))) return false;
    const view = wanted || views[0];
    const already = view.classList.contains('rv-on');
    views.forEach((each) => each.classList.toggle('rv-on', each === view));
    links.forEach((link) => {
      const on = link.getAttribute('href') === '#' + view.id;
      link.classList.toggle('sb-active', on);
      if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    return !already;
  };
  pick();
  // The top of a view is where a view begins, so going to one starts at its top; an address that names something else
  // on the page - a window - changes no view, and must not move the page under it either.
  window.addEventListener('hashchange', () => { if (pick()) window.scrollTo(0, 0); });
})();
`;

export const REPORT_VIEWS_STYLE = String.raw`
.js [data-view]:not(.rv-on){display:none}
html:not(.js) [data-view]+[data-view]{margin-top:72px;padding-top:40px;border-top:1px solid var(--white-07)}
`;
