// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { CheckLabel, CheckRow, HistoryLine, RowProject } from '../../check/check-lines.ts';
import { resultAllowed, type MarkResult } from '../../check/marks.ts';
import { matchesGlob } from '../../../core/policy/glob.ts';
import type { Redacted } from '../../../core/redaction/redacted.ts';
import type { FileStory } from '../../render/report-page/file-story.ts';
import { ruleKey } from '../../render/report-page/item-names.ts';
import { NOTHING_READ, toDoItem, type ToDoItem } from '../../render/report-page/to-do.ts';
import { localClock, type LocalDay } from '../../render/ui/local-date.ts';
import { ruleNameOf, type RuleName } from '../../rule-names.ts';
import type { IndexEntry, SessionIndex } from '../session-index.ts';

/**
 * What the To fix page shows, decided from the index (`.ai/specs/2026-09-23-to-fix.md`; plan step 1). No HTML: every
 * group, name, order, count and button of the page is chosen here, and the page only writes it.
 */

/** T4: the two groups a line to do falls in, and the fold for the lines that ask nothing (T7). */
export type FixGroup = 'keys' | 'look';

const GROUP_OF: Readonly<Record<CheckLabel, FixGroup | 'seen'>> = {
  rotate: 'keys',
  template: 'look',
  // D1: an outcome nobody recorded is looked at, like a sample file, and closed as handled.
  unknown: 'look',
  route: 'seen',
  result: 'seen',
};

/**
 * T14: the buttons a file's window offers, in the order they are drawn, each the mark it writes. Only those
 * `resultAllowed` lets a line take are offered: a file a key was read from is closed as rotated and nothing else.
 */
const RESULTS_OF: Readonly<Record<CheckLabel, readonly MarkResult[]>> = {
  rotate: ['rotated'],
  template: ['not-secret', 'rotated'],
  unknown: ['handled'],
  route: [],
  result: [],
};

/**
 * T14: the one mark besides the wizard's Done: a sample file's "No real keys here", an unrecorded outcome's "I checked
 * it", a file with no key in it "Nothing private in it" - each only where its line may take it.
 */
const SKIP_OF: Readonly<Record<CheckLabel, (item: ToDoItem, allowed: (result: MarkResult) => boolean) => MarkResult | null>> = {
  rotate: (item, allowed) => (item.kind === 'data' && allowed('not-private') ? 'not-private' : null),
  template: (_item, allowed) => (allowed('not-secret') ? 'not-secret' : null),
  // A file with no key in it is closed as handled by the wizard's Done already; its skip is the one left.
  unknown: (item, allowed) => (item.kind === 'data' ? (allowed('not-private') ? 'not-private' : null) : allowed('handled') ? 'handled' : null),
  route: () => null,
  result: () => null,
};

/** A moment on the page's clock (O2): the local day and time, and whether that day is today or yesterday. */
export interface When {
  readonly at: number;
  readonly day: LocalDay;
  readonly time: string;
  readonly relative?: 'today' | 'yesterday';
}

/** One conversation behind a file (T15). */
export interface FixConversation {
  readonly entry: IndexEntry;
  readonly when: When;
  /** The report it leads to, where there is one. */
  readonly report?: string;
}

export interface FixFile {
  readonly path: string;
  /** GD18: on the computer's page, the project the file is in - the same path in two projects is two files. */
  readonly project?: RowProject;
  readonly label: CheckLabel;
  /** T6: the built-in rule that matched it, or `undefined`: "A private file". */
  readonly name?: RuleName;
  /** Marked done, and reached again after (T5 "Back again", T12). */
  readonly reopened?: When;
  /** T14: every mark its line may take. */
  readonly results: readonly MarkResult[];
  /**
   * T13: the file as the Fix it wizard draws it, from what every conversation read from it - key formats and lines,
   * names only. Its Done writes `rotated`, or `handled` for a file with no key in it.
   */
  readonly item: ToDoItem;
  /** T14: the wizard's quiet skip - the other mark its line may take - or `null` where it may take none. */
  readonly skip: MarkResult | null;
  /**
   * T11a: what happened to it in the newest conversation whose report told it, as that report's window tells it.
   * Absent where no report of a conversation that read it could be built.
   */
  readonly story?: FixStory;
  /** T15, newest first. Only those this run lists; `count` says how many there were. */
  readonly conversations: readonly FixConversation[];
  readonly count: number;
}

export interface FixStory {
  readonly story: FileStory;
  readonly sessionId: string;
  readonly conversation: FixConversation;
}

export interface DoneFile {
  readonly path: string;
  /** GD18: on the computer's page, the project whose record holds the mark. */
  readonly project?: RowProject;
  readonly label: string;
  readonly name?: RuleName;
  readonly result: MarkResult;
  readonly when: When;
  readonly note?: string;
}

