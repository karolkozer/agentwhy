// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PACKAGE } from '../../../shared/package-name.ts';
import { escapeHtml } from '../html-report-components.ts';
import { inLanguages, labelAttributes } from '../report-copy.ts';
import { closeButton, pill } from './button.ts';
import { confirmDialog } from './confirm-dialog.ts';

/**
 * That the project's hooks run an older release than the agentwhy writing the page (`nothing-updates-by-itself.md`
 * U2), as the notice needs it: both releases, and whether the hooks run from the file everyone on the project shares.
 */
export interface UpdateNotice {
  readonly from: string;
  readonly to: string;
  readonly shared: boolean;
}

const WINDOW = 'upd-confirm';

/** An upward arrow in a circle: an update is neither a problem nor a safe state, so it is drawn in neither colour (U5). */
const ARROW =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/**
 * The notice every page `start` serves draws while the project's hooks are behind (U4-U10): top right, like a system
 * notification; **Update to X** opens the kit's confirmation window (U6, UD2) and posts `update` (U7); **Not now** hides
 * it for this run (U9, UD1). Without a script, as a file, or once the server has gone, it shows the command a terminal
 * runs instead of buttons that could not work (U10). Everything it can say is written here, in every language, so the
 * script only shows and hides.
 */
export function updateNotice(spec: UpdateNotice): string {
  const from = escapeHtml(spec.from);
  const to = escapeHtml(spec.to);
  const command = 'npx ' + PACKAGE + '@' + to + ' init --update';
  const sentence = spec.shared ? 'upd.sentence.shared' : 'upd.sentence';
  return '<aside class="upd" data-update-notice data-update-to="' + to + '" aria-labelledby="upd-title">' +
    '<div class="upd-card">' +
    closeButton(' data-upd-later' + labelAttributes((t) => t('app.close')), 'sm') +
    '<div class="upd-head"><span class="upd-mark">' + ARROW + '</span><div>' +
    '<p class="upd-title" id="upd-title">' + inLanguages((t) => t('upd.title')) + '</p>' +
    '<p class="upd-sentence">' + inLanguages((t) => t(sentence, { from })) + '</p>' +
    '</div></div>' +
    '<div class="upd-actions">' +
    pill({ label: inLanguages((t) => t('upd.update', { to })), tone: 'light', button: true, attributes: ' data-upd-update data-popup-open="' + WINDOW + '"' }) +
    pill({ label: inLanguages((t) => t('upd.later')), tone: 'outline', button: true, attributes: ' data-upd-later' }) +
    '</div>' +
    '<p class="upd-say" data-upd-say="saving" hidden>' + inLanguages((t) => t('upd.saving')) + '</p>' +
    '<p class="upd-say upd-say-bad" data-upd-say="refused" hidden>' + inLanguages((t) => t('upd.refused')) + ' <span data-upd-reason></span></p>' +
    '<p class="upd-say upd-say-bad" data-upd-say="unreachable" hidden>' + inLanguages((t) => t('upd.unreachable')) + '</p>' +
    '<div class="upd-command"><p>' + inLanguages((t) => t('upd.command')) + '</p>' +
    '<div class="upd-line"><code data-upd-line>' + command + '</code>' +
    pill({
      label: '<span data-upd-copy-label>' + inLanguages((t) => t('upd.copy')) + '</span><span data-upd-copied hidden>' + inLanguages((t) => t('upd.copied')) + '</span>',
      tone: 'outline',
      size: 'sm',
      button: true,
      attributes: ' data-upd-copy',
    }) +
    '</div></div>' +
    '<div class="upd-done"><span class="upd-check">' + CHECK + '</span><p>' + inLanguages((t) => t('upd.done', { to })) + '</p></div>' +
    '</div></aside>' +
    confirmDialog({
      id: WINDOW,
      title: inLanguages((t) => t('upd.confirm.title')),
      subject: '<span class="upd-ver">' + from + '</span><span class="upd-arrow" aria-hidden="true">→</span><span class="upd-ver upd-ver-new">' + to + '</span>',
      sentence: inLanguages((t) => t(spec.shared ? 'upd.confirm.sentence.shared' : 'upd.confirm.sentence', { to })),
      option: '',
      cancel: inLanguages((t) => t('app.cancel')),
      confirm: inLanguages((t) => t('upd.confirm.do')),
      confirmAttributes: ' data-upd-confirm',
      glyph: ARROW,
    });
}

