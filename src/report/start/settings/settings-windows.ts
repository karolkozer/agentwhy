// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages } from '../../render/report-copy.ts';
import { addFilePopup } from '../../render/ui/add-file-popup.ts';
import { confirmDialog, type ConfirmCase } from '../../render/ui/confirm-dialog.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import type { SettingsFile } from '../session-index.ts';
import type { ModeSwitch, RuleRow, SettingsView } from './settings-view.ts';

/**
 * Every window of the Settings page (F35, F38-F40, F56): the confirmation for each hook, one way or the other; **Watch
 * it too**; **Remove**; "Add a private file" with its confirmation; General's switch of who it is all for, and its
 * **Uninstall** (F59). Nothing is written without one of these, and the server's answer (R59-R62). Each confirm button
 * carries the change it posts, as the server reads it (`settings-request.ts`), and - for a page opened as a file - the
 * command that would do the same (R61). Who a change is for is asked once, in General (F56), and no window asks it again.
 */

type Hook = 'watch' | 'refuse';

/** The window a hook's switch opens: the one that turns it on where it is off, and off where it is on. */
export function hookWindowId(hook: Hook, on: boolean): string {
  return 'set-' + hook + '-' + (on ? 'on' : 'off');
}

export const WATCH_WINDOW = 'set-watch-too';
/** K8, K9: every private file that is not blocked whole, blocked in one confirmed write. */
export const FINISH_WINDOW = 'set-finish';
export const ADD_WINDOW = 'set-add';
/** `codex-blocks-too` CK5: the files blocked here, kept from Codex's shell commands too. */
export const CODEX_WINDOW = 'set-codex';
export const ADD_CONFIRM_WINDOW = 'set-add-confirm';

/** The window a row not watched yet opens (F34a): that one group, confirmed like every other write. */
export function rowWatchWindowId(at: number): string {
  return 'set-watch-row-' + at;
}

export function removeWindowId(at: number): string {
  return 'set-remove-' + at;
}

/** F57: the confirmation of one row's switch, and of taking a told row off its list. */
export function modeWindowId(at: number): string {
  return 'set-mode-' + at;
}

export function untellWindowId(at: number): string {
  return 'set-untell-' + at;
}

/** `protected-everywhere` step 3: the confirmation of a computer row's switch, and of taking it out. */
export function computerModeWindowId(at: number): string {
  return 'set-ev-mode-' + at;
}

export function computerRemoveWindowId(at: number): string {
  return 'set-ev-remove-' + at;
}

/**
 * `2026-10-07-a-file-in-its-place.md` IPD1: a computer row written in the anchored form of an older release, rewritten as
 * its place - one row's, and every such row's at once.
 */
export function computerUpdateWindowId(at: number): string {
  return 'set-ev-update-' + at;
}

export const COMPUTER_UPDATE_WINDOW = 'set-ev-update-all';

/** GD24: General's **Uninstall** on the computer's page. */
export const COMPUTER_UNINSTALL_WINDOW = 'set-ev-uninstall';

/** GD23: the window the computer's row 1 opens - alerts in every project, turned on where they are off. */
export function computerAlertsWindowId(on: boolean): string {
  return 'set-ev-alerts-' + (on ? 'on' : 'off');
}

/** Where a computer row's change is posted: the computer's route, the one its rules were written through. */
const EVERYWHERE_ROUTE = ' data-set-url="api/everywhere"';

/** General's confirmation of making everything agentwhy saved one file's (F56). */
export function scopeWindowId(file: SettingsFile): string {
  return 'set-scope-' + file;
}

/** General's **Uninstall** (F59). */
export const UNINSTALL_WINDOW = 'set-uninstall';

