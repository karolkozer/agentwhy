import { LANGS, translator, type Lang } from '../report-copy.ts';

/**
 * Live pages (`.ai/specs/2026-09-24-live-pages.md`): the pill that says there is more, and the line that says the server
 * has gone, both hidden until the script shows them. Every page carries them; only a served page ever shows them.
 */
export function liveParts(): string {
  const words = JSON.stringify(liveWords()).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return '<button type="button" class="pill pill-light pill-sm live-pill" data-live-pill data-live-words="' + words + '" hidden></button>' +
    '<p class="live-stopped" data-live-stopped role="status" hidden></p>';
}

/** The words the script says, per language, with the plural forms each language has (as `report-copy.ts` counts). */
export function liveWords(): Record<Lang, Record<string, string>> {
  const forms: Readonly<Record<Lang, readonly string[]>> = { en: ['one', 'other'], pl: ['one', 'few', 'many'], de: ['one', 'other'] };
  return Object.fromEntries(LANGS.map((lang) => {
    const t = translator(lang);
    return [lang, {
      ...Object.fromEntries(forms[lang].map((form) => [form, t('live.new.' + form)])),
      ...Object.fromEntries(forms[lang].map((form) => ['go.' + form, t('live.go.' + form)])),
      updated: t('live.updated'),
      stopped: t('live.stopped'),
    }];
  })) as unknown as Record<Lang, Record<string, string>>;
}

export const LIVE_STYLE = String.raw`
.live-pill{position:fixed;top:calc(18px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:20;box-shadow:0 10px 30px var(--shadow)}
.live-pill[hidden],.live-stopped[hidden]{display:none}
.live-stopped{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:20;margin:0;max-width:min(560px,calc(100% - 32px));padding:10px 16px;border-radius:12px;background:var(--popup);border:1px solid var(--white-14);color:var(--text-2);font-size:13.5px;line-height:1.5;text-align:center}
.live-new{background:var(--coral-08);transition:background 1.6s ease}
.live-pill.live-foot{top:auto;bottom:calc(22px + env(safe-area-inset-bottom))}
.live-lit{animation:live-lit 2.4s ease-out}
@keyframes live-lit{0%,35%{background:var(--coral-14)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.live-lit{animation:none;background:var(--coral-08)}}
`;

/**
 * L5-L14. Nothing happens unless the page was served and stamped with its version (L2): a file, a shared page and a
 * report opened alone are left exactly as they were. A page that can take a new version in place (L7a: Conversations,
 * `window.agentwhyLiveSwap`) is handed it, fetched, wherever the reader is and whatever is open: nothing flashes and
 * nothing under the reader moves, what changed is lit, and a new conversation out of view is said at the foot of the
 * screen, where a click brings it into view (the maintainer, 2026-09-25: the pill at the top went unseen). Every other
 * page, and one whose new version it cannot take in place, is updated as follows. The page asks every 2 s while it is visible and every 60 s while
 * it is not (LD1, LD4); the same version does nothing, and nothing is drawn while it asks (L6). A new version is put in
 * place only where nothing can move under the reader (L7) - no window open, no field focused, nothing selected, at the
 * top - and otherwise waits behind the pill (L8), which a click, or scrolling back to the top with nothing open, turns
 * into the update. The update is a reload that keeps the fields, folds and pressed buttons marked `data-live-keep`, the
 * scroll, and lights what is new among the elements marked `data-live-key` (L9). Three failed asks in a row say the
 * server has gone, once, and stop (L13).
 */
