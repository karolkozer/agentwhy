// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator } from '../report-copy.ts';
import { closeButton, pill } from './button.ts';
import { CLOSES, popup } from './popup.ts';

/**
 * "Add private files" (`for-people-who-build-with-ai.md` F35, F36; guidelines §9.2): two large cards, *Choose files* and
 * *Choose a folder*, a zone that takes files and folders dropped together, and "Or type a name". Settings opens it, and
 * the onboarding's step 2 (`.ai/specs/2026-09-24-onboarding.md` W12) and computer step, which is why it is in the kit.
 *
 * `2026-10-07-several-at-once.md` AS1-AS5: every pick, drop and typed name joins a list in the window, and **Continue**
 * hands the whole list to the page at once, as an `add-files` event on the window, `{ files: [{ name, kind, pattern }] }`.
 * What happens then is the page's: Settings asks to confirm, the onboarding adds a row for each.
 *
 * A picked or dropped item gives its name and nothing else: the page never reads its contents - no `FileReader`, no
 * upload; a file's `name`, a folder's first segment of `webkitRelativePath`, and a dropped entry's `name` and whether it
 * is a folder are all the script touches (F36). The name becomes the pattern a deny rule will hold - a file anywhere by
 * that name, or a folder's contents. A name that cannot be written exactly is refused here, in words (R46).
 *
 * Its words are Settings' (`set.add.*`): one popup, one set of words, whichever page opens it.
 *
 * `2026-10-09-the-file-not-its-name.md` FN3, FN4: with `locate`, a project's window - Settings' and the onboarding's step
 * 2 - looks for each picked name in the project before handing it over, through `ADD_LOCATE_SCRIPT`, and hands over the
 * path: a name alone held every file of it (FNB1). Where a name is in more than one place the window asks which.
 */
export interface AddFileOptions {
  readonly locate?: boolean;
  /**
   * FN12 (FND8, FNB22): the server can open the system's own file window for this project, so the picks ask it
   * (`ADD_PLACE_SCRIPT`) and a chosen file arrives as its path - never asked *Which one?* again. A drop and a typed
   * name keep the browser's road and the asking, as does a page whose window did not open.
   */
  readonly window?: boolean;
}

/**
 * `2026-10-13-a-window-slow-to-open.md` WN3: what is said under the cards once the system's window has been waited for
 * three seconds (`ADD_PLACE_SCRIPT`) - drawn hidden, in each language, naming the other way this window has. It holds
 * while the system is still making its window and while the person is choosing in it: the page cannot tell the two
 * apart (WND2), so it is a sentence and never a loader.
 */
function waitingLine(words: string): string {
  return '<p class="af-note af-waiting" data-af-waiting role="status" hidden>' + inLanguages((t) => t(words)) + '</p>';
}

