// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** One command line to try, as a hook would be run: with this input, from this folder, for at most this long. */
export interface Trial {
  readonly commandLine: string;
  readonly input: string;
  readonly folder: string;
  readonly timeoutMs: number;
}

/** What a trial did: ran to an exit code, ran past its time, could not be started, or was not tried here. */
export type TrialOutcome =
  | { readonly kind: 'ran'; readonly exitCode: number; readonly stderr: string }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'not-started'; readonly reason: string }
  | { readonly kind: 'not-tried' };

/**
 * Running a hook's command once, the way Codex will run it (`2026-10-02-codex-approves-its-own-hook.md` AO14, AOB8),
 * before setup writes it where every Codex command on the computer runs it. Never throws: a failure is an outcome.
 */
export interface CommandTrial {
  run(trial: Trial): Promise<TrialOutcome>;
}