export function settingsWindows(view: SettingsView, codex = false): string {
  // The computer's rows are its own to change: their windows do not wait on this project's file being writable.
  const computer = view.rows.map((row, at) => (row.computer === undefined ? '' : computerWindows(row, at, codex))).join('') +
    // GD33: updated on the computer's own page only.
    (view.computer === undefined ? '' : view.rows.map((row, at) => (row.computer?.stale === undefined ? '' : computerUpdateWindow(at, [row]))).join('')) +
    (view.computer !== undefined && view.rows.some((row) => row.computer?.stale !== undefined) ? computerUpdateWindow(undefined, view.rows.filter((row) => row.computer?.stale !== undefined)) : '') +
    // a-file-in-its-place IP2: the computer's Add names places - the system's window through the server, or a typed place.
    (view.computer?.add === true ? addFilePopup(ADD_WINDOW, view.computer.places) + computerAddWindow(codex) : '') +
    (view.computer?.alerts === true ? computerAlertsWindow(view.alerts.on) : '') +
    (view.computer?.uninstall === true ? computerUninstallWindow() : '');
  if (!view.canWrite) return computer;
  return computer + hookWindow(view, 'watch') + finishWindow(view) + codexWindow(view) + scopeWindow(view, 'local') + scopeWindow(view, 'shared') + uninstallWindow(view) +
    (view.unread.length > 0 || view.rows.some((row) => !row.watched) ? watchWindow(view) : '') +
    view.rows.map((row, at) => (row.watched || row.name === undefined ? '' : rowWatchWindow(view, row.name, row.patterns, at))).join('') +
    view.rows.map((row, at) => (row.remove === undefined ? '' : removeWindow(at, row.remove.rule, row.remove.file))).join('') +
    view.rows.map((row, at) => (row.switchTo === undefined ? '' : modeWindow(view, row, at))).join('') +
    view.rows.map((row, at) => (row.untell === undefined ? '' : untellWindow(view, row, at))).join('') +
    (view.canAdd ? addWindow() + addConfirmWindow(view) : '');
}

/**
 * F40: turning alerts on or off, confirmed; turning off is the coral button. It is written where General says (F56) -
 * the one file everything is in, else where an add goes - and asks nobody again. `refuse` has no window of its own: it
 * is half of every block (`block-means-blocked` K1), and Finish blocking is where a missing one is put back.
 */
function hookWindow(view: SettingsView, hook: 'watch'): string {
  const state = view.alerts;
  const on = !state.on;
  const words = 'set.confirm.alerts.' + (on ? 'on' : 'off');
  const id = hookWindowId(hook, on);
  const where = on ? view.writeTo : state.who ?? 'local';
  // `init --watch` alone takes a running `refuse` out of the file it writes (R4b), so the command names it too
  // wherever it runs from that file; the page's own write says the same with `keep`.
  const otherIn = view.stop.who === where;
  const command = on
    ? 'agentwhy init --' + hook + (otherIn ? ' --refuse' : '') + shared(where)
    : 'agentwhy init --remove --' + hook + shared(where);

  return confirmDialog({
    id,
    glyph: '',
    title: inLanguages((t) => t(words)),
    subject: '',
    sentence: inLanguages((t) => t(words + '.text')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t(on ? 'set.confirm.turnOn' : 'set.confirm.turnOff')),
    tone: on ? 'mint' : 'primary',
    confirmAttributes: write({ change: 'hooks', hooks: [hook], on, where }) + commandAttribute(where, command),
  });
}

/**
 * F56: everything agentwhy saved, into one file - its rules moved one by one, then its hooks. Offered only where there
 * is something to move; the command for a page opened as a file is the same runs, in the same order.
 */
function scopeWindow(view: SettingsView, file: SettingsFile): string {
  const move = view.moves[file];
  if (move.patterns.length === 0 && move.hooks.length === 0) return '';
  const from: SettingsFile = file === 'local' ? 'shared' : 'local';
  const commands = [
    ...move.patterns.flatMap((pattern) => [
      'agentwhy init --remove --unprotect ' + quoted(pattern) + shared(from),
      'agentwhy init --protect ' + quoted(pattern) + shared(file),
    ]),
    ...(move.hooks.length === 0 ? [] : ['agentwhy init ' + hooksNow(view, file, move.hooks).map((hook) => '--' + hook).join(' ') + shared(file)]),
  ];
  return confirmDialog({
    id: scopeWindowId(file),
    glyph: '',
    title: inLanguages((t) => t('set.confirm.scope.' + file)),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.scope.' + file + '.text')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.scope.go')),
    tone: 'mint',
    confirmAttributes: write({ change: 'scope', patterns: move.patterns, hooks: move.hooks, where: file }) + commandAttribute(file, commands.join(' && ')),
  });
}

/**
 * F59: both hooks and every whole rule agentwhy wrote, out of each file that holds any - the coral button, since it takes
 * all protection away. It says what stays, and, where the shared file is one of them, that everyone gets the change.
 */
