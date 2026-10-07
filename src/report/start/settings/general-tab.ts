// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { avatar } from '../../render/ui/avatar.ts';
import { BRAND_MARK } from '../../render/ui/brand-mark.ts';
import { pill, TRASH_SVG } from '../../render/ui/button.ts';
import { callout } from '../../render/ui/callout.ts';
import { opener } from '../../render/ui/popup.ts';
import { toggleSwitch } from '../../render/ui/switch.ts';
import { tag } from '../../render/ui/tag.ts';
import type { NoticeChannel } from '../../watch/notice-choices.ts';
import type { SettingsFile } from '../session-index.ts';
import { stateLine } from './alerts-tab.ts';
import type { SettingsView } from './settings-view.ts';
import { COMPUTER_UNINSTALL_WINDOW, scopeWindowId, UNINSTALL_WINDOW } from './settings-windows.ts';

/**
 * General (`for-people-who-build-with-ai.md` F56, asked for 2026-09-24; redrawn 2026-09-25): who what agentwhy saved in
 * the project is for, asked once here rather than in every window that writes. Two cards, each with a ring, the one in
 * force filled and tagged; the other card is itself the way to it, through a confirmation that moves everything
 * agentwhy wrote (F40). Where the project holds some of each, the page says so first, and either card makes it one.
 * Under them, which AI agentwhy sees (`which-project.md` V5), and **Uninstall** (F59), where there is anything of
 * agentwhy's to take out.
 */
export function generalTab(view: SettingsView, welcome?: string): string {
  // The computer's: no project's file to choose - its notices, for everywhere, the setup again, and Uninstall (GD24).
  if (view.computer !== undefined) return systemCard(view, 'everywhere') + setupCard(welcome) + computerUninstallCard(view);
  const cards = (['local', 'shared'] as const).map((file) => scopeCard(view, file)).join('');
  return '<section class="set-box set-who"><div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.general.title')) + '</h2>' +
    '<p class="set-lead">' + inLanguages((t) => t('set.general.lead')) + '</p></div>' +
    (view.scope === 'mixed' ? callout({ tone: 'coral', body: inLanguages((t) => t('set.general.mixed')) }) : '') +
    '<div class="set-scopes">' + cards + '</div>' +
    (view.known && view.scope === undefined ? '<p class="set-quiet set-general-note">' + inLanguages((t) => t('set.general.none')) + '</p>' : '') +
    '<p class="set-quiet set-general-note"><span class="set-info" aria-hidden="true">i</span><span>' + inLanguages((t) => t('set.general.note')) + '</span></p>' +
    // which-project V5: which AI agentwhy sees, in the words the project step and the list of projects say it.
    '<p class="set-quiet set-general-note"><span class="set-info" aria-hidden="true">i</span><span>' + inLanguages((t) => t('proj.which')) + '</span></p>' +
    '</section>' +
    systemCard(view) +
    setupCard(welcome) +
    uninstallCard(view);
}

/**
 * Whether agentwhy also shows what it says in the corner of the screen (`2026-10-02-said-where-the-person-is.md` SW13).
 * Asked for by the maintainer on 2026-10-02, who found the notifications tiresome and had only a command to turn them
 * off. Written at once, as Alerts' optional rows are (R26a), keeping every other channel in force; on a page opened as a
 * file, the script offers the command to copy instead.
 */
function systemCard(view: SettingsView, scope: 'project' | 'everywhere' = 'project'): string {
  const on = view.system.on;
  const others = view.system.channels.filter((channel) => channel !== 'os');
  const next: readonly NoticeChannel[] = on ? (others.length === 0 ? ['chat'] : others) : [...others, 'os'];
  return '<section class="set-box set-system"><div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.system.title')) + '</h2>' +
    '<p class="set-lead">' + inLanguages((t) => t('set.system.lead')) + '</p></div>' +
    // Not `set-msg-opt`: that row hangs from Alerts' first on a line, and this one hangs from nothing.
    '<article class="set-msg' + (on ? ' set-msg-on' : '') + '"><div class="set-card-body">' +
    '<div class="set-card-name"><h3 class="set-msg-name">' + inLanguages((t) => t('set.system.name')) + '</h3></div>' +
    '<p class="set-msg-why">' + inLanguages((t) => t('set.system.when')) + '</p>' +
    // As Alerts' optional rows: where the hooks are unknown, so is whether anything is said at all - the switch alone.
    (view.known ? stateLine({ key: on ? 'set.state.on' : 'set.state.off', on }) : '') +
    '<p class="set-say" data-set-say hidden></p></div>' +
    toggleSwitch({
      on,
      disabled: !view.noticesWritable,
      attributes: labelAttributes((t) => t('set.system.name')) + ' data-set-notice="' + e(JSON.stringify(scope === 'project' ? { notify: next } : { notify: next, scope })) + '"',
    }) +
    '</article></section>';
}

