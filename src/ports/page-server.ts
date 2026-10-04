// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A page server `start` left running for a project (`2026-10-02-a-page-not-a-file.md` PF2): where its pages are - the
 * address and its token, `http://127.0.0.1:<port>/<token>/` - and which process serves them.
 */
export interface PageServerRecord {
  readonly url: string;
  readonly pid: number;
  readonly startedAt: number;
}

/** Where a project's running page server is remembered: one record a project, the person's own. */
export interface PageServers {
  read(project: string): Promise<PageServerRecord | undefined>;
  write(project: string, record: PageServerRecord): Promise<void>;
  /** Forgets the record only where it is still this process's: a later server's is left as it is. */
  remove(project: string, pid: number): Promise<void>;
}

/** Whether a page answers on this computer: never asked of an address that is not the computer's own. */
export interface PageProbe {
  answers(url: string): Promise<boolean>;
}

/** Starts agentwhy again, in the background, apart from this process: the process id, or `undefined` where it could not. */
export interface BackgroundRun {
  start(args: readonly string[]): Promise<number | undefined>;
  /** Whether a process this started is still running: one that ended will serve nothing, and is not waited for. */
  running(pid: number): boolean;
}
