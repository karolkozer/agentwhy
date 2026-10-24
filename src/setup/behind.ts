// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { pinnedVersions } from '../adapter/claude-code/settings/hook-entries.ts';
import type { JsonObject } from '../shared/json.ts';
import { isOlder, plainVersion } from '../shared/plain-version.ts';

/** That the project's hooks run an older release than the agentwhy serving the page, and which (`nothing-updates-by-itself.md` U2). */
export interface Behind {
  /** The lowest release a hook is pinned to. */
  readonly from: string;
  /** The release serving the page. */
  readonly to: string;
  /** Whether the hooks pinned to `from` run from the shared file, so an update reaches everyone on the project. */
  readonly shared: boolean;
}

/**
 * U2 over the project's two settings files, as parsed: behind where a hook runs the pinned published way at a release
 * older than `serving`. A serving version that is not a release, and hooks in any other form, are never behind.
 */
export function behind(files: { readonly local?: JsonObject; readonly shared?: JsonObject }, serving: string | undefined): Behind | undefined {
  if (serving === undefined || plainVersion(serving) === undefined) return undefined;
  const older = (settings: JsonObject | undefined): string[] => pinnedVersions(settings ?? {}).filter((version) => isOlder(version, serving));
  const local = older(files.local);
  const shared = older(files.shared);
  const [first, ...rest] = [...local, ...shared];
  if (first === undefined) return undefined;
  const from = rest.reduce((lowest, version) => (isOlder(version, lowest) ? version : lowest), first);
  return { from, to: serving, shared: shared.includes(from) };
}

/**
 * `agentwhy-as-a-plugin.md` AP13 (as decided 2026-10-20): the agentwhy plugin serving the page runs an older release than
 * the project's hooks are pinned to. Nothing asks the internet (U3): the newer release is the one the project's own
 * hooks name.
 */
export interface PluginBehind {
  /** The release serving the page: the plugin's. */
  readonly running: string;
  /** The highest release a hook of the project is pinned to. */
  readonly newer: string;
}

/** AP13 over the same two files: a hook pinned to a plain release newer than `serving`, the highest named. */
export function pluginBehind(files: { readonly local?: JsonObject; readonly shared?: JsonObject }, serving: string | undefined): PluginBehind | undefined {
  if (serving === undefined || plainVersion(serving) === undefined) return undefined;
  const newer = [files.local, files.shared].flatMap((settings) => pinnedVersions(settings ?? {})).filter((version) => isOlder(serving, version));
  const [first, ...rest] = newer;
  if (first === undefined) return undefined;
  return { running: serving, newer: rest.reduce((highest, version) => (isOlder(highest, version) ? version : highest), first) };
}
