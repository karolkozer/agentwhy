// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { pill } from './button.ts';

/**
 * One thing to do in a step of the Fix it wizard (design file *agentwhy App*): what it is and why, a link where to do it,
 * and a button that says what a click does - "Mark as done" - since a round tick alone was not read as one (2026-09-24).
 * The tick is the page's own and is never written anywhere (report page spec F48, P42).
 */
export interface Check {
  /** Already written in every language and escaped. */
  readonly name: string;
  readonly what: string;
  /** Where it is done: a fixed URL from the page's own tables, never from a transcript. */
  readonly link?: { readonly label: string; readonly href: string };
}

/** The tick's words, already written in every language: before it is ticked, and after. */
export interface TickWords {
  readonly mark: string;
  readonly done: string;
}

export function checklist(checks: readonly Check[], tick: TickWords): string {
  return '<ul class="ck" data-checklist>' + checks.map((check) =>
    '<li class="ck-row"><div class="ck-text"><div class="ck-name">' + check.name + '</div><div class="ck-what">' + check.what + '</div></div>' +
    (check.link === undefined ? '' : pill({
      label: '<span>' + check.link.label + '</span><span aria-hidden="true">↗</span>',
      tone: 'secondary',
      href: check.link.href,
      attributes: ' target="_blank" rel="noopener noreferrer"',
    })) +
    '<button type="button" class="ck-tick js-only" aria-pressed="false" data-check><span class="ck-mark">' + tick.mark + '</span>' +
    '<span class="ck-done">✓ ' + tick.done + '</span></button></li>').join('') + '</ul>';
}

export const CHECKLIST_STYLE = String.raw`
.ck{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ck-row{display:flex;align-items:center;flex-wrap:wrap;gap:12px 14px;padding:14px 16px;border-radius:14px;background:var(--raised);border:1px solid var(--white-07);transition:border-color .15s,box-shadow .15s}
.ck-tick{flex:none;border-radius:999px;border:1px solid var(--white-18);background:transparent;color:var(--text);font:inherit;font-size:14px;font-weight:600;padding:8px 16px;cursor:pointer;white-space:nowrap}
.ck-tick .ck-done{display:none}
.ck-row.ck-on{border-color:var(--mint-35)}
.ck-on .ck-tick{border-color:var(--mint-35);background:var(--mint-12);color:var(--mint)}
.ck-on .ck-tick .ck-mark{display:none}.ck-on .ck-tick .ck-done{display:inline}
.ck-row.ck-nudge{border-color:var(--coral-60);box-shadow:0 0 0 3px var(--coral-14)}
.ck-text{flex:1 1 220px;min-width:0}
.ck-name{font-size:16px;font-weight:600}
.ck-on .ck-name{color:var(--text-2)}
.ck-what{font-size:13.5px;color:var(--text-3);margin-top:2px}
.ck-row .pill{flex:none;font-weight:500}
.js .ck-row{cursor:pointer}.js .ck-row:hover{border-color:var(--white-18)}.js .ck-row:hover .ck-tick{background:var(--white-05)}
.js .ck-row.ck-on:hover{border-color:var(--mint-50)}.js .ck-row.ck-on:hover .ck-tick{background:var(--mint-16)}
`;

/**
 * A tick turns its row done and back, and so does a click anywhere on the row but its link: a person clicks the card,
 * not the circle. The list says how many are ticked, so the wizard's button can say "I did all of
 * them" only when it is true (F52).
 */
export const CHECKLIST_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const row = event.target.closest('[data-checklist] .ck-row');
  if (!row || event.target.closest('a')) return;
  const tick = row.querySelector('[data-check]');
  const on = !row.classList.contains('ck-on');
  row.classList.toggle('ck-on', on);
  row.classList.remove('ck-nudge');
  tick.setAttribute('aria-pressed', String(on));
  const list = tick.closest('[data-checklist]');
  const all = list.querySelectorAll('.ck-row').length;
  const ticked = list.querySelectorAll('.ck-row.ck-on').length;
  list.dataset.ticked = String(ticked);
  list.dispatchEvent(new CustomEvent('checklist', { bubbles: true, detail: { ticked, all } }));
});
`;
