// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { placeInChat } from '../render/chat/chat-answer.js';
import { conversationsOf } from '../start/conversations/periods.js';
import { wanted } from '../file-counts.js';
import { accessOfCount } from './file-access.js';
import { shortNames } from './short-names.js';
/** A chat answer is read, not scrolled. */
const ROWS_SHOWN = 20;
const GROUP_SHOWN = 12;
const OFTEN_SHOWN = 8;
/** The groups a person asks for by themselves (CV1): each has its own newest rows, however far back they are. */
const LISTED = ['attention', 'tracked', 'stopped'];
/**
 * The group each look is in (CV5): a record not fully checked, and one that could not be read, are groups of their own and never
 * *nothing private in the record*. A look that is no reading yet is in none.
 */
const GROUP_OF_LOOK = {
    read: 'attention',
    guard: 'attention',
    fixed: 'fixed',
    allowed: 'tracked',
    opened: 'seen',
    name: 'seen',
    stopped: 'stopped',
    none: 'none',
    unchecked: 'partly',
    failed: 'failed',
    outside: undefined,
    checking: undefined,
};
/**
 * What is answered about a project or this computer (CV1, CV15-CV17), from the list the pages draw and by its own looks: a title, a
 * day, a look and counts of each conversation - no file's name and no task (CV7) - and the files the AIs wanted, over them all.
 * `asking` is the call it is asked in, which has no result yet and is no gap of its conversation (CVB22).
 */
export function listAnswer(index, scope, asking) {
    const asked = asking === undefined ? index : { ...index, entries: index.entries.map((entry) => withoutAsking(entry, asking)) };
    const inRange = conversationsOf(asked).conversations.filter((item) => item.look !== 'outside');
    const groups = { attention: 0, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 0, partly: 0, failed: 0 };
    const rows = [];
    // Whether a read is fixed is read from the check of every conversation: until the last is read it is not known, and a page
    // that said so early was wrong (2026-11-24).
    const reading = inRange.some((item) => item.look === 'checking');
    for (const seen of inRange) {
        const item = reading && seen.look === 'fixed' ? { ...seen, look: 'read' } : seen;
        const group = GROUP_OF_LOOK[item.look];
        if (group === undefined)
            continue;
        groups[group] += 1;
        rows.push(rowOf(item, group));
    }
    const unread = inRange.findIndex((item) => GROUP_OF_LOOK[item.look] === undefined);
    const often = oftenOf(inRange);
    const sought = often.filter((row) => row.wanted > 0);
    return {
        about: 'list',
        scope,
        ...(scope === 'computer' && index.computerView !== undefined ? { list: index.computerView.shown } : {}),
        asked: index.asked,
        checked: { read: rows.length, of: inRange.length },
        ...(index.reading === undefined ? {} : { reading: true }),
        groups,
        ...(unread < 0 ? {} : { newestRead: unread }),
        rows: named(shownOf(rows), shortNames(rows.map((row) => row.key))),
        recent: Math.min(rows.length, ROWS_SHOWN),
        rowsMore: Math.max(0, rows.length - ROWS_SHOWN),
        often: sought.slice(0, OFTEN_SHOWN),
        oftenMore: Math.max(0, sought.length - OFTEN_SHOWN),
        namedOnly: often.length - sought.length,
    };
}
/**
 * This computer (CV15): the list the page shows and its other one, each with its own counts - what asks to act first, then the one
 * that holds anything - and no conversation in both. An empty list never stands for the computer.
 */
export function computerAnswer(shown, other, asking) {
    const one = listAnswer(shown, 'computer', asking);
    if (other === undefined)
        return one;
    const two = listAnswer(other, 'computer', asking);
    const weight = (list) => (list.groups.attention > 0 ? 2 : list.checked.of > 0 ? 1 : 0);
    const names = shortNames([...one.rows, ...two.rows].map((row) => row.key));
    const [first, second] = [one, two].sort((a, b) => weight(b) - weight(a)).map((list) => ({ ...list, rows: named(list.rows, names) }));
    return { ...first, beside: second };
}
/** The conversation the call is in, with that one call's missing result left out: whole where nothing else is missing. */
function withoutAsking(entry, asking) {
    const { report } = entry;
    if (report.kind !== 'generated' || report.gaps?.noResult === undefined || report.openCalls?.includes(asking) !== true)
        return entry;
    const { noResult, ...rest } = report.gaps;
    const left = noResult > 1 ? { ...rest, noResult: noResult - 1 } : rest;
    const { gaps: _, ...without } = report;
    return { ...entry, report: Object.keys(left).length === 0 ? { ...without, incomplete: false } : { ...report, gaps: left } };
}
function filesOf(counts) {
    const files = { read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 };
    for (const count of counts)
        files[accessOfCount(count)] += 1;
    return files;
}
const named = (rows, names) => rows.map((row) => ({ ...row, ref: names.get(row.key) ?? row.key }));
function shownOf(rows) {
    const shown = new Set(rows.slice(0, ROWS_SHOWN));
    for (const group of LISTED)
        for (const row of rows.filter((one) => one.group === group).slice(0, GROUP_SHOWN))
            shown.add(row);
    return rows.filter((row) => shown.has(row));
}
function rowOf(item, group) {
    const { entry, day } = item;
    return {
        key: entry.name,
        ref: entry.name,
        report: entry.report.kind === 'generated',
        ...(entry.title === undefined ? {} : { title: entry.title }),
        provider: entry.provider,
        day: { year: day.year, month: day.month, day: day.day },
        ...(item.relative === undefined ? {} : { relative: item.relative }),
        time: item.time,
        ...(entry.entryPoint === undefined || entry.entryPoint === 'unknown' ? {} : { held: entry.entryPoint }),
        look: item.look,
        group,
        read: item.read,
        files: filesOf(entry.report.kind === 'generated' ? entry.report.counts ?? [] : []),
        ...(item.reached === undefined ? {} : { all: item.reached }),
        helpers: entry.delegations,
        ...(entry.project === undefined ? {} : { project: entry.project.name }),
    };
}
/** One row a file - and, on this computer, a project: the same path in two projects is two files (GD18). */
function oftenOf(conversations) {
    const rows = new Map();
    for (const { entry } of conversations) {
        if (entry.report.kind !== 'generated')
            continue;
        for (const count of entry.report.counts ?? []) {
            const key = JSON.stringify([entry.project?.id ?? '', count.path]);
            const known = rows.get(key);
            const place = placeInChat(count.path, 'known');
            rows.set(key, {
                path: place.shown,
                ...(place.place === undefined ? {} : { place: place.place }),
                wanted: (known?.wanted ?? 0) + wanted(count),
                read: (known?.read ?? 0) + count.read,
                changed: (known?.changed ?? 0) + count.changed,
                opened: (known?.opened ?? 0) + count.opened,
                stopped: (known?.stopped ?? 0) + count.stopped,
                named: (known?.named ?? 0) + count.named,
                unknown: (known?.unknown ?? 0) + count.unknown,
                tracked: (known?.tracked ?? true) && count.tracked,
                conversations: (known?.conversations ?? 0) + 1,
                ...(entry.project === undefined ? {} : { project: entry.project.name }),
            });
        }
    }
    return [...rows.values()].sort((one, other) => other.wanted - one.wanted || other.named - one.named || (one.path < other.path ? -1 : 1));
}
