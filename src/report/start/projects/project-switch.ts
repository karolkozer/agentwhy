// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../../render/html-report-components.ts';
import { inLanguages, LANGS, translator } from '../../render/report-copy.ts';
import { pill } from '../../render/ui/button.ts';

/**
 * Showing another project in this tab (`.ai/specs/2026-09-27-which-project.md` V12, V14, V15), shared by the two places
 * that offer it: the window the sidebar's card opens, and the onboarding's project step (V11). A container carrying
 * `switchArea(from)` holds the buttons: any `[data-switch-project]` in it asks this run's server to show that project,
 * and **Choose a folder…** opens the computer's own folder window. The page names a project by the id the server listed
 * it under, never by a path (V17), and says where it asked from, so the run it lands on opens the page it should (V16).
 */

/** The attributes of a container the script works in: its words, and - on the onboarding's step - where it asks from. */
export function switchArea(from?: 'step'): string {
  return ' data-switch-words="' + e(JSON.stringify(switchWords())) + '"' + (from === undefined ? '' : ' data-switch-from="' + from + '"');
}

/** A small folder, drawn: the guidelines have no emoji, not even in a button (§9.3). */
const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';

/**
 * "Don't see your project?" (V12): where the computer has a folder window, **Choose a folder…** opens it, and what it came
 * to is said under the box; where it has none, how to bring a project onto the list.
 */
export function chooseFolderBox(choosable: boolean): string {
  return '<div class="pjw-missing" data-choose-area><div class="pjw-missing-words">' +
    '<p class="pjw-missing-title">' + inLanguages((t) => t('proj.missing.title')) + '</p>' +
    '<p class="pjw-missing-text">' + inLanguages((t) => t('proj.missing.text')) +
    (choosable ? '' : ' ' + inLanguages((t) => t('proj.missing.how'))) + '</p></div>' +
    (choosable ? '<span class="js-only pjw-choose">' + pill({ label: FOLDER_SVG + inLanguages((t) => t('proj.choose')), tone: 'light', size: 'lg', button: true, attributes: ' data-choose-folder' }) + '</span>' : '') +
    '</div>' +
    (choosable ? '<div class="pjw-near" data-choose-area><p class="pjw-say" role="status" data-choose-say></p><div class="pjw-near-offers" data-choose-near></div></div>' : '');
}

/** Where a switch asked for over the list says what it came to. */
export const SWITCH_SAY = '<p class="pjw-say" role="status" data-switch-say></p>';

/** The script's own sentences, per language; `{name}` and `{reason}` are filled in where they are said. */
function switchWords(): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, {
      switching: t('proj.switching', { name: '{name}' }),
      failed: t('proj.switchFailed', { reason: '{reason}' }),
      unreachable: t('proj.unreachable'),
      chooseHome: t('proj.chooseHome'),
      chooseRoot: t('proj.chooseRoot'),
      chooseHere: t('proj.chooseHere'),
      nearAbove: t('proj.nearAbove', { name: '{name}' }),
      nearInside: t('proj.nearInside', { name: '{name}' }),
      openName: t('proj.openName', { name: '{name}' }),
      useAnyway: t('proj.useAnyway', { name: '{name}' }),
    }];
  }));
}

/**
 * V14, V15: a click asks this run's server to show the project in its place; the answer is the address of the run that
 * does, and this tab goes there. A refusal leaves the page as it was and says why. The page sends the project's id -
 * the name the server listed it by - and never a path (V17).
 */
