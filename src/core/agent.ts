// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/** An agent's own identity. The main agent of a session is one too, at depth 0 with no delegation above it. */
export type AgentId = string;

export const MAIN_AGENT_TYPE = 'main';

export interface Agent {
  readonly id: AgentId;
  /**
   * What kind of agent it is, in the provider's vocabulary of agent types, or `main` for the session itself.
   * Absent when the delegation index that would have stated it is missing.
   */
  readonly type?: string;
  /** 0 for the main agent, and the delegation's own depth for anything it spawned. Read, never inferred. */
  readonly depth?: number;
  /** The delegation that started this agent; absent only for the main agent. */
  readonly startedBy?: string;
  /**
   * The models its replies were recorded as coming from, each once, in the order first recorded
   * (`.ai/specs/2026-11-15-which-model-it-ran-on.md` MR2) - read from the record, never from what the agent said of
   * itself. More than one where the model changed. Absent where the record names none, or the format records none.
   */
  readonly models?: readonly string[];
}
