// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Renderer } from '../../../shared/renderer.ts';
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.ts';
import { DEFAULT_LANG, inLanguages, LANG_NAMES, LANGS, labelAttributes, TABLES, translator } from '../../render/report-copy.ts';
import { addFilePopup, ADD_FILE_POPUP_SCRIPT, ADD_FILE_POPUP_STYLE } from '../../render/ui/add-file-popup.ts';
import { BRAND_MARK } from '../../render/ui/brand-mark.ts';
import { BUTTON_STYLE, pill } from '../../render/ui/button.ts';
import { FILE_CHIP_STYLE } from '../../render/ui/file-chip.ts';
import { pageShell } from '../../render/ui/page-shell.ts';
import { POPUP_SCRIPT, POPUP_STYLE } from '../../render/ui/popup.ts';
import { PROJECT_LIST_SCRIPT, PROJECT_LIST_STYLE } from '../../render/ui/project-list.ts';
import { SWITCH_STYLE } from '../../render/ui/switch.ts';
import { TAG_STYLE } from '../../render/ui/tag.ts';
import type { AppLinks } from '../app-nav.ts';
import type { SessionIndex } from '../session-index.ts';
import { doneScreen, DONE_STYLE } from './done.ts';
import { introScreen, INTRO_STYLE } from './intro.ts';
import { ONBOARDING_SCRIPT } from './onboarding-script.ts';
import { onboardingView, type OnboardingView } from './onboarding-view.ts';
import { projectStep, PROJECT_STEP_STYLE } from './project-step.ts';
import { ADD_WINDOW, stepScreens, STEPS_STYLE } from './steps.ts';
import { welcomeScreen, WELCOME_STYLE } from './welcome.ts';

/**
 * The onboarding, written as `onboarding.html` beside the index (`.ai/specs/2026-09-24-onboarding.md`; plan step 5):
 * the intro, the welcome, three steps - the project first (`which-project.md` V19) - and Done, on the kit, with no
 * sidebar (W2). In the home directory it is the project step alone: nothing there is set up (V7). Every screen is in the page and the
 * script shows one at a time; with no script the welcome and the steps are sections in order, with the way to Settings
 * under them (W27). The page is written only where a run serves it (W1), so it can always post its one request.
 */
export class OnboardingRenderer implements Renderer<SessionIndex> {
  readonly #links: AppLinks;

  constructor(links: AppLinks) {
    this.#links = links;
  }

  render(index: SessionIndex): string {
    const view = onboardingView(index);
    return pageShell({
      title: 'ob.title',
      policy: INDEX_CONTENT_SECURITY_POLICY_META,
      styles: [BUTTON_STYLE, TAG_STYLE, SWITCH_STYLE, FILE_CHIP_STYLE, POPUP_STYLE, ADD_FILE_POPUP_STYLE, PROJECT_LIST_STYLE,
        MOTION_STYLE, FRAME_STYLE, INTRO_STYLE, WELCOME_STYLE, STEPS_STYLE, PROJECT_STEP_STYLE, DONE_STYLE],
      scripts: [POPUP_SCRIPT, ADD_FILE_POPUP_SCRIPT, PROJECT_LIST_SCRIPT, ONBOARDING_SCRIPT],
      main: view === undefined ? '' : this.#page(view, index),
      // live-pages: the onboarding is answered once; an update would take away the answers not yet sent.
      live: false,
    });
  }

