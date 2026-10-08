// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../core/entry-point.ts';
import type { Redacted } from '../../core/redaction/redacted.ts';
import type { MarkResult } from '../../ports/mark-store.ts';
import type { ReportModel } from '../report-model.ts';

/**
 * A report as a page: the analysis, and the one thing about the file that the analysis cannot know - whether an
 * index of sessions was written beside it (`a-way-back` R10). Navigation is a fact about where a file landed, not
 * about the session, so it travels here rather than in `ReportModel`.
 */
export interface ReportPage {
  readonly report: ReportModel;
  /**
   * Whether to offer the way back to `index.html`. A flag, never a path: the link's target is a literal inside the
   * renderer, so nothing read from a session or a command line can become one (R9). Only `start` sets it, because
   * only `start` wrote that index beside this report (R8).
   */
  readonly withIndexLink: boolean;
  /**
   * The person's standing marks on this report's files, by path, that still hold for it: made after the session was
   * last active, so nothing in it reached the file since (R35; the report page spec M5, P44). A file here is drawn done.
   * Only `start` reads the record; a report written on its own knows no marks.
   */
  readonly marks?: ReadonlyMap<string, MarkResult>;
  /**
   * `start` will serve this page (R50), so it may send a mark or a rule to the origin it is loaded from (P43). A page
   * not served, or opened after its server stopped, hands over the command that does the same.
   */
  readonly served?: boolean;
  /** GD25: the project, by id, whose record this page's marks are written to - on the computer's page only. */
  readonly project?: string;
  /**
   * The patterns the project's own settings files deny (M3), read when the page was written. A private file one of them
   * matches is *Protected*. Absent where a settings file could not be read: then nothing is called protected or not.
   */
  readonly denied?: readonly string[];
  /**
   * `2026-10-05-protected-everywhere.md` G15: what the person's own computer-wide rules block and track, read with
   * `denied` (which holds the blocks among the project's). A file one of them holds is the computer's to change - in
   * Settings - and no project's change from its row could lift a computer-wide block or end a computer-wide Track.
   */
  readonly everywhere?: { readonly blocked: readonly string[]; readonly told: readonly string[] };
  /** The IANA time zone a record's clock time is shown in (M4): the machine's. Absent means UTC. */
  readonly timeZone?: string;
  /**
   * The title Claude Code gave the session (P4), as Conversations shows it under "What you asked". Only `start` reads
   * it, never under `--share`; it arrives past the redactor. Absent draws no "You asked".
   */
  readonly title?: Redacted;
  /**
   * Where the conversation was held (`2026-10-08-where-it-was-held.md` WH8), said under the AI's name as the row that
   * leads here says it. Only `start` knows it, never under `--share`; absent draws the AI alone (WH4).
   */
  readonly heldIn?: EntryPoint;
}