function uninstallWindow(view: SettingsView): string {
  const files = (['local', 'shared'] as const).filter((file) => view.uninstall[file] !== undefined);
  if (files.length === 0) return '';
  const command = files.map((file) => 'agentwhy init --remove --watch --refuse' +
    (view.uninstall[file] ?? []).map((rule) => ' --unprotect ' + quoted(rule)).join('') + shared(file)).join(' && ');
  // AO17: one project's uninstall leaves agentwhy's check in the person's own Codex settings for the other projects
  // (AOD4) - said here, with the unticked choice that takes it out of Codex too.
  const codex = view.codex === undefined ? '' :
    '<label class="set-tick"><input type="checkbox" name="set-uninstall-codex">' +
    '<span>' + inLanguages((t) => t('set.confirm.uninstall.codex')) + '</span></label>';
  return confirmDialog({
    id: UNINSTALL_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('set.confirm.uninstall')),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.uninstall.text') + (files.includes('shared') ? ' ' + t('set.confirm.everyone') : '')),
    option: codex,
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.uninstall.go')),
    tone: 'primary',
    confirmAttributes: write({ change: 'uninstall', rules: view.uninstall }) +
      (view.codex === undefined ? '' : ' data-set-tick="set-uninstall-codex"') +
      commandAttribute('local', command),
  });
}

/** The hooks a file runs once the moved ones are in it: `init` with hook flags takes out any it is not given (R4b). */
function hooksNow(view: SettingsView, file: SettingsFile, moved: readonly Hook[]): Hook[] {
  const there = (['watch', 'refuse'] as const).filter((hook) => (hook === 'watch' ? view.alerts.who : view.stop.who) === file);
  return [...new Set([...there, ...moved])];
}

/**
 * K9: what is missing of every block, in one write - the rules no file holds, with the built-in list and `refuse`, as an
 * add writes them; or, where every rule is there, `refuse` alone, where it is written and asks nobody (F56). The window
 * names the files as their rows do, and closes with the guidelines' honesty line, as every block does.
 */
function finishWindow(view: SettingsView): string {
  const { rows, patterns, refuse } = view.unfinished;
  if (patterns.length === 0 && !refuse) return '';
  const open = view.rows.filter((row) => row.kept !== undefined);
  const alertsIn = view.alerts.who === view.writeTo;
  const confirmAttributes = patterns.length > 0
    ? write({ change: 'adopt', patterns, where: view.addTo }) + commandAttribute(view.addTo, protectCommand(view, patterns, view.addTo))
    : write({ change: 'hooks', hooks: ['refuse'], on: true, where: view.writeTo }) +
      commandAttribute(view.writeTo, 'agentwhy init --refuse' + (alertsIn ? ' --watch' : '') + shared(view.writeTo));
  return confirmDialog({
    id: FINISH_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('set.finish.title')),
    subject: '',
    sentence: inLanguages((t) => t('set.finish.text', { n: rows, names: open.map((row) => rowName(row, t)).join(', ') }) +
      // The built-in list it writes is what these rows are, so the add's "written into your project with it" is not said.
      ((patterns.length > 0 ? view.addTo : view.writeTo) === 'shared' ? ' ' + t('set.confirm.everyone') : '') +
      '<span class="set-soft set-honest">' + t('set.finish.honest') + '</span>'),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.finish.yes', { n: rows })),
    tone: 'mint',
    confirmAttributes,
  });
}

/**
 * `codex-approves-its-own-hook` AO8, AO10: agentwhy's Codex check, written to the person's own files and approved by
 * agentwhy itself - the page's confirmation is the consent, as for every block - and the honesty line under it. Opened
 * from `off` and from `stale` alike: the same write installs and heals. Opened as a file, it hands over
 * `agentwhy init --codex`.
 */
function codexWindow(view: SettingsView): string {
  if ((view.codex !== 'off' && view.codex !== 'stale') || !view.stop.on) return '';
  return confirmDialog({
    id: CODEX_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('set.codex.title')),
    subject: '',
    sentence: inLanguages((t) => t('set.codex.text') + '<span class="set-soft set-honest">' + t('set.finish.honest') + '</span>'),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.codex.yes')),
    tone: 'mint',
    confirmAttributes: write({ change: 'codex' }) + commandAttribute(view.writeTo, 'agentwhy init --codex'),
  });
}

