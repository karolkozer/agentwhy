// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, type Translate } from '../../render/report-copy.ts';
import { pill } from '../../render/ui/button.ts';
import { callout } from '../../render/ui/callout.ts';
import { foldLine } from '../../render/ui/fold-line.ts';
import { fixId } from '../../render/report-page/to-do-view.ts';
import { opener, opens } from '../../render/ui/popup.ts';
import { tag } from '../../render/ui/tag.ts';
import { taskList, type Task } from '../../render/ui/task-list.ts';
import { happenedId } from './file-window.ts';
import { projectTag } from '../project-tag.ts';
import type { FixFile, FixGroup, ToFixView } from './to-fix-view.ts';

/** T6: what a file is, in words - the rule that matched it, else "A private file". */
export function fileTitle(file: { readonly name?: string }, t: Translate): string {
  return t(file.name === undefined ? 'fix.private' : 'set.rule.' + file.name);
}

/**
 * The To fix tab (T4-T8): keys to change, then a look to take, each hidden when empty, then the files whose name only
 * was seen, folded. `numbered` gives each file the window number the page gave it.
 */
export function toFixList(view: ToFixView, numbered: ReadonlyMap<FixFile, number>): string {
  const empty = view.keys.length === 0 && view.look.length === 0;
  return (view.marksUnreadable ? callout({ tone: 'grey', body: inLanguages((t) => t('fix.marksUnreadable')) }) : '') +
    group('keys', view.keys, numbered) +
    group('look', view.look, numbered) +
    (empty ? '<p class="tf-empty">' + inLanguages((t) => t('fix.empty')) + '</p>' : '') +
    seenFold(view.seen);
}

const GROUP_LOOK: Readonly<Record<FixGroup, { readonly tone: 'coral' | 'amber'; readonly go: 'primary' | 'outline' }>> = {
  keys: { tone: 'coral', go: 'primary' },
  look: { tone: 'amber', go: 'outline' },
};

function group(kind: FixGroup, files: readonly FixFile[], numbered: ReadonlyMap<FixFile, number>): string {
  if (files.length === 0) return '';
  const look = GROUP_LOOK[kind];
  const tasks = files.map((file): Task => {
    const at = numbered.get(file) ?? 0;
    return {
      title: inLanguages((t) => fileTitle(file, t)),
      path: file.path,
      done: false,
      // The card as a whole opens Fix it; the pill says so, and is not a second control. "What happened" is one.
      details: pill({ label: inLanguages((t) => t('rp.what')), tone: 'secondary', href: '#' + happenedId(at), attributes: opener(happenedId(at)) }),
      action: pill({ label: inLanguages((t) => t('fix.' + kind + '.go')), tone: look.go }),
      compact: {
        bar: look.tone,
        ...(file.reopened === undefined ? {} : { tag: tag(inLanguages((t) => t('fix.back')), 'coral', 'badge', true) }),
        context: inProject(file) + inLanguages((t) => t('fix.in', { n: file.count })),
        opens: opens(fixId(at)),
        label: labelAttributes((t) => e(fileTitle(file, t) + ' · ' + file.path)),
      },
    };
  });
  return '<section class="tf-group tf-group-' + look.tone + '">' +
    '<div class="tf-group-head"><span class="tf-dot" aria-hidden="true"></span><h2 class="tf-h2">' +
    inLanguages((t) => t('fix.' + kind)) + '</h2><span class="tf-group-count">' + files.length + '</span></div>' +
    '<p class="tf-group-lead">' + inLanguages((t) => t('fix.' + kind + '.lead')) + '</p>' +
    taskList(undefined, tasks) + '</section>';
}

/** GD18: on the computer's page a file names its project, beside its path. Nothing on a project's own page. */
export function inProject(file: { readonly project?: FixFile['project'] }): string {
  return file.project === undefined ? '' : projectTag(file.project, 'tf-project') + ' ';
}

/** T7: what only named a file asks nothing, so it is one folded line, and each file opened under it says so. */
function seenFold(files: readonly FixFile[]): string {
  if (files.length === 0) return '';
  return foldLine({
    summary: inLanguages((t) => t('fix.seen', { n: files.length })),
    body: '<ul class="tf-seen">' + files.map((file) =>
      '<li class="tf-seen-row"><span class="tf-seen-text"><span class="tf-seen-title">' + inLanguages((t) => fileTitle(file, t)) + '</span>' +
      '<span class="tf-seen-sub"><span class="chip">' + e(file.path) + '</span>' + inProject(file) + '<span class="tf-context">' +
      inLanguages((t) => t('fix.in', { n: file.count })) + '</span></span></span>' +
      '<span class="tf-seen-label">○ ' + inLanguages((t) => t('fix.seen.label')) + '</span></li>').join('') + '</ul>',
  });
}
