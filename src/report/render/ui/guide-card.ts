import { pill } from './button.ts';

/**
 * The ✦ card that names one thing to do (guidelines §9.1): coral with one action while there is something to fix,
 * mint with a tick once there is not. Words arrive written in every language.
 */
export interface Guide {
  readonly tone: 'coral' | 'mint';
  /** A mint card's mark: the tick, or the lock of "Protection is on." (the maintainer's design, 2026-09-29). */
  readonly mark?: 'lock';
  readonly title: string;
  readonly body: string;
  /**
   * The one thing to do. A coral card that only warns - a key's shape in a result - has none. A mint card starts no
   * task, so its action is only ever the light pill that leads on ("See last week →"), and only where it says `light`.
   */
  readonly action?: { readonly label: string; readonly href: string; readonly attributes?: string; readonly light?: true };
}

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export function guideCard(spec: Guide): string {
  const action = spec.action;
  const shown = action !== undefined && (spec.tone === 'coral' || action.light === true);
  return '<div class="guide guide-' + spec.tone + (shown && spec.tone === 'mint' ? ' guide-acts' : '') + '">' +
    '<span class="guide-mark" aria-hidden="true">' + (spec.tone === 'coral' ? '✦' : spec.mark === 'lock' ? LOCK_SVG : '✓') + '</span>' +
    '<div class="guide-text"><div class="guide-title">' + spec.title + '</div><div class="guide-body">' + spec.body + '</div></div>' +
    (!shown ? '' : pill({ label: action.label, href: action.href, tone: action.light === true ? 'light' : 'primary', size: 'lg',
      ...(action.attributes === undefined ? {} : { attributes: action.attributes }) })) +
    '</div>';
}

export const GUIDE_CARD_STYLE = String.raw`
.guide{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:20px 24px;border-radius:14px;margin-bottom:36px}
.guide-coral{background:var(--coral-06);border:1px solid var(--coral-30)}
.guide-mint{background:var(--mint-08);border:1px solid var(--mint-30);flex-wrap:nowrap}
.guide-mark{flex:none;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.guide-coral .guide-mark{background:var(--coral-14);border:1px solid var(--coral-35);color:var(--coral-text);font-size:18px}
.guide-mint .guide-mark{background:var(--mint);color:var(--on-mint);font-size:20px;font-weight:700}
.guide-coral .guide-text,.guide-acts .guide-text{flex:1;min-width:220px}
.guide-mint.guide-acts{flex-wrap:wrap}.guide-mint .guide-mark svg{display:block}
.guide-title{font-size:17px;font-weight:600;margin-bottom:3px}
.guide-body{font-size:14px;line-height:1.5;color:var(--text-2)}
`;
