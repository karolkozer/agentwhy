// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages } from '../report-copy.ts';

/**
 * File names as chips (guidelines §4 "File name chip"), at most `visible` of them, the rest behind "+N more"
 * (§9.1). `shown` is what a chip says - the path itself, or its name with the whole path as its tooltip. Without a
 * script every chip is shown and the button is not: the extra ones are hidden only by the class a script adds, so a
 * page that runs nothing still names every file.
 */
export function fileChips(paths: readonly string[], visible = 2, shown: (path: string) => string = (path) => path): string {
  const chips = paths.map((path, at) =>
    '<span class="chip' + (at >= visible ? ' chip-extra' : '') + '" title="' + e(path) + '">' + e(shown(path)) + '</span>').join('');
  const more = paths.length <= visible ? '' :
    '<button type="button" class="chip-more js-only" data-chip-more aria-expanded="false">' +
    '<span class="chip-closed">' + inLanguages((t) => t('chip.more', { n: paths.length - visible })) + '</span>' +
    '<span class="chip-open">' + inLanguages((t) => t('chip.less')) + '</span></button>';
  return '<span class="chips">' + chips + more + '</span>';
}

export const FILE_CHIP_STYLE = String.raw`
.chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.chip{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:2px 7px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.js .chips:not(.chips-open) .chip-extra{display:none}
.chip-more{position:relative;z-index:2;font:inherit;font-size:13px;font-weight:600;color:var(--text-2);background:transparent;border:1px dashed var(--white-28);border-radius:6px;padding:2px 8px;cursor:pointer;white-space:nowrap}
.chip-more:hover{color:var(--text);background:var(--white-06);border-color:var(--white-32)}
.chip-open{display:none}.chips-open .chip-open{display:inline}.chips-open .chip-closed{display:none}
`;

/** Opens and closes the extra chips of one cell, and nothing else: the row under it is a link and must not follow. */
export const FILE_CHIP_SCRIPT = String.raw`
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-chip-more]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const chips = button.closest('.chips');
  const open = !chips.classList.contains('chips-open');
  chips.classList.toggle('chips-open', open);
  button.setAttribute('aria-expanded', String(open));
});
`;
