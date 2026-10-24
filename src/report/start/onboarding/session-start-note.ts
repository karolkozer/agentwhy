// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SESSION_START } from '../../../adapter/claude-code/contract/hooks.ts';
import { projectDirectoryName } from '../../../adapter/claude-code/contract/projects.ts';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.ts';
import { parseSessionStartInput } from '../../../adapter/claude-code/hooks/session-start-input.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { OnboardingStore } from '../../../ports/onboarding-store.ts';
import type { StartNoteStore } from '../../../ports/start-note-store.ts';
import type { TextInput } from '../../../ports/text-input.ts';
import { notAProject } from '../../../setup/not-a-project.ts';
import { inAppChatFolder } from '../projects/app-chat-folders.ts';
import { inTemporarySpace } from '../projects/temporary-space.ts';
import { readComputerPolicy } from '../../computer-policy.ts';
import { readSettingsFile, runsAgentwhy } from '../settings-files.ts';

/** A `SessionStart` input is a few fields; anything larger is not one. */
const MAX_INPUT_BYTES = 1024 * 1024;

/** APD8: a project is told at most once in this long. */
const TOLD_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * AP6 as amended 2026-10-16: facts, and nothing asked of the agent. A paragraph that told the agent what to say was taken
 * once for a prompt injection, and the agent refused the person's own request with it (§8.1); this one, measured, was
 * not, and the agent used it unasked (§8.2). English, for the agent, which speaks the person's language.
 */
export const SESSION_START_NOTE =
  'agentwhy, a tool the person installed as a Claude Code plugin, is active in this session. Its setup is not finished ' +
  'for this project, so it blocks no file here yet; it tells the person when their AI reads a private file. The person ' +
  'opens its setup by typing /agentwhy:report.\n';

export interface SessionStartNoteDependencies {
  readonly input: TextInput;
  readonly files: FileReader;
  readonly home: string;
  readonly realHome?: string;
  readonly temporaryDirectory: string;
  /** The onboarding record of one project, by the name the record keeps it under. */
  readonly onboardingOf: (project: string) => OnboardingStore;
  /** The computer's own record (`protected-everywhere` GD26, `this-computer`). */
  readonly computerOnboarding: OnboardingStore;
  readonly told: StartNoteStore;
  readonly now: () => number;
}

export interface SessionStartNoteUseCase {
  /** What the hook prints: the paragraph, or nothing. Never throws. */
  run(): Promise<string>;
}

/**
 * `agentwhy session-start`, the plugin's `SessionStart` hook (`2026-10-15-agentwhy-as-a-plugin.md` AP6, APD8): one
 * paragraph of facts to the agent, where the plugin is on and this project has no setup - the moment AP4 leaves
 * alerts on and nothing blocked. It says nothing in a session resumed, cleared, compacted or forked; in a folder that
 * is no project; where this project's or the computer's setup was finished, the computer's own settings deny a file, or
 * this project's settings run agentwhy already; where
 * it told this project in the last week; and wherever anything it reads could not be read, since a `SessionStart` that
 * fails must not break a session and one that guesses would tell a set-up project it is not.
 */
export class SessionStartNote implements SessionStartNoteUseCase {
  readonly #dependencies: SessionStartNoteDependencies;

  constructor(dependencies: SessionStartNoteDependencies) {
    this.#dependencies = dependencies;
  }

  async run(): Promise<string> {
    try {
      return (await this.#shouldTell()) ? SESSION_START_NOTE : '';
    } catch {
      return '';
    }
  }

  async #shouldTell(): Promise<boolean> {
    const { input, files, home, realHome, temporaryDirectory, onboardingOf, computerOnboarding, told, now } = this.#dependencies;
    const text = await input.readAll(MAX_INPUT_BYTES);
    const started = text === undefined ? undefined : parseSessionStartInput(text);
    if (started === undefined || 'unusable' in started || started.source !== SESSION_START.sources.startup) return false;
    const folder = started.cwd;
    if (folder === undefined) return false;
    if (notAProject(folder, home, realHome) !== undefined || inAppChatFolder(folder, home) || inTemporarySpace(folder, temporaryDirectory, home)) return false;

    const project = projectDirectoryName(folder);
    const here = await onboardingOf(project).read();
    if (here.here || here.failed) return false;
    const computer = await computerOnboarding.read();
    if (computer.here || computer.failed) return false;
    // Review of 2026-10-24: where the computer's own settings deny a file, the plugin's `refuse` blocks it in this project
    // too (RW11), and "it blocks no file here yet" would be false - a rule written by `protect` or by hand needs no record.
    if ((await readComputerPolicy(files, home)) !== undefined) return false;

    const settings = await Promise.all([SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => readSettingsFile(files, join(folder, SETTINGS_FILES.directory, name))));
    if (settings.includes('unreadable') || runsAgentwhy(settings)) return false;

    const moment = now();
    const last = await told.lastToldAt(project);
    if (last === 'failed' || (last !== undefined && moment - last < TOLD_AGAIN_AFTER_MS)) return false;
    // Told only once it is recorded: a record that cannot be written would otherwise say it in every session.
    return told.add(project, moment);
  }
}
