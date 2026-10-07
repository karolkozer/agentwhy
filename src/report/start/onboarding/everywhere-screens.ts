// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, type Translate } from '../../render/report-copy.ts';
import { pill, trashButton } from '../../render/ui/button.ts';
import { confirmDialog } from '../../render/ui/confirm-dialog.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import { opener } from '../../render/ui/popup.ts';
import { tag } from '../../render/ui/tag.ts';
import type { AppLinks } from '../app-nav.ts';
import { patternKind } from '../settings/files-tab.ts';
import { tickMark } from './done.ts';
import type { EverywhereRow, OnboardingEverywhere, OnboardingView } from './onboarding-view.ts';
import { infoTip, modeIcon, modeSwitch, PLACE_WINDOW } from './steps.ts';

/**
 * The onboarding's computer-wide path (`.ai/specs/2026-10-05-protected-everywhere.md` G7-G10), as the maintainer approved
 * it in the design canvas *Protected everywhere* on 2026-10-06: the fork that asks what agentwhy protects, the *Files*
 * step for the whole computer, its confirmation, and its Done. Each screen is drawn hidden: none of it can write
 * without a script, and the welcome and the project's steps are what a page with none shows (W27).
 */

/** The confirmation window's id. */
export const EV_CONFIRM = 'ob-ev-confirm';

/** A folder and a computer, drawn: no emoji, not even in a card (guidelines §9.3). */
const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
const COMPUTER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';

/** Says Codex only where its check is turned on with the rules (GD13, G17). */
const where = (codex: boolean): string => inLanguages((t) => t(codex ? 'ob.ev.where.codex' : 'ob.ev.where.claude'));

const hint = (key: string): string =>
  '<div class="ob-hint"><span class="ob-hint-mark" aria-hidden="true">✦</span><span>' + inLanguages((t) => t(key)) + '</span></div>';

/** G7a: the mint *Set up* tag the list of projects carries (V10), with the tick drawn in it. */
const SET_UP_TICK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const setUpTag = (): string => tag(SET_UP_TICK + inLanguages((t) => t('proj.setUp')), 'mint', 'badge');

/**
 * The fork (G7): this project, or everything on this computer - asked after the welcome and before the project's steps,
 * with no number of its own. This project starts chosen, as most people start there.
 *
 * G7a, the second time: both cards stay - after the computer's Uninstall the computer is the side that needs setting up
 * - and a side that is set up carries V10's *Set up* tag, and nothing more. A side that is not is drawn as on a first
 * run: nothing is marked *Not set up yet*, which on a new project would name a failure. Where the project is set up the
 * screen says it is the setup seen again, since its hint otherwise sends a person back to the Settings they came from.
 */
