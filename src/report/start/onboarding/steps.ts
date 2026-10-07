// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { pill, textButton, trashButton } from '../../render/ui/button.ts';
import { initial } from '../../render/ui/app-sidebar.ts';
import { MODE_SVG } from '../../render/ui/mode-icon.ts';
import { opener } from '../../render/ui/popup.ts';
import { tag, type TagTone } from '../../render/ui/tag.ts';
import { patternKind, patternShort } from '../settings/files-tab.ts';
import type { RuleRow, RuleSource } from '../settings/settings-view.ts';
import { rowKey, type OnboardingView } from './onboarding-view.ts';

/**
 * Steps 2-3 (`.ai/specs/2026-09-24-onboarding.md` W10-W12a; step 1 is the project, `project-step.ts`). Each starts from what is in force (W10), and nothing on
 * them writes: the page's script keeps the choices until Finish, and each file says what its choice does (W14). Step 3
 * is not drawn (2026-09-25, the maintainer): its choices stay what is in force. With no script the steps are sections
 * in order, showing what is in force, and their buttons are not drawn (W27).
 */

/** The window the kit's add popup is given, on this page (W12). */
export const ADD_WINDOW = 'ob-add';
/** `2026-10-07-a-file-in-its-place.md` IP2: the computer step's own add window, which names places, not names. */
export const PLACE_WINDOW = 'ob-add-place';

type StepName = 'who' | 'files';

const NEXT: Readonly<Record<StepName, string>> = { who: 'files', files: 'finish' };
// which-project V19: the project step comes before *Who*.
const BACK: Readonly<Record<StepName, string>> = { who: 'project', files: 'who' };

const SOURCE_TONE: Readonly<Record<RuleSource, TagTone>> = { agentwhy: 'grey', project: 'amber', you: 'mint', computer: 'grey' };

/** Steps 2 and 3, for the project the run is in: `name` is its folder's, said above each step's number (V22). */
export function stepScreens(view: OnboardingView, name: string): string {
  return step('who', 2, whoBody(view), name) + step('files', 3, filesBody(view), name);
}

function step(name: StepName, number: number, body: string, project: string): string {
  const last = name === 'files';
  const next = NEXT[name] === 'finish' ? ' data-ob-finish' : ' data-ob-go="' + NEXT[name] + '"';
  const foot = '<div class="ob-foot js-only">' +
    pill({ label: inLanguages((t) => t('ob.back')), tone: 'outline', size: 'lg', button: true, attributes: ' data-ob-go="' + BACK[name] + '"' }) +
    '<span class="ob-foot-end">' + textButton(inLanguages((t) => t('ob.skip')), next, 'ob-skip') +
    // Continue and Finish are white in the whole onboarding (the maintainer, 2026-09-29): coral read as a warning here.
    pill({ label: inLanguages((t) => t(last ? 'ob.finish' : 'ob.continue')), tone: 'light', size: 'lg', button: true, attributes: next }) +
    '</span></div>';
  return '<section class="ob-screen ob-step ob-step-' + name + '" data-ob-screen="' + name + '" aria-labelledby="ob-' + name + '-title">' +
    '<p class="ob-for"><span class="ob-for-mark" aria-hidden="true">' + e(initial(project)) + '</span>' +
    inLanguages((t) => t('ob.for', { name: '<strong>' + e(project) + '</strong>' })) + '</p>' +
    '<p class="ob-step-no">' + inLanguages((t) => t('ob.step', { n: number })) + '</p>' +
    '<h2 class="ob-h2" id="ob-' + name + '-title">' + inLanguages((t) => t('ob.' + name + '.title')) + '</h2>' +
    // W12a: step 3's lead is Settings' own, so Block and Tell me are said one way on both pages.
    '<p class="ob-step-text">' + inLanguages((t) => t(name === 'files' ? 'set.files.lead' : 'ob.' + name + '.text', { name: '<strong>' + e(project) + '</strong>' })) + '</p>' +
    body +
    '<div class="ob-hint"><span class="ob-hint-mark" aria-hidden="true">✦</span><span>' + inLanguages((t) => t('ob.' + name + '.hint')) + '</span></div>' +
    // On the last step Finish stays at the bottom of the window, so it is never scrolled to.
    (last ? '<div class="ob-dock">' + foot + '<p class="ob-say" data-ob-say hidden></p></div>' : foot) +
    '</section>';
}

