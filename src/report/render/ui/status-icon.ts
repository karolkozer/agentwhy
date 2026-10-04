// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { inLanguages } from '../report-copy.ts';
import { LOOKS, type Look, type Tone } from './status-look.ts';

/**
 * The look in a 26px circle, and its words beside it (guidelines §4, "AI icons"). `label`, already written in every
 * language, says it of one file where the look's own words say it of a conversation ("Read it", not "Read private files").
 */
export function statusIcon(look: Look, label?: string): string {
  const style = LOOKS[look];
  return glyphIcon(style.glyph, style.tone, label ?? inLanguages((t) => t(style.label)));
}

/**
 * Any state drawn the way a look is - a glyph in the 26px circle, its words beside it, both in the state's colour - for
 * a state that is not what the AI did: whether a file is blocked (the Files table's mode column, `mode-icon.ts`).
 */
export function glyphIcon(glyph: string, tone: Tone, label: string): string {
  return '<span class="look look-' + tone + '"><span class="look-glyph" aria-hidden="true">' + glyph + '</span>' +
    '<span class="look-label">' + label + '</span></span>';
}

export const STATUS_ICON_STYLE = String.raw`
.look{display:flex;align-items:center;gap:9px}
.look-glyph{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.look-glyph svg{width:13px;height:13px}
.look-label{font-size:14px;font-weight:600;line-height:1.3;white-space:nowrap}
.look-coral .look-glyph{background:var(--coral-16);color:var(--coral-text)}.look-coral .look-label{color:var(--coral-text)}
.look-amber .look-glyph{background:var(--amber-16);color:var(--amber)}.look-amber .look-label{color:var(--amber)}
.look-mint .look-glyph{background:var(--mint-14);color:var(--mint)}.look-mint .look-label{color:var(--mint)}
.look-sand .look-glyph{background:var(--sand-16);color:var(--sand)}.look-sand .look-label{color:var(--sand)}
.look-blue .look-glyph{background:var(--blue-16);color:var(--blue)}.look-blue .look-label{color:var(--blue)}
.look-grey .look-glyph{background:var(--white-06);color:var(--text-2)}.look-grey .look-label{color:var(--text-2)}
`;
