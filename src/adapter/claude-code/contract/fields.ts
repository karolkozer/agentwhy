// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
export const FIELDS = {
  lineType: 'type',
  sidechain: 'isSidechain',
  denialKind: 'toolDenialKind',
  toolUseResult: 'toolUseResult',
  resultSourceAssistant: 'sourceToolAssistantUUID',
  toolVersion: 'version',
  /** The session's working directory: the project root a report makes paths relative to. On conversation lines only. */
  workingDirectory: 'cwd',
  /** Which way into Claude Code the session was started by: the values of `entry-points.ts`. On conversation lines. */
  entryPoint: 'entrypoint',
  /**
   * When the line was written: ISO 8601 in UTC with milliseconds. For display only (the report page spec M4) - a line
   * can be earlier than the one before it, so it never orders or joins anything (architecture invariant 3).
   */
  recordedAt: 'timestamp',
  systemSubtype: 'subtype',
  message: 'message',
  messageContent: 'content',
  blockType: 'type',
  toolName: 'name',
  toolInput: 'input',
  blockContent: 'content',
  messageRole: 'role',
  agentId: 'agentId',
  /** The id of a tool_use block: what a result names to say which call it answers. */
  blockId: 'id',
  /** On a tool_result block, the id of the call it answers - the join of §4.3 rule 1. */
  resultCallId: 'tool_use_id',
  /** On a tool_result block, `true` when the tool answered with an error rather than a result. */
  resultIsError: 'is_error',
  /** On a text block, the words themselves. */
  blockText: 'text',
  /** On a reasoning block, the words themselves. The field carries the block's own name. */
  blockThinking: 'thinking',
} as const;

/**
 * How a subagent hands its report back when it does not write it as a message: a call of its own, whose input
 * carries the words (`.ai/specs/2026-09-16-when-an-agent-finishes.md` D9).
 *
 * Measured, not guessed (`.ai/skills/update-format-contract/SKILL.md` step 1), on a session
 * of 2026-09-19 (Claude Code 2.x auto mode): 2 calls, both on sidechain lines, one input key
 * - `message` - holding a string. The call names no delegation, so the join is the one the subagent's own index
 * entry already makes: the report belongs to the delegation that started the agent whose transcript it is on.
 */
export const HANDBACK_TOOL = {
  name: 'SubagentHandback',
  reportInputKey: 'message',
} as const;

export const TOOL_USE_BLOCK_TYPE = 'tool_use';

export const TOOL_RESULT_BLOCK_TYPE = 'tool_result';

/** What an agent writes, as opposed to what it calls: a block of its own on an assistant line. */
export const TEXT_BLOCK_TYPE = 'text';

/** What an agent works out before it calls, in its own words (`specs/2026-09-15-why-this-call.md` R1). */
export const THINKING_BLOCK_TYPE = 'thinking';

export const AGENT_TOOL = {
  name: 'Agent',
  inputKeys: ['description', 'prompt', 'subagent_type'],
  optionalInputKeys: ['run_in_background'],
  /** The one input key whose value is an enumeration - the agent type - rather than free text. */
  typeInputKey: 'subagent_type',
  promptInputKey: 'prompt',
  descriptionInputKey: 'description',
} as const;

export const META_FIELD = {
  agentType: 'agentType',
  description: 'description',
  toolUseId: 'toolUseId',
  spawnDepth: 'spawnDepth',
  requestShape: 'requestShape',
  requestNonInteractive: 'requestNonInteractive',
} as const;

export const META_KEYS = Object.values(META_FIELD);
