// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes } from '../report-copy.ts';
import { pill } from '../ui/button.ts';
import { confirmDialog, type ConfirmCase } from '../ui/confirm-dialog.ts';
import { MODE_SVG } from '../ui/mode-icon.ts';
import { opener } from '../ui/popup.ts';
import { glyphIcon } from '../ui/status-icon.ts';
import { commandRow } from './fix-wizard.ts';
import type { FileRow } from './files.ts';
import type { FileNames } from './item-names.ts';

/**
 * Changing a file's mode from its row (`.ai/specs/2026-10-06-change-it-from-the-row.md` QE1-QE12): the badge the row
 * already draws, with a pencil on it, opening one window that offers the other mode - and, under the two cards, the
 * quiet way out that takes protection away, confirmed on its own.
 *
 * A report row is a file; what holds it is a pattern, and the pattern may be wider than the file (QE2, QED2). So the
 * change is made to the pattern, and both windows name it and say how far it reaches. The count is of the files of
 * this conversation, which is all this page can honestly count.
 *
 * One window per row, for both modes: what differs between them - the sentence, which card is in force, two of the
 * buttons' words and the way out - is drawn twice and shown by the mode the window carries (`data-mode`), which the
 * script sets when the server says the change was made. Nothing here is drawn twice over for a mode the row might
 * reach later, and no window can be opened saying something that is no longer true.
 */

/**
 * What a row's own control opens goes where the row goes: Conversations shows this table in a window of its own
 * (`for-people-who-build-with-ai.md` F58), and a window marked this way is carried into it, so the change can be made
 * there instead of sending the reader to the report (QE14).
 */
export const TRAVELS = ' data-row-window';

/**
 * `protected-everywhere` GD32: on the computer's page, which project a row's Block or Track is written into - its id,
 * never a path, carried by the window itself, since the files window brings windows of several reports onto one page.
 */
export function windowProject(project: string | undefined): string {
  return project === undefined ? '' : ' data-project="' + e(project) + '"';
}

/** The mode a row is in, where this page can change it. */
export type RowMode = 'block' | 'tell';

/**
 * A pencil drawn like every other glyph of the kit: one stroke, a 24 box, no fill (guidelines §9.3). Its size is on
 * the element as well as in the style, because an SVG with neither fills whatever holds it: a page built from a
 * half-applied change drew this one the height of a row (the maintainer, 2026-10-06).
 */
const PENCIL_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

export function rowMode(row: FileRow): RowMode | undefined {
  if (row.protection === 'yes' && (row.rules?.length ?? 0) > 0) return 'block';
  return row.protection === 'told' && row.toldBy !== undefined ? 'tell' : undefined;
}

/**
 * What the window of a row changes: the rule that holds the file, and how many other files of this conversation that
 * rule also covers (QE2). The count is of the page's own rows, and the words say "of this conversation", because the
 * files of a project this run never saw cannot be counted here. Absent where this page can change nothing.
 */
export function modeSubject(row: FileRow, rows: readonly FileRow[]): ModeSubject | undefined {
  // `protected-everywhere` G15: a computer-wide rule holds it, which a project's change cannot lift or end - offering
  // one would report a change that changed nothing. It is changed in Settings, where the computer's rules are.
  if (row.everywhere === true) return undefined;
  const covers = (holds: (one: FileRow) => boolean): number => rows.filter((one) => one.path !== row.path && holds(one)).length;
  const mode = rowMode(row);
  if (mode === 'block') {
    const patterns = row.rules ?? [];
    const held = new Set(patterns);
    return { mode, patterns, covers: covers((one) => (one.rules ?? []).some((rule) => held.has(rule))) };
  }
  const told = row.toldBy;
  if (mode === undefined || told === undefined) return undefined;
  return { mode, patterns: [told], covers: covers((one) => one.toldBy === told) };
}

/** What the window of a row changes: the rule that holds the file, and how many other rows of this page it covers. */
export interface ModeSubject {
  readonly mode: RowMode;
  /** The deny rules that hold it, or the one pattern that put it on a told list. */
  readonly patterns: readonly string[];
  /** How many other files of this conversation those patterns cover (QE2). */
  readonly covers: number;
}

const say = (key: string): string => inLanguages((t) => t(key));
const BADGE: Readonly<Record<RowMode, (after: string) => string>> = {
  block: (after) => glyphIcon(MODE_SVG.block, 'mint', say('fl.mode.yes'), after),
  tell: (after) => glyphIcon(MODE_SVG.tell, 'sand', say('fl.mode.told'), after),
};

/** The pencil, on the badge's own line (`status-icon.ts`), where only the look's style decides where it sits. */
const PENCIL = '<span class="fl-pencil" aria-hidden="true">' + PENCIL_SVG + '</span>';

/** Drawn for both modes and shown by the one the window carries, the way a case's own parts are (`confirm-dialog.ts`). */
function when(mode: RowMode, body: string): string {
  return '<span class="md-when md-when-' + mode + '">' + body + '</span>';
}

/**
 * QE1, QE8: the mode cell of a row this page can change - the two answers it may take, one shown, inside the link that
 * opens its window, and beside them the state it falls back to where protection is taken away, which is the one the
 * row would have been drawn in. The script shows one of the three and never writes markup.
 */
