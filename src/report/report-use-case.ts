// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { ReportPage } from './render/report-page.ts';
import type { Policy } from '../core/policy/policy.ts';
import type { SessionActions } from './check/session-actions.ts';
import type { SessionStories } from './render/report-page/file-story.ts';
import type { Tally } from './report-model.ts';

export interface ReportOptions {
  /** A session directory or its `.jsonl`. Absent means the newest session of the current project. */
  readonly input?: string;
  /** An explicit policy file. Nothing is discovered by magic: a security policy is chosen, not found. */
  readonly policyPath?: string;
  /** A settings file whose deny rules stand in for a policy when no policy file was given. */
  readonly settingsPath?: string;
  /**
   * A policy already chosen, which wins over both paths. A run over many sessions chooses once, before it writes
   * anything, so a refused file stops it before any output exists and a file that changes mid-run cannot split one
   * run between two sets of rules (`specs/2026-09-16-worth-running-every-day.md`, plan step 2).
   */
  readonly policy?: Policy;
  /**
   * Where to write the HTML report. The stdout summary is printed either way (§7.5): `--html` must not rob a
   * command running in CI of its output.
   */
  readonly htmlPath?: string;
  /**
   * The shared view: nothing above the project root reaches the output, in any position. It reduces exposure
   * and does **not** anonymise - what the repository itself names is still named.
   */
  /** Show the HTML report once it is written. Without `htmlPath` it is written somewhere temporary first. */
  readonly open: boolean;
  /**
   * Say where the report is and nothing else (`the-agent-tells-you.md` R19). The summary names protected paths and
   * what became of each; where this command is run by an agent on a person's say-so, that summary would land in the
   * model's context, which is the one place this tool works to keep findings out of. Absent means the summary, as
   * every run has printed it (§7.5).
   */
  readonly quiet?: boolean;
  /** Draw the tree with `+ - |` instead of box-drawing characters, for a terminal whose LANG lacks UTF-8. */
  readonly ascii: boolean;
  /**
   * Every section in the terminal, in detail. Without it the terminal gets a summary whose last line says how to
   * see the rest (`specs/2026-09-15-findings-worth-reading.md` R5, R13). The HTML report is the same either way.
   */
  readonly full: boolean;
  /**
   * Whether the flags allow colour: false under `--no-color`. A terminal and an unset `NO_COLOR` are needed as well,
   * and only the shell can know those (R15).
   */
  readonly colour: boolean;
  readonly share: boolean;
  readonly width: number;
  /**
   * Offer the way back to `index.html` on the page (`specs/2026-09-15-a-way-back.md` R8). Set by `start`, which
   * writes that index beside the report; never by a flag, and never by a run that writes a report on its own -
   * those land in the temporary directory, where the name may belong to a file nobody here wrote.
   */
  readonly withIndexLink?: boolean;
  /** The standing marks that hold for this session, and whether the page will be served: set by `start` (M5). */
  readonly marks?: ReportPage['marks'];
  readonly served?: boolean;
  /** The session's title, read by `start` beside its row (P4). Never set under `--share`, and dropped there if it is. */
  readonly title?: ReportPage['title'];
}

/**
 * `complete` when every source was read, `partial` when the report says what was missing, and `policy-refused`
 * when a policy file could not be read - which stops the run rather than falling back to rules nobody chose.
 */
export type ReportOutcome = 'complete' | 'incomplete' | 'policy-refused' | 'session-unreadable' | 'no-session';

export interface ReportResult {
  readonly outcome: ReportOutcome;
  readonly output: string;
  /**
   * What the report counted, when a report was built. `start` lists many sessions on one page and needs to say
   * which of them reached something without reading each transcript a second time.
   */
  readonly tally?: Tally;
  /** What a person can do about the session, when a report was built (`specs/2026-09-16-worth-running-every-day.md` R12). */
  readonly actions?: SessionActions;
  /** What happened to each of those files, told as the report page tells it, for To fix to show the same (T11a). */
  readonly stories?: SessionStories;
  /**
   * How many files the report's Files tab lists, counted as its sidebar counts them: what "All {n} files" on the
   * Conversations page says (`for-people-who-build-with-ai.md` F14).
   */
  readonly reached?: number;
  /**
   * Whether the HTML file asked for is on disk; absent when none was asked for. A caller acts on this and never on
   * the sentence about it: the sentence exists either way, and a report's text quotes task descriptions, which can
   * say anything at all.
   */
  readonly htmlWritten?: boolean;
}

export interface ReportUseCase {
  run(options: ReportOptions): Promise<ReportResult>;
}
