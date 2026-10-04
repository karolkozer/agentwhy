// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The pills of the design (guidelines §4 "Buttons"): coral for the one thing to do, mint for a confirmation that makes
 * something safe (O6), light for "Protect it", an outline for the rest - coral where it opens a window that takes
 * something away (Settings' "Uninstall…", F59) - a quiet one for what cannot be done, and coral text for a way back. Everything clickable looks like one of these (guidelines §9.3), and a page never styles a button
 * of its own.
 */
export type PillTone = 'primary' | 'mint' | 'light' | 'outline' | 'outline-coral' | 'secondary' | 'quiet';
/** `sm` the light "Protect it" of a table row, `md` a row's action, `task` a task card's, `lg` a card's or a window's. */
export type PillSize = 'sm' | 'md' | 'task' | 'lg';

export interface Pill {
  /** The words, already written in every language and escaped. */
  readonly label: string;
  readonly tone: PillTone;
  readonly size?: PillSize;
  /** A link when present. */
  readonly href?: string;
  /** A `<button>` rather than a link or a span: something the page's script answers. */
  readonly button?: true;
  /** Extra attributes, already escaped: what a script finds the control by. */
  readonly attributes?: string;
}

export function pill(spec: Pill): string {
  const cls = 'pill pill-' + spec.tone + ' pill-' + (spec.size ?? 'md');
  const attributes = spec.attributes ?? '';
  if (spec.button === true) return '<button type="button" class="' + cls + '"' + attributes + '>' + spec.label + '</button>';
  return spec.href === undefined
    ? '<span class="' + cls + '"' + attributes + '>' + spec.label + '</span>'
    : '<a class="' + cls + '" href="' + spec.href + '"' + attributes + '>' + spec.label + '</a>';
}

/** Coral words that act: "Back to this week", "✦ I'm stuck". A link, so it works with no script. Attributes arrive escaped. */
export function textLink(label: string, href: string, attributes = ''): string {
  return '<a class="text-link" href="' + href + '"' + attributes + '>' + label + '</a>';
}

/** Coral words that act where there is nowhere to go: a script's control. */
export function textButton(label: string, attributes = '', className = ''): string {
  return '<button type="button" class="text-link text-button' + (className === '' ? '' : ' ' + className) + '"' + attributes + '>' + label + '</button>';
}

/** The round × of a window. Its name is given in every language through `attributes` (`labelAttributes`). */
export function closeButton(attributes: string, size: 'md' | 'sm' = 'md'): string {
  return '<button type="button" class="close close-' + size + '"' + attributes + '>×</button>';
}

/** A bin: a simple glyph (guidelines §9.3), drawn the same wherever something is taken out. */
export const TRASH_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13"/></svg>';

/**
 * A row's round bin: takes out what the row holds. Its name is given in every language through `attributes`
 * (`labelAttributes`). Given `href`, it is a link to the window that confirms it, so it works without a script too.
 */
export function trashButton(attributes: string, href?: string): string {
  return href === undefined
    ? '<button type="button" class="close close-md trash"' + attributes + '>' + TRASH_SVG + '</button>'
    : '<a class="close close-md trash" href="' + href + '"' + attributes + '>' + TRASH_SVG + '</a>';
}

export const BUTTON_STYLE = String.raw`
.pill{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-radius:999px;font:inherit;font-weight:600;border:1px solid transparent;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
.pill-sm{font-size:13px;font-weight:650;padding:6px 12px;border-radius:8px}
.pill-md{font-size:14px;padding:8px 16px}
.pill-task{font-size:14px;padding:10px 18px}
.pill-lg{flex:none;font-size:15px;padding:11px 20px}
.pill-primary{background:var(--coral);color:var(--on-coral);border-color:var(--coral)}
a.pill-primary:hover,button.pill-primary:hover{background:var(--coral-hover);border-color:var(--coral-hover);color:var(--on-coral)}
.pill-mint{background:var(--mint);color:var(--on-mint);border-color:var(--mint)}
a.pill-mint:hover,button.pill-mint:hover{background:var(--mint-hover);border-color:var(--mint-hover);color:var(--on-mint)}
.pill-light{background:var(--text);color:var(--bg);border-color:var(--text)}
a.pill-light:hover,button.pill-light:hover{background:var(--white);border-color:var(--white);color:var(--bg);transform:translateY(-1px)}
.pill-outline{background:transparent;color:var(--text-soft);border-color:var(--white-14)}
a.pill-outline:hover,button.pill-outline:hover{background:var(--white-05);color:var(--text)}
.pill-outline-coral{background:transparent;color:var(--coral-text);border-color:var(--coral-50)}
a.pill-outline-coral:hover,button.pill-outline-coral:hover{background:var(--coral-08);border-color:var(--coral);color:var(--coral-text)}
.pill-secondary{background:transparent;color:var(--text);border-color:var(--white-14);font-weight:500}
.pill-secondary.pill-md{padding:9px 16px}
a.pill-secondary:hover,button.pill-secondary:hover{background:var(--white-05);color:var(--white)}
.pill-quiet{background:transparent;color:var(--text-4);border-color:var(--white-08);cursor:default}
.text-link{color:var(--coral-text);font-size:14px;font-weight:600;padding:4px}
.text-link:hover{color:var(--coral-link-hover)}
.text-button{background:transparent;border:none;font:inherit;font-size:14px;font-weight:500;cursor:pointer;padding:6px 0}
.close{flex:none;border-radius:50%;background:transparent;border:1px solid var(--white-12);color:var(--text-2);line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font:inherit}
.close:hover{color:var(--text);border-color:var(--white-25)}
.close-md{width:36px;height:36px;font-size:18px}.close-sm{width:34px;height:34px;font-size:18px}
.trash svg{width:17px;height:17px}
.trash:hover{color:var(--coral-text);border-color:var(--coral-50);background:var(--coral-08)}
.pill-busy{pointer-events:none}
.pill-busy>svg{display:none}
.pill-busy::before{content:"";flex:none;width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:pillSpin .8s linear infinite}
@keyframes pillSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.pill-busy::before{animation:none;border-right-color:currentColor;opacity:.5}}
`;
