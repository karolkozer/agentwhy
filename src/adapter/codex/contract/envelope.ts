// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The line envelope: `{timestamp, type, payload}`, with `ordinal` on most lines (spec §2.1, 66 files; §2.7, 70; §2.8, 7).
 * Only top-level lines are records (X13): a `compacted` line's nested copies are none.
 */
export const ENVELOPE = {
  type: 'type',
  payload: 'payload',
  /** When the line was written: display only, never an order or a join (X12, architecture invariant 3). */
  recordedAt: 'timestamp',
  ordinal: 'ordinal',
  /** The discriminator inside a `payload`. */
  payloadType: 'type',
} as const;

/** Line types, as `type` spells them (§2.2). */
export const LINE_TYPES = {
  sessionMeta: 'session_meta',
  turnContext: 'turn_context',
  responseItem: 'response_item',
  event: 'event_msg',
  /** Copies of earlier lines (X13): never records. */
  compacted: 'compacted',
  /** Instructions and environment given to the model; no action and no words of the agent. */
  worldState: 'world_state',
  /** Usage; its `root_turn_id` names a reviewed turn (§2.2). */
  tokenUsage: 'token_usage_record',
  interAgentMetadata: 'inter_agent_communication_metadata',
} as const;

/** Line types that carry nothing the report reads: read as known, never as unknown. */
export const PASSIVE_LINE_TYPES = [LINE_TYPES.compacted, LINE_TYPES.worldState, LINE_TYPES.interAgentMetadata] as const;

/** `event_msg` payload types that carry nothing the report reads (§2.2). */
export const PASSIVE_EVENTS = ['token_count', 'thread_settings_applied', 'error'] as const;

/** `event_msg` payload types only `legacy` files wrote (§2.2: 6 and 9): known labels whose mapping is not measured. */
export const LEGACY_EVENTS = ['patch_apply_end', 'web_search_end'] as const;
