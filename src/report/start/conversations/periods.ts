// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { TO_DO_LABELS } from '../../check/check-lines.ts';
import type { IndexEntry, IndexFile, SessionIndex } from '../session-index.ts';
import { statusOf } from '../render/session-status.ts';
import { LOOKS, type Look } from '../../render/ui/status-look.ts';
import { dayOf, localClock, type LocalDay } from '../../render/ui/local-date.ts';

const LOOK_OF: Readonly<Record<ReturnType<typeof statusOf>, Look>> = {
  seen: 'read',
  result: 'name',
  named: 'name',
  blocked: 'stopped',
  clean: 'none',
  unknown: 'unchecked',
  failed: 'failed',
  outside: 'outside',
};

export interface Conversation {
  readonly entry: IndexEntry;
  readonly look: Look;
  readonly day: LocalDay;
  /** The local time, `HH:MM`. */
  readonly time: string;
  /** `today`, `yesterday`, or `undefined` for any other day, which is then named by its date. */
  readonly relative?: 'today' | 'yesterday';
  /** The protected files behind the look, strongest first, as the report names them. */
  readonly files: readonly string[];
  /** How many of those files' contents reached an agent: what the guide card and a read or fixed row count. */
  readonly read: number;
  /** How many files its report's Files tab lists, where it has a report that counted them (F14's "All {n} files"). */
  readonly reached?: number;
  /**
   * Read, and what its record leaves out is not known (F17): listed among those not fully checked, never under "nothing
   * private to fix". Changed twice on 2026-10-05 by the maintainer: a record with gaps whose every attempt has a known
   * end, and that saw only names, says so and is listed with the rest - the status ladder sends one with an attempt of
   * no known end here instead.
   */
  readonly partial: boolean;
}

/** One day tile: a day of a week, or of a month. */
export interface CalendarDay {
  readonly day: LocalDay;
  readonly conversations: number;
  readonly toCheck: number;
  /** How many of that day's conversations read something private that has since been fixed: it happened, so the tile says so. */
  readonly fixed: number;
  /** How many of that day's conversations this run could not check: older than it, unreadable, or with gaps. */
  readonly unchecked: number;
  /** How many of that day's conversations are in each look: what a tile's summary counts. */
  readonly looks: Readonly<Partial<Record<Look, number>>>;
  /** Of `unchecked`, those read with gaps: a day of these alone says "not fully checked", as their list's heading does. */
  readonly partial: number;
  /** A day of the current week or month that has not happened yet. */
  readonly future: boolean;
  readonly today: boolean;
}

/** A run of calendar days the pages are read through - a week on Conversations, a month on This month. */
export interface Period {
  /** 0 is the current one, 1 the one before, and so on, counted by the calendar - never by how many are shown. */
  readonly ago: number;
  readonly first: LocalDay;
  readonly last: LocalDay;
  readonly days: readonly CalendarDay[];
  /** Newest first. */
  readonly conversations: readonly Conversation[];
  /** The newest conversation whose AI read something private that is still to fix: where the guide card sends a person first (F9). */
  readonly start?: Conversation;
  readonly toFix: number;
}

/**
 * Every conversation on the page, newest first, read in the time zone of the machine that ran `start`
 * (`for-people-who-build-with-ai.md` O2), and the day that is today there.
 */
export function conversationsOf(index: SessionIndex): { readonly today: LocalDay; readonly conversations: readonly Conversation[] } {
  const local = localClock(index.timeZone ?? 'UTC');
  const today = local(index.now).day;
  const done = fixedOf(index);
  const conversations = index.entries
    .map((entry) => conversation(entry, local, today, done))
    .sort((a, b) => b.entry.modifiedAt - a.entry.modifiedAt);
  return { today, conversations };
}

