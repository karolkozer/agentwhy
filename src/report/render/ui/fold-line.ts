import { inLanguages } from '../report-copy.ts';

/**
 * "✓ N other … · Show" (guidelines §1.8, §9.1): what needs no attention, folded into one dashed line. A `<details>`,
 * so it opens and closes with no script at all.
 */
export interface Fold {
  /** The line's words, already written in every language: a bold count and the rest. */
  readonly summary: string;
  readonly body: string;
  readonly attributes?: string;
  /**
   * What the line is for, where it is not the rest with nothing to fix (✓ in mint, dashed): `sand` is what the person
   * chose to track - its eye in Track's colour, on a solid line (Conversations' "For your info", 2026-09-25).
   */
  readonly mark?: { readonly glyph: string; readonly tone: 'sand' };
}

export function foldLine(spec: Fold): string {
  return '<details class="fold' + (spec.mark === undefined ? '' : ' fold-' + spec.mark.tone) + '"' + (spec.attributes ?? '') + '><summary class="fold-line">' +
    '<span class="fold-mark" aria-hidden="true">' + (spec.mark?.glyph ?? '✓') + '</span><span class="fold-text">' + spec.summary + '</span>' +
    '<span class="fold-toggle"><span class="fold-show">' + inLanguages((t) => t('fold.show')) + '</span>' +
    '<span class="fold-hide">' + inLanguages((t) => t('fold.hide')) + '</span></span></summary>' +
    '<div class="fold-body">' + spec.body + '</div></details>';
}

export const FOLD_LINE_STYLE = String.raw`
.fold-line{display:flex;align-items:center;gap:12px;width:100%;padding:16px 22px;border-radius:14px;border:1px dashed var(--white-16);color:var(--text-soft);font-size:15px;cursor:pointer;list-style:none}
.fold-line::-webkit-details-marker{display:none}
.fold-line:hover{border-color:var(--white-32)}
.fold[open]>.fold-line{margin-bottom:16px}
.fold-mark{flex:none;width:24px;height:24px;border-radius:50%;background:var(--mint-14);color:var(--mint);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.fold-text{flex:1}
.fold-text strong{font-weight:650;color:var(--text)}
.fold-text .fold-rest{color:var(--text-2)}
.fold-toggle{font-size:14px;font-weight:600;color:var(--text-2)}
.fold-hide{display:none}.fold[open] .fold-hide{display:inline}.fold[open] .fold-show{display:none}
.fold-sand>.fold-line{border:1px solid var(--sand-35);background:var(--card)}.fold-sand>.fold-line:hover{border-color:var(--sand)}
.fold-sand .fold-mark{width:32px;height:32px;background:var(--sand-16);color:var(--sand)}.fold-sand .fold-mark svg{width:16px;height:16px}
`;