export const LIVE_SCRIPT = String.raw`
(() => {
  const html = document.documentElement;
  let sent = html.dataset.version;
  if (!sent || (location.protocol !== 'http:' && location.protocol !== 'https:')) return;
  const pill = document.querySelector('[data-live-pill]');
  const gone = document.querySelector('[data-live-stopped]');
  if (!pill || !gone) return;
  // The page's own name; empty where it was opened at the served root, which the server reads as the list (L3).
  const file = location.pathname.split('/').pop() || '';
  const store = 'agentwhy.live.' + (file || '/');
  const words = JSON.parse(pill.dataset.liveWords || '{}');
  const say = (key) => ((words[html.dataset.lang] || words.en || {})[key] || '');
  const form = (n) => {
    if (n === 1) return 'one';
    if (html.dataset.lang !== 'pl') return 'other';
    const last = n % 10, lastTwo = n % 100;
    return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? 'few' : 'many';
  };

  const kept = () => [...document.querySelectorAll('[data-live-keep]')];
  const keys = () => [...document.querySelectorAll('[data-live-key]')].map((element) => element.dataset.liveKey);
  const stateOf = (element) => element.tagName === 'DETAILS' ? { open: element.open }
    : element.hasAttribute('aria-pressed') ? { pressed: element.getAttribute('aria-pressed') === 'true' }
      : element.type === 'checkbox' ? { checked: element.checked } : { value: element.value };

  // After an update: the reader's place back, and what is new lit (L7, L9). Put back once the page's own scripts have
  // run: they come after this one, and a pill pressed or a field changed before they listen is pressed for nobody.
  setTimeout(() => { try {
    const saved = JSON.parse(sessionStorage.getItem(store) || 'null');
    if (saved) {
      sessionStorage.removeItem(store);
      kept().forEach((element, at) => {
        const state = saved.kept[at];
        if (!state) return;
        if ('open' in state) element.open = state.open;
        else if ('pressed' in state) { if (state.pressed && element.getAttribute('aria-pressed') !== 'true') element.click(); }
        else {
          if ('checked' in state) element.checked = state.checked; else element.value = state.value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      const before = new Set(saved.keys);
      document.querySelectorAll('[data-live-key]').forEach((element) => {
        if (before.has(element.dataset.liveKey)) return;
        element.classList.add('live-new');
        setTimeout(() => element.classList.remove('live-new'), 1600);
      });
      window.scrollTo(0, saved.scroll || 0);
    }
  } catch (error) {} }, 0);

  const field = (element) => !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
  const idle = () => !document.querySelector('dialog[open]') && !field(document.activeElement) &&
    !String(window.getSelection ? window.getSelection() : '') && window.scrollY <= 80 && document.visibilityState === 'visible';

  let waiting = null;
  let misses = 0;
  let stopped = false;
  let timer = 0;

  const apply = (toTop) => {
    try {
      sessionStorage.setItem(store, JSON.stringify({ kept: kept().map(stateOf), keys: keys(), scroll: toTop ? 0 : window.scrollY }));
    } catch (error) {}
    location.reload();
  };
  const show = (answer) => {
    // How many conversations the page was sent with is on its root (L2); the answer says how many there are now.
    const fresh = typeof answer.conversations === 'number' ? answer.conversations - Number(html.dataset.conversations || answer.conversations) : 0;
    pill.textContent = fresh > 0 ? say(form(fresh)).replace('{n}', String(fresh)) : say('updated');
    pill.dataset.toTop = fresh > 0 ? 'true' : '';
    pill.hidden = false;
  };
  const stop = () => {
    stopped = true;
    html.dataset.live = 'gone';
    clearTimeout(timer);
    pill.hidden = true;
    gone.textContent = say('stopped');
    gone.hidden = false;
  };
  const later = (answer) => { if (idle()) apply(false); else show(answer); };
  // The words each language keeps for its attributes, for what was just put in place (as LANGUAGE_SCRIPT writes them).
  const relabel = () => {
    const lang = html.dataset.lang || 'en';
    const cap = lang[0].toUpperCase() + lang[1];
    document.querySelectorAll('[data-label-' + lang + ']').forEach((element) => element.setAttribute('aria-label', element.dataset['label' + cap]));
    document.querySelectorAll('[data-placeholder-' + lang + ']').forEach((element) => element.setAttribute('placeholder', element.dataset['placeholder' + cap]));
  };
  const light = (element) => {
    element.classList.remove('live-lit');
    void element.offsetWidth;
    element.classList.add('live-lit');
    setTimeout(() => element.classList.remove('live-lit'), 2600);
  };
  const inView = (element) => {
    if (element.hidden || element.offsetParent === null) return false;
    const box = element.getBoundingClientRect();
    return box.bottom > 0 && box.top < window.innerHeight;
  };
  // L7a: the page as the server has it now, put in place by the page's own script.
  let going = null;
  let swapping = false;
  const swapIn = (answer) => { swapping = true; return fetch(location.pathname, { cache: 'no-store' })
    .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
    .then((text) => {
      const next = new DOMParser().parseFromString(text, 'text/html');
      const done = window.agentwhyLiveSwap(next);
      if (!done) { later(answer); return; }
      sent = next.documentElement.dataset.version || answer.version;
      html.dataset.version = sent;
      if (next.documentElement.dataset.conversations) html.dataset.conversations = next.documentElement.dataset.conversations;
      waiting = null;
      relabel();
      done.fresh.forEach(light);
      const unseen = done.added.filter((row) => !inView(row));
      if (unseen.length === 0) { if (!going || inView(going.row)) hideGo(); return; }
      going = { row: unseen[0], reveal: done.reveal };
      pill.textContent = say('go.' + form(done.added.length)).replace('{n}', String(done.added.length));
      pill.dataset.toTop = '';
      pill.classList.add('live-foot', 'pill-primary');
      pill.classList.remove('pill-light');
      pill.hidden = false;
    })
    .catch(() => later(answer))
    .finally(() => { swapping = false; }); };
  const hideGo = () => {
    going = null;
    pill.hidden = true;
    pill.classList.remove('live-foot', 'pill-primary');
    pill.classList.add('pill-light');
  };
  const ask = () => fetch('api/version/' + file, { cache: 'no-store' })
    .then((response) => {
      // which-project V14, amended: this project's pages were given up for another's, in this process - said at once.
      if (response.status === 410) { stop(); return null; }
      return response.ok ? response.json() : Promise.reject(new Error(String(response.status)));
    })
    .then((answer) => {
      misses = 0;
      // What a page may say while the server answers: "Connected" on an empty week (the maintainer's design, 2026-09-29).
      if (answer) html.dataset.live = 'on';
      if (!answer || answer.version === sent || swapping) return;
      waiting = answer;
      if (typeof window.agentwhyLiveSwap === 'function') return swapIn(answer);
      later(answer);
    })
    .catch(() => { misses += 1; if (misses >= 3) stop(); });
  const loop = () => {
    if (stopped) return;
    clearTimeout(timer);
    ask().finally(() => { if (!stopped) timer = setTimeout(loop, document.visibilityState === 'visible' ? 2000 : 60000); });
  };

  pill.addEventListener('click', () => {
    if (!going) { apply(pill.dataset.toTop === 'true'); return; }
    const { row, reveal } = going;
    hideGo();
    if (!row.isConnected) return;
    reveal(row);
    row.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    light(row);
  });
  const whenIdle = () => {
    if (going && inView(going.row)) { light(going.row); hideGo(); }
    if (waiting && !swapping && idle()) apply(false);
  };
  window.addEventListener('scroll', whenIdle, { passive: true });
  document.addEventListener('close', whenIdle, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !stopped) loop(); });
  timer = setTimeout(loop, 2000);
})();
`;
