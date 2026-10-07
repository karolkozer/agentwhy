// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../render/html-report-components.ts';
import { inLanguages, LANGS, translator } from '../render/report-copy.ts';
import { PILL_TABS_STYLE } from '../render/ui/pill-tabs.ts';
import type { PageWindow } from '../render/ui/page-shell.ts';
import { COMPUTER_SCOPES } from '../../ports/computer-view.ts';
import type { SessionIndex } from './session-index.ts';

/**
 * `.ai/specs/2026-10-05-protected-everywhere.md` GD21, GD27: **Outside projects | Projects** at the top of the computer's
 * Conversations, To fix and This month - one choice for the three, and under it what the one shown is. No count: there
 * may be thousands (the maintainer, 2026-10-07). A choice is posted, kept, and every page drawn again with it; nothing is filtered in the
 * browser, so the counts in the sidebar never disagree with the page.
 */
export function scopeSwitch(index: SessionIndex): { readonly top?: PageWindow } {
  const view = index.computerView;
  if (index.scope !== 'computer' || view === undefined) return {};
  const pills = COMPUTER_SCOPES.map((scope) => {
    const on = scope === view.shown;
    return '<button type="button" class="tabs-pill' + (on ? ' tabs-on' : '') + '" aria-pressed="' + String(on) + '"' +
      (on ? '' : ' data-scope-to="' + scope + '"') + '>' + inLanguages((t) => t('cs.' + scope)) + '</button>';
  }).join('');
  const words = Object.fromEntries(LANGS.map((lang) => [lang, { failed: translator(lang)('cs.failed') }]));
  return {
    top: {
      html: '<div class="cs" data-scope data-scope-words="' + e(JSON.stringify(words)) + '">' +
        '<div class="tabs-bar" role="group" ' + 'aria-label="' + e(translator('en')('cs.label')) + '">' + pills + '</div>' +
        '<p class="cs-say">' + inLanguages((t) => t('cs.say.' + view.shown)) + '</p>' +
        '<p class="cs-failed" data-scope-say role="status" hidden></p></div>',
      styles: [PILL_TABS_STYLE, SCOPE_STYLE],
      scripts: [SCOPE_SCRIPT],
    },
  };
}

const SCOPE_STYLE = String.raw`
.cs{display:flex;align-items:center;gap:10px 18px;flex-wrap:wrap;margin:0 0 26px}
.cs .tabs-bar{display:flex;margin:0;background:var(--card);border:1px solid var(--white-09)}
.cs .tabs-pill{display:flex;align-items:center;gap:8px;padding:8px 16px;font-weight:600}
.cs-say{margin:0;font-size:13.5px;color:var(--text-3);max-width:52ch}
.cs-failed{flex-basis:100%;margin:0;font-size:13.5px;color:var(--coral-text)}
`;

/** The choice posted; the page read again once it is kept, and the server's words said where it is not. */
const SCOPE_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const to = event.target.closest('[data-scope-to]');
  if (!to) return;
  const bar = to.closest('[data-scope]');
  const words = JSON.parse(bar.dataset.scopeWords || '{}');
  const failed = (words[document.documentElement.dataset.lang] || words.en || {}).failed || '';
  to.disabled = true;
  fetch('api/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: to.dataset.scopeTo }) })
    .then((response) => response.text().then((text) => {
      let answer = {};
      try { answer = JSON.parse(text); } catch { answer = { message: text.trim() }; }
      return { ok: response.ok && answer.ok === true, message: answer.message || String(response.status) };
    }), () => ({ ok: false, message: '' }))
    .then((answer) => {
      if (answer.ok) { location.replace(location.pathname + '?at=' + Date.now() + location.hash); return; }
      to.disabled = false;
      const say = bar.querySelector('[data-scope-say]');
      say.textContent = (failed + ' ' + answer.message).trim();
      say.hidden = false;
    });
});
`;
