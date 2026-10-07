// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator } from '../../render/report-copy.ts';
import { TRASH_SVG } from '../../render/ui/button.ts';
import { confirmDialog } from '../../render/ui/confirm-dialog.ts';
import { opener } from '../../render/ui/popup.ts';
import type { ProjectListRow } from '../../render/ui/project-list.ts';

/**
 * Taking a project off this person's list (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM4-RM10): the
 * trash on a row, and one confirmation for the whole list (RMD4). Nothing a person's AI wrote is ever deleted here:
 * the trash writes agentwhy's own record, and - where the window's tick is ticked - takes agentwhy out of that
 * project's settings, which is Settings' own Uninstall for that folder (F59). What was removed is not listed again
 * anywhere (RM11, as the maintainer asked the same day).
 */

/** The window's id: every trash opens this one. */
export const REMOVE_WINDOW = 'projects-remove';

/** RM4: the trash, in the Remove column of its own. Only a script can remove, so only a page with one draws it. */
export function removeTrash(row: ProjectListRow): string {
  // RM7: the tick is offered where that project's own settings are known to hold something of agentwhy's.
  const installed = row.folder === 'there' && row.setUp === true;
  return '<span class="js-only"><button type="button" class="pjl-trash" data-remove-project="' + e(row.id) + '"' +
    ' data-remove-name="' + e(row.name) + '"' + (installed ? ' data-remove-set-up' : '') + opener(REMOVE_WINDOW) +
    labelAttributes((t) => t('proj.remove', { name: e(row.name) })) + '>' + TRASH_SVG + '</button></span>';
}

/**
 * RM5: the small window the trash opens, built once and filled with the row's name when it opens. The tick that
 * uninstalls agentwhy from that project is in it always and shown only for a row that has something to uninstall
 * (RM7), because what it is about changes with the row and the window does not.
 */
export function removeWindow(): string {
  const name = '<span class="pjr-name" data-remove-name></span>';
  return confirmDialog({
    id: REMOVE_WINDOW,
    glyph: '',
    title: inLanguages((t) => t('proj.remove.title', { name })),
    subject: '',
    sentence: inLanguages((t) => t('proj.remove.text')),
    option: '<span class="pjr-uninstall" data-remove-uninstall hidden>' +
      '<label class="pjr-tick"><input type="checkbox" data-remove-tick checked>' +
      '<span>' + inLanguages((t) => t('proj.remove.uninstall')) + '</span></label>' +
      '<span class="pjr-tick-why">' + inLanguages((t) => t('proj.remove.uninstall.text')) + '</span></span>',
    note: '<p class="pjw-say" role="status" data-remove-say></p>',
    cancel: inLanguages((t) => t('app.cancel')),
    confirm: inLanguages((t) => t('proj.remove.go')),
    tone: 'primary',
    confirmAttributes: ' data-remove-go',
    attributes: ' data-remove-words="' + e(JSON.stringify(removeWords())) + '"',
  });
}

/** The script's own sentences, per language; `{name}` and `{reason}` are filled in where they are said. */
function removeWords(): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, {
      removing: t('proj.removing', { name: '{name}' }),
      failed: t('proj.removeFailed', { reason: '{reason}' }),
      unreachable: t('proj.unreachable'),
    }];
  }));
}

/**
 * RM5, RM10: the trash fills the window and opens it (the kit opens it; this fills it), and **Remove it** sends the id
 * this run listed the project under, with the tick where one was offered. A refusal is said in the server's own words
 * and nothing changes. On success the page is read again, on the window the person was in - and the list is drawn
 * without that project from then on (RM6).
 */
export const REMOVE_SCRIPT = String.raw`
(() => {
  const dialog = document.getElementById('projects-remove');
  if (!dialog) return;
  const words = JSON.parse(dialog.getAttribute('data-remove-words'));
  const word = (key) => (words[document.documentElement.dataset.lang] || words.en)[key];
  const say = dialog.querySelector('[data-remove-say]');
  const tick = dialog.querySelector('[data-remove-tick]');
  const uninstall = dialog.querySelector('[data-remove-uninstall]');
  const go = dialog.querySelector('[data-remove-go]');
  let asking = null;

  // The window the person was in opens again with the page: the kit opens a window its address names.
  const again = () => location.replace(location.pathname + '?at=' + Date.now() + '#projects');

  const ask = (body, where, lock) => {
    lock(true);
    fetch('api/remove-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      // The server answers a refusal in JSON and a request it does not take in plain text: both are its answer, said
      // as it gave it. Only a request that got no answer at all is "unreachable".
      .then((response) => response.text().then((text) => {
        let answer = {};
        try { answer = JSON.parse(text); } catch { answer = { message: text.trim() }; }
        return { ok: response.ok && answer.ok === true, message: answer.message || String(response.status) };
      }), () => ({ ok: false, message: word('unreachable') }))
      .then((answer) => {
        if (answer.ok) { again(); return; }
        lock(false);
        if (where) where.textContent = word('failed').replace('{reason}', answer.message);
      });
  };

  document.addEventListener('click', (event) => {
    const trash = event.target.closest('[data-remove-project]');
    if (trash) {
      asking = { id: trash.getAttribute('data-remove-project'), name: trash.getAttribute('data-remove-name') };
      dialog.querySelectorAll('[data-remove-name]').forEach((one) => { one.textContent = asking.name; });
      if (uninstall) uninstall.hidden = !trash.hasAttribute('data-remove-set-up');
      if (tick) tick.checked = true;
      if (say) say.textContent = '';
      if (go) go.disabled = false;
      return;
    }
    if (go && event.target.closest('[data-remove-go]') && asking) {
      if (say) say.textContent = word('removing').replace('{name}', asking.name);
      ask({ id: asking.id, uninstall: uninstall !== null && !uninstall.hidden && tick !== null && tick.checked }, say, (locked) => { go.disabled = locked; });
    }
  });
})();
`;

/** The window's own parts; the trash itself takes its colours from the list's style. */
export const REMOVE_STYLE = String.raw`
.pjr-name{font-weight:650;color:var(--text)}
.pjr-uninstall[hidden]{display:none}
.pjr-tick{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:1.5;color:var(--text-soft);cursor:pointer}
.pjr-tick input{margin:3px 0 0;accent-color:var(--coral);width:16px;height:16px;flex:none}
.pjr-tick-why{display:block;margin:6px 0 0 26px;font-size:13.5px;line-height:1.5;color:var(--text-3)}
`;
