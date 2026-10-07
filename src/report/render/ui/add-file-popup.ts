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
 */
export function addFilePopup(id: string, places?: 'both' | 'separate' | 'typed'): string {
  if (places !== undefined) return addPlacePopup(id, places);
  const title = id + '-title';
  const placeholder = (lang: (typeof LANGS)[number]): string => e(translator(lang)('set.add.placeholder'));
  const say = (key: string): string => inLanguages((t) => t(key));
  const pick = (kind: 'file' | 'folder', glyph: string, how: string): string =>
    '<button type="button" class="af-pick" data-af-pick="' + kind + '">' +
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
    body: '<div class="af" data-af>' +
      '<div class="af-head"><h3 class="af-title" id="' + title + '">' + say('set.add.title') + '</h3>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
      '<p class="af-lead">' + say('set.add.lead') + '</p>' +
      '<div class="af-picks js-only">' + pick('file', '▤', keys) + pick('folder', '▦', say('set.add.folder.one')) + '</div>' +
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
      '<div class="af-type-label">' + say('set.add.type') + '</div>' +
      '<form class="af-type" data-af-type>' +
      '<input class="af-type-input" name="name" autocomplete="off" placeholder="' + placeholder('en') + '"' +
      LANGS.map((lang) => ' data-placeholder-' + lang + '="' + placeholder(lang) + '"').join('') +
      labelAttributes((t) => e(t('set.add.type'))) + '>' +
      pill({ label: say('set.add.go'), tone: 'light', size: 'task', attributes: ' data-af-type-go', button: true }) +
      '</form>' +
      '<p class="af-cannot" data-af-cannot hidden>' + say('set.add.cannot') + '</p>' +
      '<div class="af-foot" data-af-foot hidden>' +
      pill({ label: say('app.cancel'), tone: 'outline', size: 'lg', button: true, attributes: CLOSES }) +
      pill({ label: say('set.add.continue'), tone: 'light', size: 'lg', button: true, attributes: ' data-af-continue' }) +
      '</div></div>',
  });
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
      '<p class="af-lead">' + say('set.add.placesLead') + '</p>' + picks +
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
        if (!chosen.some((item) => item.pattern === pattern)) chosen.push({ name, kind, pattern });
      }
      if (cannot) cannot.hidden = !refused;
      draw();
    };
    const reset = () => { chosen = []; if (cannot) cannot.hidden = true; if (notPlace) notPlace.hidden = true; draw(); };
    // IP2: the places the system's window answered, handed here by ADD_PLACE_SCRIPT, which alone asks the server.
    window_.addEventListener('af-places', (event) => gather((event.detail && event.detail.places) || []));
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
        // AS5: the whole list, handed over at once; the page decides what to do with it.
        const files = chosen.slice();
        if (files.length === 0) return;
        if (window_.open) window_.close();
        window_.dispatchEvent(new CustomEvent('add-files', { detail: { files } }));
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
      gather(input.dataset.afFile === 'folder'
        ? [{ name: (files[0].webkitRelativePath || '').split('/')[0], kind: 'folder' }]
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
 * event - so the window's own script reads nothing and sends nothing (F36). The card waits while the window is open.
 */
export const ADD_PLACE_SCRIPT = String.raw`
(() => {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-af-place]');
    if (!button || button.getAttribute('aria-busy') === 'true') return;
    const window_ = button.closest('dialog');
    const said = window_ && window_.querySelector('[data-af-said]');
    if (said) said.hidden = true;
    button.setAttribute('aria-busy', 'true');
    fetch('api/choose-places', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: document.documentElement.dataset.lang || 'en', kind: button.dataset.afPlace }) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: {} }))
      .then(({ ok, answer }) => {
        button.removeAttribute('aria-busy');
        if (!ok) {
          if (said) { said.textContent = answer.message || ''; said.hidden = !answer.message; }
          return;
        }
        if (answer.kind === 'chosen' && window_) window_.dispatchEvent(new CustomEvent('af-places', { detail: { places: answer.places } }));
      });
  });
})();
`;
