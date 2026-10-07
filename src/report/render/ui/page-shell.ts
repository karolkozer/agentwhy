// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FAVICON_LINK } from '../html-head.ts';
import { DEFAULT_LANG, translator } from '../report-copy.ts';
import { backdrop, BACKDROP_STYLE } from './backdrop.ts';
import { BUTTON_STYLE } from './button.ts';
import { CONFIRM_DIALOG_STYLE } from './confirm-dialog.ts';
import { liveParts, LIVE_SCRIPT, LIVE_STYLE } from './live-script.ts';
import { POPUP_SCRIPT, POPUP_STYLE } from './popup.ts';
import { THEME_COLOUR, TOKENS_STYLE } from './tokens.ts';
import { UPDATE_NOTICE_SCRIPT, UPDATE_NOTICE_STYLE } from './update-notice.ts';

export interface Page {
  /** The word key of the tab's title. */
  readonly title: string;
  /** The page's security policy, one of `html-head.ts`'s. */
  readonly policy: string;
  /** The styles of every piece the page used. Each is written once however often it is listed. */
  readonly styles: readonly string[];
  /** The scripts of every piece the page used, once each, after the content. */
  readonly scripts: readonly string[];
  /**
   * Vendored libraries, each in a `<script>` of its own and before the page's scripts. A minified UMD bundle pasted
   * into one script with other code can pick the wrong export branch and never define itself; a tag of its own is the
   * boundary a `<script src>` would have drawn.
   */
  readonly libraries?: readonly string[];
  /** How wide the content may be (guidelines §9.3): `narrow` is Settings' 780px, `list` To fix's 880px; else 1240px. */
  readonly width?: 'narrow' | 'list';
  /**
   * The sidebar and the main content, side by side. Absent, the content stands alone, centred: a page a person meets
   * before there is anything to navigate to, as the onboarding (`.ai/specs/2026-09-24-onboarding.md` W2).
   */
  readonly sidebar?: string;
  readonly main: string;
  /**
   * Whether the page updates itself while it is open (`live-pages`). Default: yes. A page that is a form worked through
   * once - the onboarding - says no, since an update would take away the answers not yet sent.
   */
  readonly live?: boolean;
  /**
   * The update notice (`nothing-updates-by-itself.md` U4), drawn over the content where the project's hooks run an older
   * release. The shell brings the pieces it is made of, so a page passes the notice and nothing else.
   */
  readonly notice?: string;
  /**
   * Windows every page of the app carries - the person's projects, opened from the sidebar's card
   * (`.ai/specs/2026-09-27-which-project.md` V11) - each with the styles and scripts it is drawn and opened with.
   */
  readonly windows?: readonly PageWindow[];
  /**
   * What stands at the head of the content, before it, with what it is drawn and worked with: the computer's choice
   * between outside projects and all (`protected-everywhere` GD21). Absent on every other page.
   */
  readonly top?: PageWindow;
}

/** A window drawn outside the page's own content, with what it needs. */
export interface PageWindow {
  readonly html: string;
  readonly styles: readonly string[];
  readonly scripts: readonly string[];
}

/** What the update notice is drawn and worked with: its window is the kit's confirmation. */
const NOTICE_STYLES: readonly string[] = [BUTTON_STYLE, POPUP_STYLE, CONFIRM_DIALOG_STYLE, UPDATE_NOTICE_STYLE];
const NOTICE_SCRIPTS: readonly string[] = [POPUP_SCRIPT, UPDATE_NOTICE_SCRIPT];

/**
 * The document every page of the new design is: head, policy, icon, the tokens, the page's own pieces' styles, the
 * background, the sidebar beside the content, and the scripts. The `js` class is set before any content, so a piece
 * that only a script can work shows its control and hides its fallback in the same paint.
 */