export const UPDATE_NOTICE_STYLE = String.raw`
.upd{position:fixed;top:calc(24px + env(safe-area-inset-top));right:24px;z-index:25;width:360px;max-width:calc(100% - 32px);animation:upd-in .2s ease-out}
.upd[hidden]{display:none}
@keyframes upd-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
@keyframes upd-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.upd-card{position:relative;padding:18px 18px 16px;border-radius:18px;background:var(--popup);border:1px solid var(--white-10);box-shadow:0 24px 70px var(--shadow)}
.upd-card>.close{position:absolute;top:12px;right:12px;width:30px;height:30px;font-size:16px}
.upd-head{display:flex;gap:14px;padding-right:34px}
.upd-mark{flex:none;width:36px;height:36px;border-radius:50%;background:var(--white-08);border:1px solid var(--white-12);color:var(--text);display:flex;align-items:center;justify-content:center}
.upd-title{margin:1px 0 6px;font-size:15.5px;font-weight:600;line-height:1.35;text-wrap:balance}
.upd-sentence{margin:0;font-size:14px;line-height:1.5;color:var(--text-2);text-wrap:pretty}
.upd-actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0 50px}
.upd-say{margin:10px 0 0 50px;font-size:13.5px;line-height:1.45;color:var(--text-2)}
.upd-say-bad{color:var(--coral-text)}
.upd-command{display:none;margin:14px 0 0 50px}
.upd-command p{margin:0 0 8px;font-size:13.5px;color:var(--text-2)}
.upd-line{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-radius:10px;background:var(--raised);border:1px solid var(--white-09)}
.upd-line code{flex:1;min-width:0;font-family:var(--mono);font-size:12.5px;line-height:1.5;color:var(--text-soft);overflow-wrap:anywhere}
.upd-done{display:none;align-items:center;gap:12px}
.upd-done p{margin:0;font-size:14.5px;line-height:1.45;color:var(--text)}
.upd-check{flex:none;width:36px;height:36px;border-radius:50%;background:var(--mint-14);color:var(--mint);display:flex;align-items:center;justify-content:center}
.upd[data-state="command"] .upd-actions{display:none}
.upd[data-state="command"] .upd-command{display:block}
.upd[data-state="done"] .upd-head,.upd[data-state="done"] .upd-actions,.upd[data-state="done"] .upd-card>.close,.upd[data-state="done"] .upd-command,.upd[data-state="done"] .upd-say{display:none}
.upd[data-state="done"] .upd-done{display:flex}
html:not(.js) .upd-actions,html:not(.js) .upd-card>.close,html:not(.js) [data-upd-copy]{display:none}
html:not(.js) .upd-command{display:block}
#upd-confirm .cf-mark{background:var(--white-08);color:var(--text)}
.upd-ver{display:inline-block;font-family:var(--mono);font-size:13px;padding:4px 10px;border-radius:8px;background:var(--white-06);border:1px solid var(--white-10);color:var(--text-2)}
.upd-ver-new{color:var(--text);border-color:var(--white-25)}
.upd-arrow{margin:0 10px;color:var(--text-3)}
@media (max-width:640px){.upd{top:auto;right:16px;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:auto;max-width:none;animation-name:upd-up}}
@media (prefers-reduced-motion:reduce){.upd{animation:none}}
`;

/**
 * The notice's behaviour (U6-U10). Not now is kept in the browser under the run's token, so the next run of agentwhy -
 * a new token - shows it again (UD1). The update is the page's one write of it, posted like every Settings write; a
 * page that cannot post (a file, or a server that has gone) shows the command instead.
 */
export const UPDATE_NOTICE_SCRIPT = String.raw`
(() => {
  const notice = document.querySelector('[data-update-notice]');
  if (!notice) return;
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const later = 'agentwhy.update.later';
  const mark = (served ? location.pathname.split('/')[1] || '' : '') + ':' + notice.dataset.updateTo;
  try { if (localStorage.getItem(later) === mark) { notice.hidden = true; return; } } catch (e) {}
  const asCommand = () => { if (notice.dataset.state !== 'done') notice.dataset.state = 'command'; };
  if (!served) asCommand();
  const gone = document.querySelector('[data-live-stopped]');
  if (gone) new MutationObserver(() => { if (!gone.hidden) asCommand(); }).observe(gone, { attributes: true, attributeFilter: ['hidden'] });
  const say = (which) => notice.querySelectorAll('[data-upd-say]').forEach((line) => { line.hidden = line.dataset.updSay !== which; });
  notice.querySelectorAll('[data-upd-later]').forEach((button) => button.addEventListener('click', () => {
    notice.hidden = true;
    try { localStorage.setItem(later, mark); } catch (e) {}
  }));
  const confirm = document.querySelector('[data-upd-confirm]');
  const update = notice.querySelector('[data-upd-update]');
  if (confirm && update) confirm.addEventListener('click', () => {
    const dialog = confirm.closest('dialog');
    if (dialog) dialog.close();
    update.disabled = true;
    say('saving');
    fetch('api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ change: 'update' }) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok, message: answer.message || '' })))
      .catch(() => ({ ok: false, unreachable: true, message: '' }))
      .then((answer) => {
        update.disabled = false;
        if (answer.ok) {
          say('');
          notice.dataset.state = 'done';
          setTimeout(() => { notice.hidden = true; }, 6000);
          return;
        }
        notice.querySelector('[data-upd-reason]').textContent = answer.message;
        say(answer.unreachable ? 'unreachable' : 'refused');
      });
  });
  const copy = notice.querySelector('[data-upd-copy]');
  if (copy && navigator.clipboard) copy.addEventListener('click', () => {
    navigator.clipboard.writeText(notice.querySelector('[data-upd-line]').textContent).then(() => {
      copy.querySelector('[data-upd-copy-label]').hidden = true;
      copy.querySelector('[data-upd-copied]').hidden = false;
    }, () => {});
  });
})();
`;
