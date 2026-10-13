// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The record envelope: one JSON object a line, `{type, id, parentId, timestamp, data}` (spec §2.2, §2.8). `parentId` names
 * an earlier line of the file on nearly every line measured; `model.*` records start chains of their own, and one line
 * in 98 named a line its file did not hold (§2.8). No join is made through it: calls join by `toolCallId`.
 */
export const ENVELOPE = {
  type: 'type',
  /** A UUID; a fork copies its parent's lines with their ids (§2.16, CP26). */
  id: 'id',
  parentId: 'parentId',
  /** When the line was written: display only, never an order or a join (architecture invariant 3). */
  recordedAt: 'timestamp',
  data: 'data',
  /** Top-level on every record a subagent wrote (§2.10, CPB56). */
  agentId: 'agentId',
} as const;

/** A record's own keys, every one measured (CPB57, 1,383 of 1,383): another at that level is a shape not measured (CPD13). */
export const RECORD_KEYS: readonly string[] = Object.values(ENVELOPE);

/** Record types as `type` spells them, by what a reader does with them (§2.2, §2.8-§2.16). */
export const RECORD_TYPES = {
  sessionStart: 'session.start',
  sessionResume: 'session.resume',
  userMessage: 'user.message',
  systemMessage: 'system.message',
  assistantMessage: 'assistant.message',
  turnStart: 'assistant.turn_start',
  turnEnd: 'assistant.turn_end',
  toolStart: 'tool.execution_start',
  toolComplete: 'tool.execution_complete',
  hookStart: 'hook.start',
  hookEnd: 'hook.end',
  subagentStarted: 'subagent.started',
  subagentCompleted: 'subagent.completed',
  permissionRequested: 'permission.requested',
  permissionCompleted: 'permission.completed',
  abort: 'abort',
  compactionComplete: 'session.compaction_complete',
  /** The runtime's words to the agent, such as a background agent's end (CPB55): context, never an action. */
  systemNotification: 'system.notification',
} as const;

/**
 * Record types that carry nothing a report reads as an action, a message or a refusal: read as known, never as unknown.
 * `model.*` are calls to other models (CP22); the `session.*` here are settings, usage and lifecycle; a subagent's
 * `selected` and `configured` say which tools and model it was given.
 */
export const PASSIVE_RECORD_TYPES = [
  'session.model_change',
  'session.permissions_changed',
  'session.usage_checkpoint',
  'session.usage_record',
  'session.info',
  'session.error',
  'session.shutdown',
  'session.compaction_start',
  'subagent.selected',
  'subagent.configured',
  'model.turn_started',
  'model.turn_ended',
  'model.model_call_started',
  'model.model_call_success',
  'model.captured_assignment_context',
  'model.message',
  'model.response',
  'model.messages_snapshot',
] as const;
