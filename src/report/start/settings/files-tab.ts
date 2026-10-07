// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, translator } from '../../render/report-copy.ts';
import { pill, trashButton } from '../../render/ui/button.ts';
import { callout } from '../../render/ui/callout.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import { opener } from '../../render/ui/popup.ts';
import { tag, type TagTone } from '../../render/ui/tag.ts';
import type { RuleRow, RuleSource, SettingsView } from './settings-view.ts';
import { ADD_WINDOW, CODEX_WINDOW, COMPUTER_UPDATE_WINDOW, computerModeWindowId, computerRemoveWindowId, computerUpdateWindowId, FINISH_WINDOW, modeWindowId, removeWindowId, rowWatchWindowId, untellWindowId, WATCH_WINDOW } from './settings-windows.ts';
import { namesAPlace } from '../../../adapter/claude-code/policy/deny-rules.ts';
import { COMPUTER_SWITCH } from '../onboarding/everywhere-address.ts';
import { SWITCH_SAY, switchArea } from '../projects/project-switch.ts';

const SOURCE_TONE: Readonly<Record<RuleSource, TagTone>> = { agentwhy: 'grey', project: 'amber', you: 'mint', computer: 'grey' };

/** A padlock left open: a row that says Block and is not blocked whole (`block-means-blocked` K7). Settings' alone. */
const OPEN_LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 7.75-1.4"/></svg>';

/**
 * Private files (F33-F38): what the hooks read, in words, with where each rule came from; the project's rules they do
 * not read yet, above the list (F34); adding a file under it (F35); and, on each row and above the list, where a file
 * that says Block is not blocked whole (`block-means-blocked` K7, K8): the rules stop Claude Code's file tools, and only
 * `refuse` stops `cat .env` or a `grep -r` that prints it. Block is both, and a row with half of it says which is missing.
 */
export function filesTab(view: SettingsView, allowed: number, switchable = false): string {
  // GD33: on a project's page the computer's rows are not this project's - they go below its list, folded and read-only.
  const onComputer = view.computer !== undefined;
  const indexed = view.rows.map((row, at) => [row, at] as const);
  const own = onComputer ? indexed : indexed.filter(([row]) => row.source !== 'computer');
  const elsewhere = onComputer ? [] : indexed.filter(([row]) => row.source === 'computer');
  // K10: blocked is what is blocked whole; the rest are counted by the line above the list.
  const blocked = own.filter(([row]) => row.watched && row.mode === 'block' && row.kept === undefined).length;
  const told = own.filter(([row]) => row.watched && row.mode === 'tell').length;
  return unreadCard(view) + finishCard(view) + codexCard(view) + (onComputer ? staleCard(view) : '') +
    '<div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.files.title')) + '</h2>' +
    '<p class="set-lead">' + inLanguages((t) => t('set.files.lead')) + '</p></div>' +
    // What each half of the switch means, said once in a bubble of its own pointing at the list rather than on every row.
    '<p class="set-legend">' + legend('block') + legend('tell') + '</p>' +
    '<section class="set-list">' +
    // One grid for the heads and every row (asked for 2026-09-24): the switch, the source and the action each keep a column
    // of their own, so they line up whatever a row holds, and a row with no action keeps its empty cell.
    '<div class="set-rules-head" aria-hidden="true"><span class="set-rules-head-file">' + inLanguages((t) => t('set.col.file')) + '</span>' +
    '<span>' + inLanguages((t) => t('set.mode.label')) + '</span><span>' + inLanguages((t) => t('set.col.src')) + '</span>' +
    '<span class="set-rules-head-act">' + inLanguages((t) => t('set.col.act')) + '</span></div>' +
    '<ul class="set-rules">' + own.map(([row, at]) => ruleRow(row, at, view)).join('') + '</ul>' +
    (view.canAdd || view.computer?.add === true
      ? '<div class="set-list-add">' + pill({
        label: '<span class="set-plus" aria-hidden="true">+</span>' + inLanguages((t) => t('set.add')),
        tone: 'light',
        size: 'lg',
        href: '#' + ADD_WINDOW,
        attributes: opener(ADD_WINDOW),
      }) + '</div>'
      : '') +
    '<p class="set-list-foot"><span class="set-count set-count-block">' + inLanguages((t) => t('set.count.block', { n: blocked })) + '</span>' +
    '<span class="set-count set-count-tell">' + inLanguages((t) => t('set.count.tell', { n: told })) + '</span>' +
    (allowed === 0 ? '' : '<span class="set-list-exc">' + inLanguages((t) => t('set.exceptions', { n: allowed })) + '</span>') + '</p>' +
    '</section>' + elsewhereSection(elsewhere, view, switchable);
}

