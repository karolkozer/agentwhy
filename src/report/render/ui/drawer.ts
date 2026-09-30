import { closeButton } from './button.ts';
import { CLOSES } from './popup.ts';

/**
 * A panel from the right edge (design file *agentwhy App*, the helper's drawer): a head with a dot, a name and a line,
 * a body that scrolls, and an optional foot. The same `<dialog>` as a window, opened the same way (`opens`), so it shares
 * the window's script and its behaviour with no script at all.
 */
export interface Drawer {
  readonly id: string;
  readonly labelledBy: string;
  readonly tone: 'coral' | 'amber' | 'blue' | 'mint' | 'grey';
  /** Already written in every language and escaped. */
  readonly title: string;
  readonly sub: string;
  readonly body: string;
  readonly foot?: string;
  /** The close button's name in every language (`labelAttributes`). */
  readonly closeLabel: string;
}

export function drawer(spec: Drawer): string {
  return '<dialog class="dr" id="' + spec.id + '" aria-labelledby="' + spec.labelledBy + '">' +
    '<div class="dr-head"><span class="dr-dot dr-dot-' + spec.tone + '" aria-hidden="true"></span>' +
    '<div class="dr-name"><div class="dr-title" id="' + spec.labelledBy + '">' + spec.title + '</div><div class="dr-sub">' + spec.sub + '</div></div>' +
    closeButton(spec.closeLabel + CLOSES, 'sm') + '</div>' +
    '<div class="dr-body">' + spec.body + '</div>' +
    (spec.foot === undefined ? '' : '<div class="dr-foot">' + spec.foot + '</div>') +
    '</dialog>';
}

export const DRAWER_STYLE = String.raw`
dialog.dr{margin:0 0 0 auto;padding:0;height:100%;max-height:100%;width:480px;max-width:100%;border:0;border-left:1px solid var(--white-08);background:var(--popup);color:var(--text)}
dialog.dr[open]{display:flex;flex-direction:column}
dialog.dr::backdrop{background:var(--scrim)}
html:not(.js) dialog.dr:target{display:flex;flex-direction:column;position:static;height:auto;margin:24px 0 24px auto}
.dr-head{display:flex;align-items:center;gap:14px;padding:22px 24px;border-bottom:1px solid var(--white-07)}
.dr-dot{flex:none;width:10px;height:10px;border-radius:50%}
.dr-dot-coral{background:var(--coral)}.dr-dot-amber{background:var(--amber)}.dr-dot-blue{background:var(--blue)}.dr-dot-mint{background:var(--mint)}.dr-dot-grey{background:var(--text-4)}
.dr-name{flex:1;min-width:0}
.dr-title{font-size:19px;font-weight:650}
.dr-sub{font-size:13px;color:var(--text-3);margin-top:2px}
.dr-body{padding:24px;flex:1;overflow:auto;display:flex;flex-direction:column;gap:24px}
.dr-foot{padding:18px 24px;border-top:1px solid var(--white-07)}
`;