/** W11: two radio cards; the chosen one mint (the maintainer, 2026-09-29: as the project chosen in step 1). */
function whoBody(view: OnboardingView): string {
  const card = (value: 'local' | 'shared', avatars: string, recommended: boolean): string => {
    const on = view.who === value;
    return '<button type="button" class="ob-who-card' + (on ? ' ob-who-on' : '') + '" role="radio" aria-checked="' + String(on) + '" data-ob-who="' + value + '">' +
      '<span class="ob-who-top"><span class="ob-avatars" aria-hidden="true">' + avatars + '</span>' +
      '<span class="ob-radio" aria-hidden="true"><span class="ob-radio-dot"></span></span></span>' +
      '<span class="ob-who-name">' + inLanguages((t) => t('ob.who.' + value)) + '</span>' +
      '<span class="ob-who-sub">' + inLanguages((t) => t('ob.who.' + value + '.sub')) + '</span>' +
      (recommended ? tag(inLanguages((t) => t('ob.recommended')), 'mint', 'badge') : '') + '</button>';
  };
  const you = '<span class="ob-avatar">' + inLanguages((t) => t('ob.who.you')) + '</span>';
  return '<div class="ob-who" role="radiogroup" aria-labelledby="ob-who-title">' +
    card('local', you, true) +
    card('shared', you + '<span class="ob-avatar ob-avatar-coral">A</span><span class="ob-avatar ob-avatar-mint">M</span>', false) +
    '</div>';
}

/**
 * W12, W12a: Settings' list, drawn as Settings draws it (asked for 2026-09-25) - the mode's mark, a human name with the
 * file as a chip under it, **Block | Tell me** at the mode in force, where the rule came from, and a bin on a name
 * added here - under the same column heads. The switch writes nothing: the page keeps the choice until Finish, which
 * writes it as Settings' own switch does.
 */
function filesBody(view: OnboardingView): string {
  const alertsOff = !view.messages.alerts.on;
  const rows = view.files.rows.map((row) => ruleRow(row, view.files.canTell, view.files.canAdd, alertsOff)).join('');
  const kinds = (['file', 'folder', 'pattern'] as const).map((kind) =>
    '<span data-ob-kind="' + kind + '"' + (kind === 'file' ? '' : ' hidden') + '>' + inLanguages((t) => t('set.rule.own.' + kind)) + '</span>').join('');
  // An added name's tip: what Block stops, said for a file, a folder or a pattern, and Tell me in Settings' words. The
  // name is filled in as text by the script, as the row's own chip is.
  const said = (kind: 'file' | 'folder' | 'pattern'): string => '<span data-ob-kind="' + kind + '"' + (kind === 'file' ? '' : ' hidden') + '>' +
    inLanguages((t) => t('ob.change.' + kind, { name: '<code class="ob-code" data-ob-name></code>' })) + '</span>';
  const addedTip = infoTip(
    said('file') + said('folder') + said('pattern'),
    inLanguages((t) => t('set.confirm.tell.text', { name: '<code class="ob-code" data-ob-name></code>' })),
    alertsOff,
  );
  const added = '<template data-ob-added-row><li class="ob-rule ob-rule-is-block ob-rule-new" data-ob-added>' + modeIcon() +
    '<span class="ob-rule-text"><span class="ob-rule-name">' + kinds + addedTip + '</span><span class="chip ob-rule-chip" data-ob-name></span></span>' +
    '<span class="ob-rule-mode">' + modeSwitch('block', view.files.canTell) + '</span>' +
    '<span class="ob-rule-src">' + tag(inLanguages((t) => t('set.src.short.you')), SOURCE_TONE.you) + '</span>' +
    '<span class="ob-rule-act">' + trashButton(labelAttributes((t) => e(t('set.remove'))) + ' data-ob-untick') + '</span>' +
    '</li></template>';
  return '<div class="ob-list">' +
    '<div class="ob-rules-head" aria-hidden="true"><span class="ob-rules-head-file">' + inLanguages((t) => t('set.col.file')) + '</span>' +
    '<span>' + inLanguages((t) => t('set.mode.label')) + '</span><span>' + inLanguages((t) => t('set.col.src')) + '</span>' +
    '<span class="ob-rules-head-act">' + inLanguages((t) => t('set.col.act')) + '</span></div>' +
    '<ul class="ob-rules" data-ob-files>' + rows + '</ul>' + added +
    (view.files.canAdd
      ? '<div class="ob-add js-only">' + pill({
        label: '<span class="ob-plus" aria-hidden="true">+</span>' + inLanguages((t) => t('ob.files.add')),
        tone: 'light',
        size: 'lg',
        button: true,
        attributes: opener(ADD_WINDOW),
      }) + '</div>'
      : '') +
    '</div>';
}

