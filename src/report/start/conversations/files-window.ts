// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FILES_SCRIPT, FILES_VIEW_STYLE } from '../../render/report-page/files-view.ts';
import { HELPERS_SCRIPT, HELPERS_VIEW_STYLE } from '../../render/report-page/helpers-view.ts';
import { STORY_WINDOW_STYLE } from '../../render/report-page/story-window.ts';
import { AVATAR_STYLE } from '../../render/ui/avatar.ts';
import { PILL_TABS_SCRIPT, PILL_TABS_STYLE } from '../../render/ui/pill-tabs.ts';
import { STAT_STYLE } from '../../render/ui/stats.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { closeButton, pill } from '../../render/ui/button.ts';
import { LABELLED_SELECT_STYLE } from '../../render/ui/labelled-select.ts';
import { CLOSES, popup, popupFoot, POPUP_SCRIPT, POPUP_STYLE } from '../../render/ui/popup.ts';
import { TAG_STYLE } from '../../render/ui/tag.ts';

const ID = 'conv-files';

/**
 * Every file of one conversation, in a window (`for-people-who-build-with-ai.md` F58; O15 decided (b)): one window on
 * the page, empty until a row's "See all {n} files" opens it - on Conversations, or in a day's window on This month,
 * over which it opens. What it shows is not written here - it is the Files section
 * of that conversation's report, read from the server that serves both, so the window and the report's tab are one
 * view and cannot drift apart. Above it, what the person asked and when; under it, the way to the whole report.
 */
export function filesWindow(): string {
  return popup({
    id: ID,
    size: 'wide',
    labelledBy: ID + '-title',
    body: '<div class="cwf-head"><p class="cwf-ask" id="' + ID + '-title">' +
      inLanguages((t) => t('conv.files.asked', { ask: '<span data-files-ask></span>', when: '<span data-files-when></span>' })) + '</p>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
      '<p class="cwf-loading" data-files-loading>' + inLanguages((t) => t('conv.files.loading')) + '</p>' +
      '<div class="cwf-body" data-files-body></div>' +
      // The windows of the files above, brought from the report with them; each opens over this one.
      '<div data-files-windows></div>' +
      popupFoot(inLanguages((t) => t('conv.files.note')),
        pill({ label: inLanguages((t) => t('app.close')), tone: 'outline', size: 'md', button: true, attributes: CLOSES }) +
        pill({ label: inLanguages((t) => t('conv.files.full')), tone: 'outline', size: 'md', href: '#', attributes: ' data-files-full' })),
  });
}

/**
 * The maintainer's 2026-09-25 look: a little wider and taller than the kit's wide window, so the Files tab it holds
 * has the whole width to itself.
 */
const FILES_WINDOW_STYLE = String.raw`
dialog#${ID}{max-width:1320px;max-height:calc(100vh - 64px);margin-top:32px}
.cwf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:28px 40px 0}
.cwf-ask{margin:8px 0 0;font-size:14.5px;line-height:1.5;color:var(--text-2)}
.cwf-ask [data-files-ask]{color:var(--text);font-weight:600}
.cwf-loading{margin:0;padding:64px 40px;text-align:center;font-size:14px;color:var(--text-3)}
.cwf-loading[hidden]{display:none}
.cwf-body{padding:12px 40px 36px}
.cwf-body:empty{display:none}
.cwf-body .fl{max-width:none}
.cwf-body .fl .hero{margin-bottom:26px}
.cwf-body .fl .hero-fact,.cwf-body .fl .hero-action{font-size:34px}
#${ID} .pp-foot{padding:18px 40px}
@media (max-width:640px){dialog#${ID}{margin-top:16px;max-height:calc(100vh - 32px)}.cwf-head{padding:18px 18px 0}.cwf-body{padding:4px 18px 20px}.cwf-body .fl .hero-fact,.cwf-body .fl .hero-action{font-size:24px}#${ID} .pp-foot{padding:14px 18px}}
`;

/**
 * Opens the window from a row's "See all {n} files", on a served page only: opened as a file, the page can read nothing
 * beside it, and the button is the link it is written as. The report's Files section is taken as it is, with four
 * changes: a row opens the window it opens on the report - what happened to that file, its story, diagram and record -
 * brought over with it and opened here, over this one (the maintainer, 2026-09-25: a row that opened the report took
 * the person off this page and out of the list they were reading; then, that every file opens that window), and a row
 * whose window is not there leads nowhere and does not light up as a link; a link inside it or its window
 * that names a place on the report (`#file-3`, `#protect-2`) leads to that place on the report, which opens the window
 * it names (`POPUP_SCRIPT`); nothing in it is marked for a live update of this page to keep or light (`LIVE_SCRIPT`
 * counts what this page marks); and no id of it is carried over, so none can stand twice. A read that fails follows
 * the link instead.
 */
