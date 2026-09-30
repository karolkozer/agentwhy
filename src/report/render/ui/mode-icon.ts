/**
 * What happens when the AI reaches a private file, as Settings names it (`for-people-who-build-with-ai.md` F57):
 * **Block** - it can't open it - or **Track** (named Tell me, with a bell, until 2026-09-25) - it may, and the person
 * is told. A padlock and an eye: simple glyphs, never an emoji (guidelines §9.3), drawn the same wherever the mode is
 * shown - a Settings row, a tag in the Files table, a file's window - each in the colour of what holds it, so the same
 * fact is never drawn two ways.
 */
export type Mode = 'block' | 'tell';

export const MODE_SVG: Readonly<Record<Mode, string>> = {
  block: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>',
  tell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};
