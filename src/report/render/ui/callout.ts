// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { inLanguages } from '../report-copy.ts';

/**
 * A line that stands apart from the content around it (*agentwhy Settings*): coral with "!" for something to act on,
 * with its action on the right ("Your project marks 1 more file as private." + **Watch it too**); grey with "i" for
 * a fact to know ("This stops the obvious tries, not every trick.").
 */
export interface Callout {
  readonly tone: 'coral' | 'grey';
  /** Every argument is already written in every language and escaped. */
  readonly body: string;
  /** The one action, on the right; coral only. */
  readonly action?: string;
  /** Extra attributes, already escaped: what a script finds it by. */
  readonly attributes?: string;
  /**
   * What only some readers want, behind **Details** (`settings-lines-in-plain-words` SL3): already written in every
   * language. A `<details>`, so it opens with no script; the line's own words stay what it says at a glance.
   */
  readonly more?: string;
}

export function callout(spec: Callout): string {
  return '<div class="co co-' + spec.tone + '"' + (spec.attributes ?? '') + '>' +
    '<span class="co-mark" aria-hidden="true">' + (spec.tone === 'coral' ? '!' : 'i') + '</span>' +
    (spec.more === undefined ? '<span class="co-body">' + spec.body + '</span>' : '<div class="co-body">' + spec.body + more(spec.more) + '</div>') +
    (spec.action === undefined ? '' : '<span class="co-action">' + spec.action + '</span>') +
    '</div>';
}

function more(body: string): string {
  return '<details class="co-more"><summary class="co-more-toggle"><span class="co-more-show">' + inLanguages((t) => t('co.more')) + '</span>' +
    '<span class="co-more-hide">' + inLanguages((t) => t('co.less')) + '</span></summary><div class="co-more-body">' + body + '</div></details>';
}

export const CALLOUT_STYLE = String.raw`
.co{display:flex;gap:16px}
.co-coral{align-items:center;flex-wrap:wrap;padding:16px 20px;border-radius:14px;background:var(--coral-06);border:1px solid var(--coral-35);margin-bottom:14px}
.co-grey{align-items:flex-start;gap:12px;padding:14px 16px;border-radius:12px;background:var(--panel);border:1px solid var(--white-08)}
.co-mark{flex:none;border-radius:50%;font-weight:700;display:flex;align-items:center;justify-content:center}
.co-coral .co-mark{width:28px;height:28px;background:var(--coral);color:var(--on-coral);font-size:14px}
.co-grey .co-mark{width:22px;height:22px;background:var(--white-08);color:var(--text-soft);font-size:12px}
.co-body{flex:1;min-width:0}
.co-coral .co-body{min-width:220px;font-size:15px;line-height:1.5}
.co-coral .co-body strong{font-weight:650}
.co-grey .co-body{font-size:14.5px;line-height:1.55;color:var(--text-soft)}
.co-action{flex:none}
.co-more{margin-top:10px}
.co-more-toggle{display:inline-flex;align-items:center;padding:3px 12px;border-radius:999px;border:1px solid var(--white-16);font-size:13px;font-weight:600;color:var(--text-2);cursor:pointer;list-style:none}
.co-more-toggle::-webkit-details-marker{display:none}
.co-more-toggle:hover{border-color:var(--white-32);color:var(--text)}
.co-more-hide{display:none}.co-more[open] .co-more-hide{display:inline}.co-more[open] .co-more-show{display:none}
.co-more-body{margin-top:10px}
`;