export function addFilePopup(id: string, places?: 'both' | 'separate' | 'typed', options: AddFileOptions = {}): string {
  if (places !== undefined) return addPlacePopup(id, places);
  const title = id + '-title';
  const say = (key: string): string => inLanguages((t) => t(key));
  // FN12: with the system's window, a pick asks the server for it (`data-af-place`, as the computer's page asks);
  // without it, the browser's own file input (`data-af-pick`).
  const pickAsks = (kind: 'file' | 'folder'): string =>
    options.window === true ? 'data-af-place="' + (kind === 'file' ? 'files' : 'folder') + '"' : 'data-af-pick="' + kind + '"';
  const pick = (kind: 'file' | 'folder', glyph: string, how: string): string =>
    '<button type="button" class="af-pick" ' + pickAsks(kind) + '>' +
    '<span class="af-pick-mark" aria-hidden="true">' + glyph + '</span>' +
    '<span class="af-pick-name">' + say('set.add.' + kind) + '</span>' +
    '<span class="af-pick-eg">' + say('set.add.' + kind + '.eg') + '</span>' +
    '<span class="af-pick-how">' + how + '</span></button>';
  // AS1: how to pick several, for the system the page is on - the script shows the one that fits.
  const keys = '<span data-af-keys="mac" hidden>' + say('set.add.file.mac') + '</span>' +
    '<span data-af-keys="other">' + say('set.add.file.other') + '</span>';

  return popup({
    id,
    size: 'pick',
    labelledBy: title,
    body: '<div class="af" data-af' + (options.locate === true ? ' data-af-locate' : '') + '><div data-af-start>' +
      '<div class="af-head"><h3 class="af-title" id="' + title + '">' + say('set.add.title') + '</h3>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
      '<p class="af-lead">' + say('set.add.lead') + '</p>' +
      '<div class="af-picks js-only">' + pick('file', '▤', keys) + pick('folder', '▦', say('set.add.folder.one')) + '</div>' +
      (options.window === true ? waitingLine('set.add.waiting') : '') +
      '<input type="file" class="af-file" data-af-file="file" multiple hidden tabindex="-1" aria-hidden="true">' +
      '<input type="file" class="af-file" data-af-file="folder" webkitdirectory directory hidden tabindex="-1" aria-hidden="true">' +
      // AS3: files and folders dropped together, read by name alone.
      '<div class="af-drop js-only" data-af-drop><span class="af-drop-mark" aria-hidden="true">⇣</span>' +
      '<span class="af-drop-text" data-af-drop-idle><strong>' + say('set.add.drop') + '</strong> ' + say('set.add.drop.more') + '</span>' +
      '<span class="af-drop-text" data-af-drop-over hidden><strong>' + say('set.add.drop.over') + '</strong></span></div>' +
      // AS4: what is chosen, gathered here before anything is handed over.
      '<div class="af-chosen" data-af-chosen hidden><div class="af-chosen-head">' +
      '<span class="af-chosen-title">' + say('set.add.chosen') + ' <span class="af-count" data-af-count>0</span></span>' +
      '<button type="button" class="af-clear" data-af-clear>' + say('set.add.clear') + '</button></div>' +
      '<div class="af-chips" data-af-chips></div>' +
      '<template data-af-chip><span class="af-chip"><span class="af-chip-mark" aria-hidden="true"></span><span class="af-chip-name"></span>' +
      '<button type="button" class="af-chip-x" data-af-unpick' + labelAttributes((t) => e(t('set.add.remove'))) + '>×</button></span></template></div>' +
      '<p class="af-cannot" data-af-cannot hidden>' + say('set.add.cannot') + '</p>' +
      // FN12: what the window could not do, in the server's words; and a place picked outside this project, said with
      // FN4's sentence - the file is not here, and a file elsewhere is the computer page's.
      (options.window === true
        ? '<p class="af-cannot" data-af-said hidden></p>' +
          '<p class="af-note af-missing" data-af-outside hidden>' + inLanguages((t) => t('set.add.which.none', { name: '<code class="af-code" data-af-fill="name"></code>' })) + '</p>'
        : '') +
      '<div class="af-foot" data-af-foot hidden>' +
      pill({ label: say('app.cancel'), tone: 'outline', size: 'lg', button: true, attributes: CLOSES }) +
      pill({ label: say('set.add.continue'), tone: 'light', size: 'lg', button: true, attributes: ' data-af-continue' }) +
      '</div></div>' + (options.locate === true ? whichPanel() : '') + '</div>',
  });
}

/**
 * FN4: the window's second face, *Which `exercise.py`?* - drawn once here and filled by the script from what the server
 * answered, every sentence in each language with slots the script fills as text. Nothing is ticked for the person; the
 * project's own paths are listed and a tool's folded under one line (FND3); the rule for every file of the name comes
 * last, unticked. A name the project does not hold is said so, with where a file elsewhere is added (the computer's page).
 */
function whichPanel(): string {
  const say = (key: string, vars: Readonly<Record<string, string>> = {}): string => inLanguages((t) => t(key, vars));
  const name = '<code class="af-code" data-af-fill="name"></code>';
  const n = '<span data-af-fill="n"></span>';
  const forKind = (key: string, vars: Readonly<Record<string, string>>): string =>
    '<span data-af-for="file">' + say(key + '.file', vars) + '</span><span data-af-for="folder" hidden>' + say(key + '.folder', vars) + '</span>';
  return '<div class="af-which" data-af-which hidden>' +
    '<div class="af-head"><h3 class="af-title"><span data-af-title="ask">' + say('set.add.which.title') + '</span>' +
    '<span data-af-title="none" hidden>' + say('set.add.which.titleNone') + '</span></h3>' +
    closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
    '<p class="af-lead" data-af-which-lead>' + say('set.add.which.lead') + '</p>' +
    '<p class="af-cannot" data-af-failed hidden>' + say('set.add.which.failed') + '</p>' +
    '<div class="af-groups" data-af-groups></div>' +
    '<template data-af-group-row><fieldset class="af-group" data-af-group><legend class="af-group-q">' + forKind('set.add.which', { name }) + '</legend>' +
    '<div class="af-opts" data-af-opts></div>' +
    '<details class="af-tools" data-af-tools hidden><summary>' + say('set.add.which.tools', { n }) + '</summary><div class="af-opts" data-af-tool-opts></div></details>' +
    '<label class="af-opt af-every"><input type="checkbox" data-af-every><span>' +
    '<span data-af-every-said="counted">' + forKind('set.add.which.every', { name, n }) + '</span>' +
    '<span data-af-every-said="any" hidden>' + forKind('set.add.which.everyAny', { name }) + '</span></span></label>' +
    '<p class="af-note" data-af-partial hidden>' + say('set.add.which.partial') + '</p>' +
    '</fieldset></template>' +
    '<template data-af-missing><p class="af-note af-missing">' + say('set.add.which.none', { name }) + '</p></template>' +
    '<template data-af-opt><label class="af-opt"><input type="checkbox" data-af-path><code class="af-opt-path"></code></label></template>' +
    '<div class="af-foot">' +
    pill({ label: say('set.add.back'), tone: 'outline', size: 'lg', button: true, attributes: ' data-af-back' }) +
    pill({ label: say('set.add.continue'), tone: 'light', size: 'lg', button: true, attributes: ' data-af-which-go disabled' }) +
    '</div></div>';
}

