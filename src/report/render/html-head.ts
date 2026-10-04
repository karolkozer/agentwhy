// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The policy every page this tool writes is served under - by nothing, since a page is opened as a file. It says
 * that the page may run its own inline script and style and may reach **nowhere**: no fetch, no image but a `data:` one, no form
 * submission, no base to redirect relative links through (§7.5 hard constraint 1).
 *
 * One constant, because two pages carrying two copies of a security header is how one of them ends up weaker.
 */
/**
 * The index's policy: the same, except that it may reach the origin it was loaded from. Opened as a file that is
 * nothing; served by `start` it is the loopback server a mark is sent to (`worth-running-every-day` R53).
 */
export const INDEX_CONTENT_SECURITY_POLICY_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; ' +
  'style-src \'unsafe-inline\'; img-src data:; connect-src \'self\'; base-uri \'none\'; form-action \'none\'">';

export const CONTENT_SECURITY_POLICY_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; ' +
  'style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'">';

/**
 * The tab's icon: the mark both pages carry beside the wordmark, in the accent on the page's own background, drawn
 * as a `data:` URI so the file stays one file. The policies above allow `img-src data:` for exactly this - a `data:`
 * image is the page's own bytes and reaches nowhere - because a browser that applies `default-src 'none'` to the
 * icon would otherwise leave the tab blank.
 */
const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -2 46 44"><rect x="-3" y="-2" width="46" height="44" rx="10" fill="#0d0e11"/>' +
  '<g fill="none" stroke="#ff997f" stroke-width="6" stroke-linecap="round">' +
  '<path d="m17 25-3 3a7.07 7.07 0 0 1-10-10l8-8a7.07 7.07 0 0 1 10 0"/>' +
  '<path d="m23 15 3-3a7.07 7.07 0 0 1 10 10l-8 8a7.07 7.07 0 0 1-10 0"/></g></svg>';

export const FAVICON_LINK = '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + encodeURIComponent(FAVICON_SVG) + '">';
