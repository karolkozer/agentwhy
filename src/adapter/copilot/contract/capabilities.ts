// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** What the contract can say of a question. The contract imports nothing: the adapter maps these to the core's terms. */
export type Answer = 'supported' | 'absent' | 'unmeasured';
export type Question = 'actions' | 'access' | 'output-delivery' | 'own-words' | 'reasoning' | 'refusals' | 'permissions';

/**
 * Which questions a session answers, by the build that wrote it (`copilotVersion`). Observations stay in the
 * specification; this is what they permit. A build not measured is `unmeasured` for every question: a recognised header
 * alone grants none.
 */
export interface CapabilityProfile {
  readonly builds: readonly string[];
  readonly answers: Readonly<Record<Question, Answer>>;
}

/**
 * The CLI's `1.0.94` and `1.0.95` and the desktop app's `1.0.94-3` (spec §2.8-§2.17, 32 files of one fictional project).
 * The other builds of their line take it too (CPD13, `MEASURED_LINE`). Every call
 * has a start and, unless a person refused it, a completion (CPB16, CPB34); a call's result is what it returned (CPB15,
 * CPB42), past a large output's preview a gap (CPB26); the agent's words are its own messages; a refusal names its
 * source (CPB18, CPB34). Reasoning is encrypted with readable parts on some messages, and when it is is CPO4, so no
 * part is read as a reason (CP16); the permission settings recorded (`session.permissions_changed`) are not read.
 */
export const MEASURED_PROFILES: readonly CapabilityProfile[] = [
  {
    builds: ['1.0.94', '1.0.94-3', '1.0.95'],
    answers: {
      actions: 'supported',
      access: 'supported',
      'output-delivery': 'supported',
      'own-words': 'supported',
      reasoning: 'unmeasured',
      refusals: 'supported',
      permissions: 'unmeasured',
    },
  },
];

/**
 * CPD13 (accepted 2026-10-12): the CLI updates itself, so a build of the measured `1.0.x` line - its desktop `-n` builds
 * alike - takes the measured profile until its file holds a record type, or a key at a record's own level, the contract
 * does not know. A new minor line is measured with the probe before it takes any profile.
 */
export const MEASURED_LINE = /^1\.0\.\d+(?:-\d+)?$/;

/** Any other build: recognised and read, and nothing about it is measured. */
export const UNMEASURED_ANSWERS: Readonly<Record<Question, Answer>> = {
  actions: 'unmeasured',
  access: 'unmeasured',
  'output-delivery': 'unmeasured',
  'own-words': 'unmeasured',
  reasoning: 'unmeasured',
  refusals: 'unmeasured',
  permissions: 'unmeasured',
};
