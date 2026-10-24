// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/** What `@clack/prompts` exports, as its own types say. */
export type Clack = typeof import('@clack/prompts');

/**
 * `@clack/prompts`, loaded when a question is asked and not before (`2026-10-15-agentwhy-as-a-plugin.md` APD2, §8.3).
 * The composition root builds every prompter for every command, so a package loaded with the module was loaded by
 * every hook, `start` and report too, none of which asks anything - and they could not start where the package is
 * not installed: the plugin copied without its dependencies, or uploaded to the account, which refuses the `@` in its
 * path. Node keeps the module once loaded, so a second question loads nothing more.
 */
export function clack(): Promise<Clack> {
  return import('@clack/prompts');
}