/**
 * W25a: the onboarding again, where this run serves it - drawn as Uninstall is (a mark, one sentence, the button), and
 * above it: going through the setup again comes before taking it all out. Nothing is written until its Finish (W10).
 */
function setupCard(welcome: string | undefined): string {
  if (welcome === undefined) return '';
  return '<section class="set-box set-again"><span class="set-again-icon" aria-hidden="true">' + BRAND_MARK + '</span>' +
    '<div class="set-card-body"><h2 class="set-h3">' + inLanguages((t) => t('ob.again.title')) + '</h2>' +
    '<p class="set-uninstall-text">' + inLanguages((t) => t('ob.again.text')) + '</p></div>' +
    pill({ label: inLanguages((t) => t('ob.again.go')), tone: 'outline', size: 'lg', href: welcome }) +
    '</section>';
}

function scopeCard(view: SettingsView, file: SettingsFile): string {
  // Nothing saved yet is "just me" in force: it is where the next thing turned on goes.
  const current = view.known && (view.scope === file || (view.scope === undefined && file === 'local'));
  const move = view.moves[file];
  const canSwitch = view.canWrite && !current && (move.patterns.length > 0 || move.hooks.length > 0);
  const body = '<span class="set-scope-top">' + who(file) + '<span class="set-scope-ring" aria-hidden="true"></span></span>' +
    '<span class="set-card-name"><span class="set-scope-name">' + inLanguages((t) => t('set.general.' + file)) + '</span>' +
    (current ? tag(inLanguages((t) => t('set.general.current')), 'mint', 'badge') : '') + '</span>' +
    '<span class="set-scope-sub">' + inLanguages((t) => t('set.general.' + file + '.sub')) + '</span>';
  if (canSwitch) return '<a class="set-scope" href="#' + scopeWindowId(file) + '"' + opener(scopeWindowId(file)) + '>' + body + '</a>';
  return '<div class="set-scope' + (current ? ' set-scope-on' : '') + '"' + (current ? ' aria-current="true"' : '') + '>' + body + '</div>';
}

/** Who a card is for, drawn: you alone, or you and two others - initials of nobody, only a picture of "everyone". */
function who(file: SettingsFile): string {
  const you = '<span class="av av-grey av-40" aria-hidden="true">' + inLanguages((t) => t('set.general.you')) + '</span>';
  return '<span class="set-scope-who">' + you + (file === 'shared' ? avatar('A', 'coral', 40) + avatar('M', 'mint', 40) : '') + '</span>';
}

/** GD24: the computer's **Uninstall** - a project's card, saying what it takes out of the computer. Nothing there, no card. */
function computerUninstallCard(view: SettingsView): string {
  if (view.computer?.uninstall !== true) return '';
  return '<section class="set-box set-uninstall"><span class="set-uninstall-icon" aria-hidden="true">' + TRASH_SVG + '</span>' +
    '<div class="set-card-body"><h2 class="set-h3">' + inLanguages((t) => t('set.ev.uninstall.title')) + '</h2>' +
    '<p class="set-uninstall-text">' + inLanguages((t) => t('set.ev.uninstall.text')) + '</p></div>' +
    pill({ label: inLanguages((t) => t('set.uninstall.go')), tone: 'outline-coral', size: 'lg', href: '#' + COMPUTER_UNINSTALL_WINDOW, attributes: opener(COMPUTER_UNINSTALL_WINDOW) }) +
    '</section>';
}

/** F59: what agentwhy put into the project, taken out behind one coral confirmation. Nothing to take out, no card. */
function uninstallCard(view: SettingsView): string {
  if (!view.canWrite || Object.keys(view.uninstall).length === 0) return '';
  return '<section class="set-box set-uninstall"><span class="set-uninstall-icon" aria-hidden="true">' + TRASH_SVG + '</span>' +
    '<div class="set-card-body"><h2 class="set-h3">' + inLanguages((t) => t('set.uninstall.title')) + '</h2>' +
    '<p class="set-uninstall-text">' + inLanguages((t) => t('set.uninstall.text')) + '</p></div>' +
    pill({ label: inLanguages((t) => t('set.uninstall.go')), tone: 'outline-coral', size: 'lg', href: '#' + UNINSTALL_WINDOW, attributes: opener(UNINSTALL_WINDOW) }) +
    '</section>';
}
