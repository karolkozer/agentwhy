// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Every colour and font of the design, once (`.ai/design/2026-09-23-design-guidelines.md` §2, §3, and the
 * maintainer's design files). A component's own style names these and never a colour of its own: two pieces that
 * mean the same thing then cannot drift apart, and a change of palette is a change of this file.
 *
 * The values are the design files' exactly, translucent ones included, because the pages are held to those files one
 * to one (`.ai/plans/2026-09-23-conversations-redesign.md`).
 */
export const TOKENS_STYLE = String.raw`
:root{
--bg:#111113;--panel:#141416;--card:#1a1a1d;--glow:#2c1c17;--glow-mid:#17131296;--glow-mint:rgba(30,70,52,0.55);
--text:#f2f0ee;--text-soft:#dcd8d5;--text-2:#a8a4a1;--text-3:#8a8683;--text-4:#5f5c5a;
--coral:#f8906f;--coral-text:#ff9a7a;--coral-hover:#ffa487;--coral-link-hover:#ffb8a0;--on-coral:#1c0f0a;
--coral-06:rgba(248,144,111,0.06);--coral-08:rgba(248,144,111,0.08);--coral-14:rgba(248,144,111,0.14);--coral-16:rgba(248,144,111,0.16);
--coral-25:rgba(248,144,111,0.25);--coral-30:rgba(248,144,111,0.3);--coral-35:rgba(248,144,111,0.35);--coral-45:rgba(248,144,111,0.45);--coral-50:rgba(248,144,111,0.5);
--amber:#f6b53d;--amber-16:rgba(246,181,61,0.16);
--sand:#f4ad5e;--sand-16:rgba(244,173,94,0.16);--sand-35:rgba(244,173,94,0.35);--on-sand:#1f150b;
--blue:#8fb7de;--blue-16:rgba(143,183,222,0.16);
--mint:#6dd3a6;--on-mint:#0c1c14;--mint-08:rgba(109,211,166,0.08);--mint-12:rgba(109,211,166,0.12);--mint-14:rgba(109,211,166,0.14);--mint-30:rgba(109,211,166,0.3);
--white-02:rgba(255,255,255,0.02);--white-06:rgba(255,255,255,0.06);--white-07:rgba(255,255,255,0.07);--white-08:rgba(255,255,255,0.08);
--white-09:rgba(255,255,255,0.09);--white-10:rgba(255,255,255,0.1);--white-12:rgba(255,255,255,0.12);--white-14:rgba(255,255,255,0.14);
--white-16:rgba(255,255,255,0.16);--white-28:rgba(255,255,255,0.28);--white-32:rgba(255,255,255,0.32);
--scroll:#2a2a2e;--star:#e59687;--star-glow:#f28b6844;--star-cross:#e59687aa;
--popup:#18181b;--popup-foot:#161618;--raised:#1f1f22;--raised-2:#232326;--avatar:#2a2a2e;--column-label:#6f6c69;--white:#ffffff;
--mint-hover:#85dcb5;--backdrop:rgba(8,8,9,0.72);--scrim:rgba(0,0,0,0.55);--shadow:rgba(0,0,0,0.6);--node-shadow:rgba(0,0,0,0.35);
--coral-05:rgba(248,144,111,0.05);--coral-07:rgba(248,144,111,0.07);--coral-12:rgba(248,144,111,0.12);--coral-18:rgba(248,144,111,0.18);
--coral-40:rgba(248,144,111,0.4);--coral-60:rgba(248,144,111,0.6);
--mint-05:rgba(109,211,166,0.05);--mint-06:rgba(109,211,166,0.06);--mint-07:rgba(109,211,166,0.07);--mint-16:rgba(109,211,166,0.16);--mint-20:rgba(109,211,166,0.2);--mint-50:rgba(109,211,166,0.5);--amber-12:rgba(246,181,61,0.12);--amber-35:rgba(246,181,61,0.35);--mint-10:rgba(109,211,166,0.1);--mint-35:rgba(109,211,166,0.35);
--white-025:rgba(255,255,255,0.025);--white-04:rgba(255,255,255,0.04);--white-05:rgba(255,255,255,0.05);--white-18:rgba(255,255,255,0.18);
--white-25:rgba(255,255,255,0.25);--white-30:rgba(255,255,255,0.3);--white-35:rgba(255,255,255,0.35);--white-40:rgba(255,255,255,0.4);--white-45:rgba(255,255,255,0.45);
--sans:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',system-ui,sans-serif;
--mono:ui-monospace,'SF Mono',Menlo,monospace;
color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--coral-text);text-decoration:none}a:hover{color:var(--coral-link-hover)}
*{box-sizing:border-box;scrollbar-color:var(--scroll) transparent}
::-webkit-scrollbar{height:8px;width:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--scroll);border-radius:8px}
:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
.i18n{display:none}
:root[data-lang="en"] .i18n[lang="en"],:root[data-lang="pl"] .i18n[lang="pl"],:root[data-lang="de"] .i18n[lang="de"]{display:inline}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.js-only{display:none}.js .js-only{display:revert}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;

/** The page's background, for the browser's own chrome, which reads a meta tag and not a custom property. */
export const THEME_COLOUR = '#111113';
