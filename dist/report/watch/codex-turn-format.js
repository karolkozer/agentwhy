// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.js';
import { keysHiddenAt } from '../../adapter/claude-code/settings/key-swap-project.js';
import { refuseProjectAbove, refuseRulesOf } from '../../adapter/claude-code/settings/refuse-project.js';
import { everywhereWatchEvents } from '../../adapter/claude-code/settings/hook-entries.js';
import { STOP } from '../../adapter/claude-code/contract/hooks.js';
import { STOP as STOP_INPUT } from '../../adapter/codex/contract/hooks.js';
import { parseJsonObject } from '../../shared/json.js';
import { textOrUndefined } from '../../ports/file-reader.js';
import { codexReaderOf } from '../../adapter/codex/hooks/reader.js';
import { codexStopFolder, parseCodexStopInput } from '../../adapter/codex/hooks/stop-input.js';
import { parseCodexUserPromptSubmitInput } from '../../adapter/codex/hooks/user-prompt-submit-input.js';
import { heldInRollout } from '../../adapter/codex/hooks/held-in-rollout.js';
import { sessionKey } from '../../core/session-catalogue.js';
import { FileAccessError } from '../../ports/file-access-error.js';
import { CODEX_REQUESTS } from './render/codex-request-words.js';
/**
 * Codex's end of a turn, for `watch` (`2026-10-02-codex-says-it-too.md` CX1-CX7): its `Stop` read by Codex's names,
 * who reads it from its rollout, the commands agentwhy stopped in the turn, Codex's requests, a Codex session's key, and
 * the project's rules - the ones Codex's `refuse` reads.
 */
export function codexTurnFormat(files, refusals, home) {
    return {
        readStop: parseCodexStopInput,
        readPrompt: parseCodexUserPromptSubmitInput,
        heldIn: (text) => heldInRollout(files, text),
        readerOf: (turn) => codexReaderOf(files, turn.transcriptPath),
        // RO3, RO4 (`2026-11-24-open-agentwhy-from-the-chat.md`): who wrote the message, and the set-up project it was written in.
        readerOfPrompt: (text) => codexReaderOf(files, transcriptIn(text)),
        projectOf: async (text) => {
            const folder = codexStopFolder(text);
            return folder === undefined ? undefined : (await refuseProjectAbove(files, folder, home))?.project;
        },
        stoppedIn: (text) => refusals.find(text),
        requests: CODEX_REQUESTS,
        sessionKey: (id) => sessionKey({ id, provider: 'codex' }),
        settingsFor: (text) => rulesOfProject(files, codexStopFolder(text), home),
        // CX9 with AO5: watched where a project above the turn's folder runs `refuse` - as `refuse --codex` finds it.
        watchedHere: async (text) => {
            const folder = codexStopFolder(text);
            if (folder !== undefined && (await refuseProjectAbove(files, folder, home)) !== undefined)
                return true;
            // `protected-everywhere` GD23: where the computer's alerts are on, every project is watched - Codex's too.
            return computerAlertsOn(files, home);
        },
        // `2026-11-09-codex-hides-keys.md` CHO4: the switch, as `hide-keys --codex` asks it.
        keysHiddenAt: (folder) => keysHiddenAt((path) => files.readText(path), folder, home),
    };
}
function transcriptIn(text) {
    const path = parseJsonObject(text)?.[STOP_INPUT.fields.transcriptPath];
    return typeof path === 'string' && path !== '' ? path : undefined;
}
/** GD23: the person's own Claude Code settings run the computer's `watch` when a conversation finishes. */
async function computerAlertsOn(files, home) {
    const settings = parseJsonObject((await textOrUndefined(files, join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared))) ?? '');
    return settings !== undefined && everywhereWatchEvents(settings).has(STOP.event);
}
/**
 * CX5 with AO5, AO6: the project is found as `refuse --codex` finds it - the nearest folder short of home whose Claude
 * Code settings run `refuse` - and its rules are the settings file that project's `refuse` command names. Found by
 * review: guessing the local file first read no rules where a project keeps them in the shared one, and so said a chat
 * was clean over a file `refuse` protects. Where it names none, the local file, then the shared one, as before. A
 * policy file is not a settings path, so it reads as none.
 */
async function rulesOfProject(files, folder, home) {
    if (folder === undefined)
        return undefined;
    const found = await refuseProjectAbove(files, folder, home);
    if (found === undefined)
        return undefined;
    const rules = refuseRulesOf(found);
    if (rules.policyPath !== undefined)
        return undefined;
    if (rules.settingsPath !== undefined)
        return rules.settingsPath;
    for (const name of [SETTINGS_FILES.local, SETTINGS_FILES.shared]) {
        const settings = join(found.project, SETTINGS_FILES.directory, name);
        if (await readable(files, settings))
            return settings;
    }
    return undefined;
}
async function readable(files, path) {
    try {
        await files.readText(path);
        return true;
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return false;
        throw error;
    }
}