export const SWITCH_SCRIPT = String.raw`
(() => {
  document.querySelectorAll('[data-switch-words]').forEach((root) => {
    const words = JSON.parse(root.getAttribute('data-switch-words'));
    const from = root.getAttribute('data-switch-from');
    const say = root.querySelector('[data-switch-say]');
    const chooseSay = root.querySelector('[data-choose-say]');
    const near = root.querySelector('[data-choose-near]');
    const word = (key) => (words[document.documentElement.dataset.lang] || words.en)[key];
    const lock = (locked) => root.querySelectorAll('[data-switch-project], [data-choose-folder]').forEach((one) => { one.disabled = locked; });
    // Said beside what was clicked: a row's switch over the list, a chosen folder's under its box.
    const sayFor = (element) => (element.closest('[data-choose-area]') && chooseSay) || say;
    const ask = (route, body) => fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(from ? { ...body, from } : body) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, unreachable: true }));
    // The maintainer, 2026-10-07: the sentence over the list went unseen while a switch ran - so a loader: the button's
    // spinner, and a veil over the window (or the page) saying where it goes, until the page there is open.
    const veilOf = () => {
      const host = root.closest('dialog') || document.body;
      let veil = host.querySelector(':scope > [data-switch-veil]');
      if (!veil) {
        veil = document.createElement('div');
        veil.className = 'pjw-veil' + (host === document.body ? ' pjw-veil-page' : '');
        veil.setAttribute('data-switch-veil', '');
        veil.setAttribute('role', 'status');
        veil.innerHTML = '<div class="pjw-veil-card"><span class="pjw-veil-spin" aria-hidden="true"></span><p class="pjw-veil-say"></p></div>';
        host.append(veil);
      }
      return veil;
    };
    const switching = (button, name) => {
      button.classList.add('pill-busy');
      button.setAttribute('aria-busy', 'true');
      const veil = veilOf();
      veil.querySelector('.pjw-veil-say').textContent = word('switching').replace('{name}', name);
      veil.hidden = false;
    };
    const settled = () => {
      root.querySelectorAll('[data-switch-project].pill-busy').forEach((one) => { one.classList.remove('pill-busy'); one.removeAttribute('aria-busy'); });
      const veil = (root.closest('dialog') || document.body).querySelector(':scope > [data-switch-veil]');
      if (veil) veil.hidden = true;
    };
    const refused = (where, answer) => {
      settled();
      lock(false);
      if (where) where.textContent = answer.unreachable ? word('unreachable') : word('failed').replace('{reason}', (answer.answer && answer.answer.message) || '');
    };
    const offer = (label, id, name, tone) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill pill-' + tone + ' pill-md';
      button.setAttribute('data-switch-project', id);
      button.setAttribute('data-switch-name', name);
      button.textContent = label.replace('{name}', name);
      return button;
    };
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-switch-project]');
      if (button) {
        const where = sayFor(button);
        lock(true);
        switching(button, button.getAttribute('data-switch-name'));
        if (where) where.textContent = '';
        ask('api/switch-project', { id: button.getAttribute('data-switch-project') }).then((answer) => {
          if (answer.ok && typeof answer.answer.url === 'string') { location.assign(answer.answer.url); return; }
          refused(where, answer);
        });
        return;
      }
      const choose = event.target.closest('[data-choose-folder]');
      if (!choose || !chooseSay || !near) return;
      lock(true);
      near.textContent = '';
      chooseSay.textContent = '';
      // The maintainer, 2026-09-28: a loader, not a sentence, while the folder window opens and is open.
      const busy = (on) => { choose.classList.toggle('pill-busy', on); if (on) choose.setAttribute('aria-busy', 'true'); else choose.removeAttribute('aria-busy'); };
      busy(true);
      ask('api/choose-folder', { lang: document.documentElement.dataset.lang || 'en' }).then((answer) => {
        busy(false);
        if (!answer.ok) { refused(chooseSay, answer); return; }
        const said = answer.answer;
        if (said.kind === 'switched' && typeof said.url === 'string') { location.assign(said.url); return; }
        lock(false);
        if (said.kind === 'cancelled') { chooseSay.textContent = ''; return; }
        if (said.kind === 'refused') { chooseSay.textContent = word(said.not === 'home' ? 'chooseHome' : 'chooseRoot'); return; }
        if (said.kind === 'here') { chooseSay.textContent = word('chooseHere'); return; }
        if (said.kind === 'near') {
          chooseSay.textContent = said.above ? word('nearAbove').replace('{name}', said.projects[0].name) : word('nearInside').replace('{name}', said.chosen.name);
          // The project shown is offered only on the onboarding's step, where choosing it goes on in the page.
          said.projects.filter((project) => !project.here).forEach((project) => near.append(offer(word('openName'), project.id, project.name, 'light')));
          near.append(offer(word('useAnyway'), said.chosen.id, said.chosen.name, 'outline'));
        }
      });
    });
  });
})();
`;

/** The box, and what is said under it and over the list. Colours come from the tokens only. */
export const SWITCH_STYLE = String.raw`
.pjw-veil{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;border-radius:inherit;background:color-mix(in srgb,var(--bg) 86%,transparent)}
.pjw-veil[hidden]{display:none}
.pjw-veil-page{position:fixed;z-index:50;border-radius:0}
.pjw-veil-card{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 28px;text-align:center}
.pjw-veil-spin{width:30px;height:30px;border-radius:50%;border:3px solid var(--white-16);border-top-color:var(--mint);animation:pillSpin .8s linear infinite}
.pjw-veil-say{margin:0;font-size:17px;font-weight:600;color:var(--text)}
@media (prefers-reduced-motion:reduce){.pjw-veil-spin{animation:none}}
.pjw-say{margin:0;min-height:0;font-size:14px;color:var(--text-soft)}
.pjw-say:not(:empty){margin:10px 4px 0}
.pjw-missing{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:20px;padding:18px 20px;border:1px dashed var(--white-16);border-radius:16px}
.pjw-missing-words{min-width:0}
.pjw-choose{flex:none}
.pjw-choose .pill{display:inline-flex;align-items:center;gap:9px}
.pjw-near .pjw-say:not(:empty){margin:12px 4px 0}
.pjw-near-offers{display:flex;flex-wrap:wrap;gap:10px;margin:10px 4px 0}
.pjw-near-offers:empty{display:none}
.pjw-missing-title{margin:0;font-size:15.5px;font-weight:600}
.pjw-missing-text{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--text-2)}
@media (max-width:640px){.pjw-missing{flex-direction:column;align-items:stretch}.pjw-choose .pill{width:100%;justify-content:center}}
`;
