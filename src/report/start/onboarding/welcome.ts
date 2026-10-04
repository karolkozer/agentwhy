// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { inLanguages } from '../../render/report-copy.ts';
import { pill } from '../../render/ui/button.ts';

/**
 * The welcome (`.ai/specs/2026-09-24-onboarding.md` W7-W9): points of light fly to the centre, the knot draws itself,
 * a flash and a soft glow, and the words come in one after the other. Its promises are the ones W9 keeps true.
 *
 * With no script it is the first thing on the page, and the steps follow it (W27); **Get started** needs a script.
 */
export function welcomeScreen(): string {
  const up = (at: number): string => ' style="--d:' + at + 's"';
  return '<section class="ob-screen ob-welcome" data-ob-screen="welcome" aria-labelledby="ob-welcome-title">' +
    '<div class="ob-mark" aria-hidden="true">' + points() +
    '<span class="ob-flash"></span><span class="ob-bloom"></span>' +
    '<svg class="ob-knot" viewBox="-3 -2 46 44" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">' +
    '<path class="ob-knot-a" d="m17 25-3 3a7.07 7.07 0 0 1-10-10l8-8a7.07 7.07 0 0 1 10 0"/>' +
    '<path class="ob-knot-b" d="m23 15 3-3a7.07 7.07 0 0 1 10 10l-8 8a7.07 7.07 0 0 1-10 0"/></svg></div>' +
    '<p class="ob-eyebrow ob-up"' + up(1.5) + '>' + inLanguages((t) => t('ob.eyebrow')) + '</p>' +
    '<h1 class="ob-h1" id="ob-welcome-title"><span class="ob-h1-a ob-up"' + up(1.7) + '>' + inLanguages((t) => t('ob.h1')) + '</span>' +
    '<span class="ob-h1-b ob-up"' + up(1.95) + '>' + inLanguages((t) => t('ob.h1b')) + '</span></h1>' +
    '<p class="ob-lead ob-up"' + up(2.2) + '>' + inLanguages((t) => t('ob.lead')) + '</p>' +
    '<div class="ob-start js-only ob-up"' + up(2.4) + '>' +
    // White, as every way on in the onboarding (the maintainer, 2026-09-29).
    pill({ label: inLanguages((t) => t('ob.start')), tone: 'light', size: 'lg', button: true, attributes: ' data-ob-go="project"' }) + '</div>' +
    '<ul class="ob-trust ob-up"' + up(2.6) + '>' +
    ['local', 'inside', 'free'].map((key) => '<li><span class="ob-tick" aria-hidden="true">✓</span>' + inLanguages((t) => t('ob.trust.' + key)) + '</li>').join('') +
    '</ul></section>';
}

/** The design's 22 points, from its own seed, so the page draws the same picture every time and needs no script. */
function points(): string {
  let seed = 11;
  const next = (): number => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: 22 }, () => {
    const angle = next() * Math.PI * 2;
    const distance = 140 + next() * 220;
    const size = 2 + next() * 3;
    const delay = next() * 0.6;
    const mint = next() < 0.3;
    return '<span class="ob-pt ob-pt-' + (mint ? 'mint' : 'coral') + '" style="--x:' + (Math.cos(angle) * distance).toFixed(1) + 'px;--y:' +
      (Math.sin(angle) * distance).toFixed(1) + 'px;--s:' + size.toFixed(1) + 'px;--d:' + delay.toFixed(2) + 's"></span>';
  }).join('');
}

/** The welcome's own look. Colours come from the tokens only. */
export const WELCOME_STYLE = String.raw`
.ob-welcome{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;max-width:760px;margin:0 auto;padding-top:2vh}
.ob-mark{position:relative;width:96px;height:96px;margin-bottom:26px;display:flex;align-items:center;justify-content:center;color:var(--coral)}
.ob-pt{position:absolute;left:50%;top:50%;width:var(--s);height:var(--s);margin:calc(var(--s) / -2) 0 0 calc(var(--s) / -2);border-radius:50%;animation:obConverge 1.1s cubic-bezier(.5,0,.2,1) var(--d) both}
.ob-pt-coral{background:var(--coral);box-shadow:0 0 8px var(--coral)}
.ob-pt-mint{background:var(--mint);box-shadow:0 0 8px var(--mint)}
.ob-flash{position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,var(--text),var(--coral-40) 40%,transparent 70%);animation:obFlash 1s ease-out 1.25s both}
.ob-bloom{position:absolute;inset:-40px;border-radius:50%;background:radial-gradient(circle,var(--coral-35),transparent 62%);filter:blur(8px);animation:obBloom 1.2s ease-out 1.2s both,obGlow 4s ease-in-out 2.4s infinite}
.ob-knot{position:relative;width:72px;height:69px;filter:drop-shadow(0 0 10px var(--coral-60));animation:obFloat 4s ease-in-out 2.4s infinite}
.ob-knot path{stroke-dasharray:120;stroke-dashoffset:120}
.ob-knot-a{animation:obDraw 1s ease-out .6s forwards}
.ob-knot-b{animation:obDraw 1s ease-out .85s forwards}
.ob-up{animation:obUp .8s cubic-bezier(.2,.8,.2,1) var(--d) both}
.ob-eyebrow{margin:0 0 18px;font-size:17px;font-weight:600;color:var(--coral-text)}
.ob-h1{margin:0 0 22px;display:flex;flex-direction:column;gap:6px;font-weight:650;text-wrap:balance}
.ob-h1-a{font-size:60px;line-height:1.05;letter-spacing:-.035em}
.ob-h1-b{font-size:44px;line-height:1.1;letter-spacing:-.03em;color:var(--coral)}
.ob-lead{margin:0 0 32px;max-width:500px;font-size:17px;line-height:1.55;color:var(--text-2);text-wrap:pretty}
.ob-start .pill{padding:15px 30px;font-size:16px;box-shadow:0 10px 40px var(--white-10)}
.ob-trust{list-style:none;margin:18px 0 0;padding:0;display:flex;gap:18px;flex-wrap:wrap;justify-content:center;font-size:13.5px;color:var(--text-2)}
.ob-trust li{display:flex;align-items:center;gap:6px}
.ob-tick{color:var(--mint)}
@media (max-width:640px){.ob-h1-a{font-size:40px}.ob-h1-b{font-size:30px}.ob-lead{font-size:16px}}
`;
