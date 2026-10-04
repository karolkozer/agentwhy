// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { textButton } from '../../render/ui/button.ts';
import { chatExample, type ChatTone } from '../../render/ui/chat-example.ts';
import { opener } from '../../render/ui/popup.ts';
import { toggleSwitch } from '../../render/ui/switch.ts';
import { tag } from '../../render/ui/tag.ts';
import type { SettingsView } from './settings-view.ts';
import { hookWindowId } from './settings-windows.ts';

/**
 * Alerts (`for-people-who-build-with-ai.md` F29-F31): the incident first, in a card of its own with a bell, and the two
 * optional moments hanging from it on a line, because they need it. Row 1, the default, is the `watch` hook, so its
 * switch opens the confirmation (F40); rows 2 and 3 are optional notice choices for this project, written at once
 * (R26a), and say nothing while row 1 is off, because without the hook nothing is said at all. Their switch then does
 * not move, but it still answers a click - a greyed switch that does nothing reads as broken - with a bubble that says
 * row 1 comes first and turns it on.
 */
export function alertsTab(view: SettingsView): string {
  const turnOn = view.canWrite ? opener(hookWindowId('watch', true)) : undefined;
  const onOff = (on: boolean): State => ({ key: on ? 'set.state.on' : 'set.state.off', on });
  // Rows 2 and 3 work only through row 1: where its state is unknown, a line saying theirs would claim more than is known.
  const optional = (on: boolean, locked: boolean): State | undefined => (view.known ? onOff(!locked && on) : undefined);

  return '<div class="set-head"><h2 class="set-h2">' + inLanguages((t) => t('set.alerts.title')) + '</h2>' +
    '<p class="set-lead">' + inLanguages((t) => t('set.alerts.lead')) + '</p></div>' +
    '<div class="set-msgs">' +
    row({
      tone: 'coral',
      key: 'read',
      main: true,
      state: !view.known ? { key: 'set.state.unknown', on: false }
        : view.alerts.on ? { key: view.alerts.who === 'shared' ? 'set.state.shared' : 'set.state.local', on: true } : onOff(false),
      control: !view.known ? '' : toggleSwitch({
        on: view.alerts.on,
        disabled: !view.canWrite,
        attributes: labelAttributes((t) => t('set.card.read.name')) + opener(hookWindowId('watch', !view.alerts.on)),
      }),
    }) +
    '<div class="set-opt"><p class="set-opt-label">' + inLanguages((t) => t('set.alerts.optional')) + '</p>' +
    row({
      tone: 'mint',
      key: 'stopped',
      locked: view.stopped.locked,
      state: optional(view.stopped.on, view.stopped.locked),
      control: view.stopped.locked ? lockedSwitch('stopped', turnOn) : toggleSwitch({
        on: view.stopped.on,
        disabled: !view.noticesWritable,
        attributes: labelAttributes((t) => t('set.card.stopped.name')) +
          ' data-set-notice="' + e(JSON.stringify({ on: view.stopped.on ? 'value' : 'refused' })) + '"',
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
        attributes: labelAttributes((t) => t('set.card.fine.name')) +
          ' data-set-notice="' + e(JSON.stringify({ clean: view.fine.on ? 'off' : 'once' })) + '"',
      }),
    }) +
    '</div></div>' +
    (view.noticesWritable || !view.alerts.on ? '' : '<p class="set-quiet">' + inLanguages((t) => t('set.notices.unusable')) + '</p>');
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
  readonly state: State | undefined;
  readonly control: string;
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
    chatExample({ tone: spec.tone, ai: inLanguages((t) => t('set.chat.ai')), answer: word('answer') }) +
    (spec.state === undefined ? '' : stateLine(spec.state)) +
    '<p class="set-say" data-set-say hidden></p>' +
    '</div>' + spec.control + '</article>';
}
