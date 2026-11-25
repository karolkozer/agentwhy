// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { LANGS, TABLES, type Lang } from '../report-copy.ts';
import { backdrop, BACKDROP_STYLE } from '../ui/backdrop.ts';
import { BRAND_MARK } from '../ui/brand-mark.ts';
import { TOKENS_STYLE } from '../ui/tokens.ts';
import { CARD_SCRIPT } from './card-script.ts';
import { CARD_STYLE } from './card-styles.ts';

/** The words a card may need, of each language: the answers', the looks', and what a file's access and place are called. */
const NEEDED = /^(?:an\.|look\.|held\.|ch\.access\.|ch\.outside$|ch\.elsewhere$|ch\.strip\.grey$|ch\.count\.|ch\.folder\.(?:main|outside|elsewhere)$|ch\.ai$|ch\.diagram\.others|cs\.(?:outside|projects)$|st\.helper$|sb\.firstPrivate$|sb\.tag\.|sb\.(?:first|then)$|sb\.(?:said|noted)\.(?:main|helper)$)/;

/**
 * The card an app draws in the message (`2026-11-24-talking-about-agentwhy.md` CV3, CV4, CVD12): one page for every answer, with no
 * value in it - the answer is handed to it by the app - no request, and nothing of another's. Its words are the pages' own.
 */
export function cardPage(lang: Lang): string {
  // Every language: an app keeps a card, and the next answer may be in another (the chat's).
  const words = Object.fromEntries(LANGS.map((one) => [one, Object.fromEntries(Object.entries(TABLES[one]).filter(([key]) => NEEDED.test(key)))]));
  return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>agentwhy</title><style>' + TOKENS_STYLE + BACKDROP_STYLE + CARD_STYLE + '</style></head><body>' + backdrop() + '<main id="card"><div class="top"><span class="brand">' + BRAND_MARK +
    '<span>agent<em>why</em></span></span><span class="end"><span class="dim" id="where"></span><button id="larger" type="button" hidden></button></span></div><nav class="tabs" id="tabs" hidden></nav><div id="view" tabindex="0" role="region" aria-label="agentwhy"></div></main>' +
    '<script type="application/json" id="words">' + JSON.stringify(words).replace(/</g, '\\u003c') + '</script>' +
    '<script>' + CARD_SCRIPT + '</script></body></html>';
}
