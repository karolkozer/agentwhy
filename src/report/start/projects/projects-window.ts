// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, translator } from '../../render/report-copy.ts';
import { BUTTON_STYLE, closeButton, pill } from '../../render/ui/button.ts';
import type { PageWindow } from '../../render/ui/page-shell.ts';
import { CONFIRM_DIALOG_STYLE } from '../../render/ui/confirm-dialog.ts';
import { CLOSES, POPUP_SCRIPT, POPUP_STYLE, popup } from '../../render/ui/popup.ts';
import { PROJECT_LIST_SCRIPT, PROJECT_LIST_STYLE, projectList, type ProjectListRow } from '../../render/ui/project-list.ts';
import { tag, TAG_STYLE } from '../../render/ui/tag.ts';
import { COMPUTER_SWITCH, EVERYWHERE_STEP } from '../onboarding/everywhere-address.ts';
import type { IndexEverywhere, SessionIndex } from '../session-index.ts';
import { REMOVE_SCRIPT, REMOVE_STYLE, removeTrash, removeWindow } from './project-remove.ts';
import { chooseFolderBox, SWITCH_SAY, SWITCH_SCRIPT, SWITCH_STYLE, switchArea } from './project-switch.ts';

/** The window's id: the sidebar's card links to it (`which-project.md` V2). */
export const PROJECTS_WINDOW = 'projects';

/**
 * The window that switches projects, over any page `start` serves (`.ai/specs/2026-09-27-which-project.md` V2, V10-V15),
 * as the maintainer's design of 2026-09-28 draws it: opened from the sidebar's card, so the page stays where it is
 * (guidelines §8). Every other project offers a way to it - **Open** (light, the maintainer's) where it is set up, **Set
 * it up →** (coral: it starts the setup) where it is not - and either shows that project in this tab (V14, V15). Where
 * the run cannot switch, nothing is offered; without a script nothing switches, and the window says so (V13). Nothing
 * where the run is not served or shares its pages.
 */
export function projectsWindows(index: SessionIndex, onboarding?: string): readonly PageWindow[] {
  const projects = index.projects;
  if (projects === undefined) return [];
  const title = PROJECTS_WINDOW + '-title';
  const action = projects.switchable ? switchAction : undefined;
  // RM4: the trash on every listed row, in a column of its own.
  const removing = projects.removable ? removeTrash : undefined;
  return [{
    html: popup({
      id: PROJECTS_WINDOW,
      size: 'list',
      labelledBy: title,
      body: '<div class="pjw"' + switchArea() + '>' +
        '<div class="pjw-head"><div><h2 class="pjw-title" id="' + title + '">' + inLanguages((t) => t('proj.title')) + '</h2>' +
        '<p class="pjw-lead">' + inLanguages((t) => t('proj.lead')) + '</p></div>' +
        closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
        '<div class="pjw-body">' +
        SWITCH_SAY +
        // protected-everywhere G10: the computer-wide path, above the projects, where this run serves it.
        (index.everywhere === undefined || onboarding === undefined ? '' : everywhereRow(index.everywhere, onboarding, index.scope === 'computer', projects.switchable)) +
        projectList({
          rows: projects.rows,
          unreadable: projects.unreadable,
          now: index.now,
          timeZone: index.timeZone ?? 'UTC',
          ...(action === undefined ? {} : { action }),
          ...(removing === undefined ? {} : { remove: removing }),
        }) +
        (projects.switchable ? '<p class="pjw-noscript">' + inLanguages((t) => t('proj.noScript')) + '</p>' : '') +
        chooseFolderBox(projects.choosable) +
        '<p class="pjw-which">' + inLanguages((t) => t('proj.which')) + '</p>' +
        '</div></div>',
    }),
    styles: [BUTTON_STYLE, POPUP_STYLE, TAG_STYLE, PROJECT_LIST_STYLE, SWITCH_STYLE, PROJECTS_WINDOW_STYLE],
    scripts: [POPUP_SCRIPT, PROJECT_LIST_SCRIPT, SWITCH_SCRIPT],
  },
  // RM5: one confirmation for the whole list, a window of its own beside it.
  ...(removing === undefined ? [] : [{
    html: removeWindow(),
    styles: [BUTTON_STYLE, POPUP_STYLE, CONFIRM_DIALOG_STYLE, REMOVE_STYLE],
    scripts: [POPUP_SCRIPT, REMOVE_SCRIPT],
  }])];
}

