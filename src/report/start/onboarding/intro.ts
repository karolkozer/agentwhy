import { inLanguages } from '../../render/report-copy.ts';

/**
 * The intro (`.ai/specs/2026-09-24-onboarding.md` W4-W6): the problem told without a technical word, in about twelve
 * seconds, as the design file's mock plays it. An illustration: fixed words, no file of the person's, nothing from the
 * model (W5). Every moment below is a CSS delay from the moment the screen is shown, so no timer runs it; the page's
 * script only moves on to the welcome at `INTRO_MS`, or at **Skip intro**. It is never drawn without a script, and never
 * under `prefers-reduced-motion` (W29).
 */

/** When the welcome takes over (W4). The last thing the intro draws fades out 0.1 s before. */
export const INTRO_MS = 12_400;

/**
 * The key the intro shows being read. Made up, and shaped so that no pattern of the redactor reads it as a secret - a
 * test says so (W5) - because a page that carried a key-shaped string would teach the reader nothing and trip the
 * tool's own checks.
 */
export const INTRO_KEY = 'KEY-4eC3-9HqL';

/** The eight files and folders, in the mock's order: the word, a folder or a file, and whether it is one the AI reads. */
const FILES: readonly { readonly word: string; readonly folder: boolean; readonly hot: boolean }[] = [
  { word: 'photos', folder: true, hot: false },
  { word: 'invoices', folder: true, hot: false },
  { word: 'passwords', folder: false, hot: true },
  { word: 'contract', folder: false, hot: false },
  { word: 'customers', folder: false, hot: true },
  { word: 'notes', folder: false, hot: false },
  { word: 'bank', folder: false, hot: true },
  { word: 'website', folder: true, hot: false },
];

/** Phase 2 starts here, and every line of the chat is placed from it (W4). */
const CHAT_AT = 3.2;

const EYE = '<svg class="ob-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
  '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

export function introScreen(): string {
  const chips = FILES.map((file, at) =>
    '<span class="ob-chip' + (file.hot ? ' ob-chip-hot' : '') + '" style="--d:' + seconds(0.15 + at * 0.1) +
    (file.hot ? ';--lit:' + seconds(1.3 + 0.3 + at * 0.12) : '') + '">' +
    (file.hot ? '<span class="ob-ping" aria-hidden="true"></span>' : '') +
    '<span class="ob-chip-icon ' + (file.folder ? 'ob-chip-folder' : 'ob-chip-file') + '" aria-hidden="true"></span>' +
    inLanguages((t) => t('ob.intro.' + file.word)) + '</span>').join('');

  const row = (who: 'you' | 'ai', text: string, at: number): string =>
    '<div class="ob-chat-row ob-chat-' + who + '" style="--d:' + seconds(CHAT_AT + at) + '">' +
    (who === 'ai' ? '<span class="ob-av ob-av-ai" aria-hidden="true">AI</span>' : '') +
    '<div class="ob-chat-say"><div class="ob-chat-who">' + inLanguages((t) => t('ob.intro.' + who)) + '</div>' +
    '<div class="ob-bubble">' + text + '</div></div>' +
    (who === 'you' ? '<span class="ob-av" aria-hidden="true">' + inLanguages((t) => t('ob.intro.you')) + '</span>' : '') + '</div>';

  return '<section class="ob-screen ob-intro" data-ob-screen="intro" hidden' + ' aria-label="agentwhy">' +
    '<div class="ob-intro-stage">' +
    '<div class="ob-intro-files">' +
    '<div class="ob-intro-working"><span class="ob-intro-dot" aria-hidden="true"></span>' +
    '<span class="ob-intro-type">' + inLanguages((t) => t('ob.intro.working')) + '</span></div>' +
    '<div class="ob-chips"><span class="ob-beam" aria-hidden="true"></span>' + chips + '</div></div>' +
    '<div class="ob-intro-chat">' +
    row('you', inLanguages((t) => t('ob.intro.ask')), 0.5) +
    row('ai', inLanguages((t) => t('ob.intro.sure')), 1.4) +
    '<div class="ob-hidden-part" style="--d:' + seconds(CHAT_AT + 2.5) + '">' +
    '<div class="ob-hidden-head">' + EYE + inLanguages((t) => t('ob.intro.hidden')) + '</div>' +
    '<div class="ob-bubble ob-bubble-hot" style="--d:' + seconds(CHAT_AT + 3) + '">' + inLanguages((t) => t('ob.intro.opening')) + '</div>' +
    '<div class="ob-bubble ob-bubble-hot" style="--d:' + seconds(CHAT_AT + 4) + '">' +
    inLanguages((t) => t('ob.intro.reading', { key: '<span class="ob-key">' + INTRO_KEY + '</span>' })) + '</div></div>' +
    row('ai', inLanguages((t) => t('ob.intro.done')), 5.2) +
    '<p class="ob-nobody" style="--d:' + seconds(CHAT_AT + 6) + '">' + inLanguages((t) => t('ob.intro.nobody')) + '</p>' +
    '</div></div></section>';
}

