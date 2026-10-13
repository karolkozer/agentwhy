// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Where the runtime keeps a session, under the home directory: one folder per session, named by its id, holding
 * `events.jsonl` and `workspace.yaml` (spec §2.8, CPB13). The desktop app and the CLI share it. Other systems are not
 * measured (CPO5).
 */
export const COPILOT_FOLDER = ['.copilot'] as const;
export const SESSIONS_ROOT = [...COPILOT_FOLDER, 'session-state'] as const;
export const EVENTS_FILE = 'events.jsonl';
export const WORKSPACE_FILE = 'workspace.yaml';

/**
 * The first line (CP1, CP1a): `session.start` with `data.producer` `copilot-agent`, `data.sessionId` - the folder's name and
 * `workspace.yaml`'s `id` in 7 of 7 (§2.8) - and `data.context.cwd`. VS Code's transcript has the same type and producer,
 * `vscodeVersion` and no `context` (8 of 8); the runtime's has `context` and no `vscodeVersion` (17 of 17).
 */
export const HEADER = {
  type: 'session.start',
  producer: 'producer',
  runtimeProducer: 'copilot-agent',
  sessionId: 'sessionId',
  version: 'copilotVersion',
  context: 'context',
  workingDirectory: 'cwd',
  /** Present on VS Code's transcript alone: a file that has it is not this contract's. */
  editorVersion: 'vscodeVersion',
} as const;

/**
 * `workspace.yaml`: top-level `key: value` lines, read for these keys alone (§2.8, §2.16). `cwd` equals the header's in 7
 * of 7; `name` is the title the apps show (CPB35), empty for a session closed before a message; `user_named` is `true`
 * for titles the app made itself, so it says nothing of who named it.
 */
export const WORKSPACE = {
  id: 'id',
  workingDirectory: 'cwd',
  title: 'name',
  client: 'client_name',
  forkCount: 'fork_count',
  summaryCount: 'summary_count',
} as const;

/** Which app wrote a session, by `client_name` (§2.8): the CLI in a terminal, the desktop app. Any other says nothing. */
export const CLIENTS = {
  terminal: 'github/cli',
  desktop: 'github/autopilot',
} as const;