export interface ToFixView {
  /** T4, each ordered by T8; an empty group is not drawn. */
  readonly keys: readonly FixFile[];
  readonly look: readonly FixFile[];
  /** T7: the files whose name only was seen. */
  readonly seen: readonly FixFile[];
  /** T9, newest first. */
  readonly done: readonly DoneFile[];
  /** T3. */
  readonly refusedAttempts: number;
  /** T2 line two: keys first, a look only, or nothing left. */
  readonly state: 'keys' | 'look' | 'none';
  /** The To fix tab's count, the hero's and the sidebar's (O10). */
  readonly total: number;
  /** The record of marks could not be read, so nothing marked was left out (R38). */
  readonly marksUnreadable: boolean;
}

export function toFixView(index: SessionIndex): ToFixView {
  const clock = localClock(index.timeZone ?? 'UTC');
  const today = clock(index.now).day.number;
  const when = (at: number): When => {
    const { day, time } = clock(at);
    const relative = day.number === today ? 'today' : day.number === today - 1 ? 'yesterday' : undefined;
    return { at, day, time, ...(relative === undefined ? {} : { relative }) };
  };
  const patterns = index.settings?.protected ?? [];
  const byName = new Map(index.entries.map((entry) => [entry.name, entry]));
  const check = index.check;

  const file = (row: CheckRow): FixFile => {
    const name = ruleNameOf(row.path as string, patterns);
    const conversations = row.sessions
      .flatMap((session) => {
        const entry = byName.get(session);
        return entry === undefined ? [] : [{
          entry,
          when: when(entry.modifiedAt),
          ...(entry.report.kind === 'generated' ? { report: entry.report.file } : {}),
        }];
      })
      .sort((a, b) => b.when.at - a.when.at);
    // A key was read from it, so "No real keys" would contradict what the record holds: only rotated closes it,
    // though the server would take not-secret for any sample file (`resultAllowed`).
    const allowed = (result: MarkResult): boolean => resultAllowed(row, result) && !(row.keyed === true && result === 'not-secret');
    // The built-in rule's own pattern names the file for the wizard (F45): a rule's file holds keys.
    const pattern = patterns.find((each) => ruleKey(each) !== undefined && matchesGlob(row.path as string, each));
    const item = toDoItem(row.path, row.read ?? NOTHING_READ, {
      template: row.label === 'template',
      further: false,
      readers: 1,
      ...(pattern === undefined ? {} : { pattern: pattern as Redacted }),
    });
    const told = conversations.flatMap((conversation) => {
      const stories = conversation.entry.report.kind === 'generated' ? conversation.entry.report.stories : undefined;
      const story = stories?.files.get(row.path as string);
      return story === undefined || stories === undefined ? [] : [{ story, sessionId: stories.sessionId as string, conversation }];
    })[0];
    return {
      path: row.path as string,
      ...(row.project === undefined ? {} : { project: row.project }),
      label: row.label,
      ...(told === undefined ? {} : { story: told }),
      ...(name === undefined ? {} : { name }),
      ...(row.reopened === undefined ? {} : { reopened: when(row.reopened.at) }),
      results: RESULTS_OF[row.label].filter(allowed),
      item,
      skip: SKIP_OF[row.label](item, allowed),
      conversations,
      count: row.sessions.length,
    };
  };

  const rows = (check?.rows ?? []).map((row) => ({ row, fix: file(row) }));
  const inGroup = (group: FixGroup | 'seen'): FixFile[] =>
    rows.filter(({ row }) => GROUP_OF[row.label] === group).map(({ fix }) => fix).sort(byUrgency);
  const keys = inGroup('keys');
  const look = inGroup('look');

  const done = (check?.history ?? [])
    .filter((line: HistoryLine) => line.status === 'standing' && !line.reopened)
    .map((line): DoneFile => {
      const name = ruleNameOf(line.path, patterns);
      return {
        path: line.path,
        ...(line.project === undefined ? {} : { project: line.project }),
        label: line.label,
        ...(name === undefined ? {} : { name }),
        result: line.result,
        when: when(line.at),
        ...(line.note === undefined ? {} : { note: line.note }),
      };
    })
    .sort((a, b) => b.when.at - a.when.at);

  return {
    keys,
    look,
    seen: inGroup('seen'),
    done,
    refusedAttempts: check?.refusedAttempts ?? 0,
    state: keys.length > 0 ? 'keys' : look.length > 0 ? 'look' : 'none',
    total: keys.length + look.length,
    marksUnreadable: check?.marksUnreadable === true,
  };
}

/**
 * T8: the files more conversations reached first, as the design orders them, then by path so the order is stable - and
 * on the computer's page, one path in two projects by the project's name (GD18).
 */
function byUrgency(a: FixFile, b: FixFile): number {
  if (a.count !== b.count) return b.count - a.count;
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  const [one, other] = [a.project?.name ?? '', b.project?.name ?? ''];
  return one < other ? -1 : one > other ? 1 : 0;
}
