// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** What the contract can say of a question. The contract imports nothing: the adapter maps these to the core's terms. */
export type Answer = 'supported' | 'absent' | 'unmeasured';
export type Question = 'actions' | 'access' | 'refusals' | 'own-words' | 'output-delivery';

/**
 * Which questions a Codex file answers, by the build that wrote it and its history mode (X23; spec §3, §7's XB state).
 * Observations stay in the specification; this is what they permit. A build or mode not measured is `unmeasured` for
 * every question a measurement gates: a recognised header alone grants none of them.
 */
export interface CapabilityProfile {
  readonly builds: readonly string[];
  readonly historyModes: readonly string[];
  readonly answers: Readonly<Partial<Record<Question, Answer>>>;
}

/**
 * `codex exec` 0.157.0, `paginated` (§2.8): XB5 and XB10 answered; XB7 found actions and refused attempts that leave no
 * item, so the action stream is never all of it; XB1 found no typed refusal.
 */
export const MEASURED_PROFILES: readonly CapabilityProfile[] = [
  {
    builds: ['0.157.0'],
    historyModes: ['paginated'],
    answers: { actions: 'absent', refusals: 'absent', 'own-words': 'supported', 'output-delivery': 'supported' },
  },
];

/**
 * Every other build of a known mode. `paginated`: items exist, but what escapes them and which message source is
 * canonical are not measured for it. `legacy`: its cells are recorded and nothing they ran is (§2.3, XD4). No build has a
 * typed refusal (§2.5, §2.8).
 */
export const UNMEASURED_PROFILES: Readonly<Record<'paginated' | 'legacy', CapabilityProfile['answers']>> = {
  paginated: { actions: 'absent', refusals: 'absent', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured' },
  legacy: { actions: 'absent', access: 'absent', refusals: 'absent', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured' },
};

/** A history mode the contract does not list: nothing about it is known (X23, X24). */
export const UNKNOWN_MODE_ANSWERS: CapabilityProfile['answers'] = {
  actions: 'unmeasured', access: 'unmeasured', refusals: 'unmeasured', 'own-words': 'unmeasured', 'output-delivery': 'unmeasured',
};
