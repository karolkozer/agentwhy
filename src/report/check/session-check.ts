// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { noStoreAnywhere, type SessionCatalogue, type SessionSummary } from '../../core/session-catalogue.ts';
import { splitBySince, type Since } from '../../core/session-filter.ts';
import type { FileReader } from '../../ports/file-reader.ts';
import type { MarkStore } from '../../ports/mark-store.ts';
import type { Renderer } from '../../shared/renderer.ts';
import type { TellListPaths } from '../private-files/tell-lists.ts';
import { choosePolicy, policyRefusal, type PolicyChoice } from '../choose-policy.ts';
import type { ReportUseCase } from '../report-use-case.ts';
import { digestOf, type ActionsDigest } from './actions-digest.ts';
import { checkOf } from './check-lines.ts';
import { noteProblem, recordMark, recordUnmark } from './mark-request.ts';
import { actionsAfterMarks, marksInRange, standingMarks, type MarkResult } from './marks.ts';
import type { SessionActions } from './session-actions.ts';
import { nothingSavedHere } from '../nothing-saved-here.ts';

/** Each report is run for its actions; the text it also renders is discarded, so this only has to be a valid width. */
const DISCARDED_WIDTH = 100;

export interface CheckOptions extends PolicyChoice {
  readonly since: Since;
  readonly share: boolean;
  /** Every section with its explanation, instead of one line per file (R15a). */
  readonly full: boolean;
}

export interface MarkOptions extends PolicyChoice {
  readonly since: Since;
  readonly path: string;
  readonly result: MarkResult;
  readonly note?: string;
}

export interface UnmarkOptions {
  readonly path: string;
}

export type CheckOutcome = 'checked' | 'no-sessions' | 'policy-refused' | 'marked' | 'mark-refused' | 'mark-failed';

export interface CheckResult {
  readonly outcome: CheckOutcome;
  readonly output: string;
}

export interface CheckUseCase {
  run(options: CheckOptions): Promise<CheckResult>;
  /** Records that a person dealt with one line of the check (R31, R32). */
  mark(options: MarkOptions): Promise<CheckResult>;
  /** Undoes a standing mark by adding a line, never by removing one (R34). */
  unmark(options: UnmarkOptions): Promise<CheckResult>;
}

export interface SessionCheckDependencies {
  /** The lists of files a person asked only to be told about (F57), read with the policy wherever it is chosen. */
  readonly tell?: TellListPaths;
  readonly catalogue: SessionCatalogue;
  readonly report: ReportUseCase;
  /** Reads the policy, once, before any session is. */
  readonly files: FileReader;
  /** How the digest is written: the view is chosen per run, so one command can answer short or long. */
  readonly createRenderer: (options: CheckOptions) => Renderer<ActionsDigest>;
  /** The person's own record of what they did about a file (R33). */
  readonly marks: MarkStore;
  readonly workingDirectory: string;
  /** When the command started: the moment a mark is recorded with. */
  readonly now: number;
}

interface ReadSession {
  readonly summary: SessionSummary;
  readonly actions: SessionActions;
}

type Analysis =
  | { readonly answer: CheckResult }
  | { readonly policyKind: ActionsDigest['policyKind']; readonly sessions: readonly ReadSession[]; readonly unreadable: number };

/**
 * `agentwhy check`: every session of this project active in the range, read the way `report` reads one, and what a
 * person can do about them in the terminal (`specs/2026-09-16-worth-running-every-day.md` R11-R16). A check writes
 * nothing; a mark appends one line to the person's record, outside the project (R31-R35).
 */
export class SessionCheck implements CheckUseCase {
  readonly #dependencies: SessionCheckDependencies;

  constructor(dependencies: SessionCheckDependencies) {
    this.#dependencies = dependencies;
  }

  async run(options: CheckOptions): Promise<CheckResult> {
    const analysis = await this.#analyse(options, options.share);
    if ('answer' in analysis) return analysis.answer;

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
    return { outcome: 'checked', output: this.#dependencies.createRenderer(options).render(digest) };
  }

  async mark(options: MarkOptions): Promise<CheckResult> {
    // A note that cannot be recorded is said before a single session is read.
    const problem = noteProblem(options.note);
    if (problem !== undefined) return problem;

    // Marked against the full answer, marks or not: a file marked yesterday can be marked again today.
    const analysis = await this.#analyse(options, false);
    if ('answer' in analysis) return analysis.answer;
    const lines = checkOf(analysis.sessions.map((session) => ({ name: session.summary.id, actions: session.actions }))).rows;
    return recordMark(this.#dependencies.marks, lines, options, { asked: options.since.asked, now: this.#dependencies.now });
  }

  async unmark(options: UnmarkOptions): Promise<CheckResult> {
    return recordUnmark(this.#dependencies.marks, options.path, this.#dependencies.now);
  }

  async #analyse(options: PolicyChoice & { readonly since: Since }, share: boolean): Promise<Analysis> {
    const { catalogue, report, files, workingDirectory } = this.#dependencies;

    const chosen = await choosePolicy(options, files, this.#dependencies.tell);
    if ('errors' in chosen) return { answer: { outcome: 'policy-refused', output: policyRefusal(chosen.errors) } };

    const listing = await catalogue.list(workingDirectory);
    if (!listing.found && noStoreAnywhere(listing)) {
      const ways = 'use Claude Code here, then run agentwhy check again - or run agentwhy init now, to be protected before there is history to check.';
      return { answer: { outcome: 'no-sessions', output: nothingSavedHere('Claude Code', listing.directory, ways) } };
    }
    if (!listing.found || listing.sessions.length === 0) {
      return {
        answer: {
          outcome: 'no-sessions',
          output:
            `No sessions are stored for this directory, so there is nothing to check.\nLooked in ${listing.directory}\n` +
            `agentwhy reads sessions Claude Code already keeps, so either this directory has not been used with Claude Code yet, or it is not the one being worked in.\n` +
            `Use Claude Code here, then run agentwhy check again - or run agentwhy init now, to be protected before there is history to check.\n`,
        },
      };
    }

    const { inRange } = splitBySince(listing.sessions, options.since.since);
    const sessions: ReadSession[] = [];
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
      if (result.actions === undefined || result.outcome === 'session-unreadable') unreadable += 1;
      else sessions.push({ summary, actions: result.actions });
    }
    return { policyKind: chosen.policy.origin.kind, sessions, unreadable };
  }
}