/** The computer's own drawn: no emoji, not even in a card (guidelines §9.3). */
const COMPUTER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';

/**
 * `2026-10-05-protected-everywhere.md` G10, as the approved mock's way back in draws it: everything on this computer,
 * a row of its own above the projects - mint, saying how many kinds of files it keeps from the AI, where it keeps
 * any; the path's own sentence where it keeps none.
 *
 * `everything-on-this-computer.md` step 4 (GD15): **Open** shows the computer's own view, as a project's **Open** shows
 * that project - the maintainer found it leading back to the setup step. On the computer's page itself it is the one
 * shown, as the current project is. Where this run cannot switch, the onboarding's step is the way left.
 */
function everywhereRow(everywhere: IndexEverywhere, onboarding: string, shown: boolean, switchable: boolean): string {
  const blocked = everywhere.blocked === 'unreadable' ? 0 : everywhere.blocked.length;
  const held = blocked > 0;
  const action = shown
    ? tag(inLanguages((t) => t('proj.ev.shown')), 'mint')
    : switchable
      ? '<span class="js-only">' + pill({
        label: inLanguages((t) => t('proj.open')),
        tone: 'light',
        size: 'md',
        button: true,
        attributes: ' data-switch-project="' + COMPUTER_SWITCH + '" data-switch-name="' + e(translator('en')('app.computer.name')) + '"',
      }) + '</span>'
      : pill({ label: inLanguages((t) => t(held ? 'proj.open' : 'ob.ev.wayin.go')), tone: held ? 'light' : 'outline', size: 'md', href: e(onboarding) + '#' + EVERYWHERE_STEP });
  return '<div class="pjw-ev' + (held ? ' pjw-ev-held' : '') + '"><span class="pjw-ev-mark" aria-hidden="true">' + COMPUTER_SVG + '</span>' +
    '<span class="pjw-ev-text"><span class="pjw-ev-name">' + inLanguages((t) => t('ob.ev.scope.everywhere')) + '</span>' +
    '<span class="pjw-ev-sub">' + inLanguages((t) => (held ? t('proj.ev.held', { n: blocked }) : t('ob.ev.scope.everywhere.text'))) + '</span></span>' +
    action + '</div>';
}

/** What another project offers: the way to it, which only a script can take. */
function switchAction(row: ProjectListRow): string {
  if (row.current) return '';
  const label = inLanguages((t) => t(row.setUp === false ? 'proj.setItUp' : 'proj.open'));
  return '<span class="js-only">' + pill({
    label,
    tone: row.setUp === false ? 'primary' : 'light',
    size: 'md',
    button: true,
    attributes: ' data-switch-project="' + e(row.id) + '" data-switch-name="' + e(row.name) + '"',
  }) + '</span>';
}

const PROJECTS_WINDOW_STYLE = String.raw`
.pjw-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:30px 32px 0}
.pjw-title{margin:0;font-size:28px;line-height:1.2;font-weight:650;letter-spacing:-0.015em}
.pjw-lead{margin:8px 0 0;font-size:15px;line-height:1.5;color:var(--text-2)}
.pjw-body{padding:8px 32px 30px}
.pjw-noscript{display:none;margin:12px 4px 0;font-size:13px;color:var(--text-3)}
html:not(.js) .pjw-noscript{display:block}
.pjw-which{margin:16px 4px 0;font-size:12.5px;line-height:1.5;color:var(--text-3)}
.pjw-ev{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:8px 0 18px;padding:16px 18px;border-radius:14px;border:1px solid var(--white-09);background:var(--card)}
.pjw-ev-held{border-color:var(--mint-35);background:var(--mint-05)}
.pjw-ev-mark{flex:none;width:38px;height:38px;border-radius:10px;background:var(--white-06);color:var(--text);display:flex;align-items:center;justify-content:center}
.pjw-ev-text{flex:999 1 220px;min-width:0;display:flex;flex-direction:column;gap:3px}
.pjw-ev-name{font-size:16px;font-weight:600}
.pjw-ev-sub{font-size:14px;line-height:1.45;color:var(--text-2)}
.pjw-ev-held .pjw-ev-sub{color:var(--mint)}
@media (max-width:640px){.pjw-head{padding:22px 18px 0}.pjw-title{font-size:24px}.pjw-body{padding:6px 18px 22px}}
`;