/**
 * GD33, asked for by the maintainer on 2026-10-07 ("jestem w projekcie i mam ustawienia globalne całego komputera, i to
 * jest mylące"): the computer's rules on a project's page, folded below its own list and read-only - still shown, so the
 * page never says less than holds here (G6), and changed on the computer's own page, which the link switches to.
 */
function elsewhereSection(rows: readonly (readonly [RuleRow, number])[], view: SettingsView, switchable: boolean): string {
  if (rows.length === 0) return '';
  const go = switchable
    ? '<div class="set-elsewhere-go"' + switchArea() + '>' + pill({
      label: inLanguages((t) => t('set.elsewhere.go')),
      tone: 'outline',
      size: 'sm',
      button: true,
      attributes: ' data-switch-project="' + COMPUTER_SWITCH + '" data-switch-name="' + e(translator('en')('app.computer.name')) + '"',
    }) + SWITCH_SAY + '</div>'
    : '<p class="set-elsewhere-where">' + inLanguages((t) => t('set.elsewhere.where')) + '</p>';
  return '<details class="set-list set-elsewhere" data-set-elsewhere>' +
    '<summary class="set-elsewhere-head"><span class="set-elsewhere-title">' + inLanguages((t) => t('set.elsewhere.title')) +
    ' <span class="set-elsewhere-count">' + rows.length + '</span></span><svg class="set-elsewhere-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>' +
    '<p class="set-elsewhere-lead">' + inLanguages((t) => t('set.elsewhere.lead')) + '</p>' +
    '<ul class="set-rules">' + rows.map(([row, at]) => ruleRow(row, at, view)).join('') + '</ul>' + go +
    '</details>';
}

function legend(mode: 'block' | 'tell'): string {
  return '<span class="set-legend-item"><span class="set-icon set-icon-sm set-icon-' + mode + '">' + MODE_SVG[mode] + '</span>' +
    '<span><strong>' + inLanguages((t) => t('set.mode.' + mode)) + '</strong> — ' + inLanguages((t) => t('set.legend.' + mode)) + '</span></span>';
}

/**
 * `2026-10-07-a-file-in-its-place.md` IPD1: the computer's rows an older release wrote anchored, which Claude Code applies
 * only inside the folder the AI works in (IPB4) - counted, with one way to write them all as their places.
 */
function staleCard(view: SettingsView): string {
  const n = view.rows.filter((row) => row.computer?.stale !== undefined).length;
  if (n === 0) return '';
  return callout({
    tone: 'coral',
    body: inLanguages((t) => t('set.ev.stale', { n })),
    action: pill({ label: inLanguages((t) => t('set.ev.updateAll.go')), tone: 'primary', size: 'task', href: '#' + COMPUTER_UPDATE_WINDOW, attributes: opener(COMPUTER_UPDATE_WINDOW) }),
  });
}

/**
 * IP5: what a computer row holds, said under its chip - one place, a folder with everything in it, or a name, which
 * Claude Code matches only inside the folder the AI works in (IPB3, IPB4). A row in the old form says so, with its update.
 */
function computerReach(row: RuleRow, at: number, here: boolean): string {
  const pattern = row.patterns[0] ?? '';
  if (row.computer?.stale !== undefined) {
    // GD33: its update is the computer's page's; a project's page says so, and offers nothing it cannot do here.
    return '<span class="set-rule-gap">' + inLanguages((t) => t('set.ev.stale.row')) + (here ? ' <a class="text-link" href="#' + computerUpdateWindowId(at) + '"' +
      opener(computerUpdateWindowId(at)) + '>' + inLanguages((t) => t('set.ev.update.go')) + '</a>' : '') + '</span>';
  }
  const key = !namesAPlace(pattern) ? 'set.place.name' : pattern.endsWith('/**') ? 'set.place.folder' : 'set.place.file';
  return '<span class="set-rule-where">' + inLanguages((t) => t(key)) + '</span>';
}

/** F34 - or, where the hooks read a file without some of the built-in patterns, the same card for those. */
function unreadCard(view: SettingsView): string {
  const missing = view.rows.some((row) => !row.watched);
  if (view.unread.length === 0 && !missing) return '';
  const n = view.unread.length;
  const action = view.canWrite
    ? pill({ label: inLanguages((t) => t('set.watch', { n: view.toWatch })), tone: 'primary', size: 'task', href: '#' + WATCH_WINDOW, attributes: opener(WATCH_WINDOW) })
    : undefined;
  return callout({
    tone: 'coral',
    body: inLanguages((t) => (n > 0 ? t('set.unread', { n }) : t('set.unwatched'))),
    ...(action === undefined ? {} : { action }),
  });
}

