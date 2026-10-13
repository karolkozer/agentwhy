// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Synthetic Copilot sessions, built by hand from the shapes the Copilot specification measured (§2.8-§2.16). They test
// the contract and the reader; they are not evidence that any variant exists. Every free text carries the canary.
import { CANARY } from './synthetic-session.ts';

export const SESSION = 'a1b2c3d4-0000-4000-8000-000000000000';
export const FORK = 'f0f0f0f0-0000-4000-8000-000000000001';
export const AGENT = '5f1c2a90-0000-4000-8000-000000000002';
export const CALL = 'call_AAAAAAAAAAAAAAAAAAAAAAAA';
export const SECOND_CALL = 'call_BBBBBBBBBBBBBBBBBBBBBBBB';
export const TASK_CALL = 'toolu_CCCCCCCCCCCCCCCCCCCCCCCC';
export const REQUEST = '9d0e4b31-0000-4000-8000-000000000003';
export const HOME = '/Users/someone';
export const PROJECT = '/Users/someone/Projects/shop';
/** A chat's folder as the desktop app names it (CPB40): the day, two words and the first 8 characters of the id. */
export const CHAT_FOLDER = `${HOME}/.copilot/chats/2026-10-09/quiet-river-${SESSION.slice(0, 8)}`;

type Data = Record<string, unknown>;
/** A record before the envelope's ids are given: what `records` turns into lines. */
export interface Draft {
  readonly type: string;
  readonly data: Data;
  readonly agentId?: string;
}

/** Where a session lives under the home directory (§2.8). */
export function sessionFolder(id: string): string {
  return `.copilot/session-state/${id}`;
}

/** `workspace.yaml`, as the runtime writes it: top-level `key: value` lines (§2.8, §2.16). */
export function workspaceYaml(fields: { id: string; cwd: string; name?: string; client?: string; forkCount?: number }): string {
  return [
    `id: ${fields.id}`,
    `cwd: ${fields.cwd}`,
    `client_name: ${fields.client ?? 'github/cli'}`,
    `name: ${fields.name ?? CANARY}`,
    'user_named: true',
    'summary_count: 0',
    `fork_count: ${fields.forkCount ?? 0}`,
    'created_at: 2026-10-09T08:00:00.000Z',
    'updated_at: 2026-10-09T08:05:00.000Z',
    '',
  ].join('\n');
}

/**
 * Lines of one file: each draft gets an id made from the file's own `prefix` and its place, a `parentId` naming the line
 * before, and a timestamp. A fork's file is its parent's lines, ids and all, then its own (§2.16): build it by joining.
 */
export function records(prefix: string, ...drafts: readonly Draft[]): string {
  return drafts.map((draft, index) => JSON.stringify({
    type: draft.type,
    id: lineId(prefix, index),
    parentId: index === 0 ? null : lineId(prefix, index - 1),
    timestamp: `2026-10-09T08:00:${String(index % 60).padStart(2, '0')}.000Z`,
    ...(draft.agentId === undefined ? {} : { agentId: draft.agentId }),
    data: draft.data,
  })).join('\n') + '\n';
}

export function lineId(prefix: string, index: number): string {
  return `${prefix.slice(0, 8)}-1111-4111-8111-${String(index).padStart(12, '0')}`;
}

/** The runtime's first line (CP1a): `context` and no `vscodeVersion`. */
export function sessionStart(id: string, extra: Data = {}): Draft {
  return { type: 'session.start', data: {
    sessionId: id, version: 1, producer: 'copilot-agent', copilotVersion: '1.0.94', startTime: '2026-10-09T08:00:00.000Z',
    context: { cwd: PROJECT }, alreadyInUse: false, remoteSteerable: false, ...extra,
  } };
}

/** VS Code's transcript's first line (§2.2): `vscodeVersion` and no `context` - not the runtime's. */
export function editorStart(id: string): Draft {
  return { type: 'session.start', data: {
    sessionId: id, version: 1, producer: 'copilot-agent', copilotVersion: '0.67.0', vscodeVersion: '1.139.0', startTime: CANARY,
  } };
}

export function sessionResume(): Draft {
  return { type: 'session.resume', data: { resumeTime: '2026-10-09T09:00:00.000Z', eventCount: 1, context: { cwd: PROJECT } } };
}

export function userMessage(text = CANARY): Draft {
  return { type: 'user.message', data: { content: text, transformedContent: `${CANARY} ${text}`, interactionId: REQUEST, turnId: '0' } };
}

export function systemMessage(): Draft {
  return { type: 'system.message', data: { role: 'system', content: CANARY } };
}

