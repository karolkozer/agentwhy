// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { pluginPresence } from '../../../../src/adapter/claude-code/settings/plugin-state.ts';
import type { DirectoryEntry, DirectoryReader } from '../../../../src/ports/directory-reader.ts';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';

const HOME = '/Users/someone';
const INSTALLED = join(HOME, '.claude', 'plugins', 'installed_plugins.json');
const SETTINGS = join(HOME, '.claude', 'settings.json');
const DESKTOP = join(HOME, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions', 'org-1', 'user-1', 'rpm', 'manifest.json');
const SYNCED = join(HOME, '.claude', 'plugins', 'synced', 'org-1_user-1', 'manifest.json');

/** A home holding exactly these files, each folder above them listable. */
function home(texts: Readonly<Record<string, string>>): FileReader & DirectoryReader {
  const folders = new Map<string, Map<string, DirectoryEntry>>();
  for (const path of Object.keys(texts)) {
    let child = path;
    let kind: DirectoryEntry['kind'] = 'file';
    while (child !== dirname(child)) {
      const parent = dirname(child);
      const entries = folders.get(parent) ?? new Map<string, DirectoryEntry>();
      entries.set(child, { name: child.slice(parent.length + 1), kind });
      folders.set(parent, entries);
      child = parent;
      kind = 'directory';
    }
  }
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: async function* () {},
    kindOf: async (path) => {
      if (texts[path] !== undefined) return 'file';
      if (folders.has(path)) return 'directory';
      throw new FileAccessError('not-found', path);
    },
    list: async (path) => {
      const entries = folders.get(path);
      if (entries === undefined) throw new FileAccessError('not-found', path);
      return [...entries.values()];
    },
    modifiedAt: async () => 0,
  };
}

const installed = (id: string, scope: string): string =>
  JSON.stringify({ version: 2, plugins: { [id]: [{ scope, installPath: '/Users/someone/.claude/plugins/cache/x', version: '1.0.0' }] } });
const enabled = (value: unknown, id = 'agentwhy@agentwhy'): string => JSON.stringify({ enabledPlugins: { [id]: value } });
const manifest = (name: string): string => JSON.stringify({ lastUpdated: 'x', plugins: [{ name, marketplaceName: 'x' }] });

test('AP9: installed for every project and turned on, the plugin is on - from its own marketplace or the directory', async () => {
  assert.equal(await pluginPresence(home({ [INSTALLED]: installed('agentwhy@agentwhy', 'user'), [SETTINGS]: enabled(true) }), HOME, 'darwin'), 'on');
  const official = 'agentwhy@claude-plugins-official';
  assert.equal(await pluginPresence(home({ [INSTALLED]: installed(official, 'user'), [SETTINGS]: enabled(true, official) }), HOME, 'linux'), 'on');
});

test('AP9: turned off, never turned on, or installed for one project, the plugin is not on for the computer', async () => {
  for (const settings of [enabled(false), enabled('yes'), JSON.stringify({}), undefined]) {
    const texts: Record<string, string> = { [INSTALLED]: installed('agentwhy@agentwhy', 'user') };
    if (settings !== undefined) texts[SETTINGS] = settings;
    assert.equal(await pluginPresence(home(texts), HOME, 'darwin'), 'none', String(settings));
  }
  for (const scope of ['project', 'local']) {
    assert.equal(await pluginPresence(home({ [INSTALLED]: installed('agentwhy@agentwhy', scope), [SETTINGS]: enabled(true) }), HOME, 'darwin'), 'none', scope);
  }
});

test('AP9: a plugin of another name or marketplace is not agentwhy', async () => {
  const other = 'agentwhy@someone-else';
  assert.equal(await pluginPresence(home({ [INSTALLED]: installed(other, 'user'), [SETTINGS]: enabled(true, other) }), HOME, 'darwin'), 'none');
  assert.equal(await pluginPresence(home({ [DESKTOP]: manifest('agentwhy-probe'), [SYNCED]: manifest('not-agentwhy') }), HOME, 'darwin'), 'none');
});

test('AP9: added to the Claude account, the plugin is known as added - the desktop app on macOS, a synced copy anywhere', async () => {
  assert.equal(await pluginPresence(home({ [DESKTOP]: manifest('agentwhy') }), HOME, 'darwin'), 'account');
  // Where the desktop app keeps this on other systems is not measured, so its macOS folder is not looked for there.
  assert.equal(await pluginPresence(home({ [DESKTOP]: manifest('agentwhy') }), HOME, 'linux'), 'none');
  assert.equal(await pluginPresence(home({ [SYNCED]: manifest('agentwhy') }), HOME, 'linux'), 'account');
});

test('AP9: on wins over added to the account', async () => {
  const texts = { [INSTALLED]: installed('agentwhy@agentwhy', 'user'), [SETTINGS]: enabled(true), [DESKTOP]: manifest('agentwhy') };
  assert.equal(await pluginPresence(home(texts), HOME, 'darwin'), 'on');
});

test('AP9: a broken or unexpected file says nothing of the plugin', async () => {
  for (const text of ['{', '[]', JSON.stringify({ plugins: [] }), JSON.stringify({ plugins: { 'agentwhy@agentwhy': 'user' } })]) {
    assert.equal(await pluginPresence(home({ [INSTALLED]: text, [SETTINGS]: enabled(true), [DESKTOP]: text }), HOME, 'darwin'), 'none', text);
  }
  assert.equal(await pluginPresence(home({}), HOME, 'darwin'), 'none');
});

test('AP9, AP12: for a project, its own settings say whether the plugin installed for every project is on there', () => {
  const PROJECT = '/Users/someone/work/shop';
  const local = join(PROJECT, '.claude', 'settings.local.json');
  const shared = join(PROJECT, '.claude', 'settings.json');
  const base = { [INSTALLED]: installed('agentwhy@agentwhy', 'user'), [SETTINGS]: enabled(true) };
  const presence = (texts: Record<string, string>) => pluginPresence(home({ ...base, ...texts }), HOME, 'darwin', PROJECT);
  return (async () => {
    assert.equal(await presence({}), 'on', 'the person\'s own yes, where the project says nothing');
    assert.equal(await presence({ [shared]: enabled(false) }), 'none', 'the project turned it off');
    assert.equal(await presence({ [shared]: enabled(false), [local]: enabled(true) }), 'on', 'local over shared');
    assert.equal(await presence({ [local]: enabled(false) }), 'none');
    assert.equal(await presence({ [shared]: JSON.stringify({ enabledPlugins: { 'agentwhy@agentwhy': 'off' } }) }), 'on', 'neither a yes nor a no: the next file decides');
    assert.equal(await pluginPresence(home({ [INSTALLED]: installed('agentwhy@agentwhy', 'user'), [shared]: enabled(true) }), HOME, 'darwin', PROJECT), 'on',
      'a yes in the project is a yes, the install being for every project');
  })();
});