/**
 * One row. A built-in group the hooks do not read yet (F34a) offers **Start watching** - on its button or anywhere on
 * the row - which opens the confirmation for that group, the way "Watch them too" confirms them all.
 */
function ruleRow(row: RuleRow, at: number, view: SettingsView): string {
  const canWrite = view.canWrite;
  const watchable = !row.watched && canWrite && row.name !== undefined;
  const pattern = row.patterns[0] ?? '';
  // A human name first, then the file as a chip under it (guidelines §1.2). The chip is the pattern shortened to what a
  // person would recognise; the pattern itself is its tooltip.
  const label = row.computer?.id !== undefined ? inLanguages((t) => t('ob.ev.row.' + row.computer?.id))
    : row.name === undefined ? inLanguages((t) => t('set.rule.own.' + patternKind(pattern))) : inLanguages((t) => t('set.rule.' + row.name));
  const mode = row.watched ? modeSwitch(row, at)
    : watchable
      ? pill({
        label: inLanguages((t) => t('set.rule.watch')),
        tone: 'primary',
        size: 'sm',
        href: '#' + rowWatchWindowId(at),
        attributes: opener(rowWatchWindowId(at)),
      })
      : tag(inLanguages((t) => t('set.rule.notWatched')), 'coral', 'badge');
  // The kit's bin, as the onboarding draws it on a name added there; a link to the confirmation, so it works without a script.
  const remove = (id: string): string => trashButton(labelAttributes((t) => e(t('set.remove'))) + opener(id), '#' + id);
  // A computer row is the computer's to change, whatever this project's file allows (G6).
  const action = row.computer !== undefined ? (row.computer.removable ? remove(computerRemoveWindowId(at)) : '<span class="set-none" aria-hidden="true">—</span>')
    : row.remove !== undefined && canWrite ? remove(removeWindowId(at))
      : row.untell !== undefined ? remove(untellWindowId(at))
        : '<span class="set-none" aria-hidden="true">—</span>';
  const covered = row.covered;
  const gapped = row.kept !== undefined || covered !== undefined;
  const icon = !row.watched ? '' : gapped ? OPEN_LOCK_SVG : MODE_SVG[row.mode];
  const iconClass = !row.watched ? '' : ' set-icon-' + (gapped ? 'gap' : row.mode);
  return '<li class="set-rule' + (row.watched ? '' : ' set-rule-off') + (watchable ? ' set-rule-watchable' : '') + '"' + (watchable ? ' data-set-row' : '') + '>' +
    '<span class="set-icon' + iconClass + '" aria-hidden="true">' + icon + '</span>' +
    '<span class="set-rule-text"><span class="set-rule-name">' + label + '</span>' +
    // IP5: a place is read whole, so on a narrow page its chip wraps rather than cutting the path it names.
    '<span class="chip set-rule-chip' + (namesAPlace(pattern) ? ' set-rule-chip-place' : '') + '" title="' + e(pattern) + '">' + e(patternShort(pattern)) + '</span>' +
    (row.computer === undefined ? '' : computerReach(row, at, view.computer !== undefined)) +
    (row.kept === undefined ? '' : '<span class="set-rule-gap">' + inLanguages((t) => t('set.rule.gap.' + row.kept)) + '</span>') +
    // SW19: tracked here, and still refused by Claude Code's own rule for a wider pattern - said on the row, like a half block.
    (covered === undefined ? '' : '<span class="set-rule-gap">' + inLanguages((t) => t('set.rule.covered', { pattern: e(patternShort(covered)) })) + '</span>') +
    // G15: blocked in every project on this computer as well, so this project's Track would change nothing.
    (row.everywhere === true ? '<span class="set-rule-note">' + inLanguages((t) => t('set.rule.everywhere')) + '</span>' : '') + '</span>' +
    '<span class="set-rule-mode">' + mode + '</span>' +
    '<span class="set-rule-src">' + tag(inLanguages((t) => t('set.src.short.' + row.source)), SOURCE_TONE[row.source], 'sm', row.source === 'computer') + '</span>' +
    '<span class="set-rule-act">' + action + '</span>' +
    '</li>';
}

