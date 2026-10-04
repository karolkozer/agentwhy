// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname } from 'node:path';
import type { FileReader } from '../../ports/file-reader.ts';
import type { FileWriter } from '../../ports/file-writer.ts';
import {
  longestMatch,
  NO_PREFERENCES,
  preferencesFor,
  readPreferences,
  withProjectChoices,
  writtenPreferences,
  type NoticePreferences,
  type Preferences,
} from './preferences.ts';

/** Whose answers a change is about: this project alone, or this person everywhere they work (R22). */
export type NoticeScope = 'project' | 'everywhere';

export interface NoticeChange {
  readonly scope: NoticeScope;
  /** What to set. A key left out is left as it was; `reset` takes every answer of that scope out instead. */
  readonly choices: NoticePreferences;
  readonly reset?: true;
}

/** What is set now: the file's own answers, kept apart so a person can see which of them is answering. */
export interface NoticeSettingsView {
  readonly path: string;
  readonly project: string;
  readonly defaults: NoticePreferences;
  readonly forProject: NoticePreferences;
  /** What the two of them come to where this project runs - what a hook would do, before any flag it carries. */
  readonly effective: NoticePreferences;
  /** The file is there and could not be read, so nothing below it is a choice anybody made (R24). */
  readonly unusable: boolean;
}

export interface NoticeSettingsDependencies {
  readonly files: FileReader;
  readonly writer: FileWriter;
  readonly path: string;
  /** The project a change without `--everywhere` is about: where the command was run. */
  readonly workingDirectory: string;
}

/**
 * Reading and changing what a person wants to be told (`specs/2026-09-21-the-agent-tells-you.md` R22-R26). The hook
 * only ever reads this file; this is the one place that writes it, and the page's Settings view writes through here
 * rather than through a second copy of the rules.
 */
export class NoticeSettings {
  readonly #dependencies: NoticeSettingsDependencies;

  constructor(dependencies: NoticeSettingsDependencies) {
    this.#dependencies = dependencies;
  }

  async view(): Promise<NoticeSettingsView> {
    const { path, workingDirectory } = this.#dependencies;
    const read = readPreferences(await this.#text());
    const preferences = read.kind === 'read' ? read.preferences : NO_PREFERENCES;

    return {
      path,
      project: workingDirectory,
      defaults: preferences.defaults,
      // The same project `effective` resolves to (R24): the longest ancestor match, not an exact key alone - a
      // directory inside a project a choice was made for is still governed by it, and must be attributed to it too.
      forProject: longestMatch(preferences.projects, workingDirectory) ?? {},
      effective: preferencesFor(preferences, workingDirectory),
      unusable: read.kind === 'unusable',
    };
  }

  /**
   * One change, written whole. A file this version cannot read is not edited around: it is replaced by what is being
   * asked for now, and the answer says so, because merging into a shape nobody recognised is how a choice quietly
   * becomes something else.
   */
  async change(change: NoticeChange): Promise<{ readonly written: boolean; readonly said: string }> {
    const { files: _files, writer, path, workingDirectory } = this.#dependencies;
    const read = readPreferences(await this.#text());
    const before = read.kind === 'read' ? read.preferences : NO_PREFERENCES;
    const after = changed(before, change, workingDirectory);

    try {
      await writer.ensureDirectory(dirname(path));
      await writer.writeText(path, writtenPreferences(after));
    } catch {
      return { written: false, said: `Nothing was written: ${path} could not be written to.` };
    }
    const where = change.scope === 'project' ? workingDirectory : 'every project';
    const what = change.reset === true ? 'Answers taken out' : 'Answers written';
    const replaced = read.kind === 'unusable' ? ' The file could not be read, so it was replaced.' : '';
    return { written: true, said: `${what} for ${where}, in ${path}.${replaced}` };
  }

  async #text(): Promise<string | undefined> {
    try {
      return await this.#dependencies.files.readText(this.#dependencies.path);
    } catch {
      return undefined;
    }
  }
}

function changed(before: Preferences, change: NoticeChange, workingDirectory: string): Preferences {
  if (change.scope === 'everywhere') {
    return { defaults: change.reset === true ? {} : { ...before.defaults, ...change.choices }, projects: before.projects };
  }
  const project = before.projects[workingDirectory] ?? {};
  return withProjectChoices(before, workingDirectory, change.reset === true ? {} : { ...project, ...change.choices });
}