/** F34 and O7: the project's own rules, copied into the file the hooks read - with the built-in list where it is missing. */
function watchWindow(view: SettingsView): string {
  const patterns = [...new Set([...view.withBuiltIn, ...view.unread.map((rule) => rule.rule)])];
  return confirmDialog({
    id: WATCH_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('set.confirm.watch')),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.watch.text') + extra(view, t)),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.watch.go')),
    confirmAttributes: write({ change: 'adopt', patterns, where: view.addTo }) + commandAttribute(view.addTo, protectCommand(view, patterns, view.addTo)),
  });
}

/** F34a: one built-in group written into the file the hooks read - the same change as Watch them too, for that group. */
function rowWatchWindow(view: SettingsView, name: string, patterns: readonly string[], at: number): string {
  return confirmDialog({
    id: rowWatchWindowId(at),
    glyph: '',
    title: inLanguages((t) => t('set.confirm.row')),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.row.text', { name: '<strong>' + t('set.rule.' + name) + '</strong>' })),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.watch.go')),
    confirmAttributes: write({ change: 'adopt', patterns, where: view.addTo }) + commandAttribute(view.addTo, protectCommand(view, patterns, view.addTo)),
  });
}

/**
 * F57: one row to the other mode. Going to Tell me is the risky way, so it is the coral button and says the cost - for a
 * built-in group, in the words of the decision of 2026-09-24: what is inside goes to the AI company, and only changing
 * the keys undoes it. Where alerts are off, it says the report is then the only place it is seen. Going to Block is
 * the mint "Yes, block it". A page opened as a file cannot write a told list, so its command is `agentwhy start`.
 */
function modeWindow(view: SettingsView, row: RuleRow, at: number): string {
  const change = row.switchTo as ModeSwitch;
  const tell = change.to === 'tell';
  const words = tell ? (row.name === undefined ? 'set.confirm.tell' : 'set.confirm.tell.secret') : 'set.confirm.block';
  return confirmDialog({
    id: modeWindowId(at),
    glyph: '',
    title: inLanguages((t) => t(words)),
    subject: '',
    sentence: inLanguages((t) => t(words + '.text', { name: rowName(row, t) }) + (tell && !view.alerts.on ? ' ' + t('set.confirm.tell.alertsOff') : '')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t(tell ? 'set.confirm.tell.go' : 'set.confirm.block.go')),
    tone: tell ? 'primary' : 'mint',
    confirmAttributes: write({ change: 'mode', to: change.to, patterns: change.patterns, rules: change.rules, where: view.writeTo }) + commandAttribute(view.writeTo, 'agentwhy start'),
  });
}

function untellWindow(view: SettingsView, row: RuleRow, at: number): string {
  return confirmDialog({
    id: untellWindowId(at),
    glyph: '',
    title: inLanguages((t) => t('set.confirm.untell')),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.untell.text', { name: rowName(row, t) })),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.remove.go')),
    tone: 'primary',
    confirmAttributes: write({ change: 'mode', to: 'none', patterns: row.untell ?? [], rules: [], where: view.writeTo }) + commandAttribute(view.writeTo, 'agentwhy start'),
  });
}

/**
 * A computer row's two windows (G6, G15, GD9): to Track is the coral one and says the cost, in every project, as a
 * project's does; to Block says it holds in every project and no project can lift it, with the honesty line; taking
 * it out says what it no longer does everywhere, and that a project protecting it itself still does. Opened as a file,
 * a block's change is `agentwhy protect`'s, and a Track's has no command, so it is `agentwhy start`'s page.
 */
/**
 * GD23: alerts in every project, turned on or off - the person's own Claude Code settings' one hook, confirmed as a
 * project's is (F40), and written through the computer's route. Off is the coral button.
 */
function computerAlertsWindow(onNow: boolean): string {
  const on = !onNow;
  const words = 'set.ev.confirm.alerts.' + (on ? 'on' : 'off');
  return confirmDialog({
    id: computerAlertsWindowId(on),
    glyph: '',
    title: inLanguages((t) => t(words)),
    subject: '',
    sentence: inLanguages((t) => t(words + '.text')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t(on ? 'set.confirm.turnOn' : 'set.confirm.turnOff')),
    tone: on ? 'mint' : 'primary',
    confirmAttributes: write({ alerts: on }) + EVERYWHERE_ROUTE + commandAttribute('local', 'agentwhy start'),
  });
}