/** An agent's message; `requests` are the calls it asks for, announced with their arguments (§2.3). */
export function assistantMessage(text: string, requests: readonly { callId: string; name: string; arguments: Data }[] = []): Draft {
  return { type: 'assistant.message', data: {
    messageId: SESSION, content: text, interactionId: REQUEST, turnId: '0', reasoningText: '',
    toolRequests: requests.map((request) => ({ toolCallId: request.callId, name: request.name, arguments: request.arguments, type: 'function' })),
  } };
}

/** A call's start; a subagent's call carries its `agentId` and the `task` call that started it (§2.10). */
export function toolStart(callId: string, name: string, args: Data, by?: { agentId: string; taskCall: string }): Draft {
  return {
    type: 'tool.execution_start',
    data: { toolCallId: callId, toolName: name, arguments: args, turnId: '0', ...(by === undefined ? {} : { parentToolCallId: by.taskCall }) },
    ...(by === undefined ? {} : { agentId: by.agentId }),
  };
}

/** A call that ran: what it returned, and `bash`'s exit code (§2.9). */
export function toolResult(callId: string, content: string, extra: { detailedContent?: string; exitCode?: number; agentId?: string } = {}): Draft {
  return {
    type: 'tool.execution_complete',
    data: {
      toolCallId: callId, success: true, turnId: '0',
      result: { content, ...(extra.detailedContent === undefined ? {} : { detailedContent: extra.detailedContent }) },
      ...(extra.exitCode === undefined ? {} : { shellExecution: { exitCode: extra.exitCode } }),
    },
    ...(extra.agentId === undefined ? {} : { agentId: extra.agentId }),
  };
}

/** A call a check or a rule refused (§2.10): the runtime's own words, and no result. */
export function toolRefused(callId: string, by: 'check' | 'rule' | 'unknown'): Draft {
  const message = by === 'check'
    ? 'Denied by preToolUse hook: hook exited with code 2'
    : by === 'rule' ? `Permission to run this tool was denied due to the following rules: \`${CANARY}\`` : CANARY;
  return { type: 'tool.execution_complete', data: { toolCallId: callId, success: false, turnId: '0', error: { code: 'denied', message } } };
}

/** A result the runtime moved to a file (CPB26): its notice, then a preview. */
export function spilledResult(callId: string): Draft {
  return toolResult(callId, `Output too large to read at once (33.0 KB). Saved to: /tmp/1-copilot-tool-output-${CANARY}.txt\n${CANARY}`, { exitCode: 0 });
}

/** A hook pair (§2.11): its input copies the call and its result, never a second exposure. */
export function hookStart(hookType: string, input: Data): Draft {
  return { type: 'hook.start', data: { hookInvocationId: `${hookType}-0000-4000-8000-000000000009`, hookType, input: { sessionId: SESSION, cwd: PROJECT, ...input } } };
}

export function hookEnd(hookType: string, output?: Data): Draft {
  return { type: 'hook.end', data: { hookInvocationId: `${hookType}-0000-4000-8000-000000000009`, hookType, success: true, ...(output === undefined ? {} : { output }) } };
}

export function subagentStarted(agentId: string, taskCall: string): Draft {
  return { type: 'subagent.started', agentId, data: { toolCallId: taskCall, agentName: 'explore', agentType: 'explore', agentDescription: CANARY } };
}

export function subagentCompleted(agentId: string, taskCall: string): Draft {
  return { type: 'subagent.completed', agentId, data: { toolCallId: taskCall, agentName: 'explore', totalToolCalls: 1 } };
}

/** A person asked, in the CLI's interactive mode (§2.15). */
export function permissionRequested(requestId: string, callId: string): Draft {
  return { type: 'permission.requested', data: {
    requestId, permissionMode: 'manual', agentMode: 'interactive',
    permissionRequest: { kind: 'shell', toolCallId: callId, fullCommandText: CANARY },
  } };
}

export function permissionCompleted(requestId: string, callId: string, kind = 'cancelled'): Draft {
  return { type: 'permission.completed', data: { requestId, toolCallId: callId, result: { kind, reason: 'Session aborted' } } };
}

export function abort(): Draft {
  return { type: 'abort', data: { reason: 'user_initiated' } };
}

/** A call to another model (CP22): no action, no message of the session. */
export function modelMessage(): Draft {
  return { type: 'model.message', data: { kind: 'message', callId: REQUEST, message: { role: 'assistant', content: CANARY } } };
}

export function compactionComplete(): Draft {
  return { type: 'session.compaction_complete', data: { trigger: 'manual', success: true, summaryContent: CANARY, messagesRemoved: 2 } };
}

export function turnStart(): Draft {
  return { type: 'assistant.turn_start', data: { turnId: '0', interactionId: REQUEST } };
}

export function turnEnd(): Draft {
  return { type: 'assistant.turn_end', data: { turnId: '0' } };
}
