// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The top of a screen (guidelines §3): a coral rule and eyebrow, the fact in white, what to do about it in coral,
 * and one line under both. Every argument is already written in every language.
 */
export interface Hero {
  /** Empty draws no eyebrow. */
  readonly eyebrow: string;
  readonly fact: string;
  /** Empty draws one line only: a heading that reassures rather than asks (Settings). */
  readonly action: string;
  readonly lead: string;
  /** Centred, as the report's to-do list is; Conversations reads from the left. */
  readonly centred?: boolean;
  /** The second line in mint, where it says all is well ("Nice work."); coral otherwise. */
  readonly calm?: boolean;
  /**
   * A large mark above the heading: `tick`, mint, on a screen whose one message is that all is well (the report's P11);
   * `unsure`, an amber question mark with the second line in amber, on one that would be all good but for what the record
   * cannot show (P60) - amber is what is not known (guidelines §2); `alert`, a coral "!", on a screen with something to
   * do (P59); `todo`, the same "!" with the tick hidden beside it, for the to-do list, whose script shows the tick once
   * everything is done (P6).
   */
  readonly mark?: 'tick' | 'unsure' | 'alert' | 'todo';
}

const TICK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const MARKS: Readonly<Record<NonNullable<Hero['mark']>, string>> = {
  tick: '<span class="hero-tick" aria-hidden="true">' + TICK_SVG + '</span>',
  unsure: '<span class="hero-unsure" aria-hidden="true">?</span>',
  alert: '<span class="hero-alert" aria-hidden="true">!</span>',
  todo: '<span class="hero-alert" aria-hidden="true" data-hero-todo>!</span>' +
    '<span class="hero-tick" aria-hidden="true" data-hero-done hidden>' + TICK_SVG + '</span>',
};

export function hero(spec: Hero): string {
  return '<section class="hero' + (spec.centred === true ? ' hero-centred' : '') + '">' + (spec.mark === undefined ? '' : MARKS[spec.mark]) +
    (spec.eyebrow === '' ? '' : '<div class="hero-eyebrow"><span class="hero-rule" aria-hidden="true"></span>' +
      '<span class="hero-eyebrow-text">' + spec.eyebrow + '</span></div>') +
    '<h1 class="hero-fact' + (spec.action === '' ? ' hero-alone' : '') + '">' + spec.fact + '</h1>' +
    (spec.action === '' ? '' : '<p class="hero-action' + (spec.calm === true ? ' hero-calm' : spec.mark === 'unsure' ? ' hero-amber' : '') + '" role="doc-subtitle">' + spec.action + '</p>') +
    '<p class="hero-lead">' + spec.lead + '</p></section>';
}

export const HERO_STYLE = String.raw`
.hero{margin-bottom:32px}
.hero-eyebrow{display:inline-flex;align-items:center;gap:12px;color:var(--coral-text);font-size:15px;font-weight:500;margin-bottom:16px}
.hero-rule{width:36px;height:1.5px;background:var(--coral)}
.hero-eyebrow-text{white-space:nowrap}
.hero-fact,.hero-action{margin:0;font-size:44px;line-height:1.12;letter-spacing:-0.02em;font-weight:650;text-wrap:balance}
.hero-action{margin:0 0 16px;color:var(--coral)}
.hero-fact.hero-alone{margin-bottom:12px;font-size:40px}
.hero-action.hero-calm{color:var(--mint)}.hero-action.hero-amber{color:var(--amber)}
.hero-lead{margin:0;max-width:600px;font-size:17px;line-height:1.55;color:var(--text-2);text-wrap:pretty}
.hero-tick{display:flex;align-items:center;justify-content:center;width:72px;height:72px;margin:0 0 26px;border-radius:50%;background:var(--mint);color:var(--on-mint);box-shadow:0 0 0 10px var(--mint-06),0 0 48px var(--mint-16)}
.hero-tick svg{width:34px;height:34px}
.hero-alert{display:flex;align-items:center;justify-content:center;width:72px;height:72px;margin:0 0 26px;border-radius:50%;background:var(--coral-14);border:1.5px solid var(--coral-35);color:var(--coral-text);box-shadow:0 0 0 10px var(--coral-06);font-size:34px;font-weight:700}
.hero-tick[hidden],.hero-alert[hidden]{display:none}
.hero-unsure{display:flex;align-items:center;justify-content:center;width:72px;height:72px;margin:0 0 26px;border-radius:50%;background:var(--amber-12);border:1.5px solid var(--amber-35);color:var(--amber);box-shadow:0 0 0 10px var(--amber-12);font-size:34px;font-weight:700}
.hero-centred .hero-tick,.hero-centred .hero-unsure,.hero-centred .hero-alert{margin-left:auto;margin-right:auto}
.hero-centred{text-align:center;margin-bottom:36px}.hero-centred .hero-eyebrow{margin-bottom:18px}
.hero-centred .hero-action{margin-bottom:18px}.hero-centred .hero-lead{max-width:520px;margin:0 auto}
@media (max-width:640px){.hero-fact,.hero-action{font-size:32px}.hero-tick{width:60px;height:60px}.hero-tick svg{width:28px;height:28px}.hero-unsure,.hero-alert{width:60px;height:60px;font-size:28px}}
`;
