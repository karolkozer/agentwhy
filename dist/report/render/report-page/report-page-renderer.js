import { escapeHtml as e } from '../html-report-components.js';
import { CONTENT_SECURITY_POLICY_META, INDEX_CONTENT_SECURITY_POLICY_META } from '../html-head.js';
import { inLanguages } from '../report-copy.js';
import { appSidebar, APP_SIDEBAR_STYLE } from '../ui/app-sidebar.js';
import { ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../ui/ask-panel.js';
import { AVATAR_STYLE } from '../ui/avatar.js';
import { DATA_TABLE_STYLE } from '../ui/data-table.js';
import { LABELLED_SELECT_STYLE } from '../ui/labelled-select.js';
import { STATUS_ICON_STYLE } from '../ui/status-icon.js';
import { BUTTON_STYLE } from '../ui/button.js';
import { callout, CALLOUT_STYLE } from '../ui/callout.js';
import { CHECKLIST_SCRIPT, CHECKLIST_STYLE } from '../ui/checklist.js';
import { confirmCase, confirmDialog, CONFIRM_DIALOG_STYLE } from '../ui/confirm-dialog.js';
import { MODE_SVG } from '../ui/mode-icon.js';
import { DRAWER_STYLE } from '../ui/drawer.js';
import { FILE_CHIP_SCRIPT, FILE_CHIP_STYLE } from '../ui/file-chip.js';
import { FILE_PATH_STYLE } from '../ui/file-path.js';
import { FOLD_LINE_STYLE } from '../ui/fold-line.js';
import { GUIDE_CARD_STYLE } from '../ui/guide-card.js';
import { HERO_STYLE } from '../ui/hero.js';
import { pageShell } from '../ui/page-shell.js';
import { POPUP_SCRIPT, POPUP_STYLE } from '../ui/popup.js';
import { PILL_TABS_SCRIPT, PILL_TABS_STYLE } from '../ui/pill-tabs.js';
import { PROGRESS_STYLE } from '../ui/progress.js';
import { STAT_STYLE } from '../ui/stats.js';
import { TAG_STYLE } from '../ui/tag.js';
import { TASK_LIST_STYLE } from '../ui/task-list.js';
import { FIX_WIZARD_SCRIPT } from './fix-wizard-script.js';
import { ADVANCED_SCRIPT, ADVANCED_VIEW_STYLE, advancedView } from './advanced-view.js';
import { commandRow, fixWizard, FIX_WIZARD_STYLE } from './fix-wizard.js';
import { savedInto } from './file-story.js';
import { fileRows, onlyNamed } from './files.js';
import { FILES_SCRIPT, FILES_VIEW_STYLE, fileWindows, filesView, uncoveredAi, untoldAi } from './files-view.js';
import { TOOL_WINDOW_STYLE, toolNotesOf, toolWindows, toolWindowsOf } from './tool-window.js';
import { helperDrawers, HELPERS_SCRIPT, HELPERS_VIEW_STYLE, helpersView } from './helpers-view.js';
import { fileNames, nameOf, titleOf } from './item-names.js';
import { BY_FOLDER_SCRIPT, BY_FOLDER_STYLE } from './by-folder-view.js';
import { STEP_BY_STEP_STYLE } from './step-by-step-view.js';
import { MODEL_CHIPS_STYLE } from './model-chips.js';
import { modeSubject, modeWindows, MODE_WINDOW_STYLE, TRAVELS, windowProject } from './mode-window.js';
import { protectPatterns } from './protect-patterns.js';
import { gapsUnderAnswer, RECORD_VIEW_STYLE } from './record-view.js';
import { storyWindow, STORY_WINDOW_STYLE } from './story-window.js';
import { keyOverwrites, toDoItems } from './to-do.js';
import { REPORT_VIEWS_SCRIPT, REPORT_VIEWS_STYLE } from './report-views.js';
import { clockIn } from './times.js';
import { guardNeedsLook, keyOverwriteWindows, storyId, toDoView, TO_DO_VIEW_STYLE } from './to-do-view.js';
/**
 * The report page, rebuilt on the UI kit (`specs/2026-09-23-the-report-page.md`; `.ai/plans/2026-09-23-report-redesign.md`).
 * Built beside `HtmlReportRenderer`, which stays the page `report --html` and `start` write until every view is here
 * (slice h). So far: the to-do list, the Fix it wizard (slice c), what happened to each file (slice d), Helpers
 * (slice e), Files, with Protect it on any private file (slice f), and Advanced (slice g).
 *
 * Served by `start`, the page may reach the origin it came from and sends its marks and rules there (P43); written on
 * its own it reaches nowhere, as every other page, and hands over the command instead. A shared copy does neither (P46).
 */
export class ReportPageRenderer {
    render(page) {
        const { report } = page;
        const items = toDoItems(report);
        const shared = report.scope.paths.shared;
        const served = page.served === true && !shared;
        const done = new Set(shared ? [] : items.map((item) => item.path).filter((path) => page.marks?.has(path) === true));
        const rows = fileRows(report, items, done, page.denied, page.everywhere, page.deniedAt, page.elsewhere);
        // R5: every file the page names, so two of one name are told apart wherever either is named - its rows, and the files
        // a story says a value was saved into, which need not be rows (found by a review). Every story the page tells is a row's.
        const paths = rows.map((row) => row.path);
        const names = fileNames([...paths, ...savedInto(report, paths)]);
        // One Protect window per file, keyed by its row: the wizard, the table and a file's own window open the same one.
        const protectKeys = new Map();
        const patterns = new Map();
        // QE1: the rows whose mode this page can change - blocked, or tracked - which the Protect window is not offered for.
        const changeKeys = new Map();
        const subjects = new Map();
        rows.forEach((row, key) => {
            const found = protectPatterns(row.path, shared);
            if (found === undefined)
                return;
            const subject = shared ? undefined : modeSubject(row, rows);
            if (subject !== undefined) {
                changeKeys.set(row.path, key);
                subjects.set(key, subject);
                // QE8: taken away, the file is a private one nothing holds, and the row offers the window for that state.
                patterns.set(key, found);
                return;
            }
            // A told file (F57) is the person's choice, and not a file to talk them out of from here: its own window switches it.
            if (row.protection === 'yes' || row.protection === 'told')
                return;
            protectKeys.set(row.path, key);
            patterns.set(key, found);
        });
        const toldPaths = new Set(rows.filter((row) => row.protection === 'told').map((row) => row.path));
        const protectedPaths = new Set(rows.filter((row) => row.protection === 'yes').map((row) => row.path));
        const clock = clockIn(page.timeZone);
        // SB20: a file a step names opens the window its row opens - its story where it is on the list, its own window else.
        const rowsByPath = new Map(rows.map((row) => [row.path, row]));
        const windows = new Map(rows.map((row, key) => [row.path, row.item === undefined ? 'file-' + key : storyId(row.item)]));
        const steps = {
            names,
            // WK7: a key written over is a thing to do of its own, as the sidebar counts it.
            toDo: { total: items.length + keyOverwrites(report).length, left: items.filter((item) => !done.has(item.path)).length + keyOverwrites(report).length },
            windowOf: (path) => windows.get(path),
            toolWindowOf: toolWindowsOf(report),
            toolNoteOf: toolNotesOf(report),
            rowOf: (path) => rowsByPath.get(path),
            titleOf: (path, t, lang) => {
                const item = items.find((each) => each.path === path);
                return item === undefined ? undefined : titleOf(item, t, lang);
            },
        };
        const nav = [
            ...(page.withIndexLink ? [{ name: 'rp.nav.back', href: 'index.html' }] : []),
            { name: 'rp.nav.todo', href: '#todo', active: true, count: items.length + keyOverwrites(report).length, countTone: 'coral' },
            { name: 'rp.nav.files', href: '#files', count: rows.filter((row) => !onlyNamed(row)).length },
            { name: 'rp.nav.helpers', href: '#helpers', count: report.graph.agents.length },
            { name: 'rp.nav.advanced', href: '#advanced' },
        ];
        // CP20, CB10: the AI this conversation was with, where agentwhy's protection does not reach it - the windows name it.
        const uncovered = uncoveredAi(report, page.checkRuns);
        // Where blocking reaches the AI, a Track sentence still promises no message in the chat it does not get (TRACK_TOLD).
        const untold = uncovered === undefined ? untoldAi(report) : undefined;
        return pageShell({
            title: 'rp.title',
            policy: served ? INDEX_CONTENT_SECURITY_POLICY_META : CONTENT_SECURITY_POLICY_META,
            styles: [APP_SIDEBAR_STYLE, BUTTON_STYLE, HERO_STYLE, GUIDE_CARD_STYLE, PROGRESS_STYLE, TAG_STYLE, TASK_LIST_STYLE, POPUP_STYLE,
                CHECKLIST_STYLE, ASK_PANEL_STYLE, FILE_CHIP_STYLE, CONFIRM_DIALOG_STYLE, AVATAR_STYLE, PILL_TABS_STYLE, STAT_STYLE, TO_DO_VIEW_STYLE, FIX_WIZARD_STYLE,
                STORY_WINDOW_STYLE, DRAWER_STYLE, FOLD_LINE_STYLE, HELPERS_VIEW_STYLE, DATA_TABLE_STYLE, LABELLED_SELECT_STYLE, STATUS_ICON_STYLE, FILE_PATH_STYLE, FILES_VIEW_STYLE,
                ADVANCED_VIEW_STYLE, CALLOUT_STYLE, RECORD_VIEW_STYLE, REPORT_VIEWS_STYLE, MODE_WINDOW_STYLE, STEP_BY_STEP_STYLE, BY_FOLDER_STYLE, TOOL_WINDOW_STYLE, MODEL_CHIPS_STYLE],
            scripts: [POPUP_SCRIPT, CHECKLIST_SCRIPT, ASK_PANEL_SCRIPT, FILE_CHIP_SCRIPT, PILL_TABS_SCRIPT, FIX_WIZARD_SCRIPT, HELPERS_SCRIPT, BY_FOLDER_SCRIPT, FILES_SCRIPT, ADVANCED_SCRIPT, REPORT_VIEWS_SCRIPT],
            sidebar: appSidebar({ home: page.withIndexLink ? 'index.html' : '#todo', items: nav, showProject: false }),
            main: '<section id="todo" data-view>' + toDoView(items, report, done, gapsUnderAnswer(report), clock, rows, { back: page.withIndexLink, ...(page.title === undefined ? {} : { title: page.title }), ...(page.heldIn === undefined ? {} : { heldIn: page.heldIn }) }, names) + '</section>' +
                // OG4: where the conversation changed what protects its files, what the tab shows as blocked or tracked is said to be today's.
                '<section id="files" data-view>' + (guardNeedsLook(report) ? '<div class="rp-guard-note">' + callout({ tone: 'grey', body: inLanguages((t) => t('gd.today')) }) + '</div>' : '') +
                filesView(rows, items, protectKeys, changeKeys, names, report.everydayNamesLeftOut ?? 0, report.gapReasons?.unread ?? 0) + '</section>' +
                '<section id="helpers" data-view>' + helpersView(report, items, names, steps) + '</section>' +
                '<section id="advanced" data-view>' + advancedView(report, items, done, clock, names, quietFiles(rows)) + '</section>' +
                // Windows opened from more than one view live outside all of them (a hidden view hides what is in it).
                helperDrawers(report, items, done, names) + fileWindows(rows, protectKeys, report, clock, names, uncovered, untold) + toolWindows(report) +
                items.map((item, at) => storyWindow(item, at, report, done.has(item.path), clock, names)).join('') + keyOverwriteWindows(report, names) +
                items.map((_item, at) => fixWizard(items, at, { done, shared, protectKeys, protectedPaths, toldPaths, names, ...(page.project === undefined ? {} : { project: page.project }), ...(uncovered === undefined ? {} : { uncovered }), ...(untold === undefined ? {} : { untold }) })).join('') +
                [...patterns].map(([key, found]) => protectWindow(windowRow(rows[key], changeKeys), key, found, names, page.project, uncovered, untold)).join('') +
                [...subjects].map(([key, subject]) => modeWindows(rows[key], key, subject, names, page.project, uncovered, untold)).join('') +
                '<div id="wizard-words" data-served="' + served + '" hidden>' + ['wz.all', 'wz.finish', 'wz.saving', 'wz.tickFirst', 'wz.pickFirst']
                .map((key) => '<span data-word="' + key + '">' + inLanguages((t) => t(key)) + '</span>').join('') + '</div>',
        });
    }
}
/**
 * `2026-10-19-what-it-did-next.md` DN6: the private files an AI read that ask for nothing - on no to-do list - each with
 * the window its row in Files opens, which `fileWindows` writes for every row with no item.
 */
function quietFiles(rows) {
    return rows.flatMap((row, key) => (row.item === undefined && row.private && row.access === 'read' ? [{ path: row.path, kind: row.kind, window: 'file-' + key }] : []));
}
/**
 * QE8: the Protect window of a row whose mode can be changed is the one that row would be offered **after** protection
 * is taken away - a private file no rule holds - because that is the state the row falls back to.
 */
function windowRow(row, changeKeys) {
    return changeKeys.has(row.path) ? { ...row, protection: 'no' } : row;
}
/**
 * "Protect this file?" (P38, P38a-c): the file's own path, or every file of its name where the option is ticked. The
 * page's script sends the rule served, and otherwise shows the `init --protect` command in the window (R61). For an
 * everyday file it is "Make this file private?": the same rule, which is what adding a file in Settings writes.
 *
 * `block-or-track-from-the-report` BT1: where the page can say exactly what holds the file - an everyday file, and a
 * private one no rule of the project holds - the window asks which mode it gets, **Block** or **Track**, in Settings'
 * own words and glyphs (F57). Where this run could not read the settings at all (*Can't tell*), it asks nothing: a
 * told entry written under a deny rule nobody can see changes nothing while reading as a change (BTD3).
 */
function protectWindow(row, at, patterns, names, project, uncovered, untold) {
    const path = row.path;
    // The option protects every file of its name, so it says the name alone; the chip says which file this is.
    const name = e(nameOf(path));
    const everyday = row.protection === 'na';
    const words = everyday ? 'mp' : 'pr';
    const found = ' data-pattern="' + e(patterns.exact) + '" data-pattern-every="' + e(patterns.every) + '"';
    const sentence = (key) => inLanguages((t) => t(key, { path: '<code>' + e(path) + '</code>' }));
    // Each case has a tick of its own, so the one the person sees is the one the script reads (BT3).
    const tick = (which, key) => '<label class="pr-option"><input type="checkbox" data-protect-every="' + which + '"> ' +
        inLanguages((t) => t(key, { name: '<code>' + name + '</code>' })) + '</label>';
    const say = (key) => inLanguages((t) => t(key));
    // CP20: where agentwhy's protection does not reach this conversation's AI, no sentence promises it and one names it.
    const words_ = (key) => (uncovered === undefined ? key : 'nc.' + key);
    const detail = uncovered === undefined ? {} : { detail: inLanguages((t) => t('nc.detail', { ai: e(uncovered) })) };
    // BT8: Block hands over `init --protect`, as it always has; no flag writes a told list, so Track hands over the
    // command that opens the page where the change can be made, as Settings' own switch does.
    const handover = (which, body) => '<div class="wz-handover" data-note-command="' + which + '" hidden><p class="wz-handover-text">' + body + '</p>' + commandRow() + '</div>';
    const note = (body) => '<div class="cf-note" data-protect-note>' +
        '<p class="wz-reason" data-note-reason role="alert" hidden></p>' + body + '</div>';
    if (!everyday && row.protection !== 'no') {
        return confirmDialog({
            id: 'protect-' + at,
            attributes: TRAVELS + windowProject(project),
            title: say(words + '.title'),
            subject: '<span class="tc-chip" title="' + e(path) + '">' + e(names(path)) + '</span>',
            sentence: sentence(words === 'pr' ? words_('pr.sentence') : words + '.sentence'),
            ...detail,
            option: tick('block', words + '.option'),
            cancel: say('app.cancel'),
            confirm: say(words + '.confirm'),
            confirmAttributes: ' data-protect="' + at + '" data-protect-mode="block"' + found,
            note: note(handover('block', say(words + '.cmd'))),
        });
    }
    const mode = (which) => ({
        mark: MODE_SVG[which],
        markTone: which === 'block' ? 'mint' : 'sand',
        name: say('md.' + which),
        why: which === 'tell' && untold !== undefined ? inLanguages((t) => t('nt.md.tell.why', { ai: e(untold) })) : say(words_('md.' + which + '.why')),
        option: tick(which, words + (which === 'block' ? '' : '.tell') + '.option'),
        confirm: say('md.go.' + which),
        // BT4, as the maintainer reversed it 2026-10-06: both answers confirm in mint. Either is a mode this person picked
        // on purpose, and coral is kept for a change that leaves a file with nothing holding it at all (BTD4, reversed).
        confirmAttributes: ' data-protect="' + at + '" data-protect-mode="' + which + '"' + found,
    });
    return confirmDialog({
        id: 'protect-' + at,
        attributes: TRAVELS + windowProject(project),
        title: say(words + '.title'),
        subject: '<span class="tc-chip" title="' + e(path) + '">' + e(names(path)) + '</span>',
        // One sentence for both options: each option says what it does, so the sentence says only what they share (BT3).
        sentence: sentence('md.sentence'),
        ...detail,
        cancel: say('app.cancel'),
        choice: { question: say(words_('md.q')), options: [mode('block'), mode('tell')] },
        note: note(confirmCase(1, handover('block', say(words + '.cmd'))) + confirmCase(2, handover('tell', say('md.cmd.tell')))),
    });
}
