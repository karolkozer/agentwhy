// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from '../../../core/policy/glob.ts';
import { idInKey } from '../../../core/session-catalogue.ts';
import type { Renderer } from '../../../shared/renderer.ts';
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.ts';
import { inLanguages, LANGS, translator, type Lang, type Translate } from '../../render/report-copy.ts';
import { FIX_WIZARD_SCRIPT } from '../../render/report-page/fix-wizard-script.ts';
import { FIX_WIZARD_STYLE } from '../../render/report-page/fix-wizard.ts';
import { HELPERS_SCRIPT, HELPERS_VIEW_STYLE } from '../../render/report-page/helpers-view.ts';
import { STORY_WINDOW_STYLE } from '../../render/report-page/story-window.ts';
import { clockIn } from '../../render/report-page/times.ts';
import { AVATAR_STYLE } from '../../render/ui/avatar.ts';
import { STAT_STYLE } from '../../render/ui/stats.ts';
import { appSidebar, APP_SIDEBAR_STYLE } from '../../render/ui/app-sidebar.ts';
import { ASK_PANEL_SCRIPT, ASK_PANEL_STYLE } from '../../render/ui/ask-panel.ts';
import { CHECKLIST_SCRIPT, CHECKLIST_STYLE } from '../../render/ui/checklist.ts';
import { BUTTON_STYLE } from '../../render/ui/button.ts';
import { CALLOUT_STYLE } from '../../render/ui/callout.ts';
import { CONFIRM_DIALOG_STYLE } from '../../render/ui/confirm-dialog.ts';
import { dataTable, DATA_TABLE_STYLE } from '../../render/ui/data-table.ts';
import { fileChips, FILE_CHIP_SCRIPT, FILE_CHIP_STYLE } from '../../render/ui/file-chip.ts';
import { FOLD_LINE_STYLE } from '../../render/ui/fold-line.ts';
import { hero, HERO_STYLE } from '../../render/ui/hero.ts';
import { localClock, rangeName } from '../../render/ui/local-date.ts';
import { pageShell } from '../../render/ui/page-shell.ts';
import { pillTabs, PILL_TABS_SCRIPT, PILL_TABS_STYLE } from '../../render/ui/pill-tabs.ts';
import { POPUP_SCRIPT, POPUP_STYLE } from '../../render/ui/popup.ts';
import { PROGRESS_STYLE } from '../../render/ui/progress.ts';
import { TAG_STYLE } from '../../render/ui/tag.ts';
import { TASK_LIST_STYLE } from '../../render/ui/task-list.ts';
import { LABELS } from '../../check/render/text-digest-renderer.ts';
import { appNav, sidebarProject, type AppLinks } from '../app-nav.ts';
import { projectsWindows } from '../projects/projects-window.ts';
import type { SessionIndex } from '../session-index.ts';
import { doneList, undoWindows } from './done-list.ts';
import { fixWindow, happenedWindow } from './file-window.ts';
import { TO_FIX_SCRIPT } from './to-fix-script.ts';
import { toFixList } from './to-fix-list.ts';
import { toFixView, type FixFile, type ToFixView } from './to-fix-view.ts';
import { pageNotice } from '../page-notice.ts';
import { scopeSwitch } from '../computer-scope-switch.ts';
import { projectTagStyle } from '../project-tag.ts';

/**
 * To fix, written as `to-fix.html` beside the index (`.ai/specs/2026-09-23-to-fix.md`; design file *agentwhy To fix*;
 * `.ai/plans/2026-09-23-to-fix-redesign.md`): every file still to fix across the run's conversations, what to do about
 * each, and what was done. Every mark and every undo goes through the server, and the page is read again (R60).
 */
export class ToFixRenderer implements Renderer<SessionIndex> {
  readonly #links: AppLinks;

  constructor(links: AppLinks) {
    this.#links = links;
  }

