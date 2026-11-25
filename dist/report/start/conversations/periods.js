// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { TO_DO_LABELS } from '../../check/check-lines.js';
import { LOOK_OF_STATUS, statusOf } from '../render/session-status.js';
import { LOOKS } from '../../render/ui/status-look.js';
import { dayOf, localClock } from '../../render/ui/local-date.js';
/**
 * Every conversation on the page, newest first, read in the time zone of the machine that ran `start`
 * (`for-people-who-build-with-ai.md` O2), and the day that is today there.
 */
export function conversationsOf(index) {
    const local = localClock(index.timeZone ?? 'UTC');
    const today = local(index.now).day;
    const done = fixedOf(index);
    const conversations = index.entries
        .map((entry) => conversation(entry, local, today, done))
        .sort((a, b) => b.entry.lastActive - a.entry.lastActive);
    return { today, conversations };
}
/** The days `first` to `last`, each counted, and the conversations among them that need a person first. */
export function period(ago, first, last, today, conversations) {
    const days = Array.from({ length: last - first + 1 }, (_unused, offset) => {
        const number = first + offset;
        const those = conversations.filter((item) => item.day.number === number);
        const looks = {};
        for (const item of those)
            looks[item.look] = (looks[item.look] ?? 0) + 1;
        return {
            day: dayOf(number),
            conversations: those.length,
            // A read of files the person let the AI read is to check too: it is put before them, as a read is (F57a).
            toCheck: those.filter((item) => LOOKS[item.look].attention).length,
            fixed: those.filter((item) => item.look === 'fixed').length,
            unchecked: those.filter(unchecked).length,
            checking: those.filter(checking).length,
            looks,
            partial: those.filter((item) => item.partial).length,
            future: number > today,
            today: number === today,
        };
    });
    // The AI-changed-its-own-guard plan step 4: protection taken away is to see to as a read is, and the card leads to it too.
    const start = conversations.find((item) => item.look === 'read' || item.look === 'guard');
    return {
        ago,
        first: dayOf(first),
        last: dayOf(last),
        days,
        conversations,
        ...(start === undefined ? {} : { start }),
        toFix: conversations.filter((item) => item.look === 'read' || item.look === 'guard').length,
    };
}
/**
 * Conversations in buckets numbered by how far back they are, the current one always among them: a period nothing
 * happened in is a dead end, so it is not offered, but it is still counted when periods are named.
 */
export function bucketed(conversations, agoOf) {
    const buckets = new Map([[0, []]]);
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
 * the To fix screen already read (O10). Only where that is known: the check has to have counted the conversation - one it
 * did not is in no row because nobody looked (found 2026-11-24: a row said fixed while the rest were being read, over a
 * file nobody had marked). A record of marks that could not be read hid nothing, and a conversation that read no file a
 * mark could close - only files the person asked to be told about - was never fixed by anyone, so it keeps its look.
 */
function fixedOf(index) {
    const check = index.check;
    if (check === undefined || check.marksUnreadable === true)
        return () => false;
    const counted = new Set(check.counted ?? []);
    const open = new Set(check.rows.filter((row) => TO_DO_LABELS.includes(row.label)).flatMap((row) => row.sessions));
    return (entry, files) => counted.has(entry.name) && !open.has(entry.name) && files.some((file) => file.kind === 'seen');
}
/**
 * F57a: a conversation whose AI read only files the person chose Tell me for, none holding a key - its report lists
 * them and asks for nothing, so its row does not ask either. It read them, and still says so. Only where its files are
 * known: a report that listed none is not taken to have read nothing that is to fix.
 */
export function allowedOnly(files) {
    // A blocked file read beside a tracked one keeps the row's ask: it said "Read — tracked" over it (found 2026-10-10).
    return files.some((file) => file.kind === 'told') && !files.some((file) => file.kind === 'seen' || file.kind === 'read');
}
function conversation(entry, local, today, done) {
    const { day, time } = local(entry.lastActive);
    const files = entry.report.kind === 'generated' ? entry.report.files ?? [] : [];
    const rung = LOOK_OF_STATUS[statusOf(entry)];
    const look = rung !== 'read' ? rung : allowedOnly(files) ? 'allowed' : done(entry, files) ? 'fixed' : rung;
    const relative = day.number === today.number ? 'today' : day.number === today.number - 1 ? 'yesterday' : undefined;
    return {
        entry,
        look,
        day,
        time,
        ...(relative === undefined ? {} : { relative }),
        files: files.map((file) => file.path),
        read: files.filter((file) => file.kind === 'seen' || file.kind === 'read').length,
        ...(entry.report.kind === 'generated' && entry.report.reached !== undefined ? { reached: entry.report.reached } : {}),
        partial: look === 'unchecked',
    };
}
/** Not checked, or read with gaps: what is listed apart, and never counted as nothing to fix (F17, O4). */
export function unchecked(item) {
    return !checking(item) && (!LOOKS[item.look].known || item.partial);
}
/**
 * `the-page-first` PR3: in range and not read yet - listed apart from both, since it is about to be one or the other, and
 * never counted as nothing to fix (PR4).
 */
export function checking(item) {
    return item.look === 'checking';
}
