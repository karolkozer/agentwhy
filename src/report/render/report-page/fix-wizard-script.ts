// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The Fix it wizard's steps (the report page spec P18-P25): one step shown at a time; on the first, "Skip for now", which
 * moves to the next file and writes nothing (F52, O13), beside the main button "I did it", which goes on once every row
 * is ticked and, before that, points at the rows still to do; the path copied, the answer to "What's in this file?"
 * drawing its checklist (F49), and a finished file drawn done on the list.
 *
 * What it writes (P42, P43): Done and the quiet skip send a mark, and **Yes, protect it** a rule, to the server the page
 * was loaded from - only where the page says it is served. The file is drawn done, or the rule drawn in place, after
 * the server says so; a refusal is shown in the server's words and changes nothing. A page that is not served, or
 * whose server has stopped, shows the command that does the same instead. A shared copy writes nothing and shows no
 * command (P46). Words come from the page, in every language, never from here.
 *
 * A page that cannot know when it is written whether it will be served - To fix - says `auto`, and the address decides.
 * There a note typed in the last step goes with the mark, the handed-over command carries the run's range, and a
 * written mark is announced (`wizard-marked`) so the page can read itself again (to-fix spec T14, R60).
 */
export const FIX_WIZARD_SCRIPT = String.raw`
(() => {
  const words = document.getElementById('wizard-words');
  const say = (key) => (words ? words.querySelector('[data-word="' + key + '"]').innerHTML : key);
  const served = words !== null && (words.dataset.served === 'true' ||
    (words.dataset.served === 'auto' && (location.protocol === 'http:' || location.protocol === 'https:')));

  /** A path as a shell reads it back: in single quotes, with a quote inside closed and reopened. */
  const quoted = (text) => "'" + text.split("'").join("'\\''") + "'";

  /** reached: the server answered at all. A page that is not served never asks. */
  const send = (route, body) => (!served
    ? Promise.resolve({ reached: false, ok: false, message: '' })
    : fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json().then((answer) => ({ reached: true, ok: response.ok && answer.ok === true, message: String(answer.message || '') })))
      .catch(() => ({ reached: false, ok: false, message: '' })));

  const handOver = (box, command) => {
    box.querySelector('[data-command]').textContent = command;
    box.querySelector('[data-copy]').setAttribute('data-copy', command);
    box.hidden = false;
  };

  const copy = (button) => {
    const text = button.getAttribute('data-copy');
    const shown = () => { button.classList.add('wz-copied'); setTimeout(() => button.classList.remove('wz-copied'), 2000); };
    if (text && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(shown, () => {});
  };

  // P38: the rule is sent, and the window closes only once it is written; otherwise it says why, or what to run.
  const protect = (button) => {
    const dialog = button.closest('dialog');
    const every = dialog.querySelector('[data-protect-every]');
    const pattern = every && every.checked ? button.getAttribute('data-pattern-every') : button.getAttribute('data-pattern');
    const reason = dialog.querySelector('[data-note-reason]');
    const command = dialog.querySelector('[data-note-command]');
    reason.hidden = true;
    command.hidden = true;
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.forEach((each) => { each.disabled = true; });
    send('api/settings', { change: 'protect', pattern }).then((answer) => {
      buttons.forEach((each) => { each.disabled = false; });
      if (answer.ok) {
        const at = button.getAttribute('data-protect');
        document.querySelectorAll('[data-protect-open="' + at + '"]').forEach((open) => { open.hidden = true; open.style.display = 'none'; });
        document.querySelectorAll('[data-protected="' + at + '"]').forEach((tag) => { tag.hidden = false; });
        document.querySelectorAll('[data-file-key="' + at + '"]').forEach((row) => { row.dataset.prot = 'yes'; });
        document.dispatchEvent(new CustomEvent('files-changed'));
        dialog.close();
      } else if (answer.reached) {
        reason.textContent = answer.message;
        reason.hidden = false;
      } else {
        handOver(command, 'agentwhy init --protect ' + quoted(pattern));
      }
    });
  };

  document.addEventListener('click', (event) => {
    const copying = event.target.closest('[data-copy]');
    if (copying) { copy(copying); return; }
    const protecting = event.target.closest('[data-protect]');
    if (protecting) protect(protecting);
  });

  const wizards = [...document.querySelectorAll('[data-wizard]')];
  if (wizards.length === 0) return;

  const state = new Map();
  const stateOf = (wizard) => {
    if (!state.has(wizard)) state.set(wizard, { step: 1, answer: null });
    return state.get(wizard);
  };

  const scopeOf = (wizard) => (wizard.dataset.kind === 'keys'
    ? wizard.querySelector('[data-step="1"]')
    : wizard.querySelector('.wz-answered.wz-on [data-checklist]'));

  const tickedAll = (scope) => {
    const rows = scope ? scope.querySelectorAll('[data-checklist] .ck-row') : [];
    return rows.length > 0 && [...rows].every((row) => row.classList.contains('ck-on'));
  };

  const draw = (wizard) => {
    const s = stateOf(wizard);
    wizard.querySelectorAll('.wz-step').forEach((step) => step.classList.toggle('wz-on', step.dataset.step === String(s.step)));
    wizard.querySelectorAll('.st-step').forEach((item, at) => {
      const n = at + 1;
      const state = n < s.step || (n === 3 && s.step === 3) ? 'past' : n === s.step ? 'current' : 'future';
      item.className = 'st-step st-' + state;
      item.querySelector('.st-mark').textContent = state === 'past' ? '✓' : String(n);
    });
    const main = wizard.querySelector('[data-wz-next]');
    const last = wizard.querySelector('[data-wz-last]');
    const skip = wizard.querySelector('[data-wz-skip]');
    const later = wizard.querySelector('[data-wz-later]');
    const back = wizard.querySelector('[data-wz-back]');
    const hint = wizard.querySelector('[data-wz-hint]');
    back.hidden = s.step !== 2;
    if (skip) skip.hidden = s.step !== 1;
    later.hidden = s.step !== 1;
    main.hidden = s.step === 3;
    last.hidden = s.step !== 3;
    if (s.step === 1) {
      const all = tickedAll(scopeOf(wizard));
      main.className = 'pill pill-lg wz-main js-only pill-primary' + (all ? '' : ' wz-wait');
      main.innerHTML = say('wz.all');
      if (all) hint.hidden = true;
    } else if (s.step === 2) {
      hint.hidden = true;
      main.className = 'pill pill-lg wz-main js-only pill-mint';
      main.innerHTML = say('wz.finish');
    }
  };

  const markDone = (wizard) => {
    const at = wizard.dataset.item;
    const card = document.querySelector('.tc[data-item="' + at + '"]');
    if (card && !card.classList.contains('tc-done')) {
      card.classList.add('tc-done');
      card.querySelector('.tc-check').textContent = '✓';
    }
    const done = document.querySelectorAll('.tc.tc-done').length;
    const total = document.querySelectorAll('.tc[data-item]').length;
    document.querySelectorAll('[data-done]').forEach((element) => { element.textContent = String(done); });
    const fill = document.querySelector('[data-progress] .pg-fill');
    if (fill) fill.style.width = (total === 0 ? 0 : Math.round((done / total) * 1000) / 10) + '%';
    const track = document.querySelector('[data-progress] .pg-track');
    if (track) track.setAttribute('aria-valuenow', String(done));
    document.querySelectorAll('[data-files-fix="' + at + '"]').forEach((element) => { element.hidden = true; });
    document.querySelectorAll('[data-files-fixed="' + at + '"]').forEach((element) => { element.hidden = false; });
    document.querySelectorAll('[data-file-item="' + at + '"]').forEach((row) => {
      row.dataset.group = 'fixed';
      const bar = row.querySelector('.dt-bar');
      if (bar) bar.remove();
    });
    document.dispatchEvent(new CustomEvent('files-changed'));
    document.querySelectorAll('[data-story-fix="' + at + '"]').forEach((element) => { element.hidden = true; });
    document.querySelectorAll('[data-story-fixed="' + at + '"]').forEach((element) => { element.hidden = false; });
    document.querySelectorAll('.rl-dash[data-rail-item="' + at + '"]').forEach((dash) => { if (!dash.classList.contains('rl-now')) dash.className = 'rl-dash rl-done'; });
    const next = document.querySelector('.tc[data-item]:not(.tc-done)');
    const go = document.querySelector('[data-guide-go]');
    if (go && next) {
      go.setAttribute('href', '#fix-' + next.dataset.item);
      go.setAttribute('data-popup-open', 'fix-' + next.dataset.item);
    }
    const guide = document.querySelector('[data-guide]');
    const finished = document.querySelector('[data-all-done]');
    if (!next && guide && finished) { guide.hidden = true; finished.hidden = false; }
    // The coral "!" above the answer gives way to the mint tick once everything is done.
    if (!next) {
      document.querySelectorAll('[data-hero-todo]').forEach((mark) => { mark.hidden = true; });
      document.querySelectorAll('[data-hero-done]').forEach((mark) => { mark.hidden = false; });
    }
  };

  const finish = (wizard) => {
    stateOf(wizard).step = 3;
    markDone(wizard);
    draw(wizard);
  };

  // F25, F50: the mark is written first; the file is drawn done once it is, or once the command is on the screen.
  const close = (wizard, result) => {
    const reason = wizard.querySelector('[data-wz-reason]');
    const handover = wizard.querySelector('[data-handover]');
    reason.hidden = true;
    handover.hidden = true;
    if (wizard.hasAttribute('data-shared')) { finish(wizard); return; }
    const main = wizard.querySelector('[data-wz-next]');
    const buttons = [...wizard.querySelectorAll('.wz-foot button')];
    buttons.forEach((each) => { each.disabled = true; });
    if (served && !main.hidden) main.innerHTML = say('wz.saving');
    const field = wizard.querySelector('[data-wz-note]');
    const note = field ? field.value.trim() : '';
    const body = { path: wizard.dataset.path, result };
    if (note !== '') body.note = note;
    const since = wizard.dataset.since;
    send('api/mark', body).then((answer) => {
      buttons.forEach((each) => { each.disabled = false; });
      if (!answer.ok && answer.reached) {
        reason.textContent = answer.message;
        reason.hidden = false;
        draw(wizard);
        return;
      }
      if (!answer.ok) {
        handOver(handover, 'agentwhy check --mark ' + result + ' ' + quoted(wizard.dataset.path) +
          (since ? ' --since ' + quoted(since) : '') + (note === '' ? '' : ' --note ' + quoted(note)));
      } else {
        wizard.dispatchEvent(new CustomEvent('wizard-marked', { bubbles: true }));
      }
      finish(wizard);
    });
  };

  // F52: "Skip for now" leaves this file as it is and goes to the next one, or back to the list after the last.
  const leave = (wizard) => {
    const dialog = wizard.closest('dialog');
    const next = document.getElementById('fix-' + (Number(wizard.dataset.item) + 1));
    if (dialog) dialog.close();
    if (next && typeof next.showModal === 'function' && !next.open) next.showModal();
  };

  // "I did it" before every row is ticked: the rows still to do are pointed at, and the hint says what to click - or,
  // before "What's in this file?" is answered, that it is to be answered first.
  const nudge = (wizard, scope) => {
    const hint = wizard.querySelector('[data-wz-hint]');
    hint.innerHTML = say(scope ? 'wz.tickFirst' : 'wz.pickFirst');
    hint.hidden = false;
    const rows = scope ? [...scope.querySelectorAll('[data-checklist] .ck-row:not(.ck-on)')] : [...wizard.querySelectorAll('[data-answer]')];
    rows.forEach((row) => { const fold = row.closest('details'); if (fold) fold.open = true; });
    rows.forEach((row) => { row.classList.add('ck-nudge'); setTimeout(() => row.classList.remove('ck-nudge'), 1600); });
    if (rows[0]) rows[0].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  wizards.forEach(draw);

  document.addEventListener('checklist', (event) => {
    const wizard = event.target.closest('[data-wizard]');
    if (wizard) draw(wizard);
  });

  document.addEventListener('click', (event) => {
    const wizard = event.target.closest('[data-wizard]');
    if (!wizard) return;
    const s = stateOf(wizard);

    if (event.target.closest('[data-wz-next]')) {
      if (s.step === 1) {
        const scope = scopeOf(wizard);
        if (!tickedAll(scope)) { nudge(wizard, scope); return; }
        s.step = 2;
      } else if (s.step === 2) { close(wizard, wizard.dataset.kind === 'keys' ? 'rotated' : 'handled'); return; }
      draw(wizard);
      return;
    }
    if (event.target.closest('[data-wz-later]')) { leave(wizard); return; }
    if (event.target.closest('[data-wz-back]')) { s.step = 1; draw(wizard); return; }
    const skip = event.target.closest('[data-wz-skip]');
    if (skip) { close(wizard, skip.getAttribute('data-wz-skip')); return; }
    if (event.target.closest('[data-wz-last]')) { const dialog = wizard.closest('dialog'); if (dialog) dialog.close(); return; }

    const answer = event.target.closest('[data-answer]');
    if (answer) {
      wizard.querySelectorAll('[data-answer]').forEach((each) => each.setAttribute('aria-checked', String(each === answer)));
      s.answer = answer.dataset.answer;
      wizard.querySelectorAll('.wz-answered').forEach((block) => block.classList.toggle('wz-on', block.dataset.forAnswer === s.answer));
      draw(wizard);
    }
  });
})();
`;
