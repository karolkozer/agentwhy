/**
 * What only To fix does (`.ai/plans/2026-09-23-to-fix-redesign.md`, step 3). The kit opens and closes the windows and
 * switches the tabs, and the Fix it wizard writes a mark; this posts an undo, and reads the page again once the server
 * has written either (R60), so the lists show what the record of marks holds and never what was clicked - after a mark,
 * once the last window is closed, so "Next file" still opens the next one. A refusal is said in the server's words
 * (R59). Opened as a file, nothing can be written, and the same button shows the command that would do it (T17).
 */
export const TO_FIX_SCRIPT = String.raw`
(() => {
  const root = document.querySelector('[data-to-fix]');
  if (!root) return;
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const words = JSON.parse(root.dataset.fixWords || '{}');
  const word = (key) => (words[document.documentElement.dataset.lang] || words.en || {})[key] || '';
  const TABS = ['todo', 'done'];

  // The tab a person was on survives the page being read again after a write.
  const pills = [...root.querySelectorAll(':scope .tabs-bar [data-tab]')];
  if (location.hash === '#done' && pills[1]) pills[1].click();
  pills.forEach((pill, at) => pill.addEventListener('click', () => history.replaceState(null, '', '#' + TABS[at])));

  const say = (where, text, command, busy) => {
    const line = where && where.querySelector('[data-fix-say]');
    if (!line) return;
    line.textContent = text;
    line.classList.toggle('tf-say-busy', busy === true);
    if (command) {
      const code = document.createElement('code');
      code.textContent = command;
      line.append(code);
    }
    line.hidden = false;
  };

  const quote = (text) => /^[\w@%+=:,./-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\''") + "'";

  const reload = () => {
    const tab = TABS[pills.findIndex((pill) => pill.classList.contains('tabs-on'))] || TABS[0];
    location.replace(location.pathname + '?at=' + Date.now() + '#' + tab);
  };

  // A mark the wizard wrote: the page is read again when no window is left open.
  let marked = false;
  root.addEventListener('wizard-marked', () => { marked = true; });
  document.addEventListener('close', () => {
    if (marked) setTimeout(() => { if (!document.querySelector('dialog[open]')) reload(); }, 0);
  }, true);

  const post = (url, body, where, button) => {
    button.disabled = true;
    say(where, word('saving'), '', true);
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      // The server answers a refusal in JSON, and a request it does not take (a wrong origin, a lost token) in plain
      // text: both are its answer, said as it gave it. Only a request that got no answer at all is "unreachable".
      .then((response) => response.text().then((text) => {
        let answer = {};
        try { answer = JSON.parse(text); } catch { answer = { message: text.trim() }; }
        return { ok: response.ok && answer.ok === true, message: answer.message || String(response.status) };
      }), () => ({ ok: false, message: word('unreachable') }))
      .then((answer) => {
        if (answer.ok) { reload(); return; }
        button.disabled = false;
        say(where, word('refused') + ' ' + answer.message);
      });
  };

  root.addEventListener('click', (event) => {
    // "Fix it" in What happened: the wizard opens in its place, not over it.
    const from = event.target.closest('[data-fix-from]');
    if (from) {
      const where = from.closest('dialog');
      if (where && where.open) setTimeout(() => where.close(), 0);
      return;
    }

    const unmark = event.target.closest('[data-fix-unmark]');
    if (unmark) {
      const where = unmark.closest('dialog');
      const body = JSON.parse(unmark.dataset.fixUnmark);
      if (!served) { say(where, word('asFile'), 'agentwhy check --unmark ' + quote(body.path)); return; }
      post('api/unmark', body, where, unmark);
      return;
    }

    const all = event.target.closest('[data-fix-all]');
    if (all) {
      // The list is the same in the wizard's fold, in What happened's Conversations tab and in the small window.
      const section = all.closest('.tf-where-block');
      if (section) section.querySelectorAll('.tf-more').forEach((row) => row.classList.remove('tf-more'));
      all.hidden = true;
    }
  });
})();
`;