/**
 * One of Settings' rows, as Settings draws it; the switch where Settings offers one, drawn and still where it does not.
 * A group not watched yet is drawn on Block where Finish can write it (KD2): it is what Finish makes it. Where it
 * cannot, it says it is not watched, and has no tip - nothing it could do is chosen here.
 */
function ruleRow(row: RuleRow, canTell: boolean, canAdd: boolean, alertsOff: boolean): string {
  const pattern = row.patterns[0] ?? '';
  const name = row.name === undefined ? inLanguages((t) => t('set.rule.own.' + patternKind(pattern))) : inLanguages((t) => t('set.rule.' + row.name));
  // KD2: a row not watched starts on Block, which Finish writes where it can add; Tell me puts it on the told list instead.
  const drawn = row.watched || canAdd;
  // W14, as amended: what the row's choice does, beside its name - Block's words or Tell me's, as the switch stands.
  const named = (t: (key: string) => string): string => (row.name === undefined ? '<code class="ob-code">' + e(patternShort(pattern)) + '</code>' : '<strong>' + t('set.rule.' + row.name) + '</strong>');
  const tip = drawn
    ? infoTip(
      inLanguages((t) => t('set.confirm.block.text', { name: named(t) })),
      inLanguages((t) => t(row.name === undefined ? 'set.confirm.tell.text' : 'set.confirm.tell.secret.text', { name: named(t) })),
      alertsOff,
    )
    : '';
  const mode = drawn ? modeSwitch(row.mode, canTell && (row.watched ? row.switchTo !== undefined : true)) : tag(inLanguages((t) => t('set.rule.notWatched')), 'grey', 'badge');
  // The key the page and the server find this row by (W12a); the switch writes nothing until Finish.
  return '<li class="ob-rule' + (drawn ? ' ob-rule-is-' + row.mode : ' ob-rule-off') + '" data-ob-row="' + e(rowKey(row)) + '" data-ob-secret="' + String(row.name !== undefined) + '">' +
    (drawn ? modeIcon() : '<span class="ob-icon" aria-hidden="true"></span>') +
    '<span class="ob-rule-text"><span class="ob-rule-name" data-ob-row-name>' + name + tip + '</span>' +
    '<span class="chip ob-rule-chip" title="' + e(pattern) + '">' + e(patternShort(pattern)) + '</span></span>' +
    '<span class="ob-rule-mode">' + mode + '</span>' +
    '<span class="ob-rule-src">' + tag(inLanguages((t) => t('set.src.short.' + row.source)), SOURCE_TONE[row.source]) + '</span>' +
    '<span class="ob-rule-act"><span class="ob-none" aria-hidden="true">—</span></span>' +
    '</li>';
}

/** The padlock and the bell, both drawn; the row's mode shows one, so a switch moves it without a script writing markup. */
export function modeIcon(): string {
  return '<span class="ob-icon" aria-hidden="true"><span class="ob-icon-block">' + MODE_SVG.block + '</span><span class="ob-icon-tell">' + MODE_SVG.tell + '</span></span>';
}

/** F57's two-part switch, the mode in force marked; drawn and still where Settings could not switch this row either. */
export function modeSwitch(mode: 'block' | 'tell', switchable: boolean): string {
  const half = (which: 'block' | 'tell'): string => {
    const words = inLanguages((t) => t('set.mode.' + which));
    const on = which === mode;
    return switchable
      ? '<button type="button" class="ob-mode-half' + (on ? ' ob-mode-on' : '') + '" aria-pressed="' + String(on) + '" data-ob-mode="' + which + '">' + words + '</button>'
      : '<span class="ob-mode-half' + (on ? ' ob-mode-on' : ' ob-mode-off') + '">' + words + '</span>';
  };
  return '<span class="ob-mode ob-mode-is-' + mode + '" role="group"' + labelAttributes((t) => e(t('set.mode.label'))) + '>' + half('block') + half('tell') + '</span>';
}

/**
 * W14, as amended 2026-09-25 by the maintainer: no list above Finish. A quiet "i" beside the file's name says what its
 * choice does, on hover or focus: Block's sentence with the guidelines' honesty line (§9.2), or Tell me's, cost
 * included. Both are drawn and the row's mode shows one, so the switch changes it without a script writing markup.
 */
