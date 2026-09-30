import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, type Translate } from '../../render/report-copy.ts';
import { textButton } from '../../render/ui/button.ts';
import { confirmDialog } from '../../render/ui/confirm-dialog.ts';
import { dayName } from '../../render/ui/local-date.ts';
import { opener } from '../../render/ui/popup.ts';
import type { Lang } from '../../render/report-copy.ts';
import { fileTitle } from './to-fix-list.ts';
import type { DoneFile, When } from './to-fix-view.ts';

export function undoWindowId(at: number): string {
  return 'fix-undo-' + at;
}

/** "today", "yesterday", or the day's date, in the page's zone (O2); `standing` starts a line: "Today". */
export function dayWord(when: When, t: Translate, lang: Lang, standing = false): string {
  return when.relative === undefined ? dayName(when.day, lang) : t((standing ? 'fix.day.' : 'fix.') + when.relative);
}

/**
 * The Done tab (T9, T10): every standing mark, newest first, with what the person wrote. A shared page lists them
 * without the notes and without Undo (T19, R37).
 */
export function doneList(done: readonly DoneFile[], writable: boolean): string {
  if (done.length === 0) return '<p class="tf-empty">' + inLanguages((t) => t('fix.done.none')) + '</p>';
  return '<p class="tf-done-lead">' + inLanguages((t) => t('fix.done.lead')) + '</p>' +
    '<ul class="tf-done">' + done.map((file, at) =>
      '<li class="tf-done-row"><span class="tf-done-text"><span class="tf-done-title">' + inLanguages((t) => fileTitle(file, t)) + '</span>' +
      '<span class="tf-done-sub"><span class="chip">' + e(file.path) + '</span>' +
      (file.note === undefined ? '' : '<span class="tf-note">“' + e(file.note) + '”</span>') + '</span></span>' +
      '<span class="tf-fixed">' + inLanguages((t, lang) => t('fix.done.fixed', { when: dayWord(file.when, t, lang) })) + '</span>' +
      (writable ? textButton(inLanguages((t) => t('fix.done.undo')), opener(undoWindowId(at)), 'tf-undo') : '') +
      '</li>').join('') + '</ul>';
}

/** T10: Undo puts back work the person said was done, so it asks first (D6). */
export function undoWindows(done: readonly DoneFile[]): string {
  return done.map((file, at) => confirmDialog({
    id: undoWindowId(at),
    glyph: '',
    title: inLanguages((t) => t('fix.undo.title')),
    subject: '<span class="chip">' + e(file.path) + '</span>',
    sentence: inLanguages((t) => t('fix.undo.text')),
    option: '',
    note: '<p class="tf-say" data-fix-say hidden></p>',
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('fix.undo.go')),
    tone: 'primary',
    confirmAttributes: ' data-fix-unmark="' + e(JSON.stringify({ path: file.path })) + '"',
  })).join('');
}
