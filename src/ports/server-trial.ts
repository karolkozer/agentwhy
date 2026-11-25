// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** A server to start once, as an app starts one: a program and its words, with no shell between. */
export interface ServerTrialRun {
  readonly run: readonly string[];
  readonly folder: string;
  readonly timeoutMs: number;
}

/** What it did: said who it is, said something else, said nothing in time, or did not start. */
export type ServerTrialOutcome =
  | { readonly kind: 'answered'; readonly name: string }
  | { readonly kind: 'other' }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'not-started'; readonly reason: string };

/** Starting a server of the Model Context Protocol once before it is written where an app starts it (`the-card-in-codex.md` CCX2). Never throws. */
export interface ServerTrial {
  run(trial: ServerTrialRun): Promise<ServerTrialOutcome>;
}
