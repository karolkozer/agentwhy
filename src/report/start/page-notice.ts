// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { updateNotice } from '../render/ui/update-notice.ts';
import type { SessionIndex } from './session-index.ts';

/**
 * What a page `start` serves draws over its content, from the model it is written with: the update notice, where the
 * project's hooks run an older release than this agentwhy (`nothing-updates-by-itself.md` U4), and nothing otherwise.
 * The onboarding does not ask for it: the hooks it writes are this release's.
 */
export function pageNotice(index: SessionIndex): { readonly notice?: string } {
  // The computer's page updates no project's hooks, and is served no route that would (`everything-on-this-computer` GD19).
  if (index.scope === 'computer') return {};
  const behind = index.settings?.hooks?.behind;
  return behind === undefined ? {} : { notice: updateNotice(behind) };
}
