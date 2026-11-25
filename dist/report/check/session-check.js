// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { noStoreAnywhere } from '../../core/session-catalogue.js';
import { splitBySince } from '../../core/session-filter.js';
import { choosePolicy, policyRefusal } from '../choose-policy.js';
import { asksOf, digestOf } from './actions-digest.js';
import { checkOf } from './check-lines.js';
import { noteProblem, recordMark, recordUnmark } from './mark-request.js';
import { actionsAfterMarks, marksInRange, standingMarks } from './marks.js';
import { nothingSavedHere } from '../nothing-saved-here.js';
/** Each report is run for its actions; the text it also renders is discarded, so this only has to be a valid width. */
const DISCARDED_WIDTH = 100;
/**
 * `agentwhy check`: every session of this project active in the range, read the way `report` reads one, and what a
 * person can do about them in the terminal (`specs/2026-09-16-worth-running-every-day.md` R11-R16). A check writes
 * nothing; a mark appends one line to the person's record, outside the project (R31-R35).
 */
export class SessionCheck {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async run(options) {
        const analysis = await this.#analyse(options, options.share);
        if ('answer' in analysis)
            return analysis.answer;
        const reading = await this.#dependencies.marks.read();
        const standing = standingMarks(reading.records);
        const before = analysis.sessions.map((session) => session.actions);
        const after = analysis.sessions.map((session) => actionsAfterMarks(session.actions, session.summary.modifiedAt, standing));
        const { done, reopened } = marksInRange(before, after, standing);
        const digest = digestOf(after, {
            asked: options.since.asked,
            sessionsUnreadable: analysis.unreadable,
            policyKind: analysis.policyKind,
            ...(standing.size === 0 && !reading.failed
                ? {}
                : { marks: { done, reopened: reopened.map(({ path, result, at }) => ({ path, result, at })), unreadable: reading.failed } }),
        });
        return { outcome: 'checked', output: this.#dependencies.createRenderer(options).render(digest), asks: asksOf(digest) };
    }
    async mark(options) {
        // A note that cannot be recorded is said before a single session is read.
        const problem = noteProblem(options.note);
        if (problem !== undefined)
            return problem;
        // Marked against the full answer, marks or not: a file marked yesterday can be marked again today.
        const analysis = await this.#analyse(options, false);
        if ('answer' in analysis)
            return analysis.answer;
        const lines = checkOf(analysis.sessions.map((session) => ({ name: session.summary.id, actions: session.actions }))).rows;
        return recordMark(this.#dependencies.marks, lines, options, { asked: options.since.asked, now: this.#dependencies.now });
    }
    async unmark(options) {
        return recordUnmark(this.#dependencies.marks, options.path, this.#dependencies.now);
    }
    async #analyse(options, share) {
        const { catalogue, report, files, workingDirectory } = this.#dependencies;
        const chosen = await choosePolicy(options, files, this.#dependencies.tell, this.#dependencies.home, workingDirectory);
        if ('errors' in chosen)
            return { answer: { outcome: 'policy-refused', output: policyRefusal(chosen.errors) } };
        const listing = await catalogue.list(workingDirectory);
        if (!listing.found && noStoreAnywhere(listing)) {
            const ways = 'use Claude Code here, then run agentwhy check again - or run agentwhy init now, to be protected before there is history to check.';
            return { answer: { outcome: 'no-sessions', output: nothingSavedHere('Claude Code', listing.directory, ways) } };
        }
        if (!listing.found || listing.sessions.length === 0) {
            return {
                answer: {
                    outcome: 'no-sessions',
                    output: `No sessions are stored for this directory, so there is nothing to check.\nLooked in ${listing.directory}\n` +
                        `agentwhy reads sessions Claude Code already keeps, so either this directory has not been used with Claude Code yet, or it is not the one being worked in.\n` +
                        `Use Claude Code here, then run agentwhy check again - or run agentwhy init now, to be protected before there is history to check.\n`,
                },
            };
        }
        const { inRange } = splitBySince(listing.sessions, options.since.since);
        const sessions = [];
        let unreadable = 0;
        for (const summary of inRange) {
            const result = await report.run({
                input: summary.path,
                policy: chosen.policy,
                open: false,
                ascii: false,
                full: false,
                colour: false,
                share,
                width: DISCARDED_WIDTH,
            });
            // Asked of the result, never of its text, as `start` asks it.
            if (result.actions === undefined || result.outcome === 'session-unreadable')
                unreadable += 1;
            else
                sessions.push({ summary, actions: result.actions });
        }
        return { policyKind: chosen.policy.origin.kind, sessions, unreadable };
    }
}