export function modeControl(row: FileRow, key: number, mode: RowMode, names: FileNames): string {
  const answer = (which: RowMode): string =>
    '<span data-made="' + which + '" data-made-key="' + key + '"' + (which === mode ? '' : ' hidden') + '>' + BADGE[which](PENCIL) + '</span>';
  const id = 'mode-' + key;
  return '<span class="fl-mode">' +
    '<a class="fl-mode-edit" href="#' + id + '"' + opener(id) + ' data-row-control data-mode-cell="' + key + '"' +
    // Its name says which file it is for, in every language the page is read in, as the kit's own bin does.
    labelAttributes((t) => t('qe.open', { name: e(names(row.path)) })) + '>' + answer('block') + answer('tell') + '</a>' +
    // Hidden until protection is taken away: then this row is a private file nothing holds, with Protect it beside it.
    '<span class="fl-prot" data-protect-open="' + key + '" hidden>' + glyphIcon('!', 'coral', say('fl.mode.no')) +
    pill({ label: say('fl.protect'), tone: 'light', size: 'sm', href: '#protect-' + key, attributes: opener('protect-' + key) + ' data-row-control' }) +
    '</span></span>';
}

/**
 * The window itself (QE2-QE5) and, behind its quiet link, the one that takes protection away. Both are returned
 * together because the link is drawn in the first and the confirmation is the second.
 */
export function modeWindows(row: FileRow, key: number, subject: ModeSubject, names: FileNames, project?: string): string {
  const chip = '<span class="tc-chip" title="' + e(row.path) + '">' + e(names(row.path)) + '</span>';
  const pattern = '<code>' + e(subject.patterns.join('</code>, <code>')) + '</code>';
  const held = (mode: RowMode): string => inLanguages((t) =>
    (subject.covers === 0 ? t('qe.by.' + mode + '.only', { pattern }) : t('qe.by.' + mode, { pattern, n: subject.covers })));
  const sent = (to: 'block' | 'tell' | 'none'): string =>
    ' data-mode-change="' + key + '" data-mode-to="' + to + '" data-mode-patterns="' + e(subject.patterns.join('\n')) + '"';
  const handover = (to: 'block' | 'tell' | 'none', body: string): string =>
    '<div class="wz-handover" data-note-command="' + to + '" hidden><p class="wz-handover-text">' + body + '</p>' + commandRow() + '</div>';
  const note = (body: string): string => '<div class="cf-note" data-mode-note>' +
    '<p class="wz-reason" data-note-reason role="alert" hidden></p>' + body + '</div>';
  // QE3: each card confirms - keeping the mode it names where that is the one in force, changing to it where it is not.
  const card = (which: RowMode): ConfirmCase => ({
    mark: MODE_SVG[which],
    markTone: which === 'block' ? 'mint' : 'sand',
    name: say('md.' + which),
    now: when(which, '<span class="cf-opt-now">' + say('qe.now') + '</span>'),
    why: say('md.' + which + '.why'),
    option: '',
    confirm: when(which, say('qe.keep.' + which)) + when(other(which), say('md.go.' + which)),
    tone: 'mint' as const,
    confirmAttributes: sent(which),
  });
  const dropLink = (mode: RowMode): string =>
    when(mode, '<p class="cf-drop"><a class="text-link" href="#drop-' + key + '"' + opener('drop-' + key) + '>' + say('qe.drop.' + mode) + '</a></p>');
  const window_ = confirmDialog({
    id: 'mode-' + key,
    glyph: '',
    attributes: ' data-mode="' + subject.mode + '"' + TRAVELS + windowProject(project),
    title: say('md.q'),
    subject: chip,
    sentence: when('block', held('block')) + when('tell', held('tell')),
    cancel: say('app.cancel'),
    choice: { question: '', chosen: subject.mode === 'tell' ? 2 : 1, options: [card('block'), card('tell')] },
    note: dropLink('block') + dropLink('tell') +
      note(handover('block', say('pr.cmd')) + handover('tell', say('md.cmd.tell'))),
  });
  const drop = confirmDialog({
    id: 'drop-' + key,
    attributes: ' data-mode="' + subject.mode + '"' + TRAVELS + windowProject(project),
    title: when('block', say('qe.drop.title.block')) + when('tell', say('qe.drop.title.tell')),
    subject: chip,
    sentence: when('block', inLanguages((t) => t('qe.drop.text.block', { pattern }))) +
      when('tell', inLanguages((t) => t('qe.drop.text.tell', { pattern }))),
    option: '',
    cancel: say('app.cancel'),
    confirm: when('block', say('qe.drop.go.block')) + when('tell', say('qe.drop.go.tell')),
    tone: 'primary',
    confirmAttributes: sent('none'),
    note: note(handover('none', say('mp.cmd'))),
  });
  return window_ + drop;
}

function other(mode: RowMode): RowMode {
  return mode === 'block' ? 'tell' : 'block';
}

/**
 * The windows' own. What the row's control looks like lives with the rest of the row, in `files-view.ts`: a page that
 * draws the Files table always carries that style, and the control is part of the table, not of a window.
 */
export const MODE_WINDOW_STYLE = String.raw`
/* What a window says differs with the mode it is about, so both are drawn and the window's own data-mode shows one
   (QE7: nothing moves when the answer changes - only the mode the row is in changes this). */
.md-when{display:none}
dialog[data-mode="block"] .md-when-block,dialog[data-mode="tell"] .md-when-tell{display:contents}
`;
