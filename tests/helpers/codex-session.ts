// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// Synthetic Codex rollouts, built by hand from the shapes the Codex specification measured (§2, §2.8; XD8). They test
// the contract and the reader; they are not evidence that any variant exists. Every free text carries the canary.

export const ROOT = '01a0ec9c-0000-7000-8000-000000000001';
export const CHILD = '01a0ec9c-0000-7000-8000-000000000002';
export const SECOND_CHILD = '01a0ec9c-0000-7000-8000-000000000003';
export const REVIEWER = '01a0ec9c-0000-7000-8000-000000000004';
export const TURN = '01a0ec9c-0000-7000-8000-00000000000a';
export const LATER_TURN = '01a0ec9c-0000-7000-8000-00000000000b';
export const CHILD_TURN = '01a0ec9c-0000-7000-8000-00000000000c';
export const REVIEW_TURN = '01a0ec9c-0000-7000-8000-00000000000d';
export const PROJECT = '/Users/someone/Projects/shop';

type Line = Record<string, unknown>;
const passthrough = (turn: string) => ({ internal_chat_message_metadata_passthrough: { turn_id: turn } });

/** Where a rollout lives under a sessions root: its date folder and a name holding its id (§2.1). */
export function rolloutPath(id: string, day = '29'): string {
  return `2026/09/${day}/rollout-2026-09-${day}T12-00-00-${id}.jsonl`;
}

export function meta(id: string, extra: Line = {}): Line {
  return { timestamp: '2026-09-29T10:00:00.000Z', type: 'session_meta', payload: {
    id, session_id: ROOT, source: 'exec', originator: 'codex_exec', cli_version: '0.157.0', cwd: PROJECT, history_mode: 'paginated', ...extra,
  } };
}

/** A thread continued in a file of its own (§2.14, XD10): named `<thread id>_<new id>`, with `history_base` in its first line. */
export function continuationPath(id: string, newId: string, day = '29'): string {
  return `2026/09/${day}/rollout-2026-09-${day}T12-30-00-${id}_${newId}.jsonl`;
}

export function continuedMeta(id: string, endByteOffset: number, endOrdinalExclusive: number, extra: Line = {}): Line {
  return meta(id, { history_base: { thread_id: id, end_byte_offset: endByteOffset, end_ordinal_exclusive: endOrdinalExclusive }, ...extra });
}

/** A started agent's first line: `source.subagent.thread_spawn` (§2.4). */
export function spawnedMeta(id: string, parent: string, agentPath: string, extra: Line = {}): Line {
  return meta(id, { parent_thread_id: parent, source: { subagent: { thread_spawn: { parent_thread_id: parent, depth: 1, agent_path: agentPath, agent_role: null } } }, ...extra });
}

export function reviewerMeta(id: string, parent: string): Line {
  return meta(id, { parent_thread_id: parent, source: { subagent: { other: 'guardian' } }, thread_source: 'guardian_review' });
}

export function turnContext(turn: string, extra: Line = {}): Line {
  return { type: 'turn_context', payload: {
    turn_id: turn, cwd: PROJECT, approval_policy: 'never', approvals_reviewer: 'user',
    sandbox_policy: { type: 'workspace-write', network_access: false },
    file_system_sandbox_policy: { kind: 'restricted', entries: [
      { access: 'read', path: { type: 'special', value: {} } },
      { access: 'write', path: { type: 'path', path: PROJECT } },
    ] },
    ...extra,
  } };
}

export function said(id: string, phase: string, text: string, turn = TURN): Line {
  return { type: 'response_item', payload: { type: 'message', role: 'assistant', id, phase, content: [{ type: 'output_text', text }], ...passthrough(turn) } };
}

export function given(role: 'user' | 'developer', text: string, turn = TURN): Line {
  return { type: 'response_item', payload: { type: 'message', role, id: `msg_${role}`, content: [{ type: 'input_text', text }], ...passthrough(turn) } };
}

export function reasoning(id: string, summary: readonly string[], turn = TURN): Line {
  return { type: 'response_item', payload: {
    type: 'reasoning', id, encrypted_content: 'opaque', summary: summary.map((text) => ({ type: 'summary_text', text })), ...passthrough(turn),
  } };
}

export function cell(callId: string, code: string, turn = TURN): Line {
  return { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: callId, id: `ctc_${callId}`, status: 'completed', input: code, ...passthrough(turn) } };
}

/** A cell's output: Codex's header, then what the script emitted (§2.8). */
export function cellOutput(callId: string, emitted: string | undefined, turn = TURN): Line {
  const header = 'Script completed\nWall time 0.1 seconds\nOutput:\n';
  return { type: 'response_item', payload: {
    type: 'custom_tool_call_output', call_id: callId,
    output: emitted === undefined ? header : [{ type: 'input_text', text: header }, { type: 'input_text', text: emitted }], ...passthrough(turn),
  } };
}

export function functionCall(callId: string, name: string, args: Line, turn = TURN): Line {
  return { type: 'response_item', payload: { type: 'function_call', name, call_id: callId, arguments: JSON.stringify(args), ...passthrough(turn) } };
}

export function functionOutput(callId: string, output: string, turn = TURN): Line {
  return { type: 'response_item', payload: { type: 'function_call_output', call_id: callId, output, ...passthrough(turn) } };
}

export function agentMessage(author: string, recipient: string, content: string): Line {
  return { type: 'response_item', payload: { type: 'agent_message', author, recipient, content } };
}

export function item(thread: string, fields: Line, turn = TURN): Line {
  return { type: 'event_msg', payload: { type: 'item_completed', turn_id: turn, thread_id: thread, item: fields } };
}

export function command(id: string, line: string, output: string, status = 'completed', exit = 0): Line {
  return {
    type: 'CommandExecution', id, command: ['zsh', '-lc', line], cwd: PROJECT, process_id: '1', source: 'unified_exec_startup',
    status, exit_code: exit, aggregated_output: output, stdout: output, stderr: '', formatted_output: output,
    parsed_cmd: [{ type: 'read', cmd: line, name: 'ignored', path: 'parsed/by/codex/not/read.env' }],
  };
}

export function fileChange(id: string, changes: Line, status = 'completed'): Line {
  return { type: 'FileChange', id, changes, status };
}

export function activity(id: string, kind: string, thread: string, agentPath: string): Line {
  return { type: 'SubAgentActivity', id, kind, agent_thread_id: thread, agent_path: agentPath };
}

export function agentItem(id: string, phase: string, text: string): Line {
  return { type: 'AgentMessage', id, phase, content: [{ type: 'Text', text }] };
}

export function taskStarted(turn: string, root?: string): Line {
  return { type: 'event_msg', payload: { type: 'task_started', turn_id: turn, ...(root === undefined ? {} : { root_turn_id: root }) } };
}

export function taskComplete(turn: string, last: string): Line {
  return { type: 'event_msg', payload: { type: 'task_complete', turn_id: turn, last_agent_message: last } };
}
