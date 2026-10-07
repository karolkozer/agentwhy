// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Renderer } from '../../../shared/renderer.ts';
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.ts';
import { inLanguages, LANGS, translator } from '../../render/report-copy.ts';
import { ADD_FILE_POPUP_SCRIPT, ADD_FILE_POPUP_STYLE, ADD_PLACE_SCRIPT } from '../../render/ui/add-file-popup.ts';
import { appSidebar, APP_SIDEBAR_STYLE } from '../../render/ui/app-sidebar.ts';
import { AVATAR_STYLE } from '../../render/ui/avatar.ts';
import { askCard, writtenAnswer, ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../../render/ui/ask-panel.ts';
import { BUTTON_STYLE } from '../../render/ui/button.ts';
import { CALLOUT_STYLE } from '../../render/ui/callout.ts';
import { CHAT_EXAMPLE_STYLE } from '../../render/ui/chat-example.ts';
import { CONFIRM_DIALOG_STYLE } from '../../render/ui/confirm-dialog.ts';
import { FILE_CHIP_STYLE } from '../../render/ui/file-chip.ts';
import { hero, HERO_STYLE } from '../../render/ui/hero.ts';
import { pageShell } from '../../render/ui/page-shell.ts';
import { pillTabs, PILL_TABS_SCRIPT, PILL_TABS_STYLE } from '../../render/ui/pill-tabs.ts';
import { POPUP_SCRIPT, POPUP_STYLE } from '../../render/ui/popup.ts';
import { SCOPE_CHOICE_STYLE } from '../../render/ui/scope-choice.ts';
import { SWITCH_STYLE } from '../../render/ui/switch.ts';
import { TAG_STYLE } from '../../render/ui/tag.ts';
import { appNav, sidebarProject, type AppLinks } from '../app-nav.ts';
import { projectsWindows } from '../projects/projects-window.ts';
import type { SessionIndex } from '../session-index.ts';
import { alertsTab } from './alerts-tab.ts';
import { filesTab } from './files-tab.ts';
import { generalTab } from './general-tab.ts';
import { SETTINGS_SCRIPT } from './settings-script.ts';
import { settingsView, type SettingsView } from './settings-view.ts';
import { settingsWindows } from './settings-windows.ts';
import { pageNotice } from '../page-notice.ts';

/**
 * Settings, written as `settings.html` beside the index (`for-people-who-build-with-ai.md` §3 C; design file *agentwhy
 * Settings*; `.ai/plans/2026-09-23-settings-redesign.md`): three tabs a person who builds with AI can read - Private
 * files, Alerts, General (F56, which replaced Stop the AI on 2026-09-24) - and, folded, everything a developer needs. Every state is read from the files (F28, R60); every write goes through a confirmation
 * and the server (F40), and the page is read again once it lands.
 */
export class SettingsRenderer implements Renderer<SessionIndex> {
  readonly #links: AppLinks;

  constructor(links: AppLinks) {
    this.#links = links;
  }

  render(index: SessionIndex): string {
    // A shared page names no machine and offers no choices (R48): it says so, and shows none of this machine's state.
    const settings = index.shared ? undefined : index.settings;
    // protected-everywhere step 3: the computer's rules join the list, where this run read them.
    const view = settings === undefined ? undefined : settingsView(settings, index.everywhere, index.scope === 'computer');
    const computer = view?.computer !== undefined;
    // A dot says on or off; where the hooks could not be read there is no dot, rather than a grey one saying "off".
    const dot = (on: boolean): 'mint' | 'grey' | undefined => (view?.known !== true || computer ? undefined : on ? 'mint' : 'grey');
    const tabs = view === undefined ? '' : pillTabs([
      { label: inLanguages((t) => t('set.tab.files')), dot: 'mint', panel: filesTab(view, settings?.allowed.length ?? 0, index.projects?.switchable === true) + ask('files') },
      { label: inLanguages((t) => t('set.tab.alerts')), ...withDot(dot(view.alerts.on)), panel: alertsTab(view) + ask('alerts') },
      // F56: who all of it is for, asked once. Its dot says whether that is one answer; a split project is grey here
      // and says what to do in the tab itself.
      // General's questions are about who a project's rules are for and its uninstall, which the computer's page has not.
      { label: inLanguages((t) => t('set.tab.general')), ...withDot(dot(view.scope !== 'mixed')), panel: generalTab(view, index.onboarding === undefined ? undefined : this.#links.onboarding) + (computer ? '' : ask('general')) },
    ], 'state');

    return pageShell({
      // which-project V2, V11: the person's projects, opened from the sidebar's card.
      windows: projectsWindows(index, this.#links.onboarding),
      title: 'set.title',
      // nothing-updates-by-itself U4: the update notice, where the project's hooks run an older release.
      ...pageNotice(index),
      policy: INDEX_CONTENT_SECURITY_POLICY_META,
      // Wider than the 780px Settings began at (2026-09-24): the list's rows carry a switch, a source and an action in
      // columns of their own, and at 780px the name had to squeeze them out of line.
      width: 'list',
      styles: [APP_SIDEBAR_STYLE, HERO_STYLE, BUTTON_STYLE, PILL_TABS_STYLE, SWITCH_STYLE, CHAT_EXAMPLE_STYLE, TAG_STYLE, CALLOUT_STYLE,
        FILE_CHIP_STYLE, POPUP_STYLE, CONFIRM_DIALOG_STYLE, ADD_FILE_POPUP_STYLE, SCOPE_CHOICE_STYLE, AVATAR_STYLE, ASK_PANEL_STYLE, SETTINGS_STYLE],
      scripts: [PILL_TABS_SCRIPT, POPUP_SCRIPT, ADD_FILE_POPUP_SCRIPT, ADD_PLACE_SCRIPT, ASK_PANEL_SCRIPT, SETTINGS_SCRIPT],
      sidebar: appSidebar({
        ...sidebarProject(index),
        home: this.#links.conversations,
        items: appNav(index, 'settings', this.#links),
      }),
      main: '<div class="set" data-settings data-set-words="' + e(JSON.stringify(scriptWords())) + '">' +
        hero({
          eyebrow: inLanguages((t) => t('set.eyebrow')),
          fact: inLanguages((t) => t('set.hero')),
          action: '',
          lead: inLanguages((t) => t('set.lead')),
        }) +
        (index.shared ? '<p class="set-quiet set-cannot">' + inLanguages((t) => t('set.shared')) + '</p>' : '') +
        (view === undefined || view.canWrite || computer ? '' : '<p class="set-quiet set-cannot">' + inLanguages((t) => t('set.cannot')) + '</p>') +
        tabs +
        (view === undefined || computer ? '' : developer(view)) +
        (view === undefined ? '' : settingsWindows(view, index.everywhere?.codex === true)) +
        '</div>',
    });
  }
}

function withDot(dot: 'mint' | 'grey' | undefined): { readonly dot?: 'mint' | 'grey' } {
  return dot === undefined ? {} : { dot };
}

/** "Not sure what to pick? Ask me." under each tab: three ready-made questions and their written answers (F43). */
function ask(tab: 'alerts' | 'files' | 'general'): string {
  const questions = [1, 2, 3].map((n) => ({
    question: inLanguages((t) => t('set.ask.' + tab + '.' + n)),
    answer: inLanguages((t) => writtenAnswer(t('set.ask.' + tab + '.' + n + '.a'))),
  }));
  return askCard(inLanguages((t) => t('set.ask.title')), questions, 'set-ask-' + tab);
}

/** F41: folded, in the tool's own words; every value is text from a file, escaped. */
function developer(view: SettingsView): string {
  return '<details class="set-dev"><summary class="set-dev-toggle">' + inLanguages((t) => t('set.dev')) + '</summary>' +
    '<dl class="set-dev-rows">' + view.developer.map((row) =>
      '<div class="set-dev-row"><dt>' + inLanguages((t) => t(row.key)) + '</dt><dd>' +
      (typeof row.value === 'string' ? e(row.value) : inLanguages((t) => t((row.value as { word: string }).word))) + '</dd></div>').join('') +
    '</dl></details>';
}

/** What the script says, in every language: it cannot hold three languages in one text node. */
function scriptWords(): Record<string, Record<string, string>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, { saving: t('set.saving'), refused: t('set.refused'), asFile: t('set.asFile'), unreachable: t('set.unreachable'), notWritten: t('set.ev.notWritten') }];
  }));
}

