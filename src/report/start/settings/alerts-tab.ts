// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { pill, textButton } from '../../render/ui/button.ts';
import { callout } from '../../render/ui/callout.ts';
import { chatExample, type ChatTone } from '../../render/ui/chat-example.ts';
import { opener } from '../../render/ui/popup.ts';
import { toggleSwitch } from '../../render/ui/switch.ts';
import { tag } from '../../render/ui/tag.ts';
import type { SettingsView } from './settings-view.ts';
import { codexCardWindowId, computerAlertsWindowId, hideKeysWindowId, hookWindowId, PHRASE_WINDOW } from './settings-windows.ts';

/**
 * Alerts (`for-people-who-build-with-ai.md` F29-F31): the incident first, in a card of its own with a bell, and the two
 * optional moments hanging from it on a line, because they need it. Row 1, the default, is the `watch` hook, so its
 * switch opens the confirmation (F40); rows 2 and 3 are optional notice choices for this project, written at once
 * (R26a), and say nothing while row 1 is off, because without the hook nothing is said at all. Their switch then does
 * not move, but it still answers a click - a greyed switch that does nothing reads as broken - with a bubble that says
 * row 1 comes first and turns it on.
 */
export function alertsTab(view: SettingsView): string {
  // `protected-everywhere` GD23: the computer's page draws the same three rows - its row 1 is alerts in every project,
  // its window the computer's, and rows 2 and 3 are the person's answers for everywhere.
  const computer = view.computer;
  // AP9: a project's row 1 is its own hook, which the plugin does not change (AP8); the computer's is alerts in every project.
  const plugin = computer === undefined ? undefined : view.plugin;
  const rowOne = (on: boolean): string => opener(computer === undefined ? hookWindowId('watch', on) : computerAlertsWindowId(on));
  const writable = computer === undefined ? view.canWrite : computer.alerts;
  const turnOn = writable ? rowOne(true) : undefined;
  const notice = (choice: Readonly<Record<string, string>>): string =>
    ' data-set-notice="' + e(JSON.stringify(computer === undefined ? choice : { ...choice, scope: 'everywhere' })) + '"';
  const onOff = (on: boolean): State => ({ key: on ? 'set.state.on' : 'set.state.off', on });
  // Rows 2 and 3 work only through row 1: where its state is unknown, a line saying theirs would claim more than is known.
  const optional = (on: boolean, locked: boolean): State | undefined => (view.known ? onOff(!locked && on) : undefined);
  const onKey = computer !== undefined ? 'set.ev.state.on' : view.alerts.who === 'shared' ? 'set.state.shared' : 'set.state.local';
  const keys = computer === undefined ? hideKeysRow(view) : '';
  const card = computer === undefined ? cardRow(view) : '';

  return '<div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.alerts.title')) + '</h2>' +
    // The hide-keys row needs no row 1, so where it is drawn the lead says so (KRD1, 2026-11-08).
    '<p class="set-lead">' + inLanguages((t) => t(computer !== undefined ? 'set.ev.alerts.lead' : keys === '' ? 'set.alerts.lead' : card === '' ? 'set.alerts.lead.keys' : 'set.alerts.lead.both')) + '</p></div>' +
    '<div class="set-msgs">' +
    row({
      tone: 'coral',
      key: 'read',
      main: true,
      state: !view.known ? { key: 'set.state.unknown', on: false } : view.alerts.on ? { key: onKey, on: true } : onOff(false),
      // AP9: where the plugin alerts in every project, a switch would change nothing - its badge stands there instead,
      // and a line says where it is turned off. Added to the account, it is not known to run: the switch stays, and the
      // line says what the plugin does while it is on.
      control: plugin === 'on'
        ? '<span class="set-msg-from">' + tag(inLanguages((t) => t('set.ev.plugin.badge')), 'grey', 'badge') + '</span>'
        : !view.known ? '' : toggleSwitch({
          on: view.alerts.on,
          disabled: !writable,
          attributes: labelAttributes((t) => t('set.card.read.name')) + rowOne(!view.alerts.on),
        }),
      ...(plugin === undefined ? {} : { note: inLanguages((t) => t(plugin === 'on' ? 'set.ev.plugin.on' : 'set.ev.plugin.account')) }),
      ...(view.lacksPhrase === undefined ? {} : { offer: phraseOffer() }),
    }) +
    '<div class="set-opt"><p class="set-opt-label">' + inLanguages((t) => t('set.alerts.optional')) + '</p>' +
    row({
      tone: 'mint',
      key: 'stopped',
      says: 'line',
      locked: view.stopped.locked,
      state: optional(view.stopped.on, view.stopped.locked),
      control: view.stopped.locked ? lockedSwitch('stopped', turnOn) : toggleSwitch({
        on: view.stopped.on,
        disabled: !view.noticesWritable,
        attributes: labelAttributes((t) => t('set.card.stopped.name')) + notice({ on: view.stopped.on ? 'value' : 'refused' }),
      }),
    }) +
    row({
      tone: 'grey',
      key: 'fine',
      locked: view.fine.locked,
      state: optional(view.fine.on, view.fine.locked),
      control: view.fine.locked ? lockedSwitch('fine', turnOn) : toggleSwitch({
        on: view.fine.on,
        disabled: !view.noticesWritable,
        attributes: labelAttributes((t) => t('set.card.fine.name')) + notice({ clean: view.fine.on ? 'off' : 'once' }),
      }),
    }) +
    keys +
    card +
    '</div></div>' +
    (view.noticesWritable || !view.alerts.on ? '' : '<p class="set-quiet">' + inLanguages((t) => t('set.notices.unusable')) + '</p>');
}

