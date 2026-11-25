// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.js';
import { notAProject } from '../../../setup/not-a-project.js';
import { readSettingsFile, setUpBy } from '../settings-files.js';
/**
 * Whether a project's run should name the onboarding instead of the index (W23), and what else the page needs to know.
 *
 * Its one side effect is N6's: a project set up before this screen existed, or by hand, has its `done` line written
 * here and silently, so that turning alerts off later never brings the onboarding back. Asking a second time for the
 * same project writes no second line: that reading finds the first.
 *
 * Shared by every run that names a page - `start` itself, and `start --detach`, whose address is the only way a person
 * reaches one (`2026-10-01-the-address-opens-the-welcome.md` AW1, extended to `--detach` on 2026-10-04).
 */
export async function welcomeIn(workingDirectory, asked) {
    const { store, files, home, realHome, now } = asked;
    const reading = await store.read();
    // W24: the intro plays once per person - where no project of theirs has finished the onboarding.
    const intro = !reading.anywhere && !reading.failed;
    // which-project V7: in the home directory no project is being shown, so the onboarding opens at its project step,
    // whatever the record says - after the welcome only for a person who has never finished one. Nothing here is set up
    // and no record is kept of it: not even the silent `done` line below.
    if (home !== undefined && notAProject(workingDirectory, home, realHome) !== undefined) {
        return { opens: true, intro, setUp: false, ...(intro ? {} : { atProject: true }) };
    }
    if (reading.here)
        return { opens: false, intro, setUp: true };
    if (reading.failed)
        return { opens: false, intro, setUp: false };
    // A local file that cannot be read leaves what runs unknown, and the onboarding closed (as `#settingsNow` does).
    const local = await readSettingsFile(files, join(workingDirectory, SETTINGS_FILES.directory, SETTINGS_FILES.local));
    if (local === 'unreadable')
        return { opens: false, intro, setUp: false };
    const shared = await readSettingsFile(files, join(workingDirectory, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
    // N6, widened 2026-09-28 by the maintainer (which-project V10): a project where one of agentwhy's hooks runs, or whose
    // settings block files, was set up - before this screen existed, or by hand - and is recorded so, silently.
    if (setUpBy([local, shared])) {
        await store.add(now());
        return { opens: false, intro, setUp: true };
    }
    return { opens: true, intro, setUp: false };
}