/**
 * `2026-10-07-a-file-in-its-place.md` IP1, IP2, IPD2: the same window on the computer's page, where a rule names a place.
 * The browser's own window gives a name only, so the system's is opened through the server (`ADD_PLACE_SCRIPT`): on a Mac
 * one card for files and folders together, on Windows one for each; where neither is known, only a typed place. Nothing
 * is dropped here - a drop gives a name too - and a typed name alone is refused, pointing to a project's Settings.
 */
function addPlacePopup(id: string, places: 'both' | 'separate' | 'typed'): string {
  const title = id + '-title';
  const say = (key: string): string => inLanguages((t) => t(key));
  const placeholder = (lang: (typeof LANGS)[number]): string => e(translator(lang)('set.add.placePlaceholder'));
  const pick = (kind: 'both' | 'files' | 'folder', glyph: string, words: string): string =>
    '<button type="button" class="af-pick" data-af-place="' + kind + '">' +
    '<span class="af-pick-mark" aria-hidden="true">' + glyph + '</span>' +
    '<span class="af-pick-name">' + say(words) + '</span>' +
    '<span class="af-pick-eg">' + say(words + '.eg') + '</span></button>';
  const picks = places === 'both' ? '<div class="af-picks af-picks-one js-only">' + pick('both', '▤', 'set.add.places') + '</div>'
    : places === 'separate' ? '<div class="af-picks js-only">' + pick('files', '▤', 'set.add.placesFiles') + pick('folder', '▦', 'set.add.placesFolder') + '</div>'
      : '';
  return popup({
    id,
    size: 'pick',
    labelledBy: title,
    body: '<div class="af" data-af data-af-places>' +
      '<div class="af-head"><h3 class="af-title" id="' + title + '">' + say('set.add.title') + '</h3>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
      '<p class="af-lead">' + say('set.add.placesLead') + '</p>' + picks + (picks === '' ? '' : waitingLine('set.add.waiting.place')) +
      '<p class="af-cannot" data-af-said role="alert" hidden></p>' +
      '<div class="af-chosen" data-af-chosen hidden><div class="af-chosen-head">' +
      '<span class="af-chosen-title">' + say('set.add.chosen') + ' <span class="af-count" data-af-count>0</span></span>' +
      '<button type="button" class="af-clear" data-af-clear>' + say('set.add.clear') + '</button></div>' +
      '<div class="af-chips" data-af-chips></div>' +
      '<template data-af-chip><span class="af-chip"><span class="af-chip-mark" aria-hidden="true"></span><span class="af-chip-name"></span>' +
      '<button type="button" class="af-chip-x" data-af-unpick' + labelAttributes((t) => e(t('set.add.remove'))) + '>×</button></span></template></div>' +
      '<div class="af-type-label">' + say('set.add.typePlace') + '</div>' +
      '<form class="af-type" data-af-type>' +
      '<input class="af-type-input" name="name" autocomplete="off" placeholder="' + placeholder('en') + '"' +
      LANGS.map((lang) => ' data-placeholder-' + lang + '="' + placeholder(lang) + '"').join('') +
      labelAttributes((t) => e(t('set.add.typePlace'))) + '>' +
      pill({ label: say('set.add.go'), tone: 'light', size: 'task', attributes: ' data-af-type-go', button: true }) +
      '</form>' +
      '<p class="af-cannot" data-af-cannot hidden>' + say('set.add.cannot') + '</p>' +
      '<p class="af-cannot" data-af-notplace hidden>' + say('set.add.notAPlace') + '</p>' +
      '<div class="af-foot" data-af-foot hidden>' +
      pill({ label: say('app.cancel'), tone: 'outline', size: 'lg', button: true, attributes: CLOSES }) +
      pill({ label: say('set.add.continue'), tone: 'light', size: 'lg', button: true, attributes: ' data-af-continue' }) +
      '</div></div>',
  });
}

