// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { EntryPoint } from '../../../core/entry-point.ts';
import { READER } from '../contract/session.ts';

/**
 * Where a person held the conversation, from the rollout's first line alone (CXB3, 175 rollouts, 2026-10-02;
 * `.ai/specs/2026-10-08-where-it-was-held.md` WH6). `source` decides first: `exec` is a scripted run whatever app
 * wrote it - CXB3 saw it from both `codex_exec` and `codex_vscode` - and an object is a thread another agent started,
 * which is nobody's way in. Then `originator` names the app. An originator this contract does not list is nothing
 * said, never the nearest of these.
 *
 * The contract holds the format's names and the core's `EntryPoint` is this project's own word, so the mapping lives
 * here and not beside them, as Claude Code's `ENTRY_POINT_VALUES` and `lastEntryPointIn` are kept apart.
 */
export function entryPointOf(source: unknown, originator: unknown): EntryPoint | undefined {
  if (typeof source !== 'string') return undefined;
  if (source === READER.scriptSource) return 'script';
  if (source !== READER.personSource) return undefined;
  if (originator === READER.terminalOriginator) return 'terminal';
  if (originator === READER.editorOriginator) return 'editor';
  // WHD4, WH7: the Codex app and the ChatGPT app are one word on a page; the two names stay apart in the contract.
  return typeof originator === 'string' && (READER.desktopOriginators as readonly string[]).includes(originator) ? 'desktop' : undefined;
}
