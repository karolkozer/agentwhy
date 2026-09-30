import { escapeHtml as e } from '../../render/html-report-components.ts';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../render/html-head.ts';
import { inLanguages, LANGS, translator } from '../../render/report-copy.ts';
import { BUTTON_STYLE, pill } from '../../render/ui/button.ts';
import { pageShell } from '../../render/ui/page-shell.ts';

/** A project as the page names it: its folder's name, and where it is. */
export interface MovedProject {
  readonly name: string;
  readonly place?: string;
}

/**
 * What a page of a project shown earlier in this process says now (`.ai/specs/2026-09-27-which-project.md` V14, amended
 * 2026-09-28 by the maintainer: "Back" after a switch reached nothing). The process serves one project at a time, at one
 * address, so the pages of the one before - in a tab's history, or reloaded - reach it and are told: "This page was for
 * my-app. agentwhy now shows blog." **Show my-app again** switches back in this tab; **Go to blog** is the project
 * shown. Nothing of the earlier project is served, and nothing is written from its pages but the way back (V17).
 */
export function movedPage(was: MovedProject, now: MovedProject, nowUrl: string): string {
  return pageShell({
    title: 'moved.pageTitle',
    policy: INDEX_CONTENT_SECURITY_POLICY_META,
    styles: [BUTTON_STYLE, MOVED_STYLE],
    scripts: [MOVED_SCRIPT],
    live: false,
    main: '<section class="mv" data-moved-words="' + e(JSON.stringify(words(was.name))) + '">' +
      '<p class="mv-eyebrow">agentwhy</p>' +
      '<h1 class="mv-title">' + inLanguages((t) => t('moved.title', { was: '<strong>' + e(was.name) + '</strong>' })) + '</h1>' +
      '<p class="mv-text">' + inLanguages((t) => t('moved.text', { now: '<strong>' + e(now.name) + '</strong>' })) + '</p>' +
      '<div class="mv-go">' +
      '<span class="js-only">' + pill({ label: inLanguages((t) => t('moved.back', { was: e(was.name) })), tone: 'light', size: 'lg', button: true, attributes: ' data-moved-back' }) + '</span>' +
      pill({ label: inLanguages((t) => t('moved.stay', { now: e(now.name) })), tone: 'outline', size: 'lg', href: e(nowUrl) }) +
      '</div>' +
      '<p class="mv-say" role="status" data-moved-say></p>' +
      '<p class="mv-noscript">' + inLanguages((t) => t('moved.noScript', { was: e(was.name) })) + '</p>' +
      '</section>',
  });
}

/** What the script says, in every language: it cannot hold three in one text node. */
function words(was: string): Readonly<Record<string, Readonly<Record<string, string>>>> {
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, { switching: t('proj.switching', { name: was }), failed: t('proj.switchFailed', { reason: '{reason}' }), unreachable: t('proj.unreachable') }];
  }));
}

/**
 * **Show my-app again**: the earlier project's run starts again and this tab goes to it; the answer is its address. Asked
 * at this page's own address - the earlier project's - which the process takes for nothing but this.
 */
const MOVED_SCRIPT = String.raw`
(() => {
  const root = document.querySelector('[data-moved-words]');
  const back = document.querySelector('[data-moved-back]');
  const say = document.querySelector('[data-moved-say]');
  if (!root || !back || !say) return;
  const words = JSON.parse(root.getAttribute('data-moved-words'));
  const word = (key) => (words[document.documentElement.dataset.lang] || words.en)[key];
  back.addEventListener('click', () => {
    back.disabled = true;
    back.classList.add('pill-busy');
    say.textContent = word('switching');
    fetch('api/switch-back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, unreachable: true }))
      .then((answer) => {
        if (answer.ok && typeof answer.answer.url === 'string') { location.replace(answer.answer.url); return; }
        back.disabled = false;
        back.classList.remove('pill-busy');
        say.textContent = answer.unreachable ? word('unreachable') : word('failed').replace('{reason}', (answer.answer && answer.answer.message) || '');
      });
  });
})();
`;

/** The page's own look. Colours come from the tokens only. */
const MOVED_STYLE = String.raw`
.mv{max-width:620px;margin:18vh auto 0;text-align:center;display:flex;flex-direction:column;align-items:center}
.mv-eyebrow{margin:0 0 14px;font-size:15px;font-weight:600;color:var(--coral-text)}
.mv-title{margin:0 0 12px;font-size:36px;line-height:1.15;letter-spacing:-.02em;font-weight:650;text-wrap:balance}
.mv-title strong,.mv-text strong{color:var(--text);font-weight:650}
.mv-text{margin:0 0 26px;font-size:17px;line-height:1.55;color:var(--text-2);text-wrap:pretty}
.mv-go{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.mv-go .pill{justify-content:center}
.mv-say{margin:16px 0 0;font-size:14px;color:var(--text-soft)}
.mv-say:empty{display:none}
.mv-noscript{margin:16px 0 0;font-size:13.5px;color:var(--text-3)}
.js .mv-noscript{display:none}
@media (max-width:640px){.mv{margin-top:10vh}.mv-title{font-size:28px}.mv-go{flex-direction:column;align-self:stretch}.mv-go .js-only .pill,.mv-go>.pill{width:100%}}
`;