export const ADD_FILE_POPUP_STYLE = String.raw`
.af{padding:28px}
.af-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px}
.af-title{margin:0;font-size:22px;line-height:1.25;font-weight:650}
.af-lead{margin:0 0 20px;font-size:15px;line-height:1.55;color:var(--text-2)}
.af-picks{grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.js .af-picks.af-picks-one{grid-template-columns:1fr}
.af-pick[aria-busy="true"]{opacity:.6;pointer-events:none}
.af-pick[data-af-opening]{opacity:1}
.af-pick[data-af-opening] .af-pick-mark{font-size:0}
.af-pick[data-af-opening] .af-pick-mark::before{content:"";width:18px;height:18px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:pillSpin .8s linear infinite}
@media (prefers-reduced-motion:reduce){.af-pick[data-af-opening] .af-pick-mark::before{animation:none;border-right-color:currentColor;opacity:.5}}
.js .af-picks{display:grid}
.af-pick{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 16px;border-radius:14px;background:var(--panel);border:1px solid var(--white-12);color:inherit;font:inherit;cursor:pointer;text-align:center}
.af-pick:hover{border-color:var(--coral)}
.af-pick-mark{width:44px;height:44px;border-radius:12px;background:var(--coral-12);color:var(--coral-text);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}
.af-pick-name{font-size:15.5px;font-weight:600}
.af-pick-eg{font-size:13px;color:var(--text-2)}
.af-pick-how{font-size:12px;color:var(--text-3)}
.af-drop{align-items:center;gap:14px;padding:16px 18px;margin-bottom:18px;border-radius:14px;border:1.5px dashed var(--white-18);color:var(--text-2);font-size:14px;line-height:1.45;transition:border-color .15s,background .15s}
.js .af-drop{display:flex}
.af-drop strong{color:var(--text);font-weight:600}
.af-drop-mark{width:36px;height:36px;flex:none;border-radius:10px;background:var(--white-06);color:var(--text-2);display:flex;align-items:center;justify-content:center;font-size:16px}
.af-drop.af-over{border-color:var(--coral);background:var(--coral-06);color:var(--text)}
.af-drop.af-over .af-drop-mark{background:var(--coral-12);color:var(--coral-text)}
.af-chosen{margin:0 0 18px;padding:14px 16px;border-radius:14px;background:var(--panel);border:1px solid var(--white-10)}
.af-chosen-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px}
.af-chosen-title{font-size:14px;font-weight:600}
.af-count{display:inline-block;min-width:22px;padding:1px 7px;margin-left:4px;border-radius:999px;background:var(--white-10);font-size:12.5px;text-align:center}
.af-clear{font:inherit;font-size:13px;color:var(--text-3);background:none;border:0;cursor:pointer;padding:0}
.af-clear:hover{color:var(--text)}
.af-chips{display:flex;flex-wrap:wrap;gap:8px;max-height:132px;overflow:auto}
.af-chip{display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:5px 5px 5px 10px;border-radius:999px;background:var(--white-06);border:1px solid var(--white-10);font-size:13px}
.af-chip-mark{color:var(--text-3);font-size:12px}
.af-chip-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mono);font-size:12.5px}
.af-chip-x{width:24px;height:24px;flex:none;border-radius:50%;border:0;background:transparent;color:var(--text-3);cursor:pointer;font-size:15px;line-height:1}
.af-chip-x:hover{background:var(--white-10);color:var(--text)}
.af-type-label{font-size:13px;color:var(--text-3);margin-bottom:8px}
.af-type{display:flex;gap:10px}
.af-type-input{flex:1;min-width:0;background:var(--panel);border:1px solid var(--white-12);border-radius:999px;padding:10px 16px;color:var(--text);font:inherit;font-size:14px;outline:none}
.af-type-input:focus-visible{border-color:var(--coral-50)}
.af-type .pill{padding:10px 20px}
.af-cannot{margin:14px 0 0;font-size:14px;line-height:1.5;color:var(--coral-text)}
.af-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.af-which .af-cannot{margin:0 0 14px}
.af-groups{display:flex;flex-direction:column;gap:12px;max-height:56vh;overflow:auto}
.af-group{margin:0;padding:14px 16px;min-width:0;border-radius:14px;background:var(--panel);border:1px solid var(--white-10)}
.af-group-q{float:left;width:100%;padding:0;margin-bottom:8px;font-size:15px;font-weight:600}
.af-group-q + *{clear:both}
.af-code{font-family:var(--mono);font-size:13px;font-weight:500}
.af-opts{display:flex;flex-direction:column}
.af-opt{display:flex;align-items:flex-start;gap:10px;padding:7px 2px;min-width:0;font-size:14px;line-height:1.45;cursor:pointer}
.af-opt input{flex:none;width:16px;height:16px;margin:2px 0 0;accent-color:var(--text);cursor:pointer}
.af-opt-path{min-width:0;font-family:var(--mono);font-size:12.5px;overflow-wrap:anywhere}
.af-tools{margin-top:4px;font-size:13.5px;color:var(--text-2)}
.af-tools summary{padding:6px 2px;cursor:pointer}
.af-every{margin-top:8px;padding-top:12px;border-top:1px solid var(--white-10);color:var(--text-2)}
.af-note{margin:10px 0 0;font-size:13.5px;line-height:1.5;color:var(--text-2)}
.af-missing{margin:0;padding:12px 16px;border-radius:14px;border:1px dashed var(--white-18)}
.af-waiting{margin:0 0 12px}
.af [data-af-which-go][disabled]{opacity:.45;cursor:default;pointer-events:none}
@media (max-width:640px){.js .af-picks{grid-template-columns:1fr}.af-foot{flex-direction:column-reverse}.af-foot .pill{width:100%;justify-content:center}}
`;

