// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The page's background: the warm glow of the design files at the top, and the still field of points the index has
 * always had behind it, kept at the maintainer's request (2026-09-23) over the guidelines' "no dots". It says
 * nothing and takes no pointer; it is written into the page, so a page with no script is the page that was designed.
 *
 * `bd-mint` on it turns a mint glow on over the warm one: the onboarding's Done, whose one message is that all is well
 * (`.ai/specs/2026-09-24-onboarding.md` W2, W17). A page's script sets it; without one the glow stays warm.
 */
export function backdrop(): string {
  return '<div class="bd" aria-hidden="true">' + stars(65) + '</div>';
}

/**
 * The field of points itself, `count` of them spread over the box that holds them: the page's, and a wide window's,
 * which carries the page's sky with it (`popup.ts`; the maintainer, 2026-09-25). Always the same points, so a page
 * written twice is the same page.
 */
export function stars(count: number): string {
  return Array.from({ length: count }, (_unused, at) =>
    '<i class="bd-star' + (at % 17 === 0 ? ' bd-cross' : '') + '" style="left:' + ((at * 47.37 + 8) % 100).toFixed(2) +
    '%;top:' + ((at * 29.83 + 3) % 100).toFixed(2) + '%;opacity:' + (0.12 + (at % 5) * 0.055).toFixed(3) + '"></i>').join('');
}

export const BACKDROP_STYLE = String.raw`
.bd{position:fixed;inset:0;pointer-events:none;z-index:0;overflow:hidden;background:radial-gradient(1200px 520px at 60% -120px,var(--glow) 0%,var(--glow-mid) 55%,var(--bg) 100%)}
.bd:after{content:"";position:absolute;inset:0;opacity:0;transition:opacity .8s ease;background:radial-gradient(1100px 560px at 50% -140px,var(--glow-mint) 0%,transparent 70%),radial-gradient(900px 600px at 50% 38%,var(--mint-16),transparent 65%)}
.bd-mint:after{opacity:1}
.bd-star{position:absolute;width:2px;height:2px;border-radius:50%;background:var(--star);box-shadow:0 0 6px var(--star-glow);opacity:.3}
.bd-cross{width:3px;height:3px;opacity:.5}
.bd-cross:after,.bd-cross:before{content:"";position:absolute;background:var(--star-cross)}
.bd-cross:after{height:7px;width:1px;left:1px;top:-2px}.bd-cross:before{width:7px;height:1px;left:-2px;top:1px}
`;
