// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.ts';
import { STOP, USER_PROMPT_SUBMIT } from '../adapter/claude-code/contract/hooks.ts';
import { pinnedOlderThan, watchInvocationsOn } from '../adapter/claude-code/settings/hook-entries.ts';
import { USER_HOOKS } from '../adapter/codex/contract/hooks.ts';
import { codexCheckState } from '../adapter/codex/settings/codex-check.ts';
import { approvedCodexEntries } from '../adapter/codex/settings/codex-hooks.ts';
import type { PlacedEntry } from '../adapter/codex/settings/hook-approval.ts';
import { textOrUndefined, type FileReader } from '../ports/file-reader.ts';
import { parseJsonObject, type JsonObject } from '../shared/json.ts';
import { OPEN_FROM_CHAT_SINCE } from './open-from-chat.ts';

/** For which AI *open agentwhy* is answered, where it was asked (RO7). */
export interface OpenFromChatHere {
  readonly claudeCode: boolean;
  readonly codex: boolean;
}

export interface WhereItWorksDependencies {
  readonly files: FileReader;
  readonly home: string;
  /** How this process runs agentwhy, for a hook written that way (`hookRun`). */
  readonly invoke: string;
  /** This run is the plugin's own, so the plugin's copy is this release. Another run's plugin is of a release not known. */
  readonly plugin: boolean;
}

/**
 * Where the phrase is answered (`2026-11-24-open-agentwhy-from-the-chat.md` RO7): the AI's `UserPromptSubmit` entry is
 * written - for Codex, approved too - and the agentwhy it runs is not pinned to a release before the phrase. Read, never
 * assumed: a file that cannot be read answers nothing, since every line and page that names the phrase rests on this.
 */
export async function openFromChatIn(dependencies: WhereItWorksDependencies, project: string | undefined): Promise<OpenFromChatHere> {
  return { claudeCode: await inClaudeCode(dependencies, project), codex: await inCodex(dependencies) };
}

/**
 * RO11: for which AI the entry is missing while agentwhy's alerts run without it - set up before agentwhy checked a message -
 * so one write adds it. `project` undefined: the computer's own alerts. Hooks pinned to a release before the phrase are the
 * update notice's, with the entry or without it; a Codex check that is not `on` is the Codex line's.
 */
export async function entryMissingIn(dependencies: WhereItWorksDependencies, project: string | undefined): Promise<OpenFromChatHere> {
  const { files, home, invoke } = dependencies;
  const settings = (await Promise.all(placesOf(home, project).filter(([, scope]) => (scope === 'everywhere') === (project === undefined))
    .map(async ([path, scope]) => ({ scope, held: await jsonIn(files, path) }))))
    .flatMap(({ scope, held }) => (held === undefined ? [] : [{ scope, held }]));
  const running = (event: string): readonly string[] => settings.flatMap(({ scope, held }) => watchInvocationsOn(held, event, scope, invoke));
  // A write repeats how the hooks already run agentwhy, so beside an older pin the entry would answer nothing: the update
  // notice comes first there (found by review).
  const claudeCode = running(STOP.event).some(knowsThePhrase) && running(USER_PROMPT_SUBMIT.event).length === 0 && !(await inClaudeCode(dependencies, project));
  const codex = (await codexCheckState(files, home)) === 'on' && (await codexEntry(files, home, USER_PROMPT_SUBMIT.event)) === undefined &&
    codexKnowsThePhrase(await codexEntry(files, home, STOP.event));
  return { claudeCode, codex };
}

/** The settings files an entry of Claude Code's can be in, and whose: a project's own two, then the computer's. */
function placesOf(home: string, project: string | undefined): ReadonlyArray<readonly [path: string, scope: 'own' | 'everywhere']> {
  return [
    ...(project === undefined ? [] : [SETTINGS_FILES.local, SETTINGS_FILES.shared].map((name) => [join(project, SETTINGS_FILES.directory, name), 'own'] as const)),
    [join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared), 'everywhere'],
  ];
}

async function inClaudeCode({ files, home, invoke, plugin }: WhereItWorksDependencies, project: string | undefined): Promise<boolean> {
  if (plugin) return true;
  for (const [path, scope] of placesOf(home, project)) {
    const settings = await jsonIn(files, path);
    if (settings !== undefined && watchInvocationsOn(settings, USER_PROMPT_SUBMIT.event, scope, invoke).some(knowsThePhrase)) return true;
  }
  return false;
}

async function inCodex({ files, home }: WhereItWorksDependencies): Promise<boolean> {
  if ((await codexCheckState(files, home)) !== 'on') return false;
  return codexKnowsThePhrase(await codexEntry(files, home, USER_PROMPT_SUBMIT.event));
}

function codexKnowsThePhrase(placed: PlacedEntry | undefined): boolean {
  const command = placed?.entry.command;
  return typeof command === 'string' && knowsThePhrase(/^\s*(.*?)\s+codex-stop(?:\s|$)/.exec(command)?.[1] ?? command);
}

async function codexEntry(files: FileReader, home: string, event: string): Promise<PlacedEntry | undefined> {
  const hooks = await jsonIn(files, join(home, USER_HOOKS.directory, USER_HOOKS.file));
  return hooks === undefined ? undefined : approvedCodexEntries(hooks).find((placed) => placed.event === event);
}

const knowsThePhrase = (invocation: string): boolean => !pinnedOlderThan(invocation, OPEN_FROM_CHAT_SINCE);

async function jsonIn(files: FileReader, path: string): Promise<JsonObject | undefined> {
  return parseJsonObject((await textOrUndefined(files, path)) ?? '');
}