/**
 * GD24: what the computer setup wrote, taken out behind one coral confirmation - its rules, its told list and its alerts.
 * It says what stays: every project's own setup, a rule written by hand, and Codex's check, which projects share.
 */
function computerUninstallWindow(): string {
  return confirmDialog({
    id: COMPUTER_UNINSTALL_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('set.ev.confirm.uninstall')),
    subject: '',
    sentence: inLanguages((t) => t('set.ev.confirm.uninstall.text')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.uninstall.go')),
    tone: 'primary',
    confirmAttributes: write({ uninstall: true }) + EVERYWHERE_ROUTE + commandAttribute('local', 'agentwhy start'),
  });
}

function computerWindows(row: RuleRow, at: number, codex: boolean): string {
  const rule = row.computer;
  if (rule === undefined) return '';
  const pattern = row.patterns[0] ?? '';
  const name = (t: (key: string) => string): string => (rule.id !== undefined ? '<strong>' + t('ob.ev.row.' + rule.id) + '</strong>'
    : row.name !== undefined ? '<strong>' + t('set.rule.' + row.name) + '</strong>' : '<code class="set-code">' + e(pattern) + '</code>');
  const tell = row.mode === 'block';
  // IPD1: a row in the old form is switched into its place, the old form taken out - never rewritten as it was.
  const target = rule.stale?.place ?? pattern;
  const mode = !rule.switchable ? '' : confirmDialog({
    id: computerModeWindowId(at),
    glyph: '',
    title: inLanguages((t) => t(tell ? 'set.ev.tell' : 'set.ev.block')),
    subject: '',
    sentence: inLanguages((t) => tell
      ? t('set.ev.tell.text', { name: name(t) })
      : t(codex ? 'set.ev.block.text.codex' : 'set.ev.block.text', { name: name(t) }) + '<span class="set-soft set-honest">' + t('set.finish.honest') + '</span>'),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t(tell ? 'set.confirm.tell.go' : 'set.confirm.block.go')),
    tone: tell ? 'primary' : 'mint',
    confirmAttributes: write(tell ? { block: [], tell: [target], unblock: [pattern] } : { block: [target], tell: [], untell: [pattern] }) + EVERYWHERE_ROUTE +
      commandAttribute('local', 'agentwhy start'),
  });
  const remove = !rule.removable ? '' : confirmDialog({
    id: computerRemoveWindowId(at),
    glyph: '',
    title: inLanguages((t) => t(row.mode === 'block' ? 'set.ev.unblock' : 'set.ev.untell')),
    subject: '',
    sentence: inLanguages((t) => t(row.mode === 'block' ? 'set.ev.unblock.text' : 'set.ev.untell.text', { name: name(t) })),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.remove.go')),
    tone: 'primary',
    confirmAttributes: write(row.mode === 'block' ? { block: [], tell: [], unblock: [pattern] } : { block: [], tell: [], untell: [pattern] }) + EVERYWHERE_ROUTE +
      // Always quoted: a pattern's stars would be expanded by the shell before agentwhy saw them.
      commandAttribute('local', row.mode === 'block' ? "agentwhy protect --remove --unprotect '" + pattern.replace(/'/g, "'\\''") + "'" : 'agentwhy start'),
  });
  return mode + remove;
}

/**
 * IPD1: rows written in the anchored form of an older release, rewritten as their places in one request - each blocked
 * one blocked at its place and the old rule taken out, each tracked one the same on the told list. `at` is the one row's
 * window; absent, every such row's.
 */
function computerUpdateWindow(at: number | undefined, rows: readonly RuleRow[]): string {
  const blocked = rows.filter((row) => row.mode === 'block');
  const told = rows.filter((row) => row.mode === 'tell');
  const placeOf = (row: RuleRow): string => row.computer?.stale?.place ?? row.patterns[0] ?? '';
  const one = at !== undefined;
  return confirmDialog({
    id: one ? computerUpdateWindowId(at) : COMPUTER_UPDATE_WINDOW,
    glyph: '',
    title: inLanguages((t) => t(one ? 'set.ev.update' : 'set.ev.updateAll')),
    subject: rows.map((row) => '<span class="chip set-pattern">' + e(placeOf(row)) + '</span>').join(' '),
    sentence: inLanguages((t) => t(one ? 'set.ev.update.text' : 'set.ev.updateAll.text')),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t(one ? 'set.ev.update.go' : 'set.ev.updateAll.go')),
    tone: 'mint',
    confirmAttributes: write({
      block: blocked.map(placeOf), tell: told.map(placeOf),
      unblock: blocked.map((row) => row.patterns[0] ?? ''), untell: told.map((row) => row.patterns[0] ?? ''),
    }) + EVERYWHERE_ROUTE + commandAttribute('local', 'agentwhy start'),
  });
}

