/**
 * What only Settings does (`.ai/plans/2026-09-23-settings-redesign.md`, step 3). The kit opens and closes the windows
 * and switches the tabs; this posts what a confirm button carries, and reads the page again once the server has
 * written it (R60), so a control shows what the file holds and never what was clicked. A refusal is said in the words
 * the server gave (R59). Opened as a file, nothing can be written, and the same button shows the command that would
 * do it (R61).
 *
 * Picking or typing a file's name is the kit's (`add-file-popup.ts`), which reads a picked file's name and nothing
 * else (F36).
 */
export const SETTINGS_SCRIPT = String.raw`
(() => {
  const root = document.querySelector('[data-settings]');
  if (!root) return;
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const words = JSON.parse(root.dataset.setWords || '{}');
  const word = (key) => (words[document.documentElement.dataset.lang] || words.en || {})[key] || '';
  const TABS = ['files', 'alerts', 'general'];

  // The tab a person was on survives the page being read again after a write.
  const pills = [...root.querySelectorAll(':scope .tabs-state [data-tab]')];
  const opened = TABS.indexOf(location.hash.slice(1));
  if (opened > 0 && pills[opened]) pills[opened].click();
  pills.forEach((pill, at) => pill.addEventListener('click', () => history.replaceState(null, '', '#' + TABS[at])));

  const say = (where, text, command, busy) => {
    const line = where && where.querySelector('[data-set-say]');
    if (!line) return;
    line.textContent = text;
    line.classList.toggle('set-say-busy', busy === true);
    if (command) {
      const code = document.createElement('code');
      code.textContent = command;
      line.append(code);
    }
    line.hidden = false;
  };

  const quote = (text) => /^[\w@%+=:,./*-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\''") + "'";
  const shared = (where) => where === 'shared' ? ' --shared' : '';
  const commandFor = (body) => {
    // A private file is kept from searches too (F38), so protecting names refuse, as the page's own write does.
    if (body.change === 'protect') return 'agentwhy init --protect ' + quote(body.pattern) + ' --refuse' + shared(body.where);
    if (body.change === 'adopt') return 'agentwhy init' + body.patterns.map((pattern) => ' --protect ' + quote(pattern)).join('') + ' --refuse' + shared(body.where);
    if (body.change === 'unprotect') return 'agentwhy init --remove --unprotect ' + quote(body.pattern) + shared(body.where);
    if (body.scope === 'project') return 'agentwhy notify' + (body.on ? ' --on ' + body.on : '') + (body.clean ? ' --clean ' + body.clean : '');
    return '';
  };

  const post = (url, body, where, controls) => {
    controls.forEach((control) => { control.disabled = true; control.setAttribute('aria-busy', 'true'); });
    say(where, word('saving'), '', true);
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok, message: answer.message || '' })))
      .catch(() => ({ ok: false, message: word('unreachable') }))
      .then((answer) => {
        if (answer.ok) {
          const tab = TABS[pills.findIndex((pill) => pill.classList.contains('tabs-on'))] || TABS[0];
          location.replace(location.pathname + '?at=' + Date.now() + '#' + tab);
          return;
        }
        controls.forEach((control) => { control.disabled = false; control.removeAttribute('aria-busy'); });
        say(where, word('refused') + ' ' + answer.message);
      });
  };

  /** A change that writes into the project: posted where the page is served, said as a command where it is a file. */
  const change = (body, button, command) => {
    const dialog = button.closest('dialog');
    if (!served) { say(dialog, word('asFile'), command || commandFor(body)); return; }
    post('api/settings', body, dialog, [button]);
  };

  // A row that needs row 1 answers a click - on its switch or anywhere on it - with a bubble beside its switch, and
  // row 1 lights up for a moment.
  const tips = [...root.querySelectorAll('[data-set-tip]')];
  const hideTips = (except) => tips.forEach((tip) => { if (tip !== except) tip.hidden = true; });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTips(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('[data-set-tip], .set-msg-locked')) hideTips(); });

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-set-tip] [data-popup-open]')) hideTips();
    const locked = !event.target.closest('[data-set-tip]') && event.target.closest('.set-msg-locked');
    const needs = locked && locked.querySelector('[data-set-needs-first]');
    if (needs) {
      const tip = document.getElementById(needs.getAttribute('aria-describedby'));
      hideTips(tip);
      if (tip) tip.hidden = false;
      const first = root.querySelector('[data-set-first]');
      if (first) {
        first.classList.add('set-msg-point');
        setTimeout(() => first.classList.remove('set-msg-point'), 1600);
      }
      return;
    }

    const confirm = event.target.closest('[data-set-write]');
    if (confirm) {
      const body = JSON.parse(confirm.dataset.setWrite);
      if (confirm.dataset.setWho) {
        const picked = document.querySelector('input[name="' + confirm.dataset.setWho + '"]:checked');
        body.where = picked ? picked.value : 'local';
      }
      change(body, confirm, confirm.getAttribute('data-set-command-' + (body.where || 'local')));
      return;
    }

    // A row not watched yet opens its confirmation from anywhere on it, as its own button does.
    const unwatched = event.target.closest('[data-set-row]');
    if (unwatched && !event.target.closest('[data-popup-open]')) {
      const button = unwatched.querySelector('[data-popup-open]');
      if (button) button.click();
      return;
    }

    const add = event.target.closest('[data-set-add]');
    if (add) {
      const settings = JSON.parse(add.dataset.setAdd);
      const pattern = add.dataset.pattern;
      if (!pattern) return;
      const body = settings.builtIn.length > 0
        ? { change: 'adopt', patterns: [...settings.builtIn, pattern], where: settings.where }
        : { change: 'protect', pattern, where: settings.where };
      // Where alerts run from the same file, the command names them too: \`init\` with a hook flag takes out any other.
      change(body, add, commandFor(body).replace(/( --shared)?$/, (settings.watch ? ' --watch' : '') + '$1'));
      return;
    }

    // Rows 2 and 3 are notice choices for this project, written at once (R26a).
    const notice = event.target.closest('[data-set-notice]');
    if (notice) {
      const body = Object.assign({ scope: 'project' }, JSON.parse(notice.dataset.setNotice));
      const card = notice.closest('.set-msg');
      if (!served) { say(card, word('asFile'), commandFor(body)); return; }
      post('api/notify', body, card, [notice]);
      return;
    }

  });

  /**
   * The kit's "Add a private file" hands over a name already turned into its pattern, or refused in words (F36, R46);
   * Settings shows the pattern exactly as it will be written, and what it means, and asks (F35).
   */
  const picker = root.querySelector('#set-add');
  if (picker) picker.addEventListener('add-file', (event) => {
    const confirm = root.querySelector('#set-add-confirm');
    if (!confirm) return;
    const { name, kind, pattern } = event.detail;
    confirm.querySelectorAll('[data-set-name]').forEach((slot) => { slot.textContent = kind === 'folder' ? name + '/' : name; });
    confirm.querySelectorAll('[data-set-pattern]').forEach((slot) => { slot.textContent = pattern; });
    confirm.querySelectorAll('[data-set-kind]').forEach((slot) => { slot.hidden = slot.dataset.setKind !== kind; });
    const button = confirm.querySelector('[data-set-add]');
    if (button) button.dataset.pattern = pattern;
    const line = confirm.querySelector('[data-set-say]');
    if (line) line.hidden = true;
    if (picker.open) picker.close();
    confirm.showModal();
  });
})();
`;
