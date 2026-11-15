// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages } from '../report-copy.ts';

/**
 * `2026-11-15-which-model-it-ran-on.md` MR3, MR3d: an AI's models, each never broken inside its id (design guidelines §4,
 * File name chip). One model - the usual case - is its id alone. More than one is a path, `A → B`, each arrow held to the
 * model it points at, so a narrow column breaks between models and nowhere else, and one line under it says the model
 * changed while it worked: the same AI, not two (the maintainer read *A then B* as two AIs, and a sentence with the ids in
 * it as four ragged lines in a table's cell). `chip` is the place's own look for an id. One drawing for every place.
 */
export function modelChips(models: readonly string[], chip: string): string {
  // A `code`, not a span: an id is a technical value, and a span inside a language's span is cut short by every reader of
  // the page that strips the other languages.
  const idOf = (id: string): string => '<code class="' + chip + ' model-chip">' + e(id) + '</code>';
  const [first, ...next] = models;
  if (first === undefined) return '';
  if (next.length === 0) return idOf(first);
  return '<span class="model-path">' + idOf(first) +
    next.map((id) => ' <span class="model-next"><span class="model-arrow" aria-hidden="true">→</span> ' + idOf(id) + '</span>').join('') + '</span>' +
    '<span class="model-changed">' + inLanguages((t) => t('model.changed')) + '</span>';
}

export const MODEL_CHIPS_STYLE = `
.model-chip{white-space:nowrap}
.model-path{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 6px;max-width:100%;vertical-align:top}
.model-next{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.model-arrow{font-family:var(--sans);color:var(--text-4)}
.model-changed{display:block;flex-basis:100%;margin-top:2px;font-family:var(--sans);font-size:12.5px;line-height:1.4;color:var(--text-3)}
`;