/**
 * A name becomes the pattern (F36): a file anywhere by that name, or a folder's contents. A picked name holding a
 * wildcard would protect other files than the one picked, and a bracket cannot be written in a deny rule at all (R46),
 * so such a name is refused here, in words, rather than escaped by a guess. A typed name with a slash or a wildcard is
 * taken as the pattern it already is.
 */
export const ADD_FILE_POPUP_SCRIPT = String.raw`
(() => {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  document.querySelectorAll('[data-af]').forEach((root) => {
    const window_ = root.closest('dialog');
    const cannot = root.querySelector('[data-af-cannot]');
    if (!window_) return;
    root.querySelectorAll('[data-af-keys]').forEach((slot) => { slot.hidden = (slot.dataset.afKeys === 'mac') !== mac; });
    const box = root.querySelector('[data-af-chosen]');
    const chips = root.querySelector('[data-af-chips]');
    const chip = root.querySelector('[data-af-chip]');
    const foot = root.querySelector('[data-af-foot]');
    let chosen = [];

    const draw = () => {
      chips.replaceChildren(...chosen.map((item, at) => {
        const one = chip.content.firstElementChild.cloneNode(true);
        one.querySelector('.af-chip-mark').textContent = item.kind === 'folder' ? '▦' : '▤';
        const name = one.querySelector('.af-chip-name');
        name.textContent = item.kind === 'folder' ? item.name + '/' : item.name;
        name.title = item.pattern;
        one.querySelector('[data-af-unpick]').dataset.afUnpick = String(at);
        return one;
      }));
      root.querySelector('[data-af-count]').textContent = String(chosen.length);
      box.hidden = chosen.length === 0;
      foot.hidden = chosen.length === 0;
    };

    const placesMode = root.hasAttribute('data-af-places');
    const notPlace = root.querySelector('[data-af-notplace]');
    /** Each item joins the list once; a name that cannot be written exactly is said, and left out (R46). */
    const gather = (items) => {
      let refused = false;
      for (const item of items) {
        const { name, kind } = item;
        if (!name) continue;
        // IP1: a place comes with the pattern it is written as; its path is held to R46 as a name is.
        const exact = item.pattern === undefined ? name : item.pattern.replace(/\/\*\*$/, '');
        if (/[()]/.test(exact) || (kind !== 'pattern' && /[*?[\]{}]/.test(exact))) { refused = true; continue; }
        const pattern = item.pattern !== undefined ? item.pattern : kind === 'file' ? '**/' + name : kind === 'folder' ? '**/' + name + '/**' : name;
        if (!chosen.some((item) => item.pattern === pattern)) chosen.push({ name, kind, pattern, ...(item.inside ? { inside: item.inside } : {}) });
      }
      if (cannot) cannot.hidden = !refused;
      draw();
    };

    // the-file-not-its-name FN3, FN4: on a project's page a name is looked for before it is handed over - by
    // ADD_LOCATE_SCRIPT, which alone asks the server - and handed over as the path it is at. Where it is in more than one
    // place, the window's second face asks which; nothing is ticked for the person.
    const locating = root.hasAttribute('data-af-locate');
    const start = root.querySelector('[data-af-start]');
    const which = root.querySelector('[data-af-which]');
    let asked = [];
    let settled = [];
    let pending = [];
    const hand = (files) => {
      if (window_.open) window_.close();
      window_.dispatchEvent(new CustomEvent('add-files', { detail: { files } }));
    };
    const face = (second) => { if (start) start.hidden = second; if (which) which.hidden = !second; };
    const fill = (node, values) => Object.keys(values).forEach((key) => node.querySelectorAll('[data-af-fill="' + key + '"]').forEach((slot) => { slot.textContent = values[key]; }));
    /** What is looked for: a picked, dropped or typed name; a typed path by its last name, kept to that path. */
    const queryOf = (item) => {
      // FN12: a pick the system's window already placed is its path - nothing to look for, nothing to ask.
      if (item.pattern !== undefined && /^\.\//.test(item.pattern)) return undefined;
      if (item.kind === 'file' || item.kind === 'folder') return { name: item.name, kind: item.kind, ...(item.inside ? { inside: item.inside } : {}) };
      const path = item.name.replace(/^\.\//, '').replace(/\/+$/, '');
      if (/[*?[\]{}]/.test(path) || !path.includes('/')) return undefined;
      return { name: path.split('/').pop(), kind: item.name.endsWith('/') ? 'folder' : 'file', want: path };
    };
    const ask = (files) => {
      asked = files.map((item) => ({ item, query: queryOf(item) }));
      const picks = asked.filter((one) => one.query).map((one) => ({ name: one.query.name, kind: one.query.kind, ...(one.query.inside ? { inside: one.query.inside } : {}) }));
      if (picks.length === 0) { hand(files); return; }
      const go = root.querySelector('[data-af-continue]');
      if (go) go.setAttribute('aria-busy', 'true');
      window_.dispatchEvent(new CustomEvent('af-locate', { detail: { picks } }));
    };
    const check = () => {
      const go = root.querySelector('[data-af-which-go]');
      if (!go) return;
      const answered = [...root.querySelectorAll('[data-af-groups] [data-af-group]')].every((node) => node.querySelector('input:checked'));
      go.disabled = !answered || (pending.length === 0 && settled.length === 0);
    };
    const drawWhich = (groups, missing, failed) => {
      const list = root.querySelector('[data-af-groups]');
      const row = (name) => root.querySelector('[' + name + ']').content.firstElementChild.cloneNode(true);
      const nodes = missing.map((name) => { const note = row('data-af-missing'); fill(note, { name }); return note; });
      groups.forEach((group, at) => {
        const node = row('data-af-group-row');
        node.dataset.afGroup = String(at);
        node.querySelectorAll('[data-af-for]').forEach((slot) => { slot.hidden = slot.dataset.afFor !== group.query.kind; });
        fill(node, { name: group.query.name, n: String(group.count) });
        node.querySelectorAll('[data-af-every-said]').forEach((slot) => { slot.hidden = (slot.dataset.afEverySaid === 'any') !== (group.partial || failed); });
        const option = (one) => {
          const choice = row('data-af-opt');
          choice.querySelector('[data-af-path]').value = one.path;
          choice.querySelector('.af-opt-path').textContent = group.query.kind === 'folder' ? one.path + '/' : one.path;
          return choice;
        };
        node.querySelector('[data-af-opts]').replaceChildren(...group.paths.filter((one) => !one.tool).map(option));
        const tools = group.paths.filter((one) => one.tool);
        const fold = node.querySelector('[data-af-tools]');
        fold.hidden = tools.length === 0;
        fill(fold, { n: String(tools.length) });
        fold.querySelector('[data-af-tool-opts]').replaceChildren(...tools.map(option));
        node.querySelector('[data-af-partial]').hidden = !group.partial || failed;
        nodes.push(node);
      });
      list.replaceChildren(...nodes);
      root.querySelector('[data-af-failed]').hidden = !failed;
      root.querySelector('[data-af-which-lead]').hidden = groups.length === 0;
      // Nothing to choose from - only names the project does not hold - is said as that, not asked as a choice.
      root.querySelectorAll('[data-af-title]').forEach((slot) => { slot.hidden = (slot.dataset.afTitle === 'none') !== (groups.length === 0); });
      pending = groups;
      face(true);
      check();
    };
    // FN4: what the server answered, one result per name looked for, in the order asked - or that it could not answer.
    window_.addEventListener('af-located', (event) => {
      const go = root.querySelector('[data-af-continue]');
      if (go) go.removeAttribute('aria-busy');
      const results = event.detail && Array.isArray(event.detail.results) ? event.detail.results : undefined;
      const groups = [];
      const missing = [];
      let at = 0;
      settled = [];
      for (const { item, query } of asked) {
        if (!query) { settled.push(item); continue; }
        const result = results ? results[at] : undefined;
        at += 1;
        const all = result ? result.paths : [];
        const paths = query.want === undefined ? all : all.filter((one) => one.path === query.want);
        const suffix = query.kind === 'folder' ? '/**' : '';
        const exact = (path) => ({ name: path, kind: query.kind, pattern: './' + path + suffix });
        const complete = result !== undefined && result.complete === true;
        if (paths.length === 1 && (complete || query.want !== undefined)) { settled.push(exact(paths[0].path)); continue; }
        // A typed path is what the person wrote: kept where the project could not be looked through in full, or at all.
        if (query.want !== undefined && !complete) { settled.push(exact(query.want)); continue; }
        if (paths.length === 0 && complete) { missing.push(query.want || query.name); continue; }
        groups.push({ query, paths, count: all.length, partial: !complete, exact, every: { name: query.name, kind: query.kind, pattern: '**/' + query.name + suffix } });
      }
      if (groups.length === 0 && missing.length === 0) { hand(settled); return; }
      drawWhich(groups, missing, results === undefined);
    });
    if (which) which.addEventListener('change', check);
    const reset = () => {
      chosen = []; if (cannot) cannot.hidden = true; if (notPlace) notPlace.hidden = true;
      ['[data-af-said]', '[data-af-outside]'].forEach((name) => { const note = root.querySelector(name); if (note) note.hidden = true; });
      asked = []; settled = []; pending = []; face(false);
      draw();
    };
    // IP2: the places the system's window answered, handed here by ADD_PLACE_SCRIPT, which alone asks the server.
    // FN12: on a project's page they arrive as ./-paths and join the list; what was picked outside the project is
    // named and said not to be in it.
    window_.addEventListener('af-places', (event) => {
      gather((event.detail && event.detail.places) || []);
      const beyond = root.querySelector('[data-af-outside]');
      if (!beyond) return;
      const names = (event.detail && event.detail.outside) || [];
      beyond.hidden = names.length === 0;
      fill(beyond, { name: names.join(', ') });
    });
    window_.addEventListener('close', reset);

    root.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-af-pick]');
      if (pick) {
        const input = root.querySelector('[data-af-file="' + pick.dataset.afPick + '"]');
        if (input) input.click();
        return;
      }
      const unpick = event.target.closest('[data-af-unpick]');
      if (unpick) { chosen.splice(Number(unpick.dataset.afUnpick), 1); draw(); return; }
      if (event.target.closest('[data-af-clear]')) { reset(); return; }
      if (event.target.closest('[data-af-continue]')) {
        // AS5: the whole list, handed over at once; the page decides what to do with it. FN3: on a project's page each
        // name is first looked for, and handed over as where it is.
        const files = chosen.slice();
        if (files.length === 0) return;
        if (locating) { ask(files); return; }
        hand(files);
        return;
      }
      if (event.target.closest('[data-af-back]')) { face(false); return; }
      if (event.target.closest('[data-af-which-go]')) {
        // FN4: what was settled without asking, and in each group the paths ticked - or every file of the name.
        const files = settled.slice();
        root.querySelectorAll('[data-af-groups] [data-af-group]').forEach((node) => {
          const group = pending[Number(node.dataset.afGroup)];
          if (!group) return;
          if (node.querySelector('[data-af-every]').checked) { files.push(group.every); return; }
          node.querySelectorAll('[data-af-path]:checked').forEach((box) => files.push(group.exact(box.value)));
        });
        if (files.length > 0) hand(files);
        return;
      }
      if (event.target.closest('[data-af-type-go]')) {
        const form = event.target.closest('form');
        if (form) form.requestSubmit();
      }
    });

    root.querySelectorAll('[data-af-file]').forEach((input) => input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.value = '';
      if (files.length === 0) return;
      // FN4: a folder's names inside it, as webkitRelativePath gives them below its own - names, never a file opened.
      gather(input.dataset.afFile === 'folder'
        ? [{ name: (files[0].webkitRelativePath || '').split('/')[0], kind: 'folder',
          inside: files.slice(0, 2000).map((file) => (file.webkitRelativePath || '').split('/').slice(1).join('/')).filter((one) => one !== '') }]
        : files.map((file) => ({ name: file.name, kind: 'file' })));
    }));

    // AS3: files and folders dropped together - each says which it is, and only its name is read.
    const drop = root.querySelector('[data-af-drop]');
    const lit = (on) => {
      if (!drop) return;
      drop.classList.toggle('af-over', on);
      drop.querySelector('[data-af-drop-idle]').hidden = on;
      drop.querySelector('[data-af-drop-over]').hidden = !on;
    };
    let depth = 0;
    const carries = (event) => [...((event.dataTransfer && event.dataTransfer.types) || [])].includes('Files');
    window_.addEventListener('dragenter', (event) => { if (!carries(event)) return; event.preventDefault(); depth += 1; lit(true); });
    window_.addEventListener('dragover', (event) => { if (carries(event)) event.preventDefault(); });
    window_.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (depth === 0) lit(false); });
    window_.addEventListener('drop', (event) => {
      if (!carries(event) || placesMode) return;
      event.preventDefault();
      depth = 0;
      lit(false);
      const entries = [...event.dataTransfer.items].map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null));
      gather(entries.length > 0 && entries.every(Boolean)
        ? entries.map((entry) => ({ name: entry.name, kind: entry.isDirectory ? 'folder' : 'file' }))
        : [...event.dataTransfer.files].map((file) => ({ name: file.name, kind: 'file' })));
    });

    const typed = root.querySelector('[data-af-type]');
    if (typed) typed.addEventListener('submit', (event) => {
      event.preventDefault();
      const field = typed.querySelector('input');
      const text = field.value.trim();
      if (text === '') return;
      if (placesMode) {
        // IPD2: on the computer's page a rule names a place - ~/… or a path from / - and a name alone is said so.
        const place = /^(?:~\/|\/)./.test(text);
        if (notPlace) notPlace.hidden = place;
        if (!place) return;
        field.value = '';
        const base = text.replace(/\/+$/, '');
        const folderPlace = text.endsWith('/');
        gather([{ name: base, kind: folderPlace ? 'folder' : 'file', pattern: (base.startsWith('~/') ? base : '/' + base) + (folderPlace ? '/**' : '') }]);
        return;
      }
      field.value = '';
      const folder = /^[^/*?[\]]+\/$/.test(text);
      const plain = /^[^/*?[\]]+$/.test(text);
      gather([{ name: folder ? text.slice(0, -1) : text, kind: folder ? 'folder' : plain ? 'file' : 'pattern' }]);
    });
  });
})();
`;