  render(index: SessionIndex): string {
    const view = toFixView(index);
    // A shared page writes nothing and carries no note (T19, R37).
    const writable = !index.shared;
    // GD25: on the computer's page too, Undo takes a mark out of the record of the project it is in.
    const undoable = writable;
    // Each file with its group, in the order the page draws them: the window's number is its place here.
    const files = [...view.keys.map((file) => ({ file, kind: 'keys' as const })), ...view.look.map((file) => ({ file, kind: 'look' as const }))];
    const numbered = new Map<FixFile, number>(files.map(({ file }, at) => [file, at]));
    // F57: files the person chose only to be told about, so a file's Fix it does not offer to protect what they let through.
    const toldPatterns = [index.settings?.told?.local, index.settings?.told?.shared].flatMap((list) => (list === undefined || list === 'unreadable' ? [] : list));
    const told = new Set(files.map(({ file }) => file.item.path as string).filter((path) => toldPatterns.some((pattern) => matchesGlob(path, pattern))));
    const windows = { writable, since: index.asked, settings: this.#links.settings, clock: clockIn(index.timeZone), told };
    const done = writable ? view.done : view.done.map(({ note: _note, ...rest }) => rest);

    return pageShell({
      // which-project V2, V11: the person's projects, opened from the sidebar's card.
      windows: projectsWindows(index, this.#links.onboarding),
      title: 'fix.title',
      // nothing-updates-by-itself U4: the update notice, where the project's hooks run an older release.
      ...pageNotice(index),
      // GD21: on the computer's page, Outside projects | All, at the head of the content.
      ...scopeSwitch(index),
      policy: INDEX_CONTENT_SECURITY_POLICY_META,
      width: 'list',
      styles: [APP_SIDEBAR_STYLE, HERO_STYLE, BUTTON_STYLE, PILL_TABS_STYLE, TASK_LIST_STYLE, TAG_STYLE, CALLOUT_STYLE, FOLD_LINE_STYLE,
        FILE_CHIP_STYLE, DATA_TABLE_STYLE, POPUP_STYLE, CONFIRM_DIALOG_STYLE, PROGRESS_STYLE, CHECKLIST_STYLE, ASK_PANEL_STYLE, FIX_WIZARD_STYLE, AVATAR_STYLE, STAT_STYLE,
        // The story's Diagram is drawn with the Helpers diagram's boxes and lines, and lit by its script, as on the report.
        HELPERS_VIEW_STYLE, STORY_WINDOW_STYLE, TO_FIX_STYLE],
      scripts: [PILL_TABS_SCRIPT, POPUP_SCRIPT, CHECKLIST_SCRIPT, FILE_CHIP_SCRIPT, ASK_PANEL_SCRIPT, FIX_WIZARD_SCRIPT, HELPERS_SCRIPT, TO_FIX_SCRIPT],
      sidebar: appSidebar({
        ...sidebarProject(index),
        home: this.#links.conversations,
        items: appNav(index, 'to-fix', this.#links),
      }),
      main: '<div class="tf" data-to-fix data-fix-words="' + e(JSON.stringify(scriptWords())) + '">' +
        hero({
          eyebrow: inLanguages((t, lang) => eyebrow(index, t, lang)),
          fact: inLanguages((t) => (view.total === 0 ? t('fix.hero.none') : t('fix.hero.count', { n: view.total }))),
          action: inLanguages((t) => (view.state === 'keys' ? t('fix.hero.keys', { n: view.keys.length }) : view.state === 'look' ? t('fix.hero.look') : t('fix.hero.nice'))),
          lead: inLanguages((t) => t('fix.lead')),
          calm: view.state === 'none',
        }) +
        pillTabs([
          { label: tabLabel('fix.tab.todo', view.total), panel: toFixList(view, numbered) },
          { label: tabLabel('fix.tab.done', done.length), panel: doneList(done, undoable) },
        ], 'state', 0, view.refusedAttempts === 0 ? '' :
          '<span class="tf-stopped"><span class="tf-stopped-mark" aria-hidden="true">✓</span>' +
          inLanguages((t) => t('fix.stopped', { n: view.refusedAttempts })) + '</span>') +
        developer(view, index) +
        files.map(({ file, kind }, at) => happenedWindow(file, kind, at, windows) + fixWindow(files.map((each) => each.file), at, windows)).join('') +
        (undoable ? undoWindows(done) : '') +
        // The wizard's words; whether the page is served is known only to its address (T17).
        '<div id="wizard-words" data-served="auto" hidden>' + ['wz.all', 'wz.finish', 'wz.saving', 'wz.tickFirst', 'wz.pickFirst']
          .map((key) => '<span data-word="' + key + '">' + inLanguages((t) => t(key)) + '</span>').join('') + '</div>' +
        '</div>',
    });
  }
}

/** "To fix 5", the count beside the word, as the design draws the two tabs. */
function tabLabel(key: string, n: number): string {
  return inLanguages((t) => t(key)) + ' <span class="tf-tab-count">' + n + '</span>';
}

/** T2, D3: the run's range - "Last 30 days · Aug 25 – Sep 23", or "Since Sep 1" for a date. */
function eyebrow(index: SessionIndex, t: Translate, lang: Lang): string {
  const clock = localClock(index.timeZone ?? 'UTC');
  const dates = rangeName(clock(index.since).day, clock(index.now).day, lang);
  const span = /^(\d+)([hdw])$/.exec(index.asked);
  return span === null
    ? t('fix.range.since', { dates })
    : t('fix.range', { range: t('fix.span.' + span[2], { n: Number(span[1]) }), dates });
}

/** T16: the conversations a row names before "+N more" - two, as a cell names at most two files (guidelines §9.1). */
const SHOWN_IDS = 2;

/**
 * T16: the tool's own words, for a developer: what `check` says of each file with what the label means, the
 * conversations it says it of, and the commands, each with what it does. A row of bare ids read as leaked values.
 */
function developer(view: ToFixView, index: SessionIndex): string {
  const files = [...view.keys, ...view.look, ...view.seen];
  const say = (key: string): string => inLanguages((t) => t(key));
  return '<details class="tf-dev"><summary class="tf-dev-toggle">' + say('fix.dev') + '</summary>' +
    '<div class="tf-dev-body"><p class="tf-dev-lead">' + say(index.shared ? 'fix.dev.lead.shared' : 'fix.dev.lead') + '</p>' +
    (files.length === 0 ? '' : dataTable({
      head: [say('fix.dev.col.says'), say('fix.dev.col.file'), say('fix.dev.col.in')],
      columns: 'minmax(150px,1fr) minmax(140px,1fr) minmax(220px,1.4fr)',
      minWidth: 560,
      rows: files.map((file) => ({
        cells: [
          '<span class="tf-dev-label">' + LABELS[file.label] + '</span><span class="tf-dev-means">' + say('fix.dev.means.' + file.label) + '</span>',
          fileChips([file.path], 1),
          '<span class="tf-dev-count">' + inLanguages((t) => t('fix.dev.count', { n: file.count })) + '</span>' +
            fileChips(file.conversations.map((each) => each.entry.name), SHOWN_IDS, shortId),
        ],
      })),
    })) +
    '<div class="tf-dev-commands"><h3 class="tf-dev-h">' + say('fix.dev.commands') + '</h3>' +
    command('fix.dev.cmd.full', 'agentwhy check --full --since ' + e(index.asked)) +
    command('fix.dev.cmd.mark', 'agentwhy check --mark rotated &lt;path&gt;') + '</div></div></details>';
}

/**
 * A session id is a UUID; its first 8 characters tell a run's conversations apart, and the chip's tooltip holds all of it.
 * They are cut from the id, not the key, which for Codex starts with `codex-`.
 */
function shortId(name: string): string {
  const id = idInKey(name);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(id) ? id.slice(0, 8) : name;
}

/** One command, under what it does. `line` is already escaped. */
function command(key: string, line: string): string {
  return '<div class="tf-dev-command"><span class="tf-dev-does">' + inLanguages((t) => t(key)) + '</span><code>' + line + '</code></div>';
}

/** What the script says, in every language: one text node cannot hold three. */
function scriptWords(): Record<string, Record<string, string>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, { saving: t('fix.saving'), refused: t('fix.refused'), asFile: t('fix.asFile'), unreachable: t('fix.unreachable') }];
  }));
}