/**
 * `2026-11-05-a-key-in-what-it-read.md` KRD1: the switch that hides a key before the AI reads it, one of Alerts' optional rows
 * since 2026-11-08 (the maintainer: "to powinno być w alert ... Optional"), read as they are (design guidelines §9.2): named
 * as the moment it acts, one sentence of why, an example of what the AI says, the state in words. Its own hook, so it never
 * waits on row 1; a project's alone (KRO5). Its window says what it does not cover (KR8).
 */
function hideKeysRow(view: SettingsView): string {
  if (!view.canWrite) return '';
  const word = (part: string): string => inLanguages((t) => t('set.card.hidekeys.' + part));
  return '<article class="set-msg set-msg-opt' + (view.hideKeys ? ' set-msg-on' : '') + '">' +
    '<div class="set-card-body">' +
    '<div class="set-card-name"><h3 class="set-msg-name">' + word('name') + '</h3>' +
    tag(inLanguages((t) => t('set.card.optional')), 'grey', 'badge') + '</div>' +
    '<p class="set-msg-why">' + word('when') + '</p>' +
    chatExample({ tone: 'mint', ai: inLanguages((t) => t('set.chat.ai')), answer: word('answer') }) +
    stateLine({ key: view.hideKeys ? 'set.state.on' : 'set.state.off', on: view.hideKeys }) +
    // KR8 under KRD5: turned on by the welcome page, its window is never read, so what it does not cover is said here - and
    // the write it checks only where that check is installed (WK5).
    (view.hideKeys ? '<p class="set-msg-note">' + word('limits') + (view.hideKeysLacksWriteCheck ? '' : ' ' + word('limits.write')) + '</p>' : '') +
    (view.hideKeysLacksWriteCheck ? olderSwitch(word) : '') +
    '</div>' +
    toggleSwitch({ on: view.hideKeys, attributes: labelAttributes((t) => t('set.card.hidekeys.name')) + opener(hideKeysWindowId(!view.hideKeys)) }) +
    '</article>';
}

/**
 * `2026-11-25-the-card-in-codex.md` CCX3: agentwhy's card in Codex's desktop app, where Codex is used on this computer. Its own switch, so
 * it waits on no other row; a server the person added themselves is said and left to them, and one that could not be read is said as that.
 */
function cardRow(view: SettingsView): string {
  if (!view.canWrite || view.codexCard === undefined) return '';
  const word = (part: string): string => inLanguages((t) => t('set.card.codexcard.' + part));
  const on = view.codexCard === 'on';
  const state = view.codexCard === 'unknown' ? 'set.state.unknown' : view.codexCard === 'yours' ? 'set.card.codexcard.yours' : on ? 'set.state.on' : 'set.state.off';
  return '<article class="set-msg set-msg-opt' + (on ? ' set-msg-on' : '') + '">' +
    '<div class="set-card-body">' +
    '<div class="set-card-name"><h3 class="set-msg-name">' + word('name') + '</h3>' +
    tag(inLanguages((t) => t('set.card.optional')), 'grey', 'badge') + '</div>' +
    '<p class="set-msg-why">' + word('when') + '</p>' +
    stateLine({ key: state, on }) +
    (view.codexCard === 'unknown' ? '<p class="set-msg-note">' + word('unknown') + '</p>' : view.codexCard === 'yours' ? '<p class="set-msg-note">' + word('yours.note') + '</p>' : '') +
    '</div>' +
    (view.codexCard === 'on' || view.codexCard === 'off'
      ? toggleSwitch({ on, attributes: labelAttributes((t) => t('set.card.codexcard.name')) + opener(codexCardWindowId(!on)) })
      : '') +
    '</article>';
}

/**
 * `2026-11-23-a-write-over-the-key.md` WK5: a switch turned on before agentwhy had its write check runs without it. One button
 * writes what turning it on writes, which adds that entry alone and leaves the rest of the file as it was (`ProjectSetup`'s
 * older install) - the person said yes to the switch once, and this is the part of it that release could not write. Its answer
 * is said in the row, as a notice row's is.
 */
