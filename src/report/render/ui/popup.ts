// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { stars } from './backdrop.ts';

/**
 * A window over the page (guidelines §4 "Popup"): a native `<dialog>`, so the browser gives it the backdrop, Escape and a
 * focus that stays inside it. What opens one is a link to its id; with a script the link opens it as a modal, and with
 * none the link still goes there and the window is drawn in the page where it stands (report page spec P45).
 *
 * Sizes are the design file's: `wide` 1200px (what happened to a file), `wizard` 640px (Fix it), `small` 560px (a
 * simple file), `pick` 520px (Add a private file), `confirm` 460px (Protect this file?), `list` 800px (switching
 * projects, as the maintainer's design of 2026-09-28 draws it). A wide window is warmed at the
 * top by the glow the page itself carries, and dotted with its points (`backdrop.ts`; the maintainer, 2026-09-25),
 * both scrolling with its content so they stay behind the heading and never show through a table or a card.
 */
export type PopupSize = 'wide' | 'wizard' | 'small' | 'pick' | 'confirm' | 'list';

export interface Popup {
  /** An id the page chose from its own counters, never from transcript text. */
  readonly id: string;
  readonly size: PopupSize;
  /** The id of the heading inside that names the window. */
  readonly labelledBy: string;
  /** The window's content: its head, body and foot, built by the page from the parts below. */
  readonly body: string;
}

export function popup(spec: Popup): string {
  const sky = spec.size === 'wide' ? '<div class="pp-sky" aria-hidden="true">' + stars(34) + '</div>' : '';
  return '<dialog class="pp pp-' + spec.size + '" id="' + spec.id + '" aria-labelledby="' + spec.labelledBy + '">' + sky + spec.body + '</dialog>';
}

/** What a link or button needs to open a window: its address with no script, and the id the script opens. */
export function opens(id: string): string {
  return ' href="#' + id + '"' + opener(id);
}

/** Only the id the script opens, for a control that has its address already (a pill given `href: '#' + id`). */
export function opener(id: string): string {
  return ' data-popup-open="' + id + '"';
}

/** What a control needs to close the window it sits in. */
export const CLOSES = ' data-popup-close';

/** The strip at the bottom of a window: a grey note on the left, its actions on the right. */
export function popupFoot(note: string, actions: string, tight = false): string {
  return '<div class="pp-foot' + (tight ? ' pp-foot-tight' : '') + '"><span class="pp-note">' + note + '</span>' +
    '<span class="pp-actions">' + actions + '</span></div>';
}

export const POPUP_STYLE = String.raw`
dialog.pp{padding:0;border:1px solid var(--white-09);border-radius:22px;background:var(--popup);color:var(--text);box-shadow:0 40px 120px var(--shadow);width:calc(100% - 40px);max-width:1200px;max-height:calc(100vh - 96px);overflow:auto;margin:48px auto auto}
dialog.pp-wide{background:radial-gradient(900px 300px at 35% -60px,var(--coral-08) 0%,transparent 70%) no-repeat local,radial-gradient(1200px 480px at 50% -120px,var(--glow) 0%,var(--glow-mid) 55%,transparent 100%) no-repeat local,var(--popup)}
dialog.pp-wide{isolation:isolate}
.pp-sky{position:absolute;left:0;right:0;top:0;height:min(100%,900px);z-index:-1;pointer-events:none;overflow:hidden}
html:not(.js) dialog.pp-wide:target{position:relative}
dialog.pp::backdrop{background:var(--backdrop);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
dialog.pp-wizard{max-width:640px;margin-top:56px;max-height:calc(100vh - 112px)}
dialog.pp-list{max-width:800px;margin-top:56px;max-height:calc(100vh - 112px)}
dialog.pp-small,dialog.pp-pick,dialog.pp-confirm{border-color:var(--white-10);border-radius:20px;margin:auto}
dialog.pp-small{max-width:560px}dialog.pp-pick{max-width:520px}dialog.pp-confirm{max-width:460px}
html:not(.js) dialog.pp:target{display:block;position:static;margin:24px auto;max-height:none}
.pp-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 32px;border-top:1px solid var(--white-07);background:var(--popup-foot)}
.pp-foot-tight{padding:16px 24px}
.pp-note{font-size:13px;color:var(--text-3)}
.pp-actions{display:flex;gap:10px;align-items:center}
@media (max-width:640px){dialog.pp{margin-top:16px;width:calc(100% - 20px)}.pp-foot{padding:14px 18px}}
`;

/**
 * Opens a window from its link, closes it from any control marked to, and from a click on the backdrop - the dialog
 * itself, outside its content. Escape is the browser's. Closing gives the focus back to what opened it.
 */
export const POPUP_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const opener = event.target.closest('[data-popup-open]');
  if (opener) {
    const dialog = document.getElementById(opener.getAttribute('data-popup-open'));
    if (dialog && typeof dialog.showModal === 'function') {
      event.preventDefault();
      dialog.opener = opener;
      if (!dialog.open) dialog.showModal();
    }
    return;
  }
  const closer = event.target.closest('[data-popup-close]');
  if (closer) {
    const dialog = closer.closest('dialog');
    if (dialog) { event.preventDefault(); dialog.close(); }
    return;
  }
  if (event.target instanceof HTMLDialogElement && event.target.open) {
    const box = event.target.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) event.target.close();
  }
});
document.addEventListener('close', (event) => {
  const dialog = event.target;
  if (dialog instanceof HTMLDialogElement && dialog.opener && typeof dialog.opener.focus === 'function') dialog.opener.focus();
}, true);
// A window named by the address is open when the page loads: a link from another page (the Files window of
// Conversations, F58) lands on the window it names, not on the page under it.
(() => {
  const named = location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (named instanceof HTMLDialogElement && named.classList.contains('pp') && typeof named.showModal === 'function' && !named.open) named.showModal();
})();
`;
