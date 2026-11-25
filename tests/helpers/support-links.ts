// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { SUPPORT_ADDRESSES } from '../../src/report/render/ui/app-sidebar.ts';
import { PUBLIC_REPOSITORY } from '../../src/shared/public-repository.ts';

/**
 * A page without the sidebar's links to agentwhy's own site (`for-people-who-build-with-ai.md` F7, added 2026-10-05),
 * and only as they are drawn - opened in a new tab, with no referrer - so a test that the page names no address still
 * fails on any other, and on these two drawn any other way.
 */
export function withoutSupportLinks(html: string): string {
  return SUPPORT_ADDRESSES.reduce((page, address) => page.replaceAll(' href="' + address + '" target="_blank" rel="noopener noreferrer"', ''), html);
}

/**
 * A page without any of the addresses a page may hold (`where-the-code-is.md` WC6, F7 as amended 2026-11-23): the
 * sidebar's two and the repository's, each only as it is drawn - a new tab, no referrer - so a test that the page names
 * no other address still fails on any other, and on these three drawn any other way.
 */
export function withoutOwnLinks(html: string): string {
  return withoutSupportLinks(html).replaceAll(' href="' + PUBLIC_REPOSITORY + '" target="_blank" rel="noopener noreferrer"', '');
}