/** A row as a sentence names it: a built-in group by its words, anything else by its pattern. */
function rowName(row: RuleRow, t: (key: string) => string): string {
  return row.name === undefined ? '<code class="set-code">' + e(row.patterns[0] ?? '') + '</code>' : '<strong>' + t('set.rule.' + row.name) + '</strong>';
}

function removeWindow(at: number, rule: string, file: SettingsFile): string {
  return confirmDialog({
    id: removeWindowId(at),
    glyph: '',
    title: inLanguages((t) => t('set.confirm.remove')),
    subject: '',
    sentence: inLanguages((t) => t('set.confirm.remove.text', { name: '<code class="set-code">' + e(rule) + '</code>' })),
    option: '',
    note: say(),
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('set.confirm.remove.go')),
    tone: 'primary',
    confirmAttributes: write({ change: 'unprotect', pattern: rule, where: file }),
  });
}

/**
 * F35, F36: the kit's "Add a private file" (`add-file-popup.ts`), which the onboarding opens too. It hands the page a
 * name turned into a pattern, and Settings' script opens the confirmation below with it.
 */
function addWindow(): string {
  return addFilePopup(ADD_WINDOW);
}

/**
 * The confirmation of an add (F35, F36; `2026-10-07-several-at-once.md` AS6). One item: the pattern exactly as it will
 * be written, and what it covers. Several: the first four names, "+N" for the rest - never a list as long as what was
 * chosen. Both ask **Block** or **Track**, Block first, as a file's own window does (F57). The script shows the parts
 * of the case it has (`data-set-one`, `data-set-many`) and fills them from the list the add window hands over.
 */
function addConfirmWindow(view: SettingsView): string {
  const name = '<code class="set-code" data-set-name></code>';
  const kinds = (['file', 'folder', 'pattern'] as const).map((kind) =>
    '<span class="set-kind" data-set-kind="' + kind + '"' + (kind === 'file' ? '' : ' hidden') + '>' +
    inLanguages((t) => t('set.confirm.add.' + kind, { name })) + '</span>').join('');
  return confirmDialog({
    id: ADD_CONFIRM_WINDOW,
    glyph: '',
    title: oneOrMany(inLanguages((t) => t('set.confirm.add')), inLanguages((t) => t('set.confirm.addMany'))),
    subject: ADD_SUBJECT,
    sentence: oneOrMany(kinds, inLanguages((t) => t('set.confirm.addMany.text'))) + inLanguages((t) => (view.addTo === 'shared' ? ' ' + t('set.confirm.everyone') : '')),
    cancel: inLanguages((t) => t('app.cancel')),
    choice: {
      question: '',
      options: [
        addMode('block', oneOrMany(inLanguages((t) => t('set.confirm.add.also')), inLanguages((t) => t('set.add.why.block.many'))) +
          (view.withBuiltIn.length === 0 ? '' : inLanguages((t) => ' ' + t('set.confirm.builtIn'))), view),
        addMode('tell', oneOrMany(inLanguages((t) => t('set.add.why.tell.one')), inLanguages((t) => t('set.add.why.tell.many'))), view),
      ],
    },
    note: say(),
  });
}

