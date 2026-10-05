// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Renderer } from '../../../shared/renderer.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { CONTENT_SECURITY_POLICY_META, INDEX_CONTENT_SECURITY_POLICY_META } from '../html-head.ts';
import type { ReportPage } from '../report-page.ts';
import { inLanguages } from '../report-copy.ts';
import { appSidebar, APP_SIDEBAR_STYLE, type NavItem } from '../ui/app-sidebar.ts';
import { ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../ui/ask-panel.ts';
import { AVATAR_STYLE } from '../ui/avatar.ts';
import { DATA_TABLE_STYLE } from '../ui/data-table.ts';
import { LABELLED_SELECT_STYLE } from '../ui/labelled-select.ts';
import { STATUS_ICON_STYLE } from '../ui/status-icon.ts';
import { BUTTON_STYLE } from '../ui/button.ts';
import { CALLOUT_STYLE } from '../ui/callout.ts';
import { CHECKLIST_SCRIPT, CHECKLIST_STYLE } from '../ui/checklist.ts';
import { confirmCase, confirmDialog, CONFIRM_DIALOG_STYLE, type ConfirmCase } from '../ui/confirm-dialog.ts';
import { MODE_SVG } from '../ui/mode-icon.ts';
import { DRAWER_STYLE } from '../ui/drawer.ts';
import { FILE_CHIP_SCRIPT, FILE_CHIP_STYLE } from '../ui/file-chip.ts';
import { FOLD_LINE_STYLE } from '../ui/fold-line.ts';
import { GUIDE_CARD_STYLE } from '../ui/guide-card.ts';
import { HERO_STYLE } from '../ui/hero.ts';
import { pageShell } from '../ui/page-shell.ts';
import { POPUP_SCRIPT, POPUP_STYLE } from '../ui/popup.ts';
import { PILL_TABS_SCRIPT, PILL_TABS_STYLE } from '../ui/pill-tabs.ts';
import { PROGRESS_STYLE } from '../ui/progress.ts';
import { STAT_STYLE } from '../ui/stats.ts';
import { TAG_STYLE } from '../ui/tag.ts';
import { TASK_LIST_STYLE } from '../ui/task-list.ts';
import { FIX_WIZARD_SCRIPT } from './fix-wizard-script.ts';
import { ADVANCED_SCRIPT, ADVANCED_VIEW_STYLE, advancedView } from './advanced-view.ts';
import { commandRow, fixWizard, FIX_WIZARD_STYLE } from './fix-wizard.ts';
import { savedInto } from './file-story.ts';
import { fileRows, onlyNamed, type FileRow } from './files.ts';
import { FILES_SCRIPT, FILES_VIEW_STYLE, fileWindows, filesView } from './files-view.ts';
import { helperDrawers, HELPERS_SCRIPT, HELPERS_VIEW_STYLE, helpersView } from './helpers-view.ts';
import { fileNames, nameOf, type FileNames } from './item-names.ts';
import { protectPatterns, type ProtectPatterns } from './protect-patterns.ts';
import { recordGaps, RECORD_VIEW_STYLE } from './record-view.ts';
import { storyWindow, STORY_WINDOW_STYLE } from './story-window.ts';
import { toDoItems } from './to-do.ts';
import { REPORT_VIEWS_SCRIPT, REPORT_VIEWS_STYLE } from './report-views.ts';
import { clockIn } from './times.ts';
import { toDoView, TO_DO_VIEW_STYLE } from './to-do-view.ts';

/**
 * The report page, rebuilt on the UI kit (`specs/2026-09-23-the-report-page.md`; `.ai/plans/2026-09-23-report-redesign.md`).
 * Built beside `HtmlReportRenderer`, which stays the page `report --html` and `start` write until every view is here
 * (slice h). So far: the to-do list, the Fix it wizard (slice c), what happened to each file (slice d), Helpers
 * (slice e), Files, with Protect it on any private file (slice f), and Advanced (slice g).
 *
 * Served by `start`, the page may reach the origin it came from and sends its marks and rules there (P43); written on
 * its own it reaches nowhere, as every other page, and hands over the command instead. A shared copy does neither (P46).
 */
export class ReportPageRenderer implements Renderer<ReportPage> {
  render(page: ReportPage): string {
    const { report } = page;
    const items = toDoItems(report);
    const shared = report.scope.paths.shared;
    const served = page.served === true && !shared;
    const done = new Set(shared ? [] : items.map((item) => item.path as string).filter((path) => page.marks?.has(path) === true));
    const rows = fileRows(report, items, done, page.denied);
    // R5: every file the page names, so two of one name are told apart wherever either is named - its rows, and the files
    // a story says a value was saved into, which need not be rows (found by a review). Every story the page tells is a row's.
    const paths = rows.map((row) => row.path as string);
    const names = fileNames([...paths, ...savedInto(report, paths)]);
    // One Protect window per file, keyed by its row: the wizard, the table and a file's own window open the same one.
    const protectKeys = new Map<string, number>();
    const patterns = new Map<number, ProtectPatterns>();
    rows.forEach((row, key) => {
      // A told file (F57) is the person's choice, and not a file to talk them out of from here: Settings switches it.
      const found = row.protection !== 'yes' && row.protection !== 'told' ? protectPatterns(row.path, shared) : undefined;
      if (found === undefined) return;
      protectKeys.set(row.path, key);
      patterns.set(key, found);
    });
    const toldPaths = new Set(rows.filter((row) => row.protection === 'told').map((row) => row.path as string));
    const protectedPaths = new Set(rows.filter((row) => row.protection === 'yes').map((row) => row.path as string));
    const clock = clockIn(page.timeZone);
    const nav: NavItem[] = [
      ...(page.withIndexLink ? [{ name: 'rp.nav.back', href: 'index.html' }] : []),
      { name: 'rp.nav.todo', href: '#todo', active: true, count: items.length, countTone: 'coral' as const },
      { name: 'rp.nav.files', href: '#files', count: rows.filter((row) => !onlyNamed(row)).length },
      { name: 'rp.nav.helpers', href: '#helpers', count: report.graph.agents.length },
      { name: 'rp.nav.advanced', href: '#advanced' },
    ];

    return pageShell({
      title: 'rp.title',
      policy: served ? INDEX_CONTENT_SECURITY_POLICY_META : CONTENT_SECURITY_POLICY_META,
      styles: [APP_SIDEBAR_STYLE, BUTTON_STYLE, HERO_STYLE, GUIDE_CARD_STYLE, PROGRESS_STYLE, TAG_STYLE, TASK_LIST_STYLE, POPUP_STYLE,
        CHECKLIST_STYLE, ASK_PANEL_STYLE, FILE_CHIP_STYLE, CONFIRM_DIALOG_STYLE, AVATAR_STYLE, PILL_TABS_STYLE, STAT_STYLE, TO_DO_VIEW_STYLE, FIX_WIZARD_STYLE,
        STORY_WINDOW_STYLE, DRAWER_STYLE, FOLD_LINE_STYLE, HELPERS_VIEW_STYLE, DATA_TABLE_STYLE, LABELLED_SELECT_STYLE, STATUS_ICON_STYLE, FILES_VIEW_STYLE,
        ADVANCED_VIEW_STYLE, CALLOUT_STYLE, RECORD_VIEW_STYLE, REPORT_VIEWS_STYLE],
      scripts: [POPUP_SCRIPT, CHECKLIST_SCRIPT, ASK_PANEL_SCRIPT, FILE_CHIP_SCRIPT, PILL_TABS_SCRIPT, FIX_WIZARD_SCRIPT, HELPERS_SCRIPT, FILES_SCRIPT, ADVANCED_SCRIPT, REPORT_VIEWS_SCRIPT],
      sidebar: appSidebar({ home: page.withIndexLink ? 'index.html' : '#todo', items: nav, showProject: false }),
      main: '<section id="todo" data-view>' + toDoView(items, report, done, recordGaps(report).any, clock, rows, { back: page.withIndexLink, ...(page.title === undefined ? {} : { title: page.title }) }, names) + '</section>' +
        '<section id="files" data-view>' + filesView(rows, items, protectKeys, names, report.everydayNamesLeftOut ?? 0) + '</section>' +
        '<section id="helpers" data-view>' + helpersView(report, items, names) + '</section>' +
        '<section id="advanced" data-view>' + advancedView(report, items, done, clock, names) + '</section>' +
        // Windows opened from more than one view live outside all of them (a hidden view hides what is in it).
        helperDrawers(report, items, done, names) + fileWindows(rows, protectKeys, report, clock, names) +
        items.map((item, at) => storyWindow(item, at, report, done.has(item.path), clock, names)).join('') +
        items.map((_item, at) => fixWizard(items, at, { done, shared, protectKeys, protectedPaths, toldPaths, names })).join('') +
        [...patterns].map(([key, found]) => protectWindow(rows[key] as FileRow, key, found, names)).join('') +
        '<div id="wizard-words" data-served="' + served + '" hidden>' + ['wz.all', 'wz.finish', 'wz.saving', 'wz.tickFirst', 'wz.pickFirst']
          .map((key) => '<span data-word="' + key + '">' + inLanguages((t) => t(key)) + '</span>').join('') + '</div>',
    });
  }
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
function protectWindow(row: FileRow, at: number, patterns: ProtectPatterns, names: FileNames): string {
  const path = row.path;
  // The option protects every file of its name, so it says the name alone; the chip says which file this is.
  const name = e(nameOf(path));
  const everyday = row.protection === 'na';
  const words = everyday ? 'mp' : 'pr';
  const found = ' data-pattern="' + e(patterns.exact) + '" data-pattern-every="' + e(patterns.every) + '"';
  const sentence = (key: string): string => inLanguages((t) => t(key, { path: '<code>' + e(path) + '</code>' }));
  // Each case has a tick of its own, so the one the person sees is the one the script reads (BT3).
  const tick = (which: 'block' | 'tell', key: string): string =>
    '<label class="pr-option"><input type="checkbox" data-protect-every="' + which + '"> ' +
    inLanguages((t) => t(key, { name: '<code>' + name + '</code>' })) + '</label>';
  const say = (key: string): string => inLanguages((t) => t(key));
  // BT8: Block hands over `init --protect`, as it always has; no flag writes a told list, so Track hands over the
  // command that opens the page where the change can be made, as Settings' own switch does.
  const handover = (which: 'block' | 'tell', body: string): string =>
    '<div class="wz-handover" data-note-command="' + which + '" hidden><p class="wz-handover-text">' + body + '</p>' + commandRow() + '</div>';
  const note = (body: string): string => '<div class="cf-note" data-protect-note>' +
    '<p class="wz-reason" data-note-reason role="alert" hidden></p>' + body + '</div>';
  if (!everyday && row.protection !== 'no') {
    return confirmDialog({
      id: 'protect-' + at,
      title: say(words + '.title'),
      subject: '<span class="tc-chip" title="' + e(path) + '">' + e(names(path)) + '</span>',
      sentence: sentence(words + '.sentence'),
      option: tick('block', words + '.option'),
      cancel: say('app.cancel'),
      confirm: say(words + '.confirm'),
      confirmAttributes: ' data-protect="' + at + '" data-protect-mode="block"' + found,
      note: note(handover('block', say(words + '.cmd'))),
    });
  }
  const mode = (which: 'block' | 'tell'): ConfirmCase => ({
    mark: MODE_SVG[which],
    markTone: which === 'block' ? 'mint' : 'sand',
    name: say('md.' + which),
    why: say('md.' + which + '.why'),
    sentence: sentence(words + (which === 'block' ? '' : '.tell') + '.sentence'),
    option: tick(which, words + (which === 'block' ? '' : '.tell') + '.option'),
    confirm: say('md.go.' + which),
    // BT4: coral only where the change takes protection away - Track on a private file, which `refuse` was keeping
    // shell commands off. On an everyday file nothing held it, so tracking it only adds a notice, and is mint (BTD4).
    ...(which === 'tell' && !everyday ? { tone: 'primary' as const } : {}),
    confirmAttributes: ' data-protect="' + at + '" data-protect-mode="' + which + '"' + found,
  });
  return confirmDialog({
    id: 'protect-' + at,
    title: say(words + '.title'),
    subject: '<span class="tc-chip" title="' + e(path) + '">' + e(names(path)) + '</span>',
    cancel: say('app.cancel'),
    choice: { question: say('md.q'), options: [mode('block'), mode('tell')] },
    note: note(confirmCase(1, handover('block', say(words + '.cmd'))) + confirmCase(2, handover('tell', say('md.cmd.tell')))),
  });
}
