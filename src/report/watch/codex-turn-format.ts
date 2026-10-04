// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.ts';
import { refuseProjectAbove, refuseRulesOf } from '../../adapter/claude-code/settings/refuse-project.ts';
import { codexReaderOf } from '../../adapter/codex/hooks/reader.ts';
import { codexConversationOf } from '../../adapter/codex/hooks/codex-conversation.ts';
import { codexStopFolder, parseCodexStopInput } from '../../adapter/codex/hooks/stop-input.ts';
import type { CodexStopRefusals } from '../../adapter/codex/hooks/stop-refusals.ts';
import { sessionKey } from '../../core/session-catalogue.ts';
import { FileAccessError } from '../../ports/file-access-error.ts';
import type { FileReader } from '../../ports/file-reader.ts';
import { CODEX_REQUESTS } from './render/codex-request-words.ts';
import type { TurnFormat } from './subagent-watch.ts';

/**
 * Codex's end of a turn, for `watch` (`2026-10-02-codex-says-it-too.md` CX1-CX7): its `Stop` read by Codex's names,
 * who reads it from its rollout, the commands agentwhy stopped in the turn, Codex's requests, a Codex session's key, and
 * the project's rules - the ones Codex's `refuse` reads.
 */
export function codexTurnFormat(files: FileReader, refusals: CodexStopRefusals, threadIndexPath: string, home: string): TurnFormat {
  return {
    readStop: parseCodexStopInput,
    readerOf: (turn) => codexReaderOf(files, turn.transcriptPath),
    stoppedIn: (text) => refusals.find(text),
    requests: CODEX_REQUESTS,
    sessionKey: (id) => sessionKey({ id, provider: 'codex' }),
    settingsFor: (text) => rulesOfProject(files, codexStopFolder(text), home),
    // CX8: one conversation across the session ids the Codex apps give it (CXB5).
    conversationOf: (turn) => codexConversationOf(files, threadIndexPath, turn.sessionId),
    // CX9 with AO5: watched where a project above the turn's folder runs `refuse` - as `refuse --codex` finds it.
    watchedHere: async (text) => {
      const folder = codexStopFolder(text);
      return folder !== undefined && (await refuseProjectAbove(files, folder, home)) !== undefined;
    },
  };
}

/**
 * CX5 with AO5, AO6: the project is found as `refuse --codex` finds it - the nearest folder short of home whose Claude
 * Code settings run `refuse` - and its rules are the settings file that project's `refuse` command names. Found by
 * review: guessing the local file first read no rules where a project keeps them in the shared one, and so said a chat
 * was clean over a file `refuse` protects. Where it names none, the local file, then the shared one, as before. A
 * policy file is not a settings path, so it reads as none.
 */
async function rulesOfProject(files: FileReader, folder: string | undefined, home: string): Promise<string | undefined> {
  if (folder === undefined) return undefined;
  const found = await refuseProjectAbove(files, folder, home);
  if (found === undefined) return undefined;
  const rules = refuseRulesOf(found);
  if (rules.policyPath !== undefined) return undefined;
  if (rules.settingsPath !== undefined) return rules.settingsPath;
  for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
    const settings = join(found.project, SETTINGS_FILES.directory, name);
    if (await readable(files, settings)) return settings;
  }
  return undefined;
}

async function readable(files: FileReader, path: string): Promise<boolean> {
  try {
    await files.readText(path);
    return true;
  } catch (error) {
    if (error instanceof FileAccessError) return false;
    throw error;
  }
}
