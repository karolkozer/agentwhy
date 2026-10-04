// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';

/**
 * A to-do list (guidelines §4, "Task card"): a header row `File · Details · Action`, then one card per file - a round
 * check, the human title and the file's chip, one action for the details and one to do it. The same card is the report's
 * to-do list and, next, the index's To fix (report page spec Q8).
 */
export interface Task {
  /** The human title, already written in every language and escaped. */
  readonly title: string;
  /** The file's path as the report names it, the chip's title; escaped here. */
  readonly path: string;
  /** What the chip says, where the page names the file by less than its path (R5); the path otherwise. Escaped here. */
  readonly label?: string;
  readonly done: boolean;
  /** A pill that opens what happened. In the compact card it stands above the card's own link, a control of its own. */
  readonly details?: string;
  /** A pill that does it, or the Done tag. */
  readonly action: string;
  readonly attributes?: string;
  /**
   * The compact card of To fix (`.ai/specs/2026-09-23-to-fix.md` T5): no round check, a status bar in the group's
   * colour, a tag after the title, a line of context after the chip, "What happened", a "›", and the whole card a link
   * - these attributes, already escaped, are its address and what a script opens (`opens`).
   */
  readonly compact?: {
    readonly bar: 'coral' | 'amber';
    readonly tag?: string;
    readonly context: string;
    readonly opens: string;
    /** The link's name in every language (`labelAttributes`). */
    readonly label: string;
  };
}

/** `head` is the three column names, already written in every language; a list of compact cards has none. */
export function taskList(head: readonly [string, string, string] | undefined, tasks: readonly Task[]): string {
  return (head === undefined ? '' :
    '<div class="tl-head" aria-hidden="true"><span class="tl-file">' + head[0] + '</span><span>' + head[1] + '</span><span>' + head[2] + '</span></div>') +
    '<ul class="tl">' + tasks.map(taskCard).join('') + '</ul>';
}

function taskCard(task: Task): string {
  const compact = task.compact;
  const chip = '<span class="tc-chip" title="' + e(task.path) + '">' + e(task.label ?? task.path) + '</span>';
  if (compact !== undefined) {
    return '<li class="tc tc-compact"' + (task.attributes ?? '') + '><div class="tc-row">' +
      '<span class="tc-bar tc-bar-' + compact.bar + '" aria-hidden="true"></span>' +
      '<a class="tc-link"' + compact.opens + compact.label + '></a>' +
      '<span class="tc-text"><span class="tc-head"><span class="tc-title">' + task.title + '</span>' + (compact.tag ?? '') + '</span>' +
      '<span class="tc-sub">' + chip + '<span class="tc-context">' + compact.context + '</span></span></span>' +
      (task.details === undefined ? '' : '<span class="tc-details tc-over">' + task.details + '</span>') +
      '<span class="tc-action">' + task.action + '</span><span class="tc-trail" aria-hidden="true">›</span></div></li>';
  }
  return '<li class="tc' + (task.done ? ' tc-done' : '') + '"' + (task.attributes ?? '') + '><div class="tc-row">' +
    '<span class="tc-main"><span class="tc-check" aria-hidden="true">' + (task.done ? '✓' : '') + '</span>' +
    '<span class="tc-text"><span class="tc-title">' + task.title + '</span>' + chip + '</span></span>' +
    '<span class="tc-details">' + (task.details ?? '') + '</span><span class="tc-action">' + task.action + '</span></div></li>';
}

export const TASK_LIST_STYLE = String.raw`
.tl-head,.tc-row{display:grid;grid-template-columns:minmax(0,1fr) 150px 118px;column-gap:20px;align-items:center}
.tl-head{padding:0 22px 8px;font-size:12.5px;font-weight:600;color:var(--text-3)}
.tl-file{padding-left:40px}
.tl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.tc{border-radius:14px;background:var(--card);border:1px solid var(--white-09);overflow:hidden}
.tc-row{padding:18px 22px}
.tc-main{min-width:0;display:flex;align-items:center;gap:16px}
.tc-check{flex:none;width:24px;height:24px;border-radius:50%;border:1.5px solid var(--white-25);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--on-mint)}
.tc-done .tc-check{border-color:var(--mint);background:var(--mint)}
.tc-text{flex:1;min-width:0}
.tc-title{display:block;font-size:16px;font-weight:600;line-height:1.35}
.tc-done .tc-title{color:var(--text-3)}
.tc-chip{display:inline-flex;font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:3px 8px;margin-top:7px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tc-details,.tc-action{display:flex}
.tc-compact{position:relative;transition:border-color .15s}
.tc-compact:hover{border-color:var(--white-25)}
.tc-compact .tc-row{grid-auto-flow:column;grid-template-columns:minmax(0,1fr);grid-auto-columns:auto;column-gap:18px;padding:24px 20px 24px 24px}
.tc-over{position:relative;z-index:2}
.tc-bar{position:absolute;left:0;top:15%;height:70%;width:2px;border-radius:0 2px 2px 0}
.tc-bar-coral{background:var(--coral)}.tc-bar-amber{background:var(--amber)}
.tc-link{position:absolute;inset:0;z-index:1;border-radius:14px}
.tc-link:focus-visible{outline-offset:-2px}
.tc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tc-sub{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:7px}
.tc-sub .tc-chip{margin-top:0}
.tc-context{font-size:13.5px;color:var(--text-3);white-space:nowrap}
.tc-trail{font-size:20px;color:var(--text-4)}
@media (max-width:640px){.tl-head{display:none}.tc-row{grid-template-columns:1fr;row-gap:12px}.tc-details,.tc-action{padding-left:40px}
.tc-compact .tc-row{grid-auto-flow:row;grid-template-columns:minmax(0,1fr) auto;padding:20px 18px 20px 20px}
.tc-compact .tc-text{grid-column:1/-1}.tc-compact .tc-details,.tc-compact .tc-action{padding-left:0}.tc-trail{display:none}}
`;