export function pageShell(page: Page): string {
  const windows = page.windows ?? [];
  return [
    '<!doctype html><html lang="' + DEFAULT_LANG + '" data-lang="' + DEFAULT_LANG + '"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="dark"><meta name="theme-color" content="' + THEME_COLOUR + '">',
    page.policy,
    FAVICON_LINK,
    '<title>' + translator(DEFAULT_LANG)(page.title) + '</title>',
    '<style>' + [TOKENS_STYLE, BACKDROP_STYLE, SHELL_STYLE, LIVE_STYLE, ...new Set([...page.styles, ...(page.notice === undefined ? [] : NOTICE_STYLES), ...windows.flatMap((one) => one.styles), ...(page.top?.styles ?? [])])].join('') + '</style></head>',
    '<body><script>document.documentElement.classList.add(\'js\');' + EARLY_LANGUAGE_SCRIPT + '</script>',
    backdrop(),
    // Live pages: hidden until a served page has something new to say (`live-pages` L8, L13).
    page.live === false ? '' : liveParts(),
    page.notice ?? '',
    ...windows.map((one) => one.html),
    '<div class="shell">' + (page.sidebar ?? '') + '<main class="shell-main' + (page.width === undefined ? '' : ' shell-' + page.width) + '" id="main">' + (page.top?.html ?? '') + page.main + '</main></div>',
    ...[...new Set(page.libraries ?? [])].map((library) => '<script>' + library + '</script>'),
    '<script>' + [LANGUAGE_SCRIPT, ...(page.live === false ? [] : [LIVE_SCRIPT]), ...new Set([...page.scripts, ...(page.notice === undefined ? [] : NOTICE_SCRIPTS), ...windows.flatMap((one) => one.scripts), ...(page.top?.scripts ?? [])])].join('\n') + '</script>',
    '</body></html>',
    '',
  ].join('\n');
}

const SHELL_STYLE = String.raw`
.shell{position:relative;z-index:1;min-height:100vh;display:flex}
.shell-main{flex:1;min-width:0;max-width:1240px;margin:0 auto;padding:40px 32px 96px}
.shell-narrow{max-width:780px}.shell-list{max-width:880px}
@media (max-width:860px){.shell{flex-direction:column}.shell-main{width:100%;padding:28px 16px 72px}}
`;

/** The key the chosen language is kept under, so a later page can start where this one left off. */
const LANG_STORAGE_KEY = 'agentwhy.lang';

/**
 * Folded into the `js` marker script, which runs before the sidebar and main content are parsed: the styles are
 * already known by then (the `<style>` block precedes `<body>`), so setting `data-lang` here is early enough that
 * the language picked on an earlier page applies to this one's first paint, with no separate `<script>` tag to
 * count against §7.5's "one self-contained file, one inline enhancement script".
 */
const EARLY_LANGUAGE_SCRIPT = String.raw`
(() => {
  try {
    const stored = localStorage.getItem('${LANG_STORAGE_KEY}');
    if (stored === 'pl' || stored === 'de') {
      document.documentElement.dataset.lang = stored;
      document.documentElement.lang = stored;
    }
  } catch (e) {}
})();
`;

/**
 * Switching language changes which copy is visible; attributes, which cannot hold three languages, are rewritten
 * from the one each element keeps per language. The choice is kept in storage, so the next page opened starts in
 * the same language instead of falling back to English. Where the page is served, it is also written to the
 * person's notice choices, so the line agentwhy leaves in the conversation speaks the same language
 * (`the-agent-tells-you.md` R29). Nothing waits on that write, and a page with nowhere to send it sends nothing.
 */
const LANGUAGE_SCRIPT = String.raw`
(() => {
  const select = document.getElementById('lang');
  const apply = (next) => {
    const cap = next[0].toUpperCase() + next[1];
    document.documentElement.dataset.lang = next;
    document.documentElement.lang = next;
    document.querySelectorAll('[data-label-' + next + ']').forEach((element) => {
      element.setAttribute('aria-label', element.dataset['label' + cap]);
    });
    document.querySelectorAll('[data-placeholder-' + next + ']').forEach((element) => {
      element.setAttribute('placeholder', element.dataset['placeholder' + cap]);
    });
  };
  const stored = document.documentElement.dataset.lang;
  if (stored && stored !== 'en') apply(stored);
  if (select && stored) select.value = stored;
  if (!select) return;
  select.addEventListener('change', () => {
    const next = select.value;
    apply(next);
    try { localStorage.setItem('${LANG_STORAGE_KEY}', next); } catch (e) {}
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      fetch('api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'everywhere', lang: next }) })
        .catch(() => {});
    }
  });
})();
`;