/**
 * IP2: opening the system's own window for places is asking the server to (`api/choose-places`), and only that: the page
 * sends the language and which kind, never a path, and what comes back is handed to the add window as an `af-places`
 * event - so the window's own script reads nothing and sends nothing (F36).
 *
 * `2026-10-13-a-window-slow-to-open.md` WN2, WN3: while the system's window is open every card that opens it waits, not
 * the pressed one alone - the other was pressed too, and a second window started behind the first (WNB4). After three
 * seconds with no answer the window's `data-af-waiting` line is shown; it and the cards are taken back when the answer
 * comes, whatever it is. Nothing here ends the wait: the system's window is the person's to answer or close.
 *
 * WN5: the pressed card is marked (`data-af-opening`) from the click, and its mark is drawn as the kit's loader - the one
 * **Choose a folder…** turns into while its window opens and is open (`which-project` V12, amended 2026-09-28) - so a
 * click is answered at once, before the three seconds of WN3. The ring and its turning are the pill's own (`pillSpin`,
 * `button.ts`), on every page this window is drawn on.
 */
export const ADD_PLACE_SCRIPT = String.raw`
(() => {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-af-place]');
    if (!button || button.getAttribute('aria-busy') === 'true') return;
    const window_ = button.closest('dialog');
    const said = window_ && window_.querySelector('[data-af-said]');
    const waiting = window_ && window_.querySelector('[data-af-waiting]');
    const cards = window_ ? [...window_.querySelectorAll('[data-af-place]')] : [button];
    if (cards.some((card) => card.getAttribute('aria-busy') === 'true')) return;
    if (said) said.hidden = true;
    cards.forEach((card) => card.setAttribute('aria-busy', 'true'));
    button.setAttribute('data-af-opening', '');
    const slow = setTimeout(() => { if (waiting) waiting.hidden = false; }, 3000);
    fetch('api/choose-places', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: document.documentElement.dataset.lang || 'en', kind: button.dataset.afPlace }) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: {} }))
      .then(({ ok, answer }) => {
        clearTimeout(slow);
        if (waiting) waiting.hidden = true;
        cards.forEach((card) => card.removeAttribute('aria-busy'));
        button.removeAttribute('data-af-opening');
        if (!ok) {
          if (said) { said.textContent = answer.message || ''; said.hidden = !answer.message; }
          return;
        }
        if (answer.kind === 'chosen' && window_) window_.dispatchEvent(new CustomEvent('af-places', { detail: { places: answer.places, outside: answer.outside || [] } }));
      });
  });
})();
`;

/**
 * `2026-10-09-the-file-not-its-name.md` FN3: asking the server where in the project a picked name is (`api/locate`), and
 * only that - as `ADD_PLACE_SCRIPT` is the one thing that asks for places. The add window hands it the picks as an
 * `af-locate` event; what goes out is each name, its kind, and for a folder the names inside it - never a file's text, which
 * no script here reads (F36). The answer, or that there was none, goes back to the window as `af-located`.
 */
export const ADD_LOCATE_SCRIPT = String.raw`
(() => {
  document.addEventListener('af-locate', (event) => {
    const window_ = event.target;
    const answer = (detail) => window_.dispatchEvent(new CustomEvent('af-located', { detail }));
    const picks = ((event.detail && event.detail.picks) || []).map((pick) => ({ name: pick.name, kind: pick.kind, ...(pick.inside ? { inside: pick.inside } : {}) }));
    if (location.protocol !== 'http:' && location.protocol !== 'https:') { answer({ failed: true }); return; }
    fetch('api/locate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ picks }) })
      .then((response) => response.json().then((body) => answer(response.ok && body.ok === true ? { results: body.results } : { failed: true })))
      .catch(() => answer({ failed: true }));
  }, true);
})();
`;
