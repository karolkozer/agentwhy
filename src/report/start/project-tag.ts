// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { RowProject } from '../check/check-lines.ts';
import { escapeHtml as e } from '../render/html-report-components.ts';
import { tag } from '../render/ui/tag.ts';
import { inLanguages } from '../render/report-copy.ts';

/**
 * A project named on a row of the computer's page (`everything-on-this-computer.md` step 2, GD18): its folder's name in
 * an outlined badge, and where that folder is on hover, as the projects window says it. `className` is the page's own,
 * which cuts a long name to its column.
 */
export function projectTag(project: RowProject, className: string): string {
  // GD20: where its kind is why it is on the computer's page, the badge says so - no project at all, or not set up.
  const label = project.kind === 'none' ? inLanguages((t) => t('cs.kind.none'))
    : project.kind === 'not-set-up' ? e(project.name) + ' · ' + inLanguages((t) => t('cs.kind.notSetUp'))
      : e(project.name);
  return '<span class="' + className + '"' + (project.place === undefined ? '' : ' title="' + e(project.place) + '"') + '>' +
    tag(label, 'grey', 'badge', true) + '</span>';
}

/** The style that cuts a project's badge to its column, under the page's own class for it. */
export function projectTagStyle(className: string): string {
  return '.' + className + ' .tag{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top}';
}