/** The days `first` to `last`, each counted, and the conversations among them that need a person first. */
export function period(ago: number, first: number, last: number, today: number, conversations: readonly Conversation[]): Period {
  const days = Array.from({ length: last - first + 1 }, (_unused, offset): CalendarDay => {
    const number = first + offset;
    const those = conversations.filter((item) => item.day.number === number);
    const looks: Partial<Record<Look, number>> = {};
    for (const item of those) looks[item.look] = (looks[item.look] ?? 0) + 1;
    return {
      day: dayOf(number),
      conversations: those.length,
      // A read of files the person let the AI read is to check too: it is put before them, as a read is (F57a).
      toCheck: those.filter((item) => LOOKS[item.look].attention).length,
      fixed: those.filter((item) => item.look === 'fixed').length,
      unchecked: those.filter(unchecked).length,
      looks,
      partial: those.filter((item) => item.partial).length,
      future: number > today,
      today: number === today,
    };
  });
  const start = conversations.find((item) => item.look === 'read');
  return {
    ago,
    first: dayOf(first),
    last: dayOf(last),
    days,
    conversations,
    ...(start === undefined ? {} : { start }),
    toFix: conversations.filter((item) => item.look === 'read').length,
  };
}

/**
 * Conversations in buckets numbered by how far back they are, the current one always among them: a period nothing
 * happened in is a dead end, so it is not offered, but it is still counted when periods are named.
 */
export function bucketed(conversations: readonly Conversation[], agoOf: (item: Conversation) => number): Map<number, Conversation[]> {
  const buckets = new Map<number, Conversation[]>([[0, []]]);
  for (const item of conversations) {
    // A conversation dated after today by a clock that moved is still the current period's, not one the page cannot reach.
    const ago = Math.max(0, agoOf(item));
    buckets.set(ago, [...(buckets.get(ago) ?? []), item]);
  }
  return new Map([...buckets].sort(([a], [b]) => a - b));
}

/**
 * Whether a conversation that read something private has nothing left to fix (F16, changed 2026-09-25): the To fix
 * list names it under no file, so every file it read was marked done after it ended - the rule the sidebar's count and
 * the To fix screen already read (O10). Only where that is known: a record of marks that could not be read hid nothing,
 * and a conversation that read no file a mark could close - only files the person asked to be told about - was never
 * fixed by anyone, so it keeps the look it has.
 */
function fixedOf(index: SessionIndex): (entry: IndexEntry, files: readonly IndexFile[]) => boolean {
  const check = index.check;
  if (check === undefined || check.marksUnreadable === true) return () => false;
  const open = new Set(check.rows.filter((row) => TO_DO_LABELS.includes(row.label)).flatMap((row) => row.sessions));
  return (entry, files) => !open.has(entry.name) && files.some((file) => file.kind === 'seen');
}

/**
 * F57a: a conversation whose AI read only files the person chose Tell me for, none holding a key - its report lists
 * them and asks for nothing, so its row does not ask either. It read them, and still says so. Only where its files are
 * known: a report that listed none is not taken to have read nothing that is to fix.
 */
function allowedOnly(files: readonly IndexFile[]): boolean {
  return files.some((file) => file.kind === 'told') && !files.some((file) => file.kind === 'seen');
}

function conversation(entry: IndexEntry, local: (epoch: number) => { readonly day: LocalDay; readonly time: string }, today: LocalDay,
  done: (entry: IndexEntry, files: readonly IndexFile[]) => boolean): Conversation {
  const { day, time } = local(entry.modifiedAt);
  const files = entry.report.kind === 'generated' ? entry.report.files ?? [] : [];
  const rung = LOOK_OF[statusOf(entry)];
  const look = rung !== 'read' ? rung : allowedOnly(files) ? 'allowed' : done(entry, files) ? 'fixed' : rung;
  const relative = day.number === today.number ? 'today' : day.number === today.number - 1 ? 'yesterday' : undefined;
  return {
    entry,
    look,
    day,
    time,
    ...(relative === undefined ? {} : { relative }),
    files: files.map((file) => file.path as string),
    read: files.filter((file) => file.kind === 'seen').length,
    ...(entry.report.kind === 'generated' && entry.report.reached !== undefined ? { reached: entry.report.reached } : {}),
    partial: look === 'unchecked',
  };
}

/** Not checked, or read with gaps: what is listed apart, and never counted as nothing to fix (F17, O4). */
export function unchecked(item: Conversation): boolean {
  return !LOOKS[item.look].known || item.partial;
}
