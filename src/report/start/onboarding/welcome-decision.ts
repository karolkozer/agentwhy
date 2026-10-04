// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { OnboardingStore } from '../../../ports/onboarding-store.ts';
import { notAProject } from '../../../setup/not-a-project.ts';
import { readSettingsFile, setUpBy } from '../settings-files.ts';

/** What W23 and W24 of `.ai/specs/2026-09-24-onboarding.md` decide about one project, for the run that is to name a page. */
export interface WelcomeFacts {
  /** W23: the onboarding is the page this run names, in place of the index. */
  readonly opens: boolean;
  /** W24: the intro plays - no project of this person has finished the onboarding. */
  readonly intro: boolean;
  /** Whether the project is set up, however it was: by the onboarding, by `init`, or by hand (N6). */
  readonly setUp: boolean;
  /** which-project V7: the onboarding starts at its project step, because no project is being shown. */
  readonly atProject?: true;
}

/** What the decision reads: the person's record, the project's settings files, and where their home is. */
export interface WelcomeAsked {
  readonly store: OnboardingStore;
  /** The reader the project's `.claude/settings*.json` are read with. */
  readonly files: FileReader;
  /** Absent where the run was not told it, which leaves every directory a project (V6). */
  readonly home?: string;
  readonly realHome?: string;
  /** The moment N6's silent `done` line is written with. */
  readonly now: () => number;
}

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
export async function welcomeIn(workingDirectory: string, asked: WelcomeAsked): Promise<WelcomeFacts> {
  const { store, files, home, realHome, now } = asked;
  const reading = await store.read();
  // W24: the intro plays once per person - where no project of theirs has finished the onboarding.
  const intro = !reading.anywhere && !reading.failed;
  // which-project V7: in the home directory no project is being shown, so the onboarding opens at its project step,
  // whatever the record says - after the welcome only for a person who has never finished one. Nothing here is set up
  // and no record is kept of it: not even the silent `done` line below.
  if (home !== undefined && notAProject(workingDirectory, home, realHome) !== undefined) {
    return { opens: true, intro, setUp: false, ...(intro ? {} : { atProject: true as const }) };
  }
  if (reading.here) return { opens: false, intro, setUp: true };
  if (reading.failed) return { opens: false, intro, setUp: false };
  // A local file that cannot be read leaves what runs unknown, and the onboarding closed (as `#settingsNow` does).
  const local = await readSettingsFile(files, join(workingDirectory, SETTINGS_FILES.directory, SETTINGS_FILES.local));
  if (local === 'unreadable') return { opens: false, intro, setUp: false };
  const shared = await readSettingsFile(files, join(workingDirectory, SETTINGS_FILES.directory, SETTINGS_FILES.shared));
  // N6, widened 2026-09-28 by the maintainer (which-project V10): a project where one of agentwhy's hooks runs, or whose
  // settings block files, was set up - before this screen existed, or by hand - and is recorded so, silently.
  if (setUpBy([local, shared])) {
    await store.add(now());
    return { opens: false, intro, setUp: true };
  }
  return { opens: true, intro, setUp: false };
}