  #page(view: OnboardingView, index: SessionIndex): string {
    // which-project V7: in the home directory there is no project to set up - only the step that picks one.
    const project = view.project.kind === 'none' ? undefined : view.project.name;
    const state = {
      intro: view.intro,
      atProject: view.atProject,
      // V23: Done's line begins with the project's name.
      ...(project === undefined ? {} : { name: project }),
      who: view.who,
      // Step 3 is not drawn (2026-09-25): its choices are what it would have started from (W10).
      alerts: view.messages.alerts,
      inForce: view.inForce,
      rows: view.files.rows.length,
    };
    return '<div class="ob" data-ob data-ob-at="welcome" data-ob-state="' + e(JSON.stringify(state)) + '" data-ob-words="' + e(JSON.stringify(scriptWords())) + '">' +
      header() +
      '<div class="ob-body">' + introScreen() + welcomeScreen() +
      projectStep(view, { now: index.now, timeZone: index.timeZone ?? 'UTC' }) +
      (project === undefined ? '' : stepScreens(view, project) + doneScreen(view.done, this.#links)) +
      noScript(this.#links, project !== undefined) + '</div>' +
      (view.files.canAdd && project !== undefined ? addFilePopup(ADD_WINDOW) : '') +
      '</div>';
  }
}

/** W2: the logo; the stepper on steps 1-3; "Runs on your computer", or **Skip intro** on the intro; the language. */
function header(): string {
  const steps = (['project', 'who', 'files'] as const).map((name, at) =>
    '<li class="ob-stepper-step" data-ob-step><span class="ob-stepper-num" aria-hidden="true"><span class="ob-stepper-n">' + (at + 1) +
    '</span><span class="ob-stepper-done">✓</span></span>' + inLanguages((t) => t('ob.stepper.' + name)) + '</li>').join('');
  return '<header class="ob-head">' +
    '<span class="ob-brand">' + BRAND_MARK + '<span class="ob-word">agent<span class="ob-why">why</span></span></span>' +
    '<ol class="ob-stepper js-only" data-ob-stepper' + labelAttributes((t) => e(t('ob.stepper'))) + '>' + steps + '</ol>' +
    '<span class="ob-head-end">' +
    pill({ label: inLanguages((t) => t('ob.skipIntro')), tone: 'outline', size: 'sm', button: true, attributes: ' data-ob-skip-intro' }) +
    '<span class="ob-local"><span class="ob-local-dot" aria-hidden="true"></span>' + inLanguages((t) => t('ob.local')) + '</span>' +
    '<select class="ob-lang js-only" id="lang"' + labelAttributes((t) => t('app.lang')) + '>' +
    LANGS.map((lang) => '<option value="' + lang + '"' + (lang === DEFAULT_LANG ? ' selected' : '') + '>' + LANG_NAMES[lang] + '</option>').join('') +
    '</select></span></header>';
}

/**
 * W27: without a script nothing here can be written, so the page says where the same choices are made - where there is a
 * project to make them for. In the home directory the project step already leads to its chats (which-project V7).
 * Conversations is written for a project with no chats too (W1a, amended 2026-10-01), so both links are always there.
 */
function noScript(links: AppLinks, aProject: boolean): string {
  if (!aProject) return '';
  return '<div class="ob-nojs"><p>' + inLanguages((t) => t('ob.nojs')) + '</p><p class="ob-nojs-links">' +
    pill({ label: inLanguages((t) => t('ob.nojs.settings')), tone: 'primary', size: 'lg', href: links.settings }) +
    pill({ label: inLanguages((t) => t('ob.nojs.conversations')), tone: 'outline', size: 'lg', href: links.conversations }) +
    '</p></div>';
}

/** What the script says, in every language: it cannot hold three languages in one text node. */
function scriptWords(): Record<string, Record<string, string>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, {
      saving: t('set.saving'),
      refused: t('set.refused'),
      unreachable: t('set.unreachable'),
      local: t('ob.summary.local'),
      shared: t('ob.summary.shared'),
      // Every plural form the language has, with its {n} left for the script, which counts the rows itself.
      ...Object.fromEntries(['one', 'few', 'many', 'other'].flatMap((form) => {
        const text = TABLES[lang]['ob.summary.kinds.' + form];
        return text === undefined ? [] : [['kinds.' + form, text]];
      })),
      messages: t('ob.summary.messages'),
      // which-project V12, V15: what the project step says of a folder chosen, and of a switch.
      switching: t('proj.switching', { name: '{name}' }),
      refusedTitle: t('ob.project.refused.title'),
      refusedHome: t('ob.project.refused.home'),
      refusedRoot: t('ob.project.refused.root'),
      chatsIn: t('ob.project.chatsIn', { name: '{name}' }),
      chatsInside: t('ob.project.chatsInside', { name: '{name}' }),
      picked: t('ob.project.picked', { place: '{place}' }),
      weUse: t('ob.project.weUse'),
      inThere: t('ob.project.inThere'),
      useAnyway: t('proj.useAnyway', { name: '{name}' }),
      failedTitle: t('ob.project.failed.title'),
      failed: t('proj.switchFailed', { reason: '{reason}' }),
      chooseHere: t('proj.chooseHere'),
    }];
  }));
}