function olderSwitch(word: (part: string) => string): string {
  return callout({
    tone: 'coral',
    body: word('older'),
    action: pill({
      label: word('older.go'),
      tone: 'primary',
      size: 'task',
      button: true,
      attributes: ' data-set-write="' + e(JSON.stringify({ change: 'hide-keys', on: true })) + '" data-set-command-local="agentwhy init --hide-keys"',
    }),
  }) + '<p class="set-say" data-set-say hidden></p>';
}

/**
 * `2026-11-24-open-agentwhy-from-the-chat.md` RO11: alerts set up before agentwhy checked a message. The button opens a
 * window that says what the entry does - it also stops a message holding a key - since the person said yes to alerts alone.
 */
function phraseOffer(): string {
  return callout({
    tone: 'grey',
    body: inLanguages((t) => t('set.phrase.missing')),
    action: pill({ label: inLanguages((t) => t('set.phrase.go')), tone: 'primary', size: 'task', href: '#' + PHRASE_WINDOW, attributes: opener(PHRASE_WINDOW) }),
  });
}

/**
 * The switch of a row that needs row 1: off, marked `aria-disabled` rather than `disabled` so a click still reaches the
 * page's script, which shows the bubble beside it. The bubble says why, and turns row 1 on where this page can write.
 */
function lockedSwitch(key: 'stopped' | 'fine', turnOn: string | undefined): string {
  const tip = 'set-need-' + key;
  return '<div class="set-sw">' +
    toggleSwitch({
      on: false,
      attributes: labelAttributes((t) => t('set.card.' + key + '.name')) + ' aria-disabled="true" aria-describedby="' + tip + '" data-set-needs-first',
    }) +
    '<div class="set-tip" id="' + tip + '" role="status" data-set-tip hidden>' +
    '<span class="set-tip-text">' + inLanguages((t) => t('set.need')) + '</span>' +
    (turnOn === undefined ? '' : textButton(inLanguages((t) => t('set.need.go')), turnOn, 'set-tip-go')) +
    '</div></div>';
}

/** A switch's state in words, under its row: shared with General's system notifications (SW13). */
export function stateLine(state: State): string {
  return '<div class="set-state' + (state.on ? ' set-state-on' : '') + '"><span class="set-dot" aria-hidden="true"></span>' +
    inLanguages((t) => t(state.key)) + '</div>';
}

/** Drawn, not loaded (§7.5 constraint 1): the bell beside the alert that matters. */
const BELL = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

export interface State {
  readonly key: string;
  readonly on: boolean;
}

interface Row {
  readonly tone: ChatTone;
  readonly key: 'read' | 'stopped' | 'fine';
  readonly main?: boolean;
  readonly locked?: boolean;
  /**
   * Who says the example: the agent, or agentwhy's own line. Row 2's levels are never said by the agent - the choice
   * of R8 (`the-agent-tells-you.md`, amended 2026-09-22) is asked about `value` alone and every weaker level is a
   * line - so an **AI** bubble over it would name a speaker that never speaks it.
   */
  readonly says?: 'line';
  readonly state: State | undefined;
  readonly control: string;
  /** One quiet line under the row's state: where what it says comes from (AP9). */
  readonly note?: string;
  /** What the row offers to add, under its state (RO11). */
  readonly offer?: string;
}

function row(spec: Row): string {
  const word = (part: string): string => inLanguages((t) => t('set.card.' + spec.key + '.' + part));
  const main = spec.main === true;
  return '<article class="set-msg' + (main ? ' set-msg-main' : ' set-msg-opt') + (spec.state?.on === true ? ' set-msg-on' : '') +
    (spec.locked === true ? ' set-msg-locked' : '') + '"' + (main ? ' data-set-first' : '') + '>' +
    (main ? '<span class="set-msg-icon">' + BELL + '</span>' : '') +
    '<div class="set-card-body">' +
    '<div class="set-card-name"><h3 class="set-msg-name">' + word('name') + '</h3>' +
    (main
      ? tag(inLanguages((t) => t('set.card.read.badge')), 'mint', 'badge')
      : tag(inLanguages((t) => t('set.card.optional')), 'grey', 'badge')) + '</div>' +
    '<p class="set-msg-why">' + word('when') + '</p>' +
    chatExample({ tone: spec.tone, ai: inLanguages((t) => t(spec.says === 'line' ? 'set.chat.line' : 'set.chat.ai')), answer: word('answer') }) +
    (spec.state === undefined ? '' : stateLine(spec.state)) +
    (spec.note === undefined ? '' : '<p class="set-msg-note">' + spec.note + '</p>') +
    (spec.offer ?? '') +
    '<p class="set-say" data-set-say hidden></p>' +
    '</div>' + spec.control + '</article>';
}