const CONVERSATION_FILES_SCRIPT = String.raw`
(() => {
  const dialog = document.getElementById('${ID}');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const body = dialog.querySelector('[data-files-body]');
  const loading = dialog.querySelector('[data-files-loading]');
  const full = dialog.querySelector('[data-files-full]');
  const held = dialog.querySelector('[data-files-windows]');
  let asked = 0;
  // A file's window closing is not this one closing: only this one's own close clears what it holds.
  dialog.addEventListener('close', (event) => {
    if (event.target !== dialog) return;
    asked += 1;
    body.replaceChildren();
    if (held) held.replaceChildren();
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-all-files]');
    if (!button || (location.protocol !== 'http:' && location.protocol !== 'https:')) return;
    event.preventDefault();
    event.stopPropagation();
    const report = button.dataset.allFiles;
    const row = button.closest('.dt-row');
    const part = (selector) => (row && row.querySelector(selector) ? row.querySelector(selector).innerHTML : '');
    dialog.querySelectorAll('[data-files-ask]').forEach((element) => { element.innerHTML = part('.cw-ask'); });
    dialog.querySelectorAll('[data-files-when]').forEach((element) => { element.innerHTML = part('.cw-when') + ', ' + part('.cw-time'); });
    if (full) full.setAttribute('href', report + '#files');
    body.replaceChildren();
    loading.hidden = false;
    dialog.opener = button;
    dialog.showModal();
    const mine = ++asked;
    fetch(report, { cache: 'no-store' })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((html) => {
        if (mine !== asked) return;
        const page = new DOMParser().parseFromString(html, 'text/html');
        const files = page.getElementById('files');
        if (!files) throw new Error('no Files section');
        // Each row's window, taken before any id is dropped, under an id of this page's own.
        const windows = [];
        files.querySelectorAll('.dt-link').forEach((link) => {
          const target = link.getAttribute('data-popup-open') || (link.getAttribute('href') || '').replace(/^#/, '');
          const found = target ? page.getElementById(target) : null;
          if (!found || found.tagName !== 'DIALOG') {
            const row = link.closest('.dt-linked');
            if (row) row.classList.remove('dt-linked');
            link.remove();
            return;
          }
          const id = 'cwf-window-' + windows.length;
          link.setAttribute('href', '#' + id);
          link.setAttribute('data-cwf-open', id);
          const title = found.getAttribute('aria-labelledby');
          const heading = title ? found.querySelector('[id="' + title + '"]') : null;
          if (heading) heading.setAttribute('data-cwf-title', '');
          windows.push({ found, id });
        });
        // What is left leads to the report: a link that names a place on it goes there, where that window opens.
        const detach = (root) => {
          root.querySelectorAll('a[href^="#"]:not([data-cwf-open])').forEach((link) => link.setAttribute('href', report + link.getAttribute('href')));
          root.querySelectorAll('[data-popup-open]').forEach((element) => element.removeAttribute('data-popup-open'));
          root.querySelectorAll('[data-live-keep],[data-live-key]').forEach((element) => {
            element.removeAttribute('data-live-keep');
            element.removeAttribute('data-live-key');
          });
          root.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
        };
        detach(files);
        files.querySelectorAll('[data-cwf-open]').forEach((link) => link.setAttribute('data-popup-open', link.getAttribute('data-cwf-open')));
        windows.forEach(({ found, id }) => {
          detach(found);
          found.id = id;
          found.setAttribute('aria-labelledby', id + '-title');
          const heading = found.querySelector('[data-cwf-title]');
          if (heading) heading.id = id + '-title';
        });
        const lang = document.documentElement.dataset.lang || 'en';
        files.querySelectorAll('[data-placeholder-' + lang + ']').forEach((field) => { field.placeholder = field.getAttribute('data-placeholder-' + lang); });
        loading.hidden = true;
        body.replaceChildren(...[...document.importNode(files, true).childNodes]);
        if (held) held.replaceChildren(...windows.map(({ found }) => document.importNode(found, true)));
        if (window.agentwhyFiles) window.agentwhyFiles(body);
        if (held && window.agentwhyDiagrams) window.agentwhyDiagrams(held);
      })
      .catch(() => {
        if (mine !== asked) return;
        dialog.close();
        location.href = button.getAttribute('href');
      });
  });
})();
`;

/**
 * What the window needs beyond the period pages' own: the kit's window, the report's Files view it shows, and a file's
 * "What happened" window - its tabs, avatars, numbers and diagram - which opens over it.
 */
export const FILES_WINDOW_STYLES: readonly string[] = [POPUP_STYLE, TAG_STYLE, LABELLED_SELECT_STYLE, FILES_VIEW_STYLE, PILL_TABS_STYLE, AVATAR_STYLE,
  STAT_STYLE, HELPERS_VIEW_STYLE, STORY_WINDOW_STYLE, FILES_WINDOW_STYLE];
export const FILES_WINDOW_SCRIPTS: readonly string[] = [POPUP_SCRIPT, PILL_TABS_SCRIPT, HELPERS_SCRIPT, FILES_SCRIPT, CONVERSATION_FILES_SCRIPT];