export function scopeScreen(view: OnboardingView, everywhere: OnboardingEverywhere): string {
  const { project } = view;
  const card = (value: 'project' | 'everywhere', mark: string, name: string, body: string, set: boolean): string => {
    const on = value === 'project';
    return '<button type="button" class="ob-scope-card' + (on ? ' ob-scope-on' : '') + '" role="radio" aria-checked="' + String(on) + '" data-ob-scope="' + value + '">' +
      '<span class="ob-scope-top"><span class="ob-radio" aria-hidden="true"><span class="ob-radio-dot"></span></span>' +
      '<span class="ob-scope-mark" aria-hidden="true">' + mark + '</span><span class="ob-scope-name">' + name + '</span>' +
      (set ? '<span class="ob-scope-tag">' + setUpTag() + '</span>' : '') + '</span>' +
      '<span class="ob-scope-body">' + body + '</span></button>';
  };
  // The maintainer, 2026-10-07: in the home folder, where no project is the run's, the same two tiles - a project, picked
  // next from the list, or the computer - in place of a list with the computer squeezed above it.
  const here = project.kind === 'none'
    ? '<span>' + inLanguages((t) => t('ob.ev.scope.pick.text')) + '</span>'
    : '<span><strong class="ob-scope-project">' + e(project.name) + '</strong>' +
      (project.kind === 'found' ? ' · ' + inLanguages((t) => t('ob.ev.scope.chats', { n: project.conversations })) : '') + '</span>' +
      (project.place === undefined ? '' : '<span class="chip ob-scope-place">' + e(project.place) + '</span>') +
      '<span>' + inLanguages((t) => t('ob.ev.scope.project.text')) + '</span>';
  const all = '<span>' + inLanguages((t) => t('ob.ev.scope.everywhere.text')) + '</span><span>' + where(everywhere.codex) + '</span>';
  // The setup seen again is the project's own state (W25, W25a): the computer alone being set up is a person still
  // setting this project up for the first time, and the first time's words are theirs.
  const again = view.setUp;
  const next = (value: 'project' | 'everywhere'): string =>
    '<span data-ob-scope-next="' + value + '"' + (value === 'project' ? '' : ' hidden') + '>' +
    inLanguages((t) => t('ob.ev.scope.next.' + value)) + '</span>';
  return '<section class="ob-screen ob-step ob-scope" data-ob-screen="scope" hidden aria-labelledby="ob-scope-title">' +
    (again ? '<p class="ob-scope-again">' + inLanguages((t) => t('ob.ev.scope.again')) + '</p>' : '') +
    '<h2 class="ob-h2" id="ob-scope-title">' + inLanguages((t) => t('ob.ev.scope.title')) + '</h2>' +
    '<p class="ob-step-text">' + inLanguages((t) => t(again ? 'ob.ev.scope.text.again' : 'ob.ev.scope.text')) + '</p>' +
    '<div class="ob-scope-cards" role="radiogroup" aria-labelledby="ob-scope-title">' +
    card('project', FOLDER_SVG, inLanguages((t) => t(project.kind === 'none' ? 'ob.ev.scope.pick' : 'ob.ev.scope.project')), here, view.setUp) +
    card('everywhere', COMPUTER_SVG, inLanguages((t) => t('ob.ev.scope.everywhere')), all, everywhere.setUp) +
    '</div>' +
    // G7a: what the chosen card leads to - three steps, or one. It follows the choice, so it is the script's to draw.
    '<p class="ob-scope-next js-only">' + next('project') + next('everywhere') + '</p>' +
    hint(again ? 'ob.ev.scope.hint.again' : project.kind === 'none' ? 'ob.ev.scope.hint.pick' : 'ob.ev.scope.hint') +
    '<div class="ob-foot js-only">' +
    pill({ label: inLanguages((t) => t('ob.back')), tone: 'outline', size: 'lg', button: true, attributes: ' data-ob-go="welcome"' }) +
    // White, as every way on in the onboarding (the maintainer, 2026-09-29).
    '<span class="ob-foot-end">' + pill({ label: inLanguages((t) => t('ob.continue')), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-scope-go' }) + '</span>' +
    '</div></section>';
}

/** The stepper of the computer-wide path: *Choose* done, *Files* now - "Step 2 of 2" (the approved mock). */
export function everywhereStepper(): string {
  return '<ol class="ob-stepper ob-stepper-ev js-only" data-ob-stepper-ev' + labelAttributes((t) => e(t('ob.ev.stepper'))) + '>' +
    '<li class="ob-stepper-step ob-stepper-past"><span class="ob-stepper-num" aria-hidden="true"><span class="ob-stepper-done">✓</span></span>' +
    inLanguages((t) => t('ob.ev.stepper.choose')) + '</li>' +
    '<li class="ob-stepper-step ob-stepper-now" aria-current="step"><span class="ob-stepper-num" aria-hidden="true"><span class="ob-stepper-n">2</span></span>' +
    inLanguages((t) => t('ob.stepper.files')) + '</li></ol>';
}

/** Drawn, not loaded: the bell Alerts' first row has, for the computer's alerts. */
const BELL_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

/**
 * The *Files* step for the whole computer (G9, GD14, GD11), drawn as the project's step 3 draws its list - the
 * maintainer, 2026-10-06: "make it as the onboarding's and the project's UI rules have it". The same column heads, and
 * each row the same parts: the mode's mark, the human name with its tip and the path as a chip under it, **Block |
 * Track**, who added it, and its action. A row is in or out: in, it has its switch and the bin a name added here has;
 * out, it is drawn dashed and dim, with **Add** where the switch was. What is on this computer starts in; the rows for
 * tools that are not start out and fold into one line, so nobody consents to a row they did not see (GD14, guidelines
 * §1.8). A rule the computer already holds is drawn as it is, with a line saying so, and is not chosen again.
 */
export function everywhereScreen(everywhere: OnboardingEverywhere, back: 'scope' | 'project'): string {
  const folded = everywhere.rows.filter((row) => !row.present && row.now === undefined).length;
  const rows = everywhere.rows.map((row) => everywhereRow(row, everywhere)).join('');
  const more = folded === 0 ? '' : '<button type="button" class="ob-ev-more js-only" aria-expanded="false" data-ob-ev-more>' +
    '<span class="ob-ev-more-mark" aria-hidden="true"></span>' +
    '<span class="ob-ev-more-show">' + inLanguages((t) => t('ob.ev.more', { n: folded })) + '</span>' +
    '<span class="ob-ev-more-hide">' + inLanguages((t) => t('ob.ev.less')) + '</span></button>';
  const kinds = (['file', 'folder', 'pattern'] as const).map((kind) =>
    '<span data-ob-kind="' + kind + '"' + (kind === 'file' ? '' : ' hidden') + '>' + inLanguages((t) => t('set.rule.own.' + kind)) + '</span>').join('');
  // A name the add window hands over: in, on Block, added by you - as the project step adds one.
  const added = '<template data-ob-ev-added-row><li class="ob-rule ob-rule-is-block ob-rule-new ob-ev-row ob-ev-on" data-ob-ev-row data-ob-ev-added>' +
    modeIcon() +
    '<span class="ob-rule-text"><span class="ob-rule-name">' + kinds + '</span><span class="chip ob-rule-chip" data-ob-name></span></span>' +
    '<span class="ob-rule-mode">' + modeSwitch('block', true) + '</span>' +
    '<span class="ob-rule-src">' + tag(inLanguages((t) => t('set.src.short.you')), 'mint') + '</span>' +
    '<span class="ob-rule-act">' + leave() + '</span></li></template>';
  return '<section class="ob-screen ob-step ob-step-files ob-step-ev" data-ob-screen="everywhere" hidden aria-labelledby="ob-ev-title">' +
    '<p class="ob-for"><span class="ob-for-mark ob-ev-for-mark" aria-hidden="true">' + COMPUTER_SVG + '</span>' + inLanguages((t) => t('ob.ev.for')) + '</p>' +
    '<p class="ob-step-no">' + inLanguages((t) => t('ob.ev.step')) + '</p>' +
    '<h2 class="ob-h2" id="ob-ev-title">' + inLanguages((t) => t('ob.ev.files.title')) + '</h2>' +
    '<p class="ob-step-text">' + inLanguages((t) => t('ob.ev.files.text')) + '</p>' +
    (everywhere.writable ? '' : '<div class="ob-notice ob-notice-warn"><span class="ob-notice-mark" aria-hidden="true">!</span><span class="ob-notice-title">' +
      inLanguages((t) => t('ob.ev.cannot')) + '</span></div>') +
    '<div class="ob-list ob-ev-list" data-ob-ev-list>' +
    '<div class="ob-rules-head" aria-hidden="true"><span class="ob-rules-head-file">' + inLanguages((t) => t('set.col.file')) + '</span>' +
    '<span>' + inLanguages((t) => t('set.mode.label')) + '</span><span>' + inLanguages((t) => t('set.col.src')) + '</span>' +
    '<span class="ob-rules-head-act">' + inLanguages((t) => t('set.col.act')) + '</span></div>' +
    '<ul class="ob-rules" data-ob-ev-rows>' + rows + '</ul>' + more +
    (everywhere.writable
      ? '<div class="ob-add js-only">' + pill({
        label: '<span class="ob-plus" aria-hidden="true">+</span>' + inLanguages((t) => t('ob.ev.add')),
        tone: 'light',
        size: 'lg',
        button: true,
        attributes: opener(PLACE_WINDOW),
      }) + '</div>'
      : '') +
    '</div>' + (everywhere.writable ? added : '') +
    hint('ob.ev.files.hint') +
    // The way on stays at the foot of the window however long the list, as step 3's Finish does.
    '<div class="ob-dock"><div class="ob-foot js-only">' +
    pill({ label: inLanguages((t) => t('ob.back')), tone: 'outline', size: 'lg', button: true, attributes: ' data-ob-go="' + back + '"' }) +
    '<span class="ob-foot-end"><span class="ob-skip ob-ev-count" data-ob-ev-count aria-live="polite"></span>' +
    pill({ label: inLanguages((t) => t('ob.continue')), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-ev-continue' + (everywhere.writable ? '' : ' disabled') }) +
    '</span></div></div></section>';
}

/** The bin a row that is in carries: a name added here, or a suggestion left out - the kit's, as step 3 draws it. */
function leave(): string {
  return trashButton(labelAttributes((t) => e(t('set.remove'))) + ' data-ob-ev-leave');
}

/**
 * One row, in step 3's parts. Its name is GD14's in words, or a rule of the person's own said by what it covers; its
 * tip says what Block or Track does in every project (Settings' words for the computer's rules); who added it is
 * agentwhy for GD14's rows and you for your own.
 */
function everywhereRow(row: EverywhereRow, everywhere: OnboardingEverywhere): string {
  const held = row.now !== undefined;
  const writable = everywhere.writable;
  // GD14: what is here starts in; what is not starts out, folded; nothing held is chosen again.
  const on = held || row.present;
  const mode = row.now ?? 'block';
  const name = (t: Translate): string => (row.id === undefined ? t('set.rule.own.' + patternKind(row.pattern)) : t('ob.ev.row.' + row.id));
  const named = (t: Translate): string => (row.id === undefined ? '<code class="ob-code">' + e(row.path) + '</code>' : '<strong>' + name(t) + '</strong>');
  const tip = infoTip(
    inLanguages((t) => t(everywhere.codex ? 'set.ev.block.text.codex' : 'set.ev.block.text', { name: named(t) })),
    inLanguages((t) => t('set.ev.tell.text', { name: named(t) })),
    false,
  );
  // A line under the chip, as step 3 says a row's state: what the computer holds already, or that it is not here yet.
  const note = held
    ? '<span class="ob-ev-note ob-ev-note-' + mode + '">' + inLanguages((t) => t(mode === 'block' ? 'ob.ev.note.blocked' : 'ob.ev.note.tracked')) + '</span>'
    : row.present ? '' : '<span class="ob-ev-note">' + inLanguages((t) => t('ob.ev.note.absent')) + '</span>';
  const switchable = !held && writable;
  const choose = switchable
    ? '<span class="ob-ev-in">' + modeSwitch(mode, true) + '</span>' +
      '<span class="ob-ev-out">' + pill({ label: inLanguages((t) => t('ob.ev.include')), tone: 'outline', size: 'sm', button: true, attributes: ' data-ob-ev-add' }) + '</span>'
    : modeSwitch(mode, false);
  const action = switchable
    ? '<span class="ob-ev-in">' + leave() + '</span><span class="ob-ev-out"><span class="ob-none" aria-hidden="true">—</span></span>'
    : '<span class="ob-none" aria-hidden="true">—</span>';
  return '<li class="ob-rule ob-rule-is-' + mode + ' ob-ev-row' + (on ? ' ob-ev-on' : '') + (held ? ' ob-ev-held' : '') +
    (!row.present && !held ? ' ob-ev-folded' : '') + '" data-ob-ev-row data-ob-ev-pattern="' + e(row.pattern) + '">' +
    modeIcon() +
    '<span class="ob-rule-text"><span class="ob-rule-name">' + inLanguages(name) + tip + '</span>' +
    '<span class="chip ob-rule-chip" title="' + e(row.pattern) + '">' + e(row.path) + '</span>' + note + '</span>' +
    '<span class="ob-rule-mode">' + choose + '</span>' +
    '<span class="ob-rule-src">' + tag(inLanguages((t) => t(row.id === undefined ? 'set.src.short.you' : 'set.src.short.agentwhy')), row.id === undefined ? 'mint' : 'grey') + '</span>' +
    '<span class="ob-rule-act">' + action + '</span></li>';
}

/**
 * The confirmation (guidelines §9.2: every change that writes gets one): what is kept from the AI and what it may read,
 * as chips the script fills from the rows chosen, each group with the one sentence of what it costs, and Codex's check
 * where Codex is used. Mint confirms, as a block makes something safe (O6).
 */
export function everywhereConfirm(everywhere: OnboardingEverywhere): string {
  // The maintainer, 2026-10-07: the files are the ones just chosen on the step - listed here, many would make the window
  // huge - and then "user tego nie widzi": so each part is a card of its own, its mark in its colour, and a title that
  // says how many and what becomes of them, which the script writes in each language; under it, what that means.
  const card = (kind: 'block' | 'tell' | 'alerts', mark: string, title: string, text: string): string =>
    '<div class="ob-ev-group ob-ev-group-' + kind + '" data-ob-ev-group="' + kind + '" hidden>' +
    '<span class="ob-ev-group-mark" aria-hidden="true">' + mark + '</span>' +
    '<span class="ob-ev-group-words"><span class="ob-ev-group-title">' + title + '</span>' +
    '<span class="ob-ev-group-text">' + text + '</span></span></div>';
  const group = (mode: 'block' | 'tell', key: string): string =>
    card(mode, MODE_SVG[mode], inLanguages(() => '<span data-ob-ev-title="' + mode + '"></span>'), inLanguages((t) => t(key + '.text')));
  return confirmDialog({
    id: EV_CONFIRM,
    title: inLanguages((t) => t('ob.ev.confirm.title')),
    subject: '',
    sentence: inLanguages((t) => t(everywhere.codex ? 'ob.ev.confirm.codex' : 'ob.ev.confirm.claude') + ' ' + t('ob.ev.confirm.later')),
    detail: '<div class="ob-ev-groups">' + group('block', 'ob.ev.confirm.blocked') + group('tell', 'ob.ev.confirm.tracked') +
      // GD23: shown where the step turns alerts on.
      card('alerts', BELL_SVG, inLanguages((t) => t('ob.ev.confirm.alerts')), inLanguages((t) => t('ob.ev.confirm.alerts.text'))) +
      '</div>',
    option: '',
    note: (everywhere.codex
      ? '<p class="ob-ev-check-note" data-ob-ev-group="block" hidden><span aria-hidden="true">✦</span><span>' + inLanguages((t) => t('ob.ev.confirm.check')) + '</span></p>'
      : '') + '<p class="ob-say ob-ev-say" data-ob-ev-say hidden></p>',
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('ob.ev.confirm.yes')),
    confirmAttributes: ' data-ob-ev-confirm',
    tone: 'mint',
    glyph: '',
  });
}

/** Where Done leads on: the project this run is for where nobody set it up yet (GD12), or a project to pick in home. */
export type EverywhereNext = { readonly kind: 'project'; readonly name: string } | { readonly kind: 'pick' } | { readonly kind: 'none' };

/**
 * Done for the whole computer: the onboarding's own tick and title, the summary the script fills from the answer, a line
 * for what was blocked and one for what is tracked - Codex named only where its check is on now (GD13) - what failed,
 * and the way on. Finishing it is no project's setup (GD12), so a project nobody set up is offered next.
 */
export function everywhereDone(next: EverywhereNext, links: AppLinks, toComputer = false): string {
  const line = (mode: 'block' | 'tell', words: string): string =>
    '<li class="ob-ev-line ob-ev-line-' + mode + '" data-ob-ev-line="' + mode + '" hidden><span class="ob-ev-line-mark" aria-hidden="true">' + MODE_SVG[mode] + '</span>' +
    '<span>' + words + '</span></li>';
  const blocked = '<span data-ob-ev-codex="on" hidden>' + inLanguages((t) => t('ob.ev.done.blockedLine.codex')) + '</span>' +
    '<span data-ob-ev-codex="else">' + inLanguages((t) => t('ob.ev.done.blockedLine.claude')) + '</span>';
  const failed = (['block', 'tell', 'alerts'] as const).map((change) =>
    '<li data-ob-ev-fail="' + change + '" hidden><span class="ob-fail-mark" aria-hidden="true">!</span><span>' +
    inLanguages((t) => t('ob.ev.done.failed.' + change)) + '</span></li>').join('');
  return '<section class="ob-screen ob-done ob-ev-done" data-ob-screen="everywhere-done" hidden aria-labelledby="ob-ev-done-title">' +
    tickMark() +
    '<h2 class="ob-h2 ob-done-title" id="ob-ev-done-title">' + inLanguages((t) => t('ob.ev.done.title')) + '</h2>' +
    '<p class="ob-ev-summary">' + inLanguages(() => '<span data-ob-ev-summary></span>') + '</p>' +
    '<ul class="ob-ev-lines">' + line('block', blocked) + line('tell', inLanguages((t) => t('ob.ev.done.trackedLine'))) +
    '<li class="ob-ev-line ob-ev-line-alerts" data-ob-ev-line="alerts" hidden><span class="ob-ev-line-mark" aria-hidden="true">' + BELL_SVG + '</span>' +
    '<span>' + inLanguages((t) => t('ob.ev.done.alertsLine')) + '</span></li></ul>' +
    '<ul class="ob-failed" data-ob-ev-failed hidden>' + failed + '</ul>' +
    '<p class="ob-codex" data-ob-ev-codex-off hidden>' + inLanguages((t) => t('ob.ev.done.codexOff')) + '</p>' +
    nextCard(next) +
    // `everything-on-this-computer.md` step 4 (GD15): from a project's page, the computer's own view - the maintainer found
    // this leading into the project the run was started in. On the computer's page it is that page's own Conversations.
    '<div class="ob-done-go">' + (toComputer
      ? pill({ label: inLanguages((t) => t('ob.done.open')), tone: 'mint', size: 'lg', button: true, attributes: ' data-ob-switch-computer' })
      : pill({ label: inLanguages((t) => t('ob.done.open')), tone: 'mint', size: 'lg', href: links.conversations })) + '</div>' +
    // Step 3: Settings lists the computer's rules, and switches and takes them out.
    '<p class="ob-ev-later">' + inLanguages((t) => t('ob.ev.done.later', { settings: '<a class="ob-link" href="' + links.settings + '">' + t('ob.ev.done.settings') + '</a>' })) + '</p>' +
    '</section>';
}

function nextCard(next: EverywhereNext): string {
  if (next.kind === 'none') return '';
  const say = (key: string, t: Translate): string => (next.kind === 'project' ? t(key, { name: '<strong>' + e(next.name) + '</strong>' }) : t(key));
  const base = next.kind === 'project' ? 'ob.ev.done.project' : 'ob.ev.done.pick';
  return '<div class="ob-ev-next"><span class="ob-scope-mark" aria-hidden="true">' + FOLDER_SVG + '</span>' +
    '<span class="ob-ev-next-text"><span class="ob-ev-next-title">' + inLanguages((t) => say(base + '.title', t)) + '</span>' +
    '<span class="ob-ev-next-sub">' + inLanguages((t) => say(base + '.text', t)) + '</span></span>' +
    pill({ label: inLanguages((t) => say(base + '.go', t)), tone: 'outline', size: 'md', button: true, attributes: ' data-ob-go="project"' }) + '</div>';
}

/** The path's own look, on the onboarding's frame and Settings' list. Colours come from the tokens only. */
export const EVERYWHERE_STYLE = String.raw`
.ob-scope{max-width:760px}
.ob-scope-cards{display:flex;flex-wrap:wrap;gap:16px}
.ob-scope-card{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:14px;padding:22px;border-radius:16px;background:var(--card);border:1.5px solid var(--white-10);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .2s,background .2s}
.ob-scope-card:hover{border-color:var(--white-30)}
.ob-scope-on,.ob-scope-on:hover{background:var(--mint-05);border-color:var(--mint-50)}
.ob-scope-on .ob-radio{border-color:var(--mint)}.ob-scope-on .ob-radio-dot{background:var(--mint);transform:scale(1)}
.ob-scope-top{display:flex;align-items:center;gap:12px}
.ob-scope-mark{flex:none;width:36px;height:36px;border-radius:10px;background:var(--white-06);color:var(--text);display:flex;align-items:center;justify-content:center}
.ob-scope-name{min-width:0;font-size:17px;font-weight:600}
.ob-scope-body{display:flex;flex-direction:column;align-items:flex-start;gap:8px;font-size:15px;line-height:1.5;color:var(--text-2)}
.ob-scope-project{color:var(--text);font-weight:600}
.ob-scope-place{font-size:13px}
.ob-scope-again{margin:0 0 10px;font-size:13.5px;color:var(--text-3)}
.ob-scope-tag{margin-left:auto;flex:none}
.ob-scope-tag .tag{gap:5px}
.ob-scope-next{display:flex;margin:16px 0 0;font-size:14.5px;color:var(--text-2)}
.ob-step-ev{max-width:780px}
/* Each of these is js-only, and the kit's .js .js-only{display:revert} would beat a one-class display: two classes, as the kit does. */
.js .ob-stepper-ev.js-only{display:none}
.js .ob[data-ob-at="everywhere"] .ob-stepper:not(.ob-stepper-ev){display:none}
.js .ob[data-ob-at="everywhere"] .ob-stepper-ev{display:flex;visibility:visible}
.ob-ev-for-mark svg{width:13px;height:13px}
.ob-ev-list{overflow:hidden}
.ob-ev-list:not(.ob-ev-open) .ob-ev-folded{display:none}
.ob-ev-note{font-size:13px;line-height:1.4;color:var(--text-3)}
.ob-ev-note-block{color:var(--mint)}.ob-ev-note-tell{color:var(--sand)}
/* In or out: in, the row's switch and its bin; out, the mark dashed and empty, the row dim, and Add where the switch was. */
.ob-ev-in,.ob-ev-out{display:contents}
.ob-ev-row:not(.ob-ev-on) .ob-ev-in,.ob-ev-on .ob-ev-out{display:none}
.ob-ev-row:not(.ob-ev-on) .ob-icon{background:transparent;color:transparent;border:1.5px dashed var(--white-25)}
.ob-ev-row:not(.ob-ev-on) .ob-rule-name,.ob-ev-row:not(.ob-ev-on) .ob-rule-chip,.ob-ev-row:not(.ob-ev-on) .ob-rule-src{opacity:.55}
.js .ob-ev-more.js-only{display:flex}
.ob-ev-more{align-items:center;gap:10px;width:100%;padding:14px 22px;border:0;border-top:1px solid var(--white-06);background:transparent;color:var(--text-2);font:inherit;font-size:14px;font-weight:600;text-align:left;cursor:pointer}
.ob-ev-more:hover{color:var(--text)}
.ob-ev-more-mark{width:18px;text-align:center;color:var(--text-3)}
.ob-ev-more-mark::before{content:"+"}
.ob-ev-open .ob-ev-more-mark::before{content:"−"}
.ob-ev-more-hide,.ob-ev-open .ob-ev-more-show{display:none}
.ob-ev-open .ob-ev-more-hide{display:inline}
.ob-ev-count:hover{color:var(--text-3)}
.ob-step-ev .ob-foot .pill[disabled]{opacity:.45;cursor:not-allowed}
dialog.pp-confirm:has(.ob-ev-groups){max-width:560px}
.ob-ev-groups{display:grid;gap:10px}
.ob-ev-group{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;align-items:start;padding:14px 16px;border-radius:14px;border:1px solid var(--white-09);background:var(--white-04)}
.ob-ev-group[hidden],.ob-ev-check-note[hidden]{display:none}
.ob-ev-group-mark{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px}
.ob-ev-group-mark svg{width:18px;height:18px}
.ob-ev-group-block .ob-ev-group-mark{color:var(--mint);background:var(--mint-12)}
.ob-ev-group-tell .ob-ev-group-mark{color:var(--sand);background:var(--sand-16)}
.ob-ev-group-alerts .ob-ev-group-mark{color:var(--coral);background:var(--coral-12)}
.ob-ev-group-words{display:flex;flex-direction:column;gap:4px;min-width:0}
.ob-ev-group-title{font-size:15.5px;font-weight:650;line-height:1.35;color:var(--text)}
.ob-ev-group-text{font-size:13.5px;line-height:1.5;color:var(--text-3)}
.ob-ev-check-note{display:flex;gap:10px;margin:0 0 18px;padding:12px 14px;border-radius:10px;background:var(--white-04);font-size:13.5px;line-height:1.45;color:var(--text-2)}
.ob-ev-say{text-align:left;margin:0 0 14px}
.ob-ev-line-alerts .ob-ev-line-mark{color:var(--coral)}
.ob-ev-summary{display:inline-flex;margin:4px 0 18px;padding:8px 14px;border-radius:999px;background:var(--mint-12);color:var(--mint);font-size:14px;font-weight:600}
.ob-ev-lines{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:10px;text-align:left;font-size:16px;line-height:1.5;color:var(--text-2)}
.ob-ev-line{display:flex;gap:12px}
.ob-ev-line[hidden]{display:none}
.ob-ev-line-mark{flex:none;display:flex;margin-top:3px}.ob-ev-line-mark svg{width:18px;height:18px}
.ob-ev-line-block .ob-ev-line-mark{color:var(--mint)}.ob-ev-line-tell .ob-ev-line-mark{color:var(--sand)}
.ob-ev-later{margin:16px 0 0;font-size:14px;color:var(--text-3)}
.ob-ev-next{display:flex}
.ob-ev-next{width:100%;box-sizing:border-box;flex-wrap:wrap;align-items:center;gap:16px;margin-top:22px;padding:20px 22px;border-radius:16px;background:var(--card);border:1px solid var(--white-09);text-align:left}
.ob-ev-next-text{flex:999 1 260px;min-width:0;display:flex;flex-direction:column;gap:4px}
.ob-ev-next-title{font-size:16px;font-weight:600}
.ob-ev-next-sub{font-size:14.5px;line-height:1.5;color:var(--text-2)}
.ob-ev-next strong{color:var(--text);font-weight:600}
@media (max-width:640px){.ob-scope-card{padding:18px}.ob-ev-next{padding:18px}.ob-ev-more{padding:14px 18px}}
`;