export function infoTip(block: string, tell: string, alertsOff: boolean): string {
  return '<span class="ob-info" tabindex="0"' + labelAttributes((t) => e(t('ob.files.info'))) + '>' +
    '<span class="ob-info-mark" aria-hidden="true">i</span>' +
    '<span class="ob-tip" role="tooltip">' +
    '<span class="ob-tip-block">' + block + '<span class="ob-tip-quiet">' + inLanguages((t) => t('ob.change.honest')) + '</span></span>' +
    '<span class="ob-tip-tell">' + tell + (alertsOff ? '<span class="ob-tip-quiet">' + inLanguages((t) => t('set.confirm.tell.alertsOff')) + '</span>' : '') + '</span>' +
    '</span></span>';
}

/** The steps' own look; the list is Settings' (its columns, marks and switch). Colours come from the tokens only. */
export const STEPS_STYLE = String.raw`
.ob-step{max-width:640px;margin:0 auto}
.ob-step-files{max-width:780px}
.ob-for{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:13.5px;color:var(--text-3);overflow-wrap:anywhere}
.ob-for strong{color:var(--text);font-weight:600}
.ob-for-mark{flex:none;width:20px;height:20px;border-radius:6px;background:var(--white-08);border:1px solid var(--white-10);color:var(--text);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ob-step-no{margin:0 0 10px;font-size:14px;font-weight:600;color:var(--coral-text)}
.ob-h2{margin:0 0 10px;font-size:34px;line-height:1.15;letter-spacing:-.02em;font-weight:650;text-wrap:balance}
.ob-step-text{margin:0 0 26px;font-size:16.5px;line-height:1.55;color:var(--text-2);text-wrap:pretty}
.ob-step-text strong{color:var(--text);font-weight:600}
.ob-who{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.ob-who-card{display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:22px;border-radius:16px;background:var(--card);border:1.5px solid var(--white-10);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .2s,background .2s}
.ob-who-card:hover{border-color:var(--white-30)}
.ob-who-on,.ob-who-on:hover{background:var(--mint-05);border-color:var(--mint-50)}
.ob-who-top{display:flex;justify-content:space-between;align-items:center;width:100%}
.ob-avatars{display:flex}
.ob-avatar{width:34px;height:34px;margin-right:-8px;border-radius:50%;background:var(--avatar);border:2px solid var(--card);color:var(--text);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ob-avatar-coral{background:var(--coral-18);color:var(--coral-text)}
.ob-avatar-mint{background:var(--mint-16);color:var(--mint)}
.ob-radio{flex:none;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--white-30);display:flex;align-items:center;justify-content:center;transition:border-color .2s}
.ob-radio-dot{width:11px;height:11px;border-radius:50%;transform:scale(0);transition:transform .2s cubic-bezier(.2,.9,.3,1.3),background .2s}
.ob-who-on .ob-radio{border-color:var(--mint)}.ob-who-on .ob-radio-dot{background:var(--mint);transform:scale(1)}
.ob-who-name{font-size:18px;font-weight:650}
.ob-who-sub{font-size:14.5px;line-height:1.5;color:var(--text-2)}
.ob-list{--ob-cols:36px minmax(0,1fr) auto 104px 40px;border-radius:16px;background:var(--card);border:1px solid var(--white-09)}
.ob-rules-head{border-radius:16px 16px 0 0;display:grid;grid-template-columns:var(--ob-cols);column-gap:14px;padding:12px 22px;background:var(--panel);font-size:12.5px;font-weight:600;color:var(--text-3)}
.ob-rules-head-file{grid-column:1 / 3}
.ob-rules{list-style:none;margin:0;padding:0}
.ob-rule{display:grid;grid-template-columns:var(--ob-cols);column-gap:14px;align-items:center;padding:14px 22px;border-top:1px solid var(--white-06)}
.ob-rule-new{animation:obUp .35s cubic-bezier(.2,.8,.2,1) both}
.ob-rule-gone{animation:obGone .2s ease-in both}
@keyframes obGone{to{opacity:0;transform:translateX(12px)}}
.ob-rule-mode,.ob-rule-src,.ob-rule-act{display:flex;align-items:center;min-width:0}
.ob-icon{flex:none;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s}
.ob-icon svg{width:18px;height:18px}
.ob-icon-block,.ob-icon-tell{display:none}
.ob-rule-is-block .ob-icon{background:var(--mint-14);color:var(--mint)}.ob-rule-is-block .ob-icon-block{display:flex}
.ob-rule-is-tell .ob-icon{background:var(--sand-16);color:var(--sand)}.ob-rule-is-tell .ob-icon-tell{display:flex}
.ob-rule-off .ob-icon{border:1.5px dashed var(--white-25)}
.ob-rule-text{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
.ob-rule-name{position:relative;display:block;font-size:16px;font-weight:600;line-height:1.3}
.ob-info{display:inline-flex;margin-left:7px;vertical-align:-2px;border-radius:50%;outline:none}
.ob-info-mark{width:16px;height:16px;border-radius:50%;border:1px solid var(--white-25);color:var(--text-3);font-size:10.5px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:help;transition:color .15s,border-color .15s}
.ob-info:hover .ob-info-mark,.ob-info:focus-visible .ob-info-mark{color:var(--text);border-color:var(--white-45)}
.ob-info:focus-visible{box-shadow:0 0 0 2px var(--coral-60)}
.ob-tip{position:absolute;left:0;bottom:calc(100% + 10px);z-index:6;width:max-content;max-width:min(320px,calc(100vw - 110px));padding:12px 14px;border-radius:12px;background:var(--popup);border:1px solid var(--white-14);box-shadow:0 14px 36px var(--shadow);font-size:13.5px;font-weight:400;line-height:1.5;color:var(--text);white-space:normal;visibility:hidden;opacity:0;transform:translateY(4px);transition:opacity .15s,transform .15s,visibility .15s}
.ob-info:hover .ob-tip,.ob-info:focus .ob-tip{visibility:visible;opacity:1;transform:none}
.ob-tip-block,.ob-tip-tell{display:none;flex-direction:column;gap:6px}
.ob-rule-is-block .ob-tip-block,.ob-rule-is-tell .ob-tip-tell{display:flex}
.ob-tip-quiet{color:var(--text-2);font-size:12.5px}
.ob-rule-chip{font-size:12.5px}
.ob-none{color:var(--text-4)}
.ob-mode{flex:none;display:inline-flex;padding:3px;border-radius:999px;background:var(--bg);border:1px solid var(--white-08)}
.ob-mode-half{font:inherit;font-size:13.5px;font-weight:600;color:var(--text-2);background:transparent;border:0;border-radius:999px;padding:6px 13px;white-space:nowrap;transition:background .2s,color .2s}
button.ob-mode-half{cursor:pointer}button.ob-mode-half:not(.ob-mode-on):hover{color:var(--text);background:var(--white-06)}
.ob-mode-on{background:var(--white-10);color:var(--text)}
.ob-mode-is-block .ob-mode-on{background:var(--mint);color:var(--on-mint)}
.ob-mode-is-tell .ob-mode-on{background:var(--sand);color:var(--on-sand)}
.ob-mode-off{opacity:.45}
.ob-add{padding:18px 22px;border-top:1px solid var(--white-06);justify-content:center}
.js .ob-add{display:flex}
.ob-add .pill{gap:10px;padding:11px 22px}
.ob-plus{width:20px;height:20px;border-radius:50%;background:var(--bg);color:var(--text);display:inline-flex;align-items:center;justify-content:center;font-size:15px;line-height:1}
.ob-code{font-family:var(--mono);font-size:.92em;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:1px 7px;overflow-wrap:anywhere}
.ob-hint{display:flex;align-items:center;gap:12px;margin-top:18px;padding:12px 16px;border-radius:12px;background:var(--coral-05);border:1px solid var(--coral-25);font-size:14px;line-height:1.5;color:var(--text-soft)}
.ob-hint-mark{flex:none;width:26px;height:26px;border-radius:50%;background:var(--coral-14);color:var(--coral-text);display:flex;align-items:center;justify-content:center;font-size:12px}
.ob-dock{position:sticky;bottom:0;z-index:2;margin-top:18px;padding:0 0 18px;background:var(--bg);box-shadow:0 -18px 18px -6px var(--bg)}
.ob-dock .ob-foot{margin-top:14px}
.ob-foot{margin-top:28px;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.js .ob-foot{display:flex}
.ob-foot-end{display:flex;align-items:center;gap:14px;margin-left:auto}
.ob-skip{color:var(--text-3);font-size:15px}
.ob-skip:hover{color:var(--text)}
.ob-say{margin:14px 0 0;font-size:14px;line-height:1.5;color:var(--coral-text);text-align:right}
@media (max-width:640px){
.ob-h2{font-size:28px}
.ob-rules-head{display:none}.ob-rule:first-child{border-top:0}
.ob-rule{grid-template-columns:36px minmax(0,1fr) auto;grid-template-areas:"icon text act" ". mode src";row-gap:12px;column-gap:12px;padding:16px 18px}
.ob-rule>.ob-icon{grid-area:icon}.ob-rule-text{grid-area:text}.ob-rule-mode{grid-area:mode}.ob-rule-src{grid-area:src;justify-content:flex-end}.ob-rule-act{grid-area:act;justify-content:flex-end}
.ob-add{padding-left:18px;padding-right:18px}
.ob-none{display:none}
}
`;
