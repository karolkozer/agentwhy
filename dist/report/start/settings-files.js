// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.js';
import { fileRulePathOf } from '../../adapter/claude-code/policy/deny-rules.js';
import { fileRulesIn, isDenied } from '../../adapter/claude-code/settings/deny-entries.js';
import { ADDED_LATER, holdsKeySwap, missingHookEntries } from '../../adapter/claude-code/settings/hook-entries.js';
/**
 * A settings file, read the way `init` reads it. Absent is an answer - a project nobody set up has none - and a file
 * that is not a JSON object is `unreadable`, so nothing is drawn from a guess about what it holds.
 */
export async function readSettingsFile(files, path) {
    let text;
    try {
        text = await files.readText(path);
    }
    catch {
        return undefined;
    }
    try {
        const settings = JSON.parse(text);
        if (settings === null || typeof settings !== 'object' || Array.isArray(settings))
            return 'unreadable';
        return settings;
    }
    catch {
        return 'unreadable';
    }
}
/**
 * Whether a file runs a hook whole. `watch` is not installed where only one of its two events is (`hookEntries`'s own
 * comment): a file left running `watch` on `SubagentStop` alone never says anything in the conversation and never checks
 * the session's own agent, so a hook this incomplete reads as off - the `missingHookEntries` a fresh `init` uses to find
 * the gap. On Windows a `refuse` that does not run on Claude Code's `PowerShell` is half installed too (PWO1), where the
 * caller names the platform. An event the hook gained later (`ADDED_LATER`) is not asked: a project set up before it
 * stays set up.
 */
export function hookComplete(settings, hook, platform) {
    return missingHookEntries(settings, [hook], '', undefined, platform).every((entry) => ADDED_LATER.has(entry.event));
}
/**
 * Whether agentwhy runs in a project, from its settings files: one of its hooks runs there whole. What a project's status
 * - **Set up** or **Not set up yet** - says, in the list of projects, the onboarding's list and the computer's two views
 * (decided by the maintainer on 2026-10-07, of a project whose settings block files and runs no hook of agentwhy's: "ten
 * projekt nie ma agentwhy"). A file that could not be read says nothing.
 */
export function runsAgentwhy(files) {
    return files.some((settings) => settings !== undefined && settings !== 'unreadable' && (hookComplete(settings, 'watch') || hookComplete(settings, 'refuse')));
}
/**
 * Whether agentwhy is set up in a project, from its settings files (`.ai/specs/2026-09-27-which-project.md` V10, and the
 * onboarding's W23 as amended the same day): one of its hooks runs there whole, or the files hold rules that block a file
 * - a rule a person wrote by hand included. Decided by the maintainer on 2026-09-28: a project that blocks files is set
 * up, and is not offered the setup again. A file that could not be read says nothing.
 */
export function setUpBy(files) {
    return files.some((settings) => settings !== undefined && settings !== 'unreadable' &&
        (hookComplete(settings, 'watch') || hookComplete(settings, 'refuse') || fileRulesIn(settings).length > 0));
}
/**
 * What Settings' **Uninstall** would take out of a project that is not this run's own
 * (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM8): for each of the two settings files, the rules
 * agentwhy wrote there, where that file runs one of its hooks whole or holds such a rule. A file that holds neither is
 * not named, and one that could not be read is not guessed at. The answer is what `change: 'uninstall'` takes - the
 * same shape Settings builds for this project from its own view (`settings-view.ts` `uninstallFrom`), read from the
 * files of another folder.
 */
export async function uninstallableIn(files, projectPath) {
    const directory = join(projectPath, SETTINGS_FILES.directory);
    const read = { local: await readSettingsFile(files, join(directory, SETTINGS_FILES.local)), shared: await readSettingsFile(files, join(directory, SETTINGS_FILES.shared)) };
    const out = {};
    for (const file of ['local', 'shared']) {
        const settings = read[file];
        if (settings === undefined || settings === 'unreadable')
            continue;
        // A pattern counts as agentwhy's only where the file denies it for every tool `init` writes: half a pair is a rule
        // somebody wrote by hand, and `--unprotect` must not be given it.
        const rules = [...new Set(fileRulesIn(settings).map((entry) => fileRulePathOf(entry)).filter((rule) => rule !== undefined))]
            .filter((rule) => isDenied(settings, rule));
        // KR10: a file holding the switch alone has something of agentwhy's to take out, and is still no project set up - a
        // write check left alone too (WK1).
        if (rules.length > 0 || hookComplete(settings, 'watch') || hookComplete(settings, 'refuse') || holdsKeySwap(settings))
            out[file] = rules;
    }
    return out;
}