/** Whether a pattern names every file of a name, everything in a folder of a name, or whatever matches it. */
export function patternKind(pattern: string): 'file' | 'folder' | 'pattern' {
  if (/^\*\*\/[^*?/]+\/\*\*$/.test(pattern)) return 'folder';
  // IP5: a place is a file or a folder by its form - `~/x/**`, `//x/**` - whatever its depth.
  if (/^(?:~\/|\/\/)[^*?]+\/\*\*$/.test(pattern)) return 'folder';
  if (/^(?:~\/|\/\/)[^*?]+$/.test(pattern)) return 'file';
  return /^(?:\*\*\/|\.\/)?[^*?/]+$/.test(pattern) ? 'file' : 'pattern';
}

/** A pattern as a person reads it: `**\/secrets/**` is `secrets/`, `**\/.npmrc` is `.npmrc`; anything else as written. */
export function patternShort(pattern: string): string {
  // IP5: a place as a person reads one - `~/.ssh/`, `~/Projects/my-app/package.json`, `/Volumes/share/` - never shortened.
  const place = /^(~\/|\/\/)(.+?)(\/\*\*)?$/.exec(pattern);
  if (place !== null) return (place[1] === '//' ? '/' : '~/') + place[2] + (place[3] === undefined ? '' : '/');
  const folder = /^\*\*\/(.+)\/\*\*$/.exec(pattern)?.[1];
  if (folder !== undefined) return folder + '/';
  return /^(?:\*\*\/|\.\/)(.+)$/.exec(pattern)?.[1] ?? pattern;
}

/**
 * F57: Block | Tell me, the mode in force marked. The other half opens that row's confirmation, where the page can make
 * the change; where it cannot - a rule written by hand, a list that could not be read - it is drawn, and does nothing.
 */
function modeSwitch(row: RuleRow, at: number): string {
  const half = (mode: 'block' | 'tell'): string => {
    const words = inLanguages((t) => t('set.mode.' + mode));
    if (row.mode === mode) return '<span class="set-mode-half set-mode-on" aria-current="true">' + words + '</span>';
    const id = row.computer === undefined ? (row.switchTo === undefined ? undefined : modeWindowId(at)) : row.computer.switchable ? computerModeWindowId(at) : undefined;
    if (id === undefined) return '<span class="set-mode-half set-mode-off">' + words + '</span>';
    return '<a class="set-mode-half" href="#' + id + '"' + opener(id) + '>' + words + '</a>';
  };
  return '<span class="set-mode set-mode-is-' + row.mode + '" role="group"' + labelAttributes((t) => t('set.mode.label')) + '>' + half('block') + half('tell') + '</span>';
}

/**
 * K8: one coral line above the list, where a row that says Block is not blocked whole, with the one button that closes
 * every gap at once - offered where the page can write, and where one write can close it (`unfinished`). Where `refuse`
 * runs and reads other rules, `init` points it again only when it writes a rule (R4d): the line and the rows say so,
 * and the developer details say which file each hook reads.
 */
function finishCard(view: SettingsView): string {
  const n = view.unfinished.rows;
  if (!view.known || n === 0) return '';
  const fixable = view.canWrite && (view.unfinished.patterns.length > 0 || view.unfinished.refuse);
  return callout({
    tone: 'coral',
    body: inLanguages((t) => t('set.finish.gap', { n })),
    ...(fixable ? { action: pill({ label: inLanguages((t) => t('set.finish.go')), tone: 'primary', size: 'task', href: '#' + FINISH_WINDOW, attributes: opener(FINISH_WINDOW) }) } : {}),
  });
}

/**
 * `codex-approves-its-own-hook` AO3, AO10: in a project that uses Codex, whether the files blocked here are kept from
 * Codex too. Verified (`on`), a grey line states the fact: from the first message, in the terminal and in VS Code,
 * nothing to confirm in Codex. Written but not verified (`stale`), a coral line says Codex may still ask, with the one
 * write that makes it automatic. Not written (`off`) and Claude Code's block running, a coral line with the same
 * write; where Claude Code's block does not run either, Finish blocking above writes both, and this says nothing.
 */
function codexCard(view: SettingsView): string {
  if (!view.known || view.codex === undefined || !view.stop.on) return '';
  if (view.codex === 'on') return callout({ tone: 'grey', body: inLanguages((t) => t('set.codex.on')) });
  const stale = view.codex === 'stale';
  return callout({
    tone: 'coral',
    body: inLanguages((t) => t(stale ? 'set.codex.stale' : 'set.codex.off')),
    ...(view.canWrite ? { action: pill({ label: inLanguages((t) => t(stale ? 'set.codex.fix' : 'set.codex.go')), tone: 'primary', size: 'task', href: '#' + CODEX_WINDOW, attributes: opener(CODEX_WINDOW) }) } : {}),
  });
}