/** Every moment the onboarding draws (W4, W7, W17), and the move from one screen to the next, named once; none plays where motion is unwelcome (W29). */
const MOTION_STYLE = String.raw`
@keyframes obIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
@keyframes obOut{to{opacity:0;transform:scale(.9);filter:blur(6px)}}
@keyframes obUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes obType{from{width:0}to{width:100%}}
@keyframes obTwinkle{0%,100%{opacity:.25}50%{opacity:.9}}
@keyframes obBeam{0%{left:-10%;opacity:1}100%{left:110%;opacity:1}}
@keyframes obLit{to{border-color:var(--coral-60);background:var(--coral-18);box-shadow:0 0 22px var(--coral-45)}}
@keyframes obPing{0%{transform:scale(.6);opacity:.9}100%{transform:scale(2.2);opacity:0}}
@keyframes obConverge{0%{transform:translate(var(--x),var(--y)) scale(1);opacity:0}20%{opacity:1}100%{transform:translate(0,0) scale(.3);opacity:0}}
@keyframes obDraw{from{stroke-dashoffset:120}to{stroke-dashoffset:0}}
@keyframes obFlash{0%{opacity:0;transform:scale(.6)}30%{opacity:.9}100%{opacity:0;transform:scale(2.4)}}
@keyframes obBloom{0%{transform:scale(.2);opacity:0}40%{opacity:1}100%{transform:scale(1);opacity:.7}}
@keyframes obGlow{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:.9;transform:scale(1.08)}}
@keyframes obFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes obPop{0%{transform:scale(.4);opacity:0}60%{transform:scale(1.08);opacity:1}100%{transform:scale(1)}}
@keyframes obConfetti{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(calc(var(--dx) * var(--spread,1)),calc(var(--dy) * var(--spread,1))) rotate(var(--r));opacity:0}}
@keyframes obRipple{0%{transform:scale(.55);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes obStepIn{from{opacity:0;transform:translateX(var(--ob-from,32px))}to{opacity:1;transform:none}}
@keyframes obStepOut{to{opacity:0;transform:translateX(var(--ob-to,-32px))}}
@keyframes obRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.ob-enter{animation:obStepIn .42s cubic-bezier(.2,.8,.2,1) both}
.ob-enter.ob-step>*{animation:obRise .45s cubic-bezier(.2,.8,.2,1) both}
.ob-enter.ob-step>:nth-child(2){animation-delay:.04s}.ob-enter.ob-step>:nth-child(3){animation-delay:.08s}
.ob-enter.ob-step>:nth-child(4){animation-delay:.12s}.ob-enter.ob-step>:nth-child(n+5){animation-delay:.16s}
.ob-leave{animation:obStepOut .18s ease-in both;pointer-events:none}
.ob-back{--ob-from:-32px;--ob-to:32px}
@media (prefers-reduced-motion:reduce){
.ob *,.ob *::before,.ob *::after{animation:none!important;transition:none!important}
.ob-knot path{stroke-dashoffset:0}.ob-pt,.ob-flash,.ob-conf,.ob-ripple,.ob-beam,.ob-ping{display:none}
}
`;

/** The frame: the header, one screen at a time, and what a page with no script shows. Colours from the tokens only. */
const FRAME_STYLE = String.raw`
.ob{min-height:calc(100vh - 136px);display:flex;flex-direction:column}
.ob-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px}
.ob-brand{display:flex;align-items:center;gap:9px;color:var(--coral);font-size:20px;font-weight:650}
.ob-brand .brand-mark{width:26px;height:26px;flex:none}
.ob-word{color:var(--text)}.ob-why{color:var(--coral)}
.ob-stepper{list-style:none;margin:0;padding:0;align-items:center;gap:8px;visibility:hidden}
.js .ob-stepper{display:flex}
.ob[data-ob-at="project"] .ob-stepper,.ob[data-ob-at="who"] .ob-stepper,.ob[data-ob-at="files"] .ob-stepper{visibility:visible}
.ob-stepper-step{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--text-3);padding:6px 12px;border-radius:999px;transition:color .3s,background .3s}
.ob-stepper-num{width:20px;height:20px;border-radius:50%;background:var(--white-08);color:var(--text-2);font-size:11px;display:flex;align-items:center;justify-content:center;transition:color .3s,background .3s}
.ob-stepper-done{display:none}
.ob-stepper-now{color:var(--text);background:var(--white-07)}.ob-stepper-now .ob-stepper-num{background:var(--coral);color:var(--on-coral)}
.ob-stepper-past{color:var(--mint)}.ob-stepper-past .ob-stepper-num{background:var(--mint);color:var(--on-mint)}
.ob-stepper-past .ob-stepper-n{display:none}.ob-stepper-past .ob-stepper-done{display:inline}
.ob-head-end{display:flex;align-items:center;gap:14px}
.ob-head-end [data-ob-skip-intro]{display:none}
.ob[data-ob-at="intro"] [data-ob-skip-intro]{display:inline-flex}
.ob[data-ob-at="intro"] .ob-local{display:none}
.ob-local{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-3)}
.ob-local-dot{width:7px;height:7px;border-radius:50%;background:var(--mint)}
.ob-lang{background:var(--card);color:var(--text-2);border:1px solid var(--white-10);border-radius:8px;padding:5px 8px;font:inherit;font-size:13px}
.ob-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:56px}
.ob-screen{width:100%}
.js .ob-body{gap:0}
.ob-screen[hidden]{display:none!important}
.ob-screen h1[tabindex="-1"]:focus,.ob-screen h2[tabindex="-1"]:focus{outline:none}
.ob-nojs{max-width:640px;margin:0 auto;padding:22px;border-radius:16px;background:var(--card);border:1px solid var(--white-09);font-size:15px;line-height:1.55;color:var(--text-soft)}
.ob-nojs p{margin:0}
.ob-nojs-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px!important}
.js .ob-nojs{display:none}
@media (max-width:640px){.ob-stepper-step{font-size:0;gap:0;padding:4px}.ob-stepper-num{font-size:11px}.ob-local{display:none}.ob-head{margin-bottom:20px}}
`;