/** The two answers of an add, each its own confirm button carrying what the script posts (AS7). */
function addMode(mode: 'block' | 'tell', why: string, view: SettingsView | undefined): ConfirmCase {
  return {
    mark: MODE_SVG[mode],
    markTone: mode === 'block' ? 'mint' : 'sand',
    name: inLanguages((t) => t('set.mode.' + mode)),
    why,
    option: '',
    confirm: mode === 'block'
      ? oneOrMany(inLanguages((t) => t(view === undefined ? 'set.confirm.block.go' : 'set.confirm.add.go')), inLanguages((t) => t('set.add.go.block.many')))
      : oneOrMany(inLanguages((t) => t('set.add.go.tell.one')), inLanguages((t) => t('set.add.go.tell.many'))),
    // What the script needs to post the add, and to say it as a command where the page is a file: `--watch` rides
    // along where alerts run from that file, since `init` with a hook flag takes out any it is not given (R4b).
    confirmAttributes: ' data-set-add="' + e(JSON.stringify(view === undefined ? { everywhere: true } : { builtIn: view.withBuiltIn, where: view.addTo, watch: view.alerts.who === view.addTo })) + '"' +
      ' data-set-mode="' + mode + '"' + (view === undefined ? EVERYWHERE_ROUTE : ''),
  };
}

/** The add's subject: the one pattern exactly as written, or the chosen names, four at most and "+N". */
const ADD_SUBJECT = '<span class="chip set-pattern" data-set-pattern data-set-one></span>' +
  '<span class="set-chips" data-set-chips data-set-many hidden></span>';

/** One part of the add's confirmation for one item, and one for several; the script shows the one that fits. */
function oneOrMany(one: string, many: string): string {
  return '<span data-set-one>' + one + '</span><span data-set-many hidden>' + many + '</span>';
}

/**
 * The computer's page adds to the computer's rules (`everything-on-this-computer.md` step 1): the name as it will be
 * written, what it does in every project, and the honesty line - posted to `api/everywhere`, where its rules are written.
 */
function computerAddWindow(codex: boolean): string {
  const name = '<code class="set-code" data-set-name></code>';
  return confirmDialog({
    id: ADD_CONFIRM_WINDOW,
    glyph: '',
    title: oneOrMany(inLanguages((t) => t('set.ev.add')), inLanguages((t) => t('set.ev.addMany'))),
    subject: ADD_SUBJECT,
    sentence: oneOrMany('', inLanguages((t) => t('set.ev.addMany.text'))) + inLanguages((t) => '<span class="set-soft set-honest">' + t('set.finish.honest') + '</span>'),
    cancel: inLanguages((t) => t('app.cancel')),
    choice: {
      question: '',
      options: [
        addMode('block', oneOrMany(inLanguages((t) => t(codex ? 'set.ev.block.text.codex' : 'set.ev.block.text', { name })), inLanguages((t) => t('set.add.why.block.many'))), undefined),
        addMode('tell', oneOrMany(inLanguages((t) => t('set.add.why.tell.one')), inLanguages((t) => t('set.add.why.tell.many'))), undefined),
      ],
    },
    note: say(),
  });
}

/** What else a write from Private files does: the built-in list goes with it (S4.3), and a shared file reaches everyone. */
function extra(view: SettingsView, t: (key: string) => string): string {
  return (view.withBuiltIn.length === 0 ? '' : ' ' + t('set.confirm.builtIn')) + (view.addTo === 'shared' ? ' ' + t('set.confirm.everyone') : '');
}

/**
 * Protecting from a page opened as a file: the rules, and `refuse` with them (F38, amended 2026-09-24), and `watch`
 * where it runs from the same file - `init` with a hook flag takes out any it is not given (R4b).
 */
function protectCommand(view: SettingsView, patterns: readonly string[], where: SettingsFile): string {
  return 'agentwhy init' + patterns.map((pattern) => ' --protect ' + quoted(pattern)).join('') + ' --refuse' +
    (view.alerts.who === where ? ' --watch' : '') + shared(where);
}

function shared(where: SettingsFile): string {
  return where === 'shared' ? ' --shared' : '';
}

/** A shell word, quoted where it needs to be: the same rule the page's script uses for a typed name. */
function quoted(text: string): string {
  return /^[\w@%+=:,./*-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\''") + "'";
}

function commandAttribute(where: SettingsFile, command: string): string {
  return ' data-set-command-' + where + '="' + e(command) + '"';
}

/** The line a window's script fills: saving, the reason a change was refused (R59), or the command to run (R61). */
function say(): string {
  return '<p class="set-say" data-set-say hidden></p>';
}

function write(body: Readonly<Record<string, unknown>>): string {
  return ' data-set-write="' + e(JSON.stringify(body)) + '"';
}
