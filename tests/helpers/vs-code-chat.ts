// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { CANARY, jsonl } from './synthetic-session.ts';

// Synthetic VS Code chat logs in the shape `what-vs-code-copilot-wrote` §2 measured: a snapshot, each request appended,
// its parts appended, its result set (VCB-M2). Fictional values only; every free text the canary unless a test needs words.

export const CHAT = '11111111-1111-4111-8111-111111111111';
export const PROJECT = '/Users/someone/shop';
const SUFFIX = '__vscode-1791885173915';

/** A call's id as the log keys it, from the id its part carries (VCB-M7, VCB-M12). */
export const callId = (short: string): string => `${short}${SUFFIX}`;

export interface ChatCall {
  /** The part's id, `call_…`; the call's own is it with VS Code's suffix. */
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown> | string;
  /** What it handed the model: a string, or a tree from `tree()`. Absent: no result. */
  readonly result?: unknown;
}

export interface ChatRequest {
  readonly prompt?: string;
  readonly timestamp?: number;
  readonly calls?: readonly ChatCall[];
  /** The reply's parts, in order: `markdown()`, `toolPart()` and any other. */
  readonly parts?: readonly object[];
  /** What VS Code handed the model with it (VCB-M21): `handed()` entries. */
  readonly variables?: readonly object[];
}

/** A file VS Code handed the model with a request (VCB-M21): open in the editor (a location), attached, or instructions. */
export function handed(kind: 'open' | 'attached' | 'instructions', path: string): object {
  const uri = fileUri(path);
  if (kind === 'open') return { id: CANARY, name: CANARY, kind: 'file', value: { uri, range: { startLineNumber: 1, endLineNumber: 9 } } };
  if (kind === 'attached') return { id: CANARY, name: CANARY, kind: 'file', value: uri, modelDescription: CANARY };
  return { id: CANARY, name: CANARY, kind: 'promptFile', value: uri, modelDescription: CANARY };
}

export function markdown(text: string): object {
  return { value: text, supportThemeIcons: false, supportHtml: false };
}

/** A `file` URI as VS Code serialises one (VCB-M18). */
export function fileUri(path: string): object {
  return { $mid: 1, path, scheme: 'file' };
}

export interface PartOptions {
  readonly confirmed?: number;
  readonly complete?: boolean;
  readonly helperOf?: string;
  readonly files?: readonly string[];
  readonly specific?: object;
}

export function toolPart(id: string, toolId: string, options: PartOptions = {}): object {
  const uris = Object.fromEntries((options.files ?? []).map((path, at) => [`${CANARY}${at}`, fileUri(path)]));
  return {
    kind: 'toolInvocationSerialized', toolCallId: id, toolId, isComplete: options.complete ?? true,
    invocationMessage: { value: CANARY, uris }, pastTenseMessage: { value: CANARY, uris },
    source: { type: 'internal' },
    ...(options.confirmed === undefined ? {} : { isConfirmed: { type: options.confirmed } }),
    ...(options.helperOf === undefined ? {} : { subAgentInvocationId: options.helperOf }),
    ...(options.specific === undefined ? {} : { toolSpecificData: options.specific }),
  };
}

/** A terminal's data (VCB-M15, VCB-M19): its folder and, for a command that ran, its exit code. */
export function terminal(folder: string, exitCode?: number): object {
  return {
    kind: 'terminal', commandLine: { original: CANARY }, cwd: fileUri(folder), language: 'sh',
    terminalCommandState: { timestamp: 1791885000000, ...(exitCode === undefined ? {} : { exitCode, duration: 12 }) },
  };
}

/** A result as an element tree (VCB-M17): its lines as `text` leaves, the first naming `file`. */
export function tree(lines: readonly string[], file?: string): object {
  return {
    node: {
      type: 1, ctor: 2, ctorName: CANARY,
      children: lines.map((text, at) => ({
        type: 2, priority: 1, text, ...(at === 0 ? {} : { lineBreakBefore: true }),
        ...(at === 0 && file !== undefined ? { references: [{ anchor: { fsPath: file } }] } : {}),
      })),
    },
  };
}

/** The log of one chat, its requests written as VS Code writes them. */
export function chatLog(requests: readonly ChatRequest[], options: { readonly version?: number; readonly id?: string } = {}): string {
  const lines: object[] = [{
    kind: 0,
    v: {
      version: options.version ?? 3, sessionId: options.id ?? CHAT, creationDate: 1791885000000, customTitle: CANARY,
      initialLocation: 'panel', responderUsername: CANARY, hasPendingEdits: false, pendingRequests: [], inputState: {}, requests: [],
    },
  }];
  requests.forEach((request, at) => {
    lines.push({
      kind: 2, k: ['requests'],
      v: [{
        requestId: `request_${at}`, timestamp: request.timestamp ?? 1791885000000 + at, message: { text: request.prompt ?? CANARY, parts: [] },
        modelId: 'copilot/gpt-5-mini', modeInfo: { kind: 'agent' }, response: [],
        ...(request.variables === undefined ? {} : { variableData: { variables: request.variables } }),
      }],
    });
    if ((request.parts ?? []).length > 0) lines.push({ kind: 2, k: ['requests', at, 'response'], v: request.parts });
    const calls = request.calls ?? [];
    lines.push({
      kind: 1, k: ['requests', at, 'result'],
      v: {
        metadata: {
          toolCallRounds: [{ id: CANARY, response: CANARY, timestamp: 1791885000000, toolCalls: calls.map((call) => ({
            id: callId(call.id), name: call.name, arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args),
          })) }],
          toolCallResults: Object.fromEntries(calls.filter((call) => call.result !== undefined).map((call) => [callId(call.id), { content: [{ value: call.result }] }])),
        },
      },
    });
  });
  return jsonl(...lines);
}

/** Where VS Code keeps a chat: its log in `chatSessions`, beside the workspace's `workspace.json`. */
export function workspaceFiles(log: string, folder: string = PROJECT, id: string = CHAT): Record<string, string> {
  return {
    'ws1/workspace.json': JSON.stringify({ folder: `file://${folder}` }),
    [`ws1/chatSessions/${id}.jsonl`]: log,
  };
}
