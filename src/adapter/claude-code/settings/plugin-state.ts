// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryEntry, DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { PLUGIN_IDS, PLUGIN_RECORDS } from '../contract/plugins.ts';
import { SETTINGS_FILES } from '../contract/settings.ts';

/**
 * Whether agentwhy's Claude Code plugin runs on this computer (`agentwhy-as-a-plugin.md` AP9): `on` where it is
 * installed for every project - Claude Code's `user` scope - and turned on; `account` where it was added to the
 * person's Claude account, which the desktop app's records say and never whether its switch is on; `none` otherwise,
 * and wherever what would say it cannot be read. A page says the plugin runs only on `on`. An install for one project
 * (`project`, `local`) is not read: where it records its project is not measured.
 */
export type PluginPresence = 'on' | 'account' | 'none';

/**
 * Asked for a project, a plugin installed for every project is on there unless the project's own settings turn it off:
 * `enabledPlugins` read local over shared over the person's own (§2.8). Asked for none, the person's own alone.
 */
export async function pluginPresence(files: FileReader & DirectoryReader, home: string, platform: string, project?: string): Promise<PluginPresence> {
  // Read for every person's Settings, plugin or not: a failure the port does not name (EIO, EMFILE) says nothing of the
  // plugin and must not take the page with it - `none` is what a page draws nothing new for.
  try {
    if (await installedForEveryProject(files, home, project)) return 'on';
    return (await addedToTheAccount(files, home, platform)) ? 'account' : 'none';
  } catch {
    return 'none';
  }
}

async function installedForEveryProject(files: FileReader, home: string, project: string | undefined): Promise<boolean> {
  const { installed } = PLUGIN_RECORDS;
  const plugins = (await jsonAt(files, join(home, ...installed.file)))?.[installed.plugins];
  if (!isJsonObject(plugins)) return false;
  const ids = PLUGIN_IDS.filter((id) => {
    const entries = plugins[id];
    return Array.isArray(entries) && entries.some((entry) => isJsonObject(entry) && entry[installed.scope] === installed.everyProject);
  });
  if (ids.length === 0) return false;
  const settings = [
    ...(project === undefined ? [] : [SETTINGS_FILES.local, SETTINGS_FILES.shared].map((file) => join(project, SETTINGS_FILES.directory, file))),
    join(home, SETTINGS_FILES.directory, SETTINGS_FILES.shared),
  ];
  const answers = await Promise.all(settings.map(async (path) => (await jsonAt(files, path))?.[PLUGIN_RECORDS.enabled]));
  // The first file that says either way decides. What an install at this scope writes, measured, is `true`; absent
  // everywhere, or anything but a yes or a no, is not read as on.
  return ids.some((id) => answers.map((enabled) => (isJsonObject(enabled) ? enabled[id] : undefined)).find((value) => typeof value === 'boolean') === true);
}

/** The desktop app's manifest of the account's plugins (macOS), or the copy a terminal session downloaded of it. */
async function addedToTheAccount(files: FileReader & DirectoryReader, home: string, platform: string): Promise<boolean> {
  const { account } = PLUGIN_RECORDS;
  const manifests: string[] = [];
  if (platform === 'darwin') {
    const desktop = join(home, ...account.desktop);
    for (const organisation of await folders(files, desktop)) {
      for (const user of await folders(files, join(desktop, organisation))) {
        manifests.push(join(desktop, organisation, user, ...account.desktopManifest));
      }
    }
  }
  const synced = join(home, ...account.synced);
  for (const bucket of await folders(files, synced)) manifests.push(join(synced, bucket, account.syncedManifest));
  for (const manifest of manifests) {
    const plugins = (await jsonAt(files, manifest))?.[account.plugins];
    if (Array.isArray(plugins) && plugins.some((plugin) => isJsonObject(plugin) && plugin[account.name] === PLUGIN_RECORDS.name)) return true;
  }
  return false;
}

async function jsonAt(files: FileReader, path: string): Promise<JsonObject | undefined> {
  return parseJsonObject((await textOrUndefined(files, path)) ?? '');
}

/** The folders directly in `path`; none where it is not there or cannot be listed. */
async function folders(directories: DirectoryReader, path: string): Promise<readonly string[]> {
  let entries: readonly DirectoryEntry[];
  try {
    entries = await directories.list(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return [];
  }
  return entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.name);
}
