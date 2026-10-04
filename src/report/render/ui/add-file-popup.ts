// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator } from '../report-copy.ts';
import { closeButton, pill } from './button.ts';
import { CLOSES, popup } from './popup.ts';

/**
 * "Add a private file" (`for-people-who-build-with-ai.md` F35, F36; guidelines §9.2): two large cards, *Choose a file* and
 * *Choose a folder*, then "Or type the name". Settings opens it, and the onboarding's step 2
 * (`.ai/specs/2026-09-24-onboarding.md` W12), which is why it is in the kit.
 *
 * A picked file gives its name and nothing else: the page never reads its contents - no `FileReader`, no upload;
 * `files[0].name` and, for a folder, the first segment of `webkitRelativePath` are all the script touches. The name
 * becomes the pattern a deny rule will hold - a file anywhere by that name, or a folder's contents - and is handed to
 * the page as an `add-file` event on the window, `{ name, kind, pattern }`. What happens then is the page's: Settings
 * asks to confirm, the onboarding adds a row. A name that cannot be written exactly is refused here, in words (R46).
 *
 * Its words are Settings' (`set.add.*`): one popup, one set of words, whichever page opens it.
 */
export function addFilePopup(id: string): string {
  const title = id + '-title';
  const placeholder = (lang: (typeof LANGS)[number]): string => e(translator(lang)('set.add.placeholder'));
  const pick = (kind: 'file' | 'folder', glyph: string): string =>
    '<button type="button" class="af-pick" data-af-pick="' + kind + '">' +
    '<span class="af-pick-mark" aria-hidden="true">' + glyph + '</span>' +
    '<span class="af-pick-name">' + inLanguages((t) => t('set.add.' + kind)) + '</span>' +
    '<span class="af-pick-eg">' + inLanguages((t) => t('set.add.' + kind + '.eg')) + '</span></button>';

  return popup({
    id,
    size: 'pick',
    labelledBy: title,
    body: '<div class="af" data-af>' +
      '<div class="af-head"><h3 class="af-title" id="' + title + '">' + inLanguages((t) => t('set.add.title')) + '</h3>' +
      closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>' +
      '<p class="af-lead">' + inLanguages((t) => t('set.add.lead')) + '</p>' +
      '<div class="af-picks js-only">' + pick('file', '▤') + pick('folder', '▦') + '</div>' +
      '<input type="file" class="af-file" data-af-file="file" hidden tabindex="-1" aria-hidden="true">' +
      '<input type="file" class="af-file" data-af-file="folder" webkitdirectory directory hidden tabindex="-1" aria-hidden="true">' +
      '<div class="af-type-label">' + inLanguages((t) => t('set.add.type')) + '</div>' +
      '<form class="af-type" data-af-type>' +
      '<input class="af-type-input" name="name" autocomplete="off" placeholder="' + placeholder('en') + '"' +
      LANGS.map((lang) => ' data-placeholder-' + lang + '="' + placeholder(lang) + '"').join('') +
      labelAttributes((t) => e(t('set.add.type'))) + '>' +
      pill({ label: inLanguages((t) => t('set.add.go')), tone: 'light', size: 'task', attributes: ' data-af-type-go', button: true }) +
      '</form>' +
      '<p class="af-cannot" data-af-cannot hidden>' + inLanguages((t) => t('set.add.cannot')) + '</p></div>',
  });
}

export const ADD_FILE_POPUP_STYLE = String.raw`
.af{padding:28px}
.af-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px}
.af-title{margin:0;font-size:22px;line-height:1.25;font-weight:650}
.af-lead{margin:0 0 20px;font-size:15px;line-height:1.55;color:var(--text-2)}
.af-picks{grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}
.js .af-picks{display:grid}
.af-pick{display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 16px;border-radius:14px;background:var(--panel);border:1px solid var(--white-12);color:inherit;font:inherit;cursor:pointer;text-align:center}
.af-pick:hover{border-color:var(--coral)}
.af-pick-mark{width:44px;height:44px;border-radius:12px;background:var(--coral-12);color:var(--coral-text);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700}
.af-pick-name{font-size:15.5px;font-weight:600}
.af-pick-eg{font-size:13px;color:var(--text-2)}
.af-type-label{font-size:13px;color:var(--text-3);margin-bottom:8px}
.af-type{display:flex;gap:10px}
.af-type-input{flex:1;min-width:0;background:var(--panel);border:1px solid var(--white-12);border-radius:999px;padding:10px 16px;color:var(--text);font:inherit;font-size:14px;outline:none}
.af-type-input:focus-visible{border-color:var(--coral-50)}
.af-type .pill{padding:10px 20px}
.af-cannot{margin:14px 0 0;font-size:14px;line-height:1.5;color:var(--coral-text)}
@media (max-width:640px){.js .af-picks{grid-template-columns:1fr}}
`;

/**
 * A name becomes the pattern (F36): a file anywhere by that name, or a folder's contents. A picked name holding a
 * wildcard would protect other files than the one picked, and a bracket cannot be written in a deny rule at all (R46),
 * so such a name is refused here, in words, rather than escaped by a guess. A typed name with a slash or a wildcard is
 * taken as the pattern it already is.
 */
export const ADD_FILE_POPUP_SCRIPT = String.raw`
(() => {
  document.querySelectorAll('[data-af]').forEach((root) => {
    const window_ = root.closest('dialog');
    const cannot = root.querySelector('[data-af-cannot]');
    if (!window_) return;
    const hand = (name, kind) => {
      if (/[()]/.test(name) || (kind !== 'pattern' && /[*?[\]{}]/.test(name))) {
        if (cannot) cannot.hidden = false;
        return;
      }
      if (cannot) cannot.hidden = true;
      const pattern = kind === 'file' ? '**/' + name : kind === 'folder' ? '**/' + name + '/**' : name;
      window_.dispatchEvent(new CustomEvent('add-file', { detail: { name, kind, pattern } }));
    };

    root.addEventListener('click', (event) => {
      const pick = event.target.closest('[data-af-pick]');
      if (pick) {
        const input = root.querySelector('[data-af-file="' + pick.dataset.afPick + '"]');
        if (input) input.click();
        return;
      }
      if (event.target.closest('[data-af-type-go]')) {
        const form = event.target.closest('form');
        if (form) form.requestSubmit();
      }
    });

    root.querySelectorAll('[data-af-file]').forEach((input) => input.addEventListener('change', () => {
      const first = input.files && input.files[0];
      if (!first) return;
      const name = input.dataset.afFile === 'folder' ? (first.webkitRelativePath || '').split('/')[0] : first.name;
      input.value = '';
      if (name) hand(name, input.dataset.afFile);
    }));

    const typed = root.querySelector('[data-af-type]');
    if (typed) typed.addEventListener('submit', (event) => {
      event.preventDefault();
      const field = typed.querySelector('input');
      const text = field.value.trim();
      if (text === '') return;
      field.value = '';
      const folder = /^[^/*?[\]]+\/$/.test(text);
      const plain = /^[^/*?[\]]+$/.test(text);
      hand(folder ? text.slice(0, -1) : text, folder ? 'folder' : plain ? 'file' : 'pattern');
    });
  });
})();
`;