/** What only this page lays out. Colours come from the tokens (plan rule 1). */
const TO_FIX_STYLE = String.raw`
.tf-stopped{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:600;color:var(--mint);background:var(--mint-06);border:1px solid var(--mint-35);border-radius:999px;padding:7px 16px 7px 8px}
.tf-stopped-mark{width:20px;height:20px;border-radius:50%;background:var(--mint);color:var(--on-mint);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.tf-tab-count{margin-left:6px;font-size:13px;opacity:.7}
.tf-group{margin-bottom:28px}
.tf-group-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.tf-dot{width:10px;height:10px;border-radius:50%}
.tf-group-coral .tf-dot{background:var(--coral)}.tf-group-amber .tf-dot{background:var(--amber)}
.tf-h2{margin:0;font-size:20px;font-weight:650}
.tf-group-count{font-size:15px;font-weight:650}
.tf-group-coral .tf-group-count{color:var(--coral-text)}.tf-group-amber .tf-group-count{color:var(--amber)}
.tf-group-lead{margin:0 0 14px 20px;font-size:14.5px;line-height:1.5;color:var(--text-2)}
.tf-empty{font-size:15px;color:var(--text-2);margin:8px 0 24px}
.tf-soft{color:var(--text-2);font-weight:400}
.tf-context{font-size:13.5px;color:var(--text-3)}
${projectTagStyle('tf-project')}
.tf-project{display:inline-block;max-width:100%;vertical-align:middle}
.tc-context:has(.tf-project){white-space:normal;min-width:0;max-width:100%}
.tf-seen{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.tf-seen-row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-radius:14px;background:var(--card);border:1px solid var(--white-07)}
.tf-seen-text{flex:1;min-width:0}
.tf-seen-title{display:block;font-size:15px;font-weight:600}
.tf-seen-sub{display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
.tf-seen-label{font-size:13px;color:var(--text-3);white-space:nowrap}
.tf-done-lead{font-size:14.5px;color:var(--text-2);margin:0 0 14px}
.tf-done{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.tf-done-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:18px;align-items:center;padding:16px 20px;border-radius:14px;background:var(--card);border:1px solid var(--mint-20)}
.tf-done-title{display:block;font-size:15.5px;font-weight:600;color:var(--text-3)}
.tf-done-sub{display:flex;align-items:center;gap:10px;margin-top:6px;flex-wrap:wrap}
.tf-note{font-size:13.5px;color:var(--text-2);font-style:italic}
.tf-fixed{font-size:13.5px;font-weight:600;color:var(--mint);white-space:nowrap}
.tf-undo{color:var(--text-3);font-size:13.5px;font-weight:400}.tf-undo:hover{color:var(--coral-text)}
.tf-window-head{padding:26px 32px 20px;border-bottom:1px solid var(--white-07)}
.tf-window-top{display:flex;justify-content:space-between;align-items:center;gap:16px}
.tf-window-group{font-size:14px;font-weight:600}.tf-window-keys{color:var(--coral-text)}.tf-window-look{color:var(--amber)}
.tf-window-title{margin:6px 0 10px;font-size:24px;line-height:1.25;font-weight:650}
.tf-window-body{display:flex;flex-direction:column;gap:22px;padding:24px 32px 28px}
.tf-fact-text{margin:0;font-size:15px;line-height:1.55;color:var(--text-2)}
.tf-h3{margin:0 0 12px;font-size:16px;font-weight:650}
.tf-say{margin:10px 0 0;font-size:13.5px;line-height:1.5;color:var(--coral-text)}
.tf-say[hidden]{display:none}
.tf-say-busy{color:var(--text-3)}
.tf-say code{display:block;margin-top:6px;font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--panel);border:1px solid var(--white-08);border-radius:8px;padding:8px 10px;word-break:break-all;user-select:all}
.tf-story-where{max-width:760px;margin:0 auto}
.tf-where{list-style:none;margin:0;padding:0;border-radius:12px;border:1px solid var(--white-08);overflow:hidden}
.tf-where-row{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:14px;align-items:center;padding:12px 14px;border-top:1px solid var(--white-06);background:var(--card)}
.tf-where-row:first-child{border-top:0}
.js .tf-where-row.tf-more{display:none}
.tf-where-day{display:block;font-size:14px;font-weight:600}
.tf-where-time{display:block;font-size:13px;color:var(--text-3)}
.tf-where-ask{font-size:14.5px;overflow-wrap:anywhere}
.tf-where-none{font-size:13px;color:var(--text-4)}
.tf-where-foot{display:flex;justify-content:space-between;gap:12px;margin-top:8px}
.tf-where-foot:empty{display:none}
.tf-all{background:transparent;border:none;color:var(--coral-text);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:4px 0}
.tf-dev{margin-top:28px}
.tf-dev-toggle{display:inline-block;cursor:pointer;list-style:none;color:var(--text-2);font-size:14px;font-weight:600;padding:4px 0}
.tf-dev-toggle::-webkit-details-marker{display:none}
.tf-dev-toggle:after{content:" ▾"}.tf-dev[open] .tf-dev-toggle:after{content:" ▴"}
.tf-dev-body{display:flex;flex-direction:column;gap:16px;margin-top:12px}
.tf-dev-lead{margin:0;max-width:640px;font-size:14px;line-height:1.5;color:var(--text-2)}
.tf-dev .dt-row{align-items:start;padding:14px 20px}
.tf-dev-label{display:block;font-family:var(--mono);font-size:12.5px;font-weight:600;letter-spacing:0.02em;color:var(--text);white-space:nowrap}
.tf-dev-means{display:block;margin-top:4px;font-size:13px;line-height:1.4;color:var(--text-3)}
.tf-dev-count{display:block;margin-bottom:8px;font-size:13px;font-weight:600;color:var(--text-2)}
.tf-dev-commands{display:flex;flex-direction:column;gap:12px;border-radius:12px;background:var(--panel);border:1px solid var(--white-08);padding:14px 18px}
.tf-dev-h{margin:0;font-size:12.5px;font-weight:600;color:var(--text-3)}
.tf-dev-command{display:flex;flex-direction:column;gap:3px}
.tf-dev-does{font-size:13px;color:var(--text-2)}
.tf-dev-command code{font-family:var(--mono);font-size:13px;color:var(--text-soft);overflow-wrap:anywhere}
@media (max-width:640px){.tf-window-head{padding:20px 18px 16px}.tf-window-body{padding:20px 18px}
.tf-where-row{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"when see" "ask see";row-gap:4px}
.tf-where-when{grid-area:when;display:flex;gap:8px;align-items:baseline}.tf-where-ask{grid-area:ask}.tf-where-row>:last-child{grid-area:see}}
@media (max-width:760px){.tf-done-row{grid-template-columns:1fr}}
.sw-body .tabs-inset .tabs-pill{white-space:nowrap;flex:none}
@media (max-width:640px){.sw-body>.tabs>.tabs-bar{max-width:100%;overflow-x:auto;scrollbar-width:none}.sw-body .tabs-inset .tabs-pill{padding:7px 12px}}
`;
