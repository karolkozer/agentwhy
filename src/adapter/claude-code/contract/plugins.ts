// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Where Claude Code records the plugins a person installed, and where the Claude desktop app keeps the ones added to the
 * person's Claude account (`.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` §2.8, §8.3, AP9). Measured 2026-10-20 on
 * macOS, Claude Code 2.1.236 in a terminal and the desktop app 2.42304.2, by a script printing key names alone:
 *
 * - `installed_plugins.json` is `{ version: 2, plugins: { "<name>@<marketplace>": [{ scope, installPath, version,
 *   installedAt, lastUpdated }] } }`, one entry per install, `scope` `user` for an install that runs in every project;
 * - `enabledPlugins` in `~/.claude/settings.json` holds `true` for each plugin installed at that scope (2 of 2);
 * - the desktop app's manifest of the account's plugins, `rpm/manifest.json` two folders under
 *   `local-agent-mode-sessions`, and the copy a terminal session downloads, `manifest.json` one folder under
 *   `~/.claude/plugins/synced`, are each `{ lastUpdated, plugins: [{ name, ... }] }` - and no key of either says
 *   whether the plugin is turned on: where the desktop app keeps its Plugins window's switch is not found, so a page
 *   knows the plugin was added and never that it runs.
 *
 * Only these keys and names are read, nothing else of these files. Managed settings, which Claude Code puts over all of
 * them, are not read; Windows is not measured, so the desktop app's folder is looked for on macOS alone.
 */
export const PLUGIN_RECORDS = {
  /** agentwhy's own plugin, by the name its `plugin.json` gives. */
  name: 'agentwhy',
  /** The marketplaces agentwhy is offered from: its own, and Anthropic's directory once it is listed there (APD6). */
  marketplaces: ['agentwhy', 'claude-plugins-official'],
  installed: {
    /** Under the home directory. */
    file: ['.claude', 'plugins', 'installed_plugins.json'],
    plugins: 'plugins',
    scope: 'scope',
    /** The scope whose install runs in every project of the person's. */
    everyProject: 'user',
  },
  /** The key of a settings file whose `<id>: true` turns an installed plugin on. */
  enabled: 'enabledPlugins',
  account: {
    /** Under the home directory, on macOS: `<organisation>/<user>/rpm/manifest.json` under it. */
    desktop: ['Library', 'Application Support', 'Claude', 'local-agent-mode-sessions'],
    desktopManifest: ['rpm', 'manifest.json'],
    /** Under the home directory: `<organisation>_<user>/manifest.json` under it. */
    synced: ['.claude', 'plugins', 'synced'],
    syncedManifest: 'manifest.json',
    plugins: 'plugins',
    name: 'name',
  },
} as const;

/** `<name>@<marketplace>`: how `installed_plugins.json` and `enabledPlugins` name a plugin. */
export const PLUGIN_IDS: readonly string[] = PLUGIN_RECORDS.marketplaces.map((marketplace) => PLUGIN_RECORDS.name + '@' + marketplace);
