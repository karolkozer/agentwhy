import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes } from '../../render/report-copy.ts';
import { BUTTON_STYLE, closeButton, pill } from '../../render/ui/button.ts';
import type { PageWindow } from '../../render/ui/page-shell.ts';
import { CLOSES, POPUP_SCRIPT, POPUP_STYLE, popup } from '../../render/ui/popup.ts';
import { PROJECT_LIST_SCRIPT, PROJECT_LIST_STYLE, projectList, type ProjectListRow } from '../../render/ui/project-list.ts';
import { TAG_STYLE } from '../../render/ui/tag.ts';
import type { SessionIndex } from '../session-index.ts';
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
export function projectsWindows(index: SessionIndex): readonly PageWindow[] {
  const projects = index.projects;
  if (projects === undefined) return [];
  const title = PROJECTS_WINDOW + '-title';
  const action = projects.switchable ? switchAction : undefined;
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
        projectList({ rows: projects.rows, unreadable: projects.unreadable, now: index.now, timeZone: index.timeZone ?? 'UTC', ...(action === undefined ? {} : { action }) }) +
        (projects.switchable ? '<p class="pjw-noscript">' + inLanguages((t) => t('proj.noScript')) + '</p>' : '') +
        chooseFolderBox(projects.choosable) +
        '<p class="pjw-which">' + inLanguages((t) => t('proj.which')) + '</p>' +
        '</div></div>',
    }),
    styles: [BUTTON_STYLE, POPUP_STYLE, TAG_STYLE, PROJECT_LIST_STYLE, SWITCH_STYLE, PROJECTS_WINDOW_STYLE],
    scripts: [POPUP_SCRIPT, PROJECT_LIST_SCRIPT, SWITCH_SCRIPT],
  }];
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
@media (max-width:640px){.pjw-head{padding:22px 18px 0}.pjw-title{font-size:24px}.pjw-body{padding:6px 18px 22px}}
`;
