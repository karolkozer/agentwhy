// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import { PROVIDER_NAMES, type Provider } from '../../../core/session-format.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, LANGS, translator } from '../report-copy.ts';
import { tag } from './tag.ts';

/**
 * Where a conversation was held, in the words `which-project.md` V4 settled
 * (`.ai/specs/2026-10-08-where-it-was-held.md` WH2). `unknown` has no key on purpose: a record that did not say draws
 * nothing rather than a guess (WH4). Nothing here says *VS Code* - no measurement supports it for either AI, since the
 * Claude Code extension in Cursor and in JetBrains is unmeasured (VB4) and Codex's is too (WHB2).
 */
const HELD_KEYS: Readonly<Record<Exclude<EntryPoint, 'unknown'>, string>> = {
  terminal: 'held.terminal',
  editor: 'held.editor',
  desktop: 'held.desktop',
  script: 'held.script',
};

/** The place in words, in every language the page ships with, or nothing where the record did not say it (WH4). */
export function heldWords(where: EntryPoint | undefined): string | undefined {
  const key = where === undefined || where === 'unknown' ? undefined : HELD_KEYS[where];
  return key === undefined ? undefined : inLanguages((t) => t(key));
}

/** The place in every language, as plain lowercase words: what a row's search text carries (WH10). */
export function heldSearchWords(where: EntryPoint | undefined): string {
  const key = where === undefined || where === 'unknown' ? undefined : HELD_KEYS[where];
  return key === undefined ? '' : LANGS.map((lang) => translator(lang)(key)).join(' ').toLowerCase();
}

/**
 * The badge a row and a report both draw (WH1, WH3, WH8): which AI the conversation was with (`what-codex-wrote` X28)
 * and, where the record says so, where it was held. One badge and not two - the cell it sits in may already carry a
 * project tag beside it, and §9.1 holds a cell to two chips.
 */
export function aiBadge(provider: Provider, where?: EntryPoint): string {
  const words = heldWords(where);
  const name = e(PROVIDER_NAMES[provider]);
  return tag(words === undefined ? name : name + '<span class="tag-held"> · ' + words + '</span>', 'grey', 'badge');
}