/** What only this page lays out. Colours come from the tokens (plan rule 1). */
const SETTINGS_STYLE = String.raw`
.set .hero{margin-bottom:28px}
.set-cannot{margin:-8px 0 22px}
.set-quiet{font-size:14px;line-height:1.5;color:var(--text-3)}
.set-soft{color:var(--text-2)}
.set-tick{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--text-2);cursor:pointer}
.set-tick input{margin-top:3px;accent-color:var(--coral)}
.set-head{margin-bottom:16px}
.co+.set-head{margin-top:30px}
.set-h2{margin:0;font-size:19px;font-weight:650;line-height:1.3}
.set-h3{margin:0;font-size:17px;font-weight:650}
.set-lead{margin:6px 0 0;font-size:15px;line-height:1.5;color:var(--text-2)}
.set-msg{position:relative;display:flex;align-items:flex-start;gap:20px;padding:26px 28px;border-radius:18px;background:var(--card);border:1px solid var(--white-09);transition:background .3s,border-color .3s}
.set-msg-main{border-color:var(--coral-35)}
.set-msg-opt.set-msg-on{border-color:var(--mint-20)}
.set-msg-icon{flex:none;width:40px;height:40px;border-radius:50%;background:var(--coral-14);color:var(--coral-text);display:flex;align-items:center;justify-content:center}
.set-msg .sw{margin-top:2px}
.set-opt{position:relative;margin-left:48px;padding-left:28px}
.set-opt-label{position:relative;margin:0;padding:22px 0 14px;font-size:14.5px;font-weight:600;color:var(--text-2)}
.set-opt-label:before,.set-msg-opt:not(:last-child):after{content:"";position:absolute;left:-28px;top:0;bottom:0;border-left:1.5px solid var(--coral-30)}
.set-msg-opt:not(:last-child):after{left:-29px;top:37px;bottom:-15px}
.set-msg-opt:before{content:"";position:absolute;left:-29px;top:-1px;width:28px;height:38px;border-left:1.5px solid var(--coral-30);border-bottom:1.5px solid var(--coral-30);border-bottom-left-radius:14px}
.set-msg-opt+.set-msg-opt{margin-top:14px}
.set-msg-locked{cursor:not-allowed}
.set-msg-locked .set-card-body{opacity:.35;filter:grayscale(1)}
.set-msg-point{background:var(--coral-06)}
.set-sw{position:relative;flex:none;display:flex}
.set-sw .sw[aria-disabled="true"]{opacity:.35;cursor:not-allowed}
.set-tip{cursor:default}
.set-tip{position:absolute;right:-10px;bottom:calc(100% + 14px);z-index:5;width:290px;padding:14px 16px;border-radius:14px;background:var(--popup);border:1px solid var(--white-14);box-shadow:0 18px 44px var(--shadow);display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.set-tip[hidden]{display:none}
.set-tip:after{content:"";position:absolute;right:30px;bottom:-7px;width:12px;height:12px;background:var(--popup);border-right:1px solid var(--white-14);border-bottom:1px solid var(--white-14);transform:rotate(45deg)}
.set-tip-text{font-size:14px;line-height:1.5;color:var(--text)}
.set-tip-go{padding:0;font-weight:600}
.set-msg-name{margin:0;font-size:17.5px;font-weight:650}
.set-msg-why{margin:8px 0 0;font-size:15px;line-height:1.55;color:var(--text-2)}
.set-msg .set-state{margin-top:16px;font-size:14px}
.set-msg .ce{gap:12px;margin-top:16px}
.set-msg .ce-who{width:30px;height:30px;margin-top:4px;font-size:11px}
.set-msg .ce-say{font-size:15px;line-height:1.5;padding:12px 16px;border-radius:4px 14px 14px 14px}
.set-card-on{border-color:var(--mint-30)}
.set-card-body{flex:1;min-width:0}
.set-card-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.set-state{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;font-weight:600;color:var(--text-3)}
.set-state-lg{font-size:14px}
.set-state-on{color:var(--mint)}
.set-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
.set-say{margin:10px 0 0;font-size:13.5px;line-height:1.5;color:var(--coral-text)}
.set-say[hidden]{display:none}
.set-say code{display:block;margin-top:6px;font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--panel);border:1px solid var(--white-08);border-radius:8px;padding:8px 10px;word-break:break-all;user-select:all}
.set-say-busy{color:var(--text-3)}
.set-list{border-radius:16px;background:var(--card);border:1px solid var(--white-09);overflow:hidden}
.set-legend{position:relative;display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 18px;padding:14px 20px;border-radius:14px;background:var(--panel);border:1px solid var(--white-09);font-size:14.5px;color:var(--text-2)}
.set-legend:after{content:"";position:absolute;left:34px;bottom:-7px;width:12px;height:12px;background:var(--panel);border-right:1px solid var(--white-09);border-bottom:1px solid var(--white-09);transform:rotate(45deg)}
.set-legend-item{display:inline-flex;align-items:center;gap:10px}
.set-legend strong{color:var(--text);font-weight:600}
.set-rules{list-style:none;margin:0;padding:0}
.set-list{--set-cols:40px minmax(0,1fr) 172px 118px 56px}
.set-rules-head{display:grid;grid-template-columns:var(--set-cols);column-gap:16px;padding:12px 28px;background:var(--panel);font-size:12.5px;font-weight:600;color:var(--text-3)}
.set-rules-head-file{grid-column:1 / 3}
.set-rule{display:grid;grid-template-columns:var(--set-cols);column-gap:16px;align-items:center;padding:16px 28px;border-top:1px solid var(--white-06)}
.set-rule-mode,.set-rule-src,.set-rule-act{display:flex;align-items:center;min-width:0}
.set-icon{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.set-icon svg{width:18px;height:18px}
.set-icon-sm{width:28px;height:28px}.set-icon-sm svg{width:14px;height:14px}
.set-icon-block{background:var(--mint-14);color:var(--mint)}
.set-icon-tell{background:var(--sand-16);color:var(--sand)}
.set-icon-gap{background:var(--coral-14);color:var(--coral-text);box-shadow:inset 0 0 0 1.5px var(--coral)}
.set-rule-off .set-icon{border:1.5px dashed var(--white-25)}
.set-rule-watchable{cursor:pointer;transition:background .15s}.set-rule-watchable:hover{background:var(--white-02)}
.set-rule-watchable:hover .set-icon{border-color:var(--coral)}
.set-rule-text{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0}
.set-rule-name{display:block;font-size:16px;font-weight:600;line-height:1.3}
.set-rule-chip{font-size:12.5px}
.set-rule-gap{font-size:13px;line-height:1.4;color:var(--coral-text)}
.set-rule-where{font-size:13px;line-height:1.4;color:var(--text-3)}
.set-elsewhere{margin-top:18px}
.set-elsewhere-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 28px;cursor:pointer;list-style:none}
.set-elsewhere-head::-webkit-details-marker{display:none}
.set-elsewhere-title{font-size:15px;font-weight:600;color:var(--text)}
.set-elsewhere-count{display:inline-block;min-width:22px;padding:1px 8px;margin-left:6px;border-radius:999px;background:var(--white-10);font-size:12.5px;font-weight:600;text-align:center;color:var(--text-2)}
.set-elsewhere-chev{flex:none;color:var(--text-3);transition:transform .15s}
.set-elsewhere[open] .set-elsewhere-chev{transform:rotate(180deg)}
@media (prefers-reduced-motion:reduce){.set-elsewhere-chev{transition:none}}
.set-elsewhere-lead{margin:0;padding:0 28px 14px;font-size:14px;line-height:1.5;color:var(--text-2)}
.set-elsewhere-go{display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:14px 28px;border-top:1px solid var(--white-06)}
.set-elsewhere-where{margin:0;padding:14px 28px;border-top:1px solid var(--white-06);font-size:14px;color:var(--text-2)}
@media (max-width:640px){.set-elsewhere-head,.set-elsewhere-go,.set-elsewhere-where{padding-left:18px;padding-right:18px}.set-elsewhere-lead{padding:0 18px 14px}}
.set-rule-chip.set-rule-chip-place{white-space:normal;overflow-wrap:anywhere;text-overflow:clip;max-width:100%;height:auto}
.set-rule-note{font-size:13px;line-height:1.45;color:var(--text-3)}
.set-honest{display:block;margin-top:10px}
.set-none{color:var(--text-4)}
.set-list-add{padding:20px 28px;border-top:1px solid var(--white-06);display:flex;justify-content:center}
.set-list-add .pill{gap:10px;padding:11px 22px}
.set-plus{width:20px;height:20px;border-radius:50%;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1}
.set-list-foot{display:flex;flex-wrap:wrap;gap:6px 22px;margin:0;padding:14px 28px;border-top:1px solid var(--white-06);font-size:14px;color:var(--text-2)}
.set-count-n{font-weight:650}
.set-count-block .set-count-n{color:var(--mint)}.set-count-tell .set-count-n{color:var(--sand)}
.set-list-exc{margin-left:auto;color:var(--text-3)}
.set-stop{border-radius:16px;background:var(--card);border:1px solid var(--white-09);overflow:hidden}
.set-stop-main{display:flex;align-items:flex-start;gap:18px;padding:24px}
.set-stop-note{margin:0 24px 24px}
.set-code{font-family:var(--mono);font-size:.92em;color:var(--text)}
.set-pattern:empty{display:none}
.set-chips{display:flex;flex-wrap:wrap;gap:8px}
.set-chips[hidden]{display:none}
.set-chips .set-pattern{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.set-more{align-self:center;font-size:13px;color:var(--text-3)}
.set-mode{flex:none;display:inline-flex;padding:3px;border-radius:999px;background:var(--bg);border:1px solid var(--white-08)}
.set-mode-half{padding:6px 13px;border-radius:999px;font-size:13.5px;font-weight:600;color:var(--text-2);white-space:nowrap}
a.set-mode-half:hover{color:var(--text);background:var(--white-06)}
.set-mode-on{background:var(--white-10);color:var(--text)}
.set-mode-is-block .set-mode-on{background:var(--mint);color:var(--on-mint)}
.set-mode-is-tell .set-mode-on{background:var(--sand);color:var(--on-sand)}
.set-mode-off{opacity:.45}
.set-general-note{display:flex;align-items:center;gap:10px;margin:18px 0 0}
.set-box{border-radius:20px;background:var(--card);border:1px solid var(--white-09);padding:28px}
.set-box+.set-box{margin-top:16px}
.set-who .set-head{margin-bottom:22px}
.set-scopes{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.set-scope{display:flex;flex-direction:column;padding:24px;border-radius:18px;background:var(--panel);border:1.5px solid var(--white-09);color:var(--text);transition:border-color .15s,background .15s}
a.set-scope:hover{color:var(--text);border-color:var(--white-25);background:var(--white-02)}
.set-scope-on{background:var(--mint-06);border-color:var(--mint-50)}
.set-scope-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.set-scope-who{display:flex}
.set-scope-who .av{border:2px solid var(--card)}
.set-scope-who .av+.av{margin-left:-9px}
.set-scope-ring{flex:none;width:24px;height:24px;border-radius:50%;border:1.5px solid var(--white-30);display:flex;align-items:center;justify-content:center}
.set-scope-ring:after{content:"";width:12px;height:12px;border-radius:50%}
.set-scope-on .set-scope-ring{border:2px solid var(--mint)}.set-scope-on .set-scope-ring:after{background:var(--mint)}
a.set-scope:hover .set-scope-ring{border-color:var(--mint)}
.set-scope-name{font-size:18px;font-weight:650}
.set-scope-sub{display:block;margin-top:12px;font-size:14.5px;line-height:1.55;color:var(--text-2)}
.set-info{flex:none;width:20px;height:20px;border-radius:50%;background:var(--white-06);color:var(--text-2);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
.set-uninstall{display:flex;align-items:center;gap:20px;padding:24px 28px}
.set-uninstall-icon{flex:none;width:46px;height:46px;border-radius:50%;background:var(--coral-12);color:var(--coral-text);display:flex;align-items:center;justify-content:center}
.set-uninstall-text{margin:4px 0 0;font-size:14.5px;line-height:1.55;color:var(--text-2)}
.set-dev{margin-top:4px}
.set-again{display:flex;align-items:center;gap:20px;padding:24px 28px}
.set-again-icon{flex:none;width:46px;height:46px;border-radius:50%;background:var(--white-06);color:var(--coral);display:flex;align-items:center;justify-content:center}
.set-again-icon .brand-mark{width:24px;height:24px}
.set-dev-toggle{display:inline-block;cursor:pointer;list-style:none;color:var(--text-2);font-size:14px;font-weight:600;padding:4px 0}
.set-dev-toggle::-webkit-details-marker{display:none}
.set-dev-toggle:after{content:" ▾"}.set-dev[open] .set-dev-toggle:after{content:" ▴"}
.set-dev-toggle:hover{color:var(--text)}
.set-dev-rows{margin:10px 0 0;border-radius:12px;background:var(--panel);border:1px solid var(--white-08);padding:6px 18px}
.set-dev-row{display:grid;grid-template-columns:190px minmax(0,1fr);gap:16px;padding:10px 0;border-bottom:1px solid var(--white-05);font-size:13.5px}
.set-dev-row:last-child{border-bottom:0}
.set-dev-row dt{color:var(--text-3)}
.set-dev-row dd{margin:0;font-family:var(--mono);color:var(--text-soft);word-break:break-all}
@media (max-width:640px){
.set-msg{padding:22px 18px;gap:14px}.set-msg-main{flex-wrap:wrap}.set-msg-main .set-card-body{order:3;flex-basis:100%}.set-msg-main .sw{margin-left:auto}
.set-opt{margin-left:20px;padding-left:18px}.set-opt-label:before,.set-msg-opt:not(:last-child):after{left:-18px}.set-msg-opt:not(:last-child):after{left:-19px}.set-msg-opt:before{left:-19px;width:18px;border-bottom-left-radius:10px}.set-legend{padding:12px 16px}
.set-rules-head{display:none}.set-rule:first-child{border-top:0}
.set-rule{grid-template-columns:40px minmax(0,1fr) auto;grid-template-areas:"icon text act" ". mode src";row-gap:12px;column-gap:12px;padding:16px 18px}
.set-rule>.set-icon{grid-area:icon}.set-rule-text{grid-area:text}.set-rule-mode{grid-area:mode}.set-rule-src{grid-area:src;justify-content:flex-end}.set-rule-act{grid-area:act;justify-content:flex-end}
.set-list-add,.set-list-foot{padding-left:18px;padding-right:18px}
.set-none{display:none}
.set-dev-row{grid-template-columns:1fr;gap:4px}
.set-box{padding:22px 18px}.set-scopes{grid-template-columns:1fr}.set-scope{padding:20px}
.set-uninstall,.set-again{flex-wrap:wrap;gap:14px 16px}.set-uninstall .set-card-body,.set-again .set-card-body{flex-basis:calc(100% - 62px)}
}
`;
