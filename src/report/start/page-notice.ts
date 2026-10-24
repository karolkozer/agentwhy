// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { pluginUpdateNotice, updateNotice } from '../render/ui/update-notice.ts';
import type { SessionIndex } from './session-index.ts';

/**
 * What a page `start` serves draws over its content, from the model it is written with: the update notice, where the
 * project's hooks run an older release than this agentwhy (`nothing-updates-by-itself.md` U4), or, in a run of the agentwhy
 * plugin, a newer one (`agentwhy-as-a-plugin.md` AP13), and nothing otherwise.
 * The onboarding does not ask for it: the hooks it writes are this release's.
 */
export function pageNotice(index: SessionIndex): { readonly notice?: string } {
  // The computer's page updates no project's hooks, and is served no route that would (`everything-on-this-computer` GD19).
  if (index.scope === 'computer') return {};
  const hooks = index.settings?.hooks;
  if (hooks?.behind !== undefined) return { notice: updateNotice(hooks.behind) };
  // AP13: the plugin serving the page is the older one - said where it is updated, with nothing that writes.
  return hooks?.pluginBehind === undefined ? {} : { notice: pluginUpdateNotice(hooks.pluginBehind) };
}
