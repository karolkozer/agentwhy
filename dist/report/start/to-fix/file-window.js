// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.js';
import { inLanguages, labelAttributes } from '../../render/report-copy.js';
import { closeButton, pill } from '../../render/ui/button.js';
import { callout } from '../../render/ui/callout.js';
import { fixWizard } from '../../render/report-page/fix-wizard.js';
import { storyWindowOf } from '../../render/report-page/story-window.js';
import { fixId, storyId } from '../../render/report-page/to-do-view.js';
import { CLOSES, opener, popup, popupFoot } from '../../render/ui/popup.js';
import { dayWord } from './done-list.js';
import { fileTitle } from './to-fix-list.js';
/** T15: the conversations shown before "Show all". */
const FIRST = 6;
/** The window a card's "What happened" opens (T11a): the report page's own id for it. */
export function happenedId(at) {
    return storyId(at);
}
/**
 * A file's Fix it (T11-T15): the report page's own wizard, one step at a time, for the file as every conversation read
 * it - with where it was read folded under "Now fixing", and a note in the last step, sent with the mark.
 */
export function fixWindow(files, at, page) {
    const file = files[at];
    return fixWizard(files.map((each) => each.item), at, {
        done: new Set(),
        shared: !page.writable,
        protectKeys: new Map(),
        protectedPaths: new Set(),
        ...(page.told === undefined ? {} : { toldPaths: page.told }),
        protectAt: page.settings + '#files',
        // GD25: on the computer's page, the mark goes to the record of the project the file is in.
        ...(file.project === undefined ? {} : { project: file.project.id }),
    }, {
        ...(file.reopened === undefined ? {} : { notice: backAgain(file) }),
        where: {
            summary: inLanguages((t) => t('fix.window.where') + ' · ' + t('fix.in', { n: file.count })),
            body: whereList(file),
        },
        note: page.writable,
        skip: file.skip,
        since: page.since,
    });
}
/**
 * "What happened" (T11a): the report page's own window - Story, Diagram, Record - told from the newest conversation that
 * read the file, which it names, with every conversation in a fourth tab. A file no report could tell falls back to what
 * the index knows: what the AI did, where, and what to do.
 */
export function happenedWindow(file, kind, at, page) {
    if (file.story !== undefined) {
        const { story, sessionId, conversation } = file.story;
        const title = conversation.entry.title === undefined ? undefined : '“' + e(conversation.entry.title) + '”';
        return storyWindowOf(story, file.item, at, sessionId, false, page.clock, {
            context: inLanguages((t, lang) => t('fix.story.from', {
                title: title ?? t('fix.window.untitled'),
                day: dayWord(conversation.when, t, lang, true),
                time: conversation.when.time,
            }) + (file.count > 1 ? ' ' + t('fix.story.more', { n: file.count - 1 }) : '')),
            tabs: [{ label: inLanguages((t) => t('fix.story.tab')) + ' <span class="tf-tab-count">' + file.count + '</span>', panel: '<div class="tf-story-where">' + whereList(file) + '</div>' }],
        });
    }
    const id = happenedId(at);
    const did = file.label === 'unknown' ? 'unknown' : kind;
    const head = '<div class="tf-window-head"><div class="tf-window-top">' +
        '<span class="tf-window-group tf-window-' + kind + '">' + inLanguages((t) => t('fix.' + kind)) + '</span>' +
        closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
        '<h2 class="tf-window-title" id="' + id + '-title">' + inLanguages((t) => fileTitle(file, t)) + '</h2>' +
        '<span class="chip tf-window-chip">' + e(file.path) + '</span></div>';
    const row = (title, body) => '<section class="tf-fact"><h3 class="tf-h3">' + inLanguages((t) => t(title)) + '</h3>' + body + '</section>';
    const body = '<div class="tf-window-body">' +
        (file.reopened === undefined ? '' : backAgain(file)) +
        row('fix.happened.did', '<p class="tf-fact-text">' + inLanguages((t) => t('fix.happened.' + did)) + '</p>') +
        row('fix.window.where', whereList(file)) +
        row('fix.window.todo', '<p class="tf-fact-text">' + inLanguages((t) => t('fix.happened.todo.' + did)) + '</p>') +
        '</div>';
    const foot = popupFoot(inLanguages((t) => t('fix.window.after')), pill({ label: inLanguages((t) => t('app.close')), tone: 'outline', size: 'md', button: true, attributes: CLOSES }) +
        pill({ label: inLanguages((t) => t('fix.' + kind + '.go')), tone: 'primary', size: 'md', href: '#' + fixId(at), attributes: opener(fixId(at)) + ' data-fix-from' }));
    return popup({ id, size: 'small', labelledBy: id + '-title', body: head + body + foot });
}
/** T12. */
function backAgain(file) {
    return callout({
        tone: 'coral',
        body: inLanguages((t, lang) => t('fix.window.back', { day: dayWord(file.reopened, t, lang) })),
    });
}
/** T15: the conversations it was read in, newest first; six, then the rest behind "Show all". */
function whereList(file) {
    const shown = file.conversations;
    const gone = file.count - shown.length;
    const rows = shown.map((conversation, at) => {
        const title = conversation.entry.title === undefined ? undefined : e(conversation.entry.title);
        return '<li class="tf-where-row' + (at >= FIRST ? ' tf-more' : '') + '">' +
            '<span class="tf-where-when"><span class="tf-where-day">' +
            inLanguages((t, lang) => dayWord(conversation.when, t, lang, true)) +
            '</span><span class="tf-where-time">' + conversation.when.time + '</span></span>' +
            '<span class="tf-where-ask">' + (title ?? inLanguages((t) => t('fix.window.untitled'))) + '</span>' +
            (conversation.report === undefined
                ? '<span class="tf-where-none">' + inLanguages((t) => t('fix.window.noReport')) + '</span>'
                : pill({ label: inLanguages((t) => t('fix.window.see')), tone: 'outline', href: e(conversation.report) })) +
            '</li>';
    }).join('');
    return '<div class="tf-where-block"><ul class="tf-where" data-fix-where>' + rows + '</ul>' +
        (shown.length > FIRST || gone > 0
            ? '<div class="tf-where-foot">' +
                (shown.length > FIRST
                    ? '<button type="button" class="tf-all js-only" data-fix-all>' + inLanguages((t) => t('fix.window.all', { n: shown.length })) + '</button>'
                    : '') +
                (gone > 0 ? '<span class="tf-context">' + inLanguages((t) => t('fix.window.gone', { n: gone })) + '</span>' : '') +
                '</div>'
            : '') +
        '</div>';
}