function seconds(value: number): string {
  return Number(value.toFixed(2)) + 's';
}

/** The intro's own look. Colours come from the tokens only. */
export const INTRO_STYLE = String.raw`
.ob-intro{position:relative;width:100%;max-width:900px;margin:0 auto;height:calc(100vh - 150px);min-height:360px}
.ob-intro-stage{position:absolute;inset:0;display:grid;place-items:center;animation:obOut .8s ease-in 11.5s forwards}
.ob-intro-files,.ob-intro-chat{grid-area:1/1;display:flex;flex-direction:column;align-items:center;gap:22px;width:100%}
.ob-intro-files{animation:obOut .6s ease-in 3.2s forwards}
.ob-intro-working{display:flex;align-items:center;gap:10px;font-size:15px;color:var(--text-2);animation:obIn .5s ease-out both}
.ob-intro-dot{width:8px;height:8px;border-radius:50%;background:var(--mint);animation:obTwinkle 1s ease-in-out infinite}
.ob-intro-type{display:inline-block;overflow:hidden;white-space:nowrap;animation:obType 1.2s steps(36) both}
.ob-chips{position:relative;display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:720px;padding:16px 20px;border-radius:18px;background:var(--card);border:1px solid var(--white-08);overflow:hidden}
.ob-beam{position:absolute;top:0;bottom:0;left:-10%;width:80px;opacity:0;background:linear-gradient(90deg,transparent,var(--coral-35),transparent);animation:obBeam 1.4s ease-in-out 1.3s}
.ob-chip{position:relative;display:inline-flex;align-items:center;gap:7px;font-size:14.5px;font-weight:500;color:var(--text);padding:6px 11px;border-radius:8px;border:1px solid var(--white-12);background:var(--panel);animation:obIn .4s ease-out var(--d) both}
.ob-chip-hot{animation:obIn .4s ease-out var(--d) both,obLit .4s ease var(--lit) forwards}
.ob-chip-icon{flex:none;width:14px;height:14px;border-radius:3px}
.ob-chip-file{border:1.5px solid var(--white-40)}
.ob-chip-folder{height:11px;border-radius:2px 4px 3px 3px;background:var(--amber-35)}
.ob-ping{position:absolute;right:-4px;top:-4px;width:9px;height:9px;border-radius:50%;background:var(--coral);opacity:0;animation:obPing 1.4s ease-out var(--lit) infinite}
.ob-intro-chat{max-width:600px;gap:16px;padding:0 20px;align-items:stretch}
.ob-chat-row{display:flex;gap:12px;align-items:flex-start;animation:obIn .5s ease-out var(--d) both}
.ob-chat-you{justify-content:flex-end;text-align:right}
.ob-chat-say{min-width:0}
.ob-chat-who{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-3);margin-bottom:6px}
.ob-av{flex:none;width:34px;height:34px;border-radius:50%;border:1px solid var(--white-14);background:var(--raised);color:var(--text-soft);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.ob-av-ai{color:var(--text-soft)}
.ob-bubble{display:inline-block;background:var(--raised);border:1px solid var(--white-10);border-radius:16px;padding:12px 16px;font-size:17px;line-height:1.45;color:var(--text);text-align:left}
.ob-hidden-part{display:flex;flex-direction:column;gap:12px;align-items:flex-start;border-radius:16px;border:1.5px dashed var(--coral-50);background:var(--coral-05);padding:16px 16px 18px;animation:obIn .6s ease-out var(--d) both}
.ob-hidden-head{display:flex;align-items:center;gap:9px;font-size:13.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--coral-text)}
.ob-eye{width:20px;height:20px;flex:none}
.ob-bubble-hot{background:var(--coral-08);border-color:var(--coral-35);animation:obIn .5s ease-out var(--d) both}
.ob-bubble-hot strong{color:var(--coral-text)}
.ob-key{font-family:var(--mono);font-size:15.5px;color:var(--coral-text);background:var(--coral-14);border:1px solid var(--coral-45);border-radius:6px;padding:1px 7px;white-space:nowrap}
.ob-nobody{margin:6px 0 0;text-align:center;font-size:19px;font-weight:600;color:var(--text);animation:obIn .6s ease-out var(--d) both}
@media (max-height:820px){.ob-intro-chat{transform:scale(.85)}}
@media (max-height:700px){.ob-intro-chat{transform:scale(.72)}}
@media (max-height:600px){.ob-intro-chat{transform:scale(.6)}}
@media (max-width:640px){.ob-bubble{font-size:15px}.ob-key{font-size:13.5px}.ob-chip{font-size:13px}}
`;
