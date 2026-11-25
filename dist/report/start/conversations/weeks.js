// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { TO_DO_LABELS } from '../../check/check-lines.js';
import { bucketed, conversationsOf, period } from './periods.js';
/**
 * The weeks the Conversations page is read through (`for-people-who-build-with-ai.md` F10, F11; O2, O3): calendar
 * weeks, Monday to Sunday, in the time zone of the machine that ran `start`. Every number and date the page shows is
 * decided here, and the page only writes it.
 */
export function conversationWeeks(index) {
    const { today, conversations } = conversationsOf(index);
    const thisMonday = today.number - today.weekday;
    const byWeek = bucketed(conversations, (item) => Math.floor((thisMonday - (item.day.number - item.day.weekday)) / 7));
    return {
        weeks: [...byWeek].map(([ago, those]) => period(ago, thisMonday - ago * 7, thisMonday - ago * 7 + 6, today.number, those)),
        total: index.entries.length,
        toFix: (index.check?.rows ?? []).filter((row) => TO_DO_LABELS.includes(row.label)).length,
    };
}
