// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.js';
import { inLanguages } from '../../render/report-copy.js';
import { textButton } from '../../render/ui/button.js';
import { confirmDialog } from '../../render/ui/confirm-dialog.js';
import { dayName } from '../../render/ui/local-date.js';
import { opener } from '../../render/ui/popup.js';
import { fileTitle, inProject } from './to-fix-list.js';
export function undoWindowId(at) {
    return 'fix-undo-' + at;
}
/** "today", "yesterday", or the day's date, in the page's zone (O2); `standing` starts a line: "Today". */
export function dayWord(when, t, lang, standing = false) {
    return when.relative === undefined ? dayName(when.day, lang) : t((standing ? 'fix.day.' : 'fix.') + when.relative);
}
/**
 * The Done tab (T9, T10): every standing mark, newest first, with what the person wrote. A shared page lists them
 * without the notes and without Undo (T19, R37).
 */
export function doneList(done, writable) {
    if (done.length === 0)
        return '<p class="tf-empty">' + inLanguages((t) => t('fix.done.none')) + '</p>';
    return '<p class="tf-done-lead">' + inLanguages((t) => t('fix.done.lead')) + '</p>' +
        '<ul class="tf-done">' + done.map((file, at) => '<li class="tf-done-row"><span class="tf-done-text"><span class="tf-done-title">' + inLanguages((t) => fileTitle(file, t)) + '</span>' +
        '<span class="tf-done-sub"><span class="chip">' + e(file.path) + '</span>' + inProject(file) +
        (file.note === undefined ? '' : '<span class="tf-note">“' + e(file.note) + '”</span>') + '</span></span>' +
        '<span class="tf-fixed">' + inLanguages((t, lang) => t('fix.done.fixed', { when: dayWord(file.when, t, lang) })) + '</span>' +
        (writable ? textButton(inLanguages((t) => t('fix.done.undo')), opener(undoWindowId(at)), 'tf-undo') : '') +
        '</li>').join('') + '</ul>';
}
/** T10: Undo puts back work the person said was done, so it asks first (D6). */
export function undoWindows(done) {
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
        confirmAttributes: ' data-fix-unmark="' + e(JSON.stringify({ path: file.path, ...(file.project === undefined ? {} : { project: file.project.id }) })) + '"',
    })).join('');
}
