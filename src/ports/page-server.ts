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
  /**
   * PF7: the version of the agentwhy serving these pages, as its `package.json` names it. Absent where that agentwhy did
   * not know it, and in a record an agentwhy older than PF7 wrote - which `--detach` does not reuse (PFD5).
   */
  readonly version?: string;
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
  /**
   * Whether a page answers 200. With `redirect`, a 302 counts too: `2026-10-15-agentwhy-as-a-plugin.md` AP19's door
   * answers with where to go, and a server an older agentwhy started answers it 404.
   */
  answers(url: string, redirect?: 'counts'): Promise<boolean>;
}

/** Starts agentwhy again, in the background, apart from this process: the process id, or `undefined` where it could not. */
export interface BackgroundRun {
  start(args: readonly string[]): Promise<number | undefined>;
  /** Whether a process this started is still running: one that ended will serve nothing, and is not waited for. */
  running(pid: number): boolean;
}
