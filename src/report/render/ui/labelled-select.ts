// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A choice with its question as the label (guidelines §4, "Filters"): "What the AI did:" + Anything / Opened and read it
 * / … The options' words are one language per option element, so the page writes one select per language and shows
 * the one being read; the script keeps them on the same value.
 */
export interface Choice {
  readonly value: string;
  /** Plain text in that language, escaped. */
  readonly label: string;
}

export function labelledSelect(question: string, choices: readonly Choice[], attributes: string): string {
  return '<label class="ls"><span class="ls-q">' + question + '</span><select class="ls-select"' + attributes + '>' +
    choices.map((choice) => '<option value="' + choice.value + '">' + choice.label + '</option>').join('') + '</select></label>';
}

export const LABELLED_SELECT_STYLE = String.raw`
.ls{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--white-10);border-radius:10px;padding:0 6px 0 14px}
.ls-q{font-size:13.5px;color:var(--text-3);white-space:nowrap}
.ls-select{background:transparent;border:none;color:var(--text);font:inherit;font-size:14px;font-weight:600;padding:9px 6px;outline:none;cursor:pointer}
.ls-select option{background:var(--card)}
`;
