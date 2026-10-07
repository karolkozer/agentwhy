// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { COMPUTER_SWITCH, EVERYWHERE_STEP } from './everywhere-address.ts';
import { EV_CONFIRM } from './everywhere-screens.ts';
import { INTRO_MS } from './intro.ts';
import { PICK_GROUP } from './project-step.ts';
import { WORKING_JS } from '../../render/ui/button.ts';

/**
 * The address of step *Who* (`.ai/specs/2026-09-27-which-project.md` V16): `onboarding.html#who` opens there, past the
 * intro, the welcome and the project step - where a page that chose this project in another's onboarding lands.
 */
export const WHO_STEP = 'who';

/**
 * What only the onboarding does (`.ai/specs/2026-09-24-onboarding.md`). The kit opens and closes the add popup, and the
 * switch's script shows another project (`which-project.md` V14); this moves between the screens, opens the project
 * step's list, keeps the two other steps' choices - nothing is written before Finish (W10) - posts them (W15),
 * and draws Done from the server's answer
 * (W17-W20, W26). It plays the intro, and moves from one screen to the next, only where motion is welcome (W6, W24, W29).
 *
 * A picked file gives its name and nothing else: the kit's add popup reads a picked file's name and hands this page the
 * pattern (F36). Nothing here reads a file.
 */
export const ONBOARDING_SCRIPT = String.raw`
(() => {
${WORKING_JS}  const root = document.querySelector('[data-ob]');
  if (!root) return;
  const state = JSON.parse(root.dataset.obState || '{}');
  const words = JSON.parse(root.dataset.obWords || '{}');
  const lang = () => document.documentElement.dataset.lang || 'en';
  const word = (key, which) => ((words[which || lang()] || words.en || {})[key]) || (words.en || {})[key] || '';
  // "Open agentwhy" says at once that the page is on its way: the button's spinner, and the switch's own veil over the
  // page saying so, until the next page is open - or taken away where it could not open, or the page comes back.
  const opening = (button, on) => {
    button.classList.toggle('pill-busy', on);
    if (on) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
    let veil = document.body.querySelector(':scope > [data-ob-veil]');
    if (!veil && on) {
      veil = document.createElement('div');
      veil.className = 'pjw-veil pjw-veil-page';
      veil.setAttribute('data-ob-veil', '');
      veil.setAttribute('role', 'status');
      veil.innerHTML = '<div class="pjw-veil-card"><span class="pjw-veil-spin" aria-hidden="true"></span><p class="pjw-veil-say"></p></div>';
      document.body.append(veil);
    }
    if (veil) {
      veil.querySelector('.pjw-veil-say').textContent = word('opening');
      veil.hidden = !on;
    }
  };
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    document.querySelectorAll('.ob-done-go .pill-busy').forEach((button) => opening(button, false));
  });
  const plural = (which, n) => n === 1 ? 'one' : which !== 'pl' ? 'other' : (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) ? 'few' : 'many';
  const counted = (key, n, which) => (word(key + '.' + plural(which, n), which) || word(key + '.other', which)).replace('{n}', String(n));
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const screens = [...root.querySelectorAll('[data-ob-screen]')];
  const STEPS = ['project', 'who', 'files'];
  // The order the screens come in, so a move back slides the other way. The computer-wide path's two screens come
  // after the project's steps: it is reached from the fork, which comes before them (protected-everywhere G7).
  const ORDER = ['intro', 'welcome', 'scope', ...STEPS, 'everywhere', 'done', 'everywhere-done'];
  const LEAVE_MS = 180;
  const ENTER_MS = 700;
  let timer;
  let moving;

  const show = (name, back) => {
    clearTimeout(timer);
    screens.forEach((screen) => {
      screen.hidden = screen.dataset.obScreen !== name;
      screen.classList.remove('ob-enter', 'ob-leave', 'ob-back');
    });
    root.dataset.obAt = name;
    const at = STEPS.indexOf(name);
    root.querySelectorAll('[data-ob-stepper] [data-ob-step]').forEach((pill, index) => {
      pill.classList.toggle('ob-stepper-now', index === at);
      pill.classList.toggle('ob-stepper-past', at >= 0 && index < at);
      if (index === at) pill.setAttribute('aria-current', 'step'); else pill.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    const screen = screens.find((each) => each.dataset.obScreen === name);
    if (screen && back !== undefined && !still) {
      screen.classList.add('ob-enter');
      screen.classList.toggle('ob-back', back);
      timer = setTimeout(() => screen.classList.remove('ob-enter', 'ob-back'), ENTER_MS);
    }
    // The project step holds a heading for each of its views; the one shown is the one read.
    const heading = screen && [...screen.querySelectorAll('h1, h2')].find((one) => one.offsetParent !== null);
    if (heading && name !== 'intro') { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  };

  // A click from one screen to the next: the one shown slides out, the next slides in from the side it lies on.
  const go = (name) => {
    const from = screens.find((screen) => !screen.hidden);
    const back = ORDER.indexOf(name) < ORDER.indexOf(root.dataset.obAt);
    clearTimeout(moving);
    if (still || !from || root.dataset.obAt === 'intro') { show(name, back); return; }
    from.classList.remove('ob-enter');
    from.classList.add('ob-leave');
    from.classList.toggle('ob-back', back);
    moving = setTimeout(() => show(name, back), LEAVE_MS);
  };

  // which-project V16: a page that chose this project in another's onboarding lands here at Who, the project chosen.
  const addressed = location.hash === '#${WHO_STEP}' && screens.some((screen) => screen.dataset.obScreen === '${WHO_STEP}');
  // W6, W24, W29: the intro once per person, never where motion is unwelcome; then the welcome - or, in the home
  // directory for someone who has been through it before, the project step (V7).
  if (addressed) {
    show('${WHO_STEP}');
  } else if (location.hash === '#${EVERYWHERE_STEP}' && screens.some((screen) => screen.dataset.obScreen === '${EVERYWHERE_STEP}')) {
    show('${EVERYWHERE_STEP}');
  } else if (state.atProject) {
    // The home folder, for a person who has been through it before: the choice of a project or the computer, where the
    // computer is offered (the maintainer, 2026-10-07); the list of projects otherwise (V7).
    show(state.scope ? 'scope' : 'project');
  } else if (state.intro && !still) {
    show('intro');
    timer = setTimeout(() => show('welcome'), ${INTRO_MS});
  } else {
    show('welcome');
  }


  // which-project V20, V12, V14-V16: the project step - its card, the list it opens, what the folder window came to, and a
  // switch. Choosing this run's own project goes on to Who in the page; any other is shown in this tab, at its own Who.
  const projectStep = root.querySelector('[data-ob-screen="project"]');
  if (projectStep) {
    const list = projectStep.querySelector('[data-ob-list]');
    const chosenBox = projectStep.querySelector('[data-ob-chosen]');
    const notice = projectStep.querySelector('[data-ob-notice]');
    const onward = projectStep.querySelector('[data-ob-continue]');
    const chooser = projectStep.querySelector('[data-ob-choose]');
    const switching = projectStep.querySelector('[data-ob-switching]');
    const radios = () => [...projectStep.querySelectorAll('input[name="${PICK_GROUP}"]')];
    const picked = () => radios().find((radio) => radio.checked && !radio.closest('[hidden]'));
    const own = () => radios().find((radio) => radio.hasAttribute('data-pick-here') && !radio.closest('[data-ob-chosen]'));
    const drawOnward = () => { if (onward) onward.disabled = !picked(); };
    const say = (tone, title, text) => {
      if (!notice) return;
      notice.classList.toggle('ob-notice-warn', tone === 'warn');
      notice.querySelector('[data-ob-notice-mark]').textContent = tone === 'warn' ? '!' : '→';
      notice.querySelector('[data-ob-notice-title]').textContent = title;
      notice.querySelector('[data-ob-notice-text]').textContent = text || '';
      notice.hidden = false;
    };
    const unsay = () => { if (notice) notice.hidden = true; };
    // The list as it was drawn, what the folder window came to set aside.
    const toList = () => {
      unsay();
      if (chosenBox) { chosenBox.hidden = true; chosenBox.querySelector('[data-ob-chosen-rows]').textContent = ''; }
      if (list) list.hidden = false;
      const mine = own();
      if (mine && !picked()) mine.checked = true;
      drawOnward();
    };
    const ask = (route, body) => fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: {}, unreachable: true }));
    const failed = (answer) => say('warn', word('failedTitle'), answer.unreachable ? word('unreachable') : word('failed').replace('{reason}', (answer.answer && answer.answer.message) || ''));
    // V15: "Switching to blog…" where the step was, until the run that shows it answers with its address.
    const showSwitching = (name) => {
      projectStep.classList.add('ob-switching-now');
      if (!switching) return;
      switching.querySelector('[data-ob-switching-title]').textContent = word('switching').replace('{name}', name);
      switching.hidden = false;
    };
    const switchTo = (id, name) => {
      if (!served) { projectStep.classList.add('ob-picking'); say('warn', word('failedTitle'), word('unreachable')); return; }
      showSwitching(name);
      ask('api/switch-project', { id, from: 'step' }).then((answer) => {
        if (answer.ok && typeof answer.answer.url === 'string') { location.assign(answer.answer.url); return; }
        projectStep.classList.remove('ob-switching-now');
        if (switching) switching.hidden = true;
        projectStep.classList.add('ob-picking');
        failed(answer);
      });
    };
    // A chosen folder's project, as its row in the list draws it - or by its name and place, where the list does not hold it.
    const rowFor = (project) => {
      const listed = radios().find((one) => one.value === project.id && !one.closest('[data-ob-chosen]'));
      if (listed) {
        const row = listed.closest('.pjl-pick').cloneNode(true);
        row.classList.add('pjl-pick-here');
        return row;
      }
      const row = document.createElement('label');
      row.className = 'pjl-pick pjl-pick-here';
      const input = document.createElement('input');
      input.type = 'radio';
      input.className = 'pjl-radio-input';
      input.name = '${PICK_GROUP}';
      input.value = project.id;
      input.setAttribute('data-pick-name', project.name);
      if (project.here) input.setAttribute('data-pick-here', '');
      const mark = document.createElement('span');
      mark.className = 'pjl-radio';
      const dot = document.createElement('span');
      dot.className = 'pjl-radio-dot';
      mark.append(dot);
      const text = document.createElement('span');
      text.className = 'pjl-project';
      const name = document.createElement('span');
      name.className = 'pjl-name';
      name.textContent = project.name;
      const place = document.createElement('span');
      place.className = 'pjl-detail';
      place.textContent = project.place || '';
      text.append(name, place);
      row.append(input, mark, text);
      return row;
    };
    // V12: the computer's folder window, and what it came to, said over the list.
    const chooseFolder = () => {
      if (!served) { say('warn', word('failedTitle'), word('unreachable')); return; }
      toList();
      // The maintainer, 2026-09-28: a loader on the button, not a sentence, while the folder window opens and is open.
      const busy = (on) => {
        if (list) list.classList.toggle('ob-waiting', on);
        if (!chooser) return;
        chooser.classList.toggle('pill-busy', on);
        if (on) chooser.setAttribute('aria-busy', 'true'); else chooser.removeAttribute('aria-busy');
      };
      busy(true);
      if (onward) onward.disabled = true;
      ask('api/choose-folder', { lang: lang(), from: 'step' }).then((answer) => {
        busy(false);
        if (!answer.ok) { failed(answer); drawOnward(); return; }
        const said = answer.answer;
        if (said.kind === 'switched' && typeof said.url === 'string') { showSwitching(said.name || ''); location.assign(said.url); return; }
        if (said.kind === 'refused') say('warn', word('refusedTitle'), word(said.not === 'home' ? 'refusedHome' : 'refusedRoot'));
        else if (said.kind === 'here') { const mine = own(); if (mine) { mine.checked = true; unsay(); } else say('arrow', word('chooseHere'), ''); }
        else if (said.kind === 'near' && chosenBox && (said.projects || []).length > 0) {
          const projects = said.projects;
          say('arrow', (said.above ? word('chatsIn') : word('chatsInside')).replace('{name}', said.above ? projects[0].name : said.chosen.name),
            word('picked').replace('{place}', said.chosen.place || said.chosen.name));
          chosenBox.querySelector('[data-ob-chosen-label]').textContent = word(said.above ? 'weUse' : 'inThere');
          const rows = chosenBox.querySelector('[data-ob-chosen-rows]');
          rows.textContent = '';
          projects.forEach((project, at) => {
            const row = rowFor(project);
            row.querySelector('input').checked = at === 0;
            rows.append(row);
          });
          const anyway = chosenBox.querySelector('[data-ob-anyway]');
          anyway.textContent = word('useAnyway').replace('{name}', said.chosen.name);
          anyway.setAttribute('data-ob-switch', said.chosen.id);
          anyway.setAttribute('data-ob-name', said.chosen.name);
          if (list) list.hidden = true;
          chosenBox.hidden = false;
        } else unsay();
        drawOnward();
      });
    };
    projectStep.addEventListener('change', drawOnward);
    projectStep.addEventListener('click', (event) => {
      if (event.target.closest('[data-ob-pick]')) {
        projectStep.classList.add('ob-picking');
        toList();
        const first = picked() || radios()[0];
        if (first) first.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-ob-unpick]')) {
        if (chosenBox && !chosenBox.hidden) { toList(); return; }
        unsay();
        if (projectStep.querySelector('[data-ob-card]')) projectStep.classList.remove('ob-picking'); else go(state.scope ? 'scope' : 'welcome');
        return;
      }
      const other = event.target.closest('[data-ob-switch]');
      if (other) { switchTo(other.getAttribute('data-ob-switch'), other.getAttribute('data-ob-name') || ''); return; }
      if (event.target.closest('[data-ob-continue]')) {
        const chosen = picked();
        if (!chosen) return;
        if (chosen.hasAttribute('data-pick-here')) go('who'); else switchTo(chosen.value, chosen.getAttribute('data-pick-name') || '');
        return;
      }
      if (event.target.closest('[data-ob-choose]')) chooseFolder();
    });
    drawOnward();
  }

  // The steps' answers, from what is in force (W10), kept here until Finish. Step 3 is not drawn (2026-09-25): alerts
  // start on where they can be written, as it started them, and the two other moments stay as they are.
  const choices = { scope: state.who, watch: state.alerts.on, modes: {}, stopped: state.inForce.stopped, fine: state.inForce.fine };
  // W12a: the names added here, each with its own Block or Tell me.
  const added = [];
  const payload = () => ({
    scope: choices.scope,
    watch: choices.watch,
    protect: added.filter((item) => item.mode === 'block').map((item) => item.pattern),
    tell: added.filter((item) => item.mode === 'tell').map((item) => item.pattern),
    modes: choices.modes,
    stopped: choices.stopped,
    fine: choices.fine,
  });

  // Step 1 (W11): the chosen card.
  const whoCards = [...root.querySelectorAll('[data-ob-who]')];
  const drawWho = () => whoCards.forEach((card) => {
    const on = card.dataset.obWho === choices.scope;
    card.classList.toggle('ob-who-on', on);
    card.setAttribute('aria-checked', String(on));
  });

  // Step 2 (W12a): a row's switch and mark, drawn at the mode chosen.
  const drawMode = (holder, mode) => {
    const box = holder.querySelector('.ob-mode');
    if (!box) return;
    holder.classList.toggle('ob-rule-is-block', mode === 'block');
    holder.classList.toggle('ob-rule-is-tell', mode === 'tell');
    box.classList.toggle('ob-mode-is-block', mode === 'block');
    box.classList.toggle('ob-mode-is-tell', mode === 'tell');
    box.querySelectorAll('[data-ob-mode]').forEach((half) => {
      const on = half.dataset.obMode === mode;
      half.classList.toggle('ob-mode-on', on);
      half.setAttribute('aria-pressed', String(on));
    });
  };

  // Step 2 (W12, W12a): a name the kit's popup hands over becomes a row, on Block, and can be taken off again.
  const list = root.querySelector('[data-ob-files]');
  const template = root.querySelector('[data-ob-added-row]');
  const picker = document.getElementById('ob-add');
  const shown = (item) => item.kind === 'folder' ? item.name + '/' : item.name;
  // several-at-once AS8: the window hands over everything it gathered, and each becomes a row of its own.
  const eachAdded = (event, take) => ((event.detail && event.detail.files) || []).forEach(take);
  if (picker) picker.addEventListener('add-files', (event) => eachAdded(event, ({ name, kind, pattern }) => {
    // The same window serves the computer-wide list, which takes what it hands over on its own screen.
    if (root.dataset.obAt === 'everywhere') return;
    if (picker.open) picker.close();
    if (added.some((each) => each.pattern === pattern) || (state.inForce.protected || []).includes(pattern) || !list || !template) return;
    const item = { name, kind, pattern, mode: 'block' };
    added.push(item);
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelectorAll('[data-ob-name]').forEach((slot) => { slot.textContent = shown(item); slot.title = pattern; });
    row.querySelectorAll('[data-ob-kind]').forEach((slot) => { slot.hidden = slot.dataset.obKind !== kind; });
    row.querySelector('[data-ob-untick]').addEventListener('click', () => {
      added.splice(added.indexOf(item), 1);
      if (still) { row.remove(); return; }
      row.classList.add('ob-rule-gone');
      setTimeout(() => row.remove(), 200);
    });
    row.querySelectorAll('[data-ob-mode]').forEach((half) => half.addEventListener('click', () => {
      item.mode = half.dataset.obMode;
      drawMode(row, item.mode);
    }));
    list.append(row);
  }));

  const say = (where, text) => {
    const line = where && where.querySelector('[data-ob-say]');
    if (!line) return;
    line.textContent = text;
    line.hidden = text === '';
  };

  const filesStep = root.querySelector('[data-ob-screen="files"]');

  // protected-everywhere G7: the fork - this project, or everything on this computer. This project starts chosen.
  let scope = 'project';
  const drawScope = () => {
    root.querySelectorAll('[data-ob-scope]').forEach((card) => {
      const on = card.dataset.obScope === scope;
      card.classList.toggle('ob-scope-on', on);
      card.setAttribute('aria-checked', String(on));
    });
    // G7a: the line under the cards names what the chosen one leads to - three steps, or one.
    root.querySelectorAll('[data-ob-scope-next]').forEach((line) => { line.hidden = line.dataset.obScopeNext !== scope; });
  };

  // G9, GD14, GD11: the computer-wide Files step. A row is chosen where it is in and not held already; its mode is its
  // switch's. Nothing is written before the confirmation's one request.
  const evList = root.querySelector('[data-ob-ev-list]');
  const evRows = root.querySelector('[data-ob-ev-rows]');
  const evTemplate = root.querySelector('[data-ob-ev-added-row]');
  const evConfirm = document.getElementById('${EV_CONFIRM}');
  const evAll = () => [...root.querySelectorAll('[data-ob-ev-row]')];
  const evChosen = () => evAll().filter((row) => row.classList.contains('ob-ev-on') && !row.classList.contains('ob-ev-held')).map((row) => ({
    pattern: row.dataset.obEvPattern,
    mode: row.classList.contains('ob-rule-is-tell') ? 'tell' : 'block',
    chip: (row.querySelector('.ob-rule-chip') || {}).textContent || row.dataset.obEvPattern,
  }));
  const evCount = () => {
    const n = evChosen().length;
    root.querySelectorAll('[data-ob-ev-count]').forEach((slot) => { slot.textContent = n === 0 ? word('evNone') : counted('evCount', n); });
    // Nothing new chosen is no dead end (the maintainer, 2026-10-06, in a project where every file here was protected
    // already): Continue then goes to Done, which says what holds, with nothing to confirm and nothing written.
    const onward = root.querySelector('[data-ob-ev-continue]');
    if (onward && state.ev && state.ev.writable) onward.disabled = false;
  };
  // GD23: alerts in every project, on by default with the computer's step where they are not on yet.
  const evAlerts = () => Boolean(state.ev && state.ev.alerts);
  const evSay = (text) => {
    const line = evConfirm && evConfirm.querySelector('[data-ob-ev-say]');
    if (!line) return;
    line.textContent = text;
    line.hidden = text === '';
  };
  // The add window's place, as a row that is in, on Block, before the rows folded away. The computer step has its own
  // window, which names places (a-file-in-its-place IP2).
  const placePicker = document.getElementById('ob-add-place');
  if (placePicker && evRows && evTemplate) placePicker.addEventListener('add-files', (event) => eachAdded(event, ({ name, kind, pattern }) => {
    if (placePicker.open) placePicker.close();
    if (evAll().some((row) => row.dataset.obEvPattern === pattern)) return;
    const row = evTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.obEvPattern = pattern;
    row.querySelectorAll('[data-ob-name]').forEach((slot) => { slot.textContent = shown({ name, kind }); slot.title = pattern; });
    row.querySelectorAll('[data-ob-kind]').forEach((slot) => { slot.hidden = slot.dataset.obKind !== kind; });
    evRows.insertBefore(row, evRows.querySelector('.ob-ev-folded'));
    evCount();
  }));
  // The confirmation, filled from the rows chosen: a group is shown only where it holds something.
  const evOpen = () => {
    const chosen = evChosen();
    // No file new: the step is finished all the same - recorded, and the alerts written where they are ticked (GD26).
    if (chosen.length === 0) { evFinish(root.querySelector('[data-ob-ev-continue]')); return; }
    if (!evConfirm) return;
    evConfirm.querySelectorAll('[data-ob-ev-group="alerts"]').forEach((group) => { group.hidden = !evAlerts(); });
    ['block', 'tell'].forEach((mode) => {
      const mine = chosen.filter((item) => item.mode === mode);
      evConfirm.querySelectorAll('[data-ob-ev-group="' + mode + '"]').forEach((group) => { group.hidden = mine.length === 0; });
      evConfirm.querySelectorAll('[data-ob-ev-title="' + mode + '"]').forEach((slot) => {
        slot.textContent = counted(mode === 'block' ? 'evConfirmBlocked' : 'evConfirmTracked', mine.length, (slot.closest('[lang]') || {}).lang || 'en');
      });
    });
    evSay('');
    if (typeof evConfirm.showModal === 'function' && !evConfirm.open) evConfirm.showModal();
  };
  // Done, from the answer: what holds now - the rules held before and those just written - and what failed. Codex is
  // named only where its check is on now (GD13).
  const evDone = (answer, chosen) => {
    const results = answer.results || [];
    const wrote = (change) => (results.find((result) => result.change === change) || {}).written === true;
    const held = (mode) => evAll().filter((row) => row.classList.contains('ob-ev-held') && row.classList.contains('ob-rule-is-' + mode)).length;
    const blocked = held('block') + (wrote('block') ? chosen.filter((item) => item.mode === 'block').length : 0);
    const tracked = held('tell') + (wrote('tell') ? chosen.filter((item) => item.mode === 'tell').length : 0);
    root.querySelectorAll('[data-ob-ev-line="block"]').forEach((line) => { line.hidden = blocked === 0; });
    root.querySelectorAll('[data-ob-ev-line="tell"]').forEach((line) => { line.hidden = tracked === 0; });
    root.querySelectorAll('[data-ob-ev-line="alerts"]').forEach((line) => { line.hidden = !wrote('alerts'); });
    root.querySelectorAll('[data-ob-ev-codex]').forEach((part) => { part.hidden = (part.dataset.obEvCodex === 'on') !== (answer.codex === 'on'); });
    const off = root.querySelector('[data-ob-ev-codex-off]');
    if (off) off.hidden = answer.codex !== 'off';
    const failures = root.querySelector('[data-ob-ev-failed]');
    let failed = false;
    ['block', 'tell', 'alerts'].forEach((change) => {
      const result = results.find((one) => one.change === change);
      const now = result !== undefined && result.written !== true;
      const line = failures && failures.querySelector('[data-ob-ev-fail="' + change + '"]');
      if (line) line.hidden = !now;
      failed = failed || now;
    });
    if (failures) failures.hidden = !failed;
    root.querySelectorAll('[data-ob-ev-summary]').forEach((slot) => {
      const which = (slot.closest('[lang]') || {}).lang || 'en';
      const parts = ['✓ ' + word('evWhere', which)];
      if (blocked > 0) parts.push(counted('evBlocked', blocked, which));
      if (tracked > 0) parts.push(counted('evTracked', tracked, which));
      slot.textContent = parts.join(' · ');
    });
    const backdrop = document.querySelector('.bd');
    if (backdrop) backdrop.classList.add('bd-mint');
    go('everywhere-done');
  };
  // One request. A refusal, or nothing written at all, is said in the window; anything else is Done, which names what failed.
  const evSend = (button) => {
    if (!served) { evSay(word('unreachable')); return; }
    const chosen = evChosen();
    evSay('');
    working(button, true, word('saving'));
    const body = {
      block: chosen.filter((item) => item.mode === 'block').map((item) => item.pattern),
      tell: chosen.filter((item) => item.mode === 'tell').map((item) => item.pattern),
      ...(evAlerts() ? { alerts: true } : {}),
      // The step finished: recorded, and the computer's page opens on its default view (GD21, GD26).
      finish: true,
    };
    fetch('api/everywhere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: { message: word('unreachable') } }))
      .then(({ ok, answer }) => {
        working(button, false);
        if (!ok) { evSay(word('refused') + ' ' + (answer.message || '')); return; }
        const results = answer.results || [];
        if (results.length > 0 && results.every((result) => result.written !== true)) {
          evSay(word('refused') + ' ' + results.map((result) => word(result.change === 'tell' ? 'evFailTell' : result.change === 'alerts' ? 'evFailAlerts' : 'evFailBlock')).join(' '));
          return;
        }
        if (evConfirm.open) evConfirm.close();
        evDone(answer, chosen);
      });
  };
  // GD26: the step finished with no file new - one request that records it, with the alerts where they are ticked. A step
  // that cannot be sent (a page opened as a file) goes to Done as it did: there is nothing to record it with.
  const evFinish = (button) => {
    if (!served) { evDone({ results: [] }, []); return; }
    if (button) working(button, true, word('saving'));
    fetch('api/everywhere', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ finish: true, ...(evAlerts() ? { alerts: true } : {}) }) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: {} }))
      .then(({ ok, answer }) => {
        if (button) working(button, false);
        evDone(ok ? answer : { results: [] }, []);
      });
  };
  evCount();

  // W15: one request. A refusal is said where the person is; anything else is Done, which names what failed (W20).
  const send = (where, button) => {
    if (!served) { say(where, word('unreachable')); return; }
    say(where, '');
    working(button, true, word('saving'));
    fetch('api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
      .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true, answer })))
      .catch(() => ({ ok: false, answer: { message: word('unreachable') } }))
      .then(({ ok, answer }) => {
        working(button, false);
        if (!ok) { say(where, word('refused') + ' ' + (answer.message || '')); return; }
        done(answer);
      });
  };

  // W17-W20, W26: Done, from the answer. Alerts count as on only where the hook runs now.
  const done = (answer) => {
    const results = answer.results || [];
    const failed = results.filter((result) => !result.written);
    const hook = results.find((result) => result.change === 'watch');
    const on = choices.watch && (hook ? hook.written : state.inForce.watch !== false);
    root.querySelectorAll('[data-ob-if]').forEach((part) => { part.hidden = part.dataset.obIf !== (on ? 'on' : 'off'); });
    const failures = root.querySelector('[data-ob-failed]');
    failed.forEach((result) => {
      // A name added on Tell me and a row switched are one line: the Block and Tell me choices.
      const line = failures.querySelector('[data-ob-fail="' + (result.change === 'tell' ? 'mode' : result.change) + '"]');
      if (!line) return;
      line.querySelectorAll('[data-ob-fail-said]').forEach((slot) => { slot.textContent = result.message || ''; });
      line.hidden = false;
    });
    failures.hidden = failed.length === 0;
    const tick = root.querySelector('[data-ob-summary-tick]');
    if (tick) tick.hidden = failed.length > 0;
    const kinds = (state.rows || 0) + added.length;
    const messages = choices.watch ? 1 + (choices.stopped ? 1 : 0) + (choices.fine ? 1 : 0) : 0;
    root.querySelectorAll('[data-ob-summary]').forEach((slot) => {
      const which = (slot.closest('[lang]') || {}).lang || 'en';
      slot.textContent = word(choices.scope === 'shared' ? 'shared' : 'local', which) + ' · ' + counted('kinds', kinds, which) + ' · ' +
        word('messages', which).replace('{n}', String(messages));
      // which-project V23: the line begins with the project it was for.
      if (state.name) {
        const name = document.createElement('strong');
        name.textContent = state.name;
        slot.prepend(name, ' · ');
      }
    });
    // W20a: the line for Codex that Finish's answer names, where it names one.
    root.querySelectorAll('[data-ob-codex]').forEach((part) => { part.hidden = part.dataset.obCodex !== answer.codex; });
    const unrecorded = root.querySelector('[data-ob-unrecorded]');
    if (unrecorded) unrecorded.hidden = answer.recorded !== false;
    const backdrop = document.querySelector('.bd');
    if (backdrop) backdrop.classList.add('bd-mint');
    go('done');
  };

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-ob-skip-intro]')) { show('welcome'); return; }
    const to = event.target.closest('[data-ob-go]');
    if (to) { go(to.dataset.obGo); return; }
    const finish = event.target.closest('[data-ob-finish]');
    if (finish) { send(filesStep, finish); return; }

    const who = event.target.closest('[data-ob-who]');
    if (who) { choices.scope = who.dataset.obWho; drawWho(); return; }

    // protected-everywhere G7: the fork, and the way on it chose.
    const card = event.target.closest('[data-ob-scope]');
    if (card) { scope = card.dataset.obScope; drawScope(); return; }
    if (event.target.closest('[data-ob-scope-go]')) { go(scope === 'everywhere' ? 'everywhere' : 'project'); return; }
    // G9: a computer-wide row's Block or Track.
    const evHalf = event.target.closest('[data-ob-ev-row] [data-ob-mode]');
    if (evHalf) {
      drawMode(evHalf.closest('[data-ob-ev-row]'), evHalf.dataset.obMode);
      evCount();
      return;
    }
    // A row in or out: Add puts a suggestion in; the bin leaves it out, or takes away a name added here, as step 3's does.
    const evIn = event.target.closest('[data-ob-ev-row] [data-ob-ev-add]');
    if (evIn) { evIn.closest('[data-ob-ev-row]').classList.add('ob-ev-on'); evCount(); return; }
    const evOut = event.target.closest('[data-ob-ev-row] [data-ob-ev-leave]');
    if (evOut) {
      const row = evOut.closest('[data-ob-ev-row]');
      if (!row.hasAttribute('data-ob-ev-added')) { row.classList.remove('ob-ev-on'); evCount(); return; }
      if (still) { row.remove(); evCount(); return; }
      row.classList.add('ob-rule-gone');
      setTimeout(() => { row.remove(); evCount(); }, 200);
      return;
    }
    const more = event.target.closest('[data-ob-ev-more]');
    if (more && evList) {
      const open = evList.classList.toggle('ob-ev-open');
      more.setAttribute('aria-expanded', String(open));
      return;
    }
    if (event.target.closest('[data-ob-ev-continue]')) { evOpen(); return; }
    // Step 4 (GD15): Done's way on, from a project's page, is the computer's own view - shown in this tab, as a switch is.
    const toComputer = event.target.closest('[data-ob-switch-computer]');
    if (toComputer) {
      if (!served) return;
      toComputer.disabled = true;
      opening(toComputer, true);
      fetch('api/switch-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '${COMPUTER_SWITCH}', from: 'window' }) })
        .then((response) => response.json().then((answer) => ({ ok: response.ok && answer.ok === true && typeof answer.url === 'string', answer })))
        .catch(() => ({ ok: false, answer: {} }))
        .then(({ ok, answer }) => {
          if (ok) { location.assign(answer.url); return; }
          toComputer.disabled = false;
          opening(toComputer, false);
        });
      return;
    }
    // The way on as a link - from the home folder, the computer's own Conversations: the server draws it first, which
    // takes seconds the first time, so the page says it is on its way, as a switch does (the maintainer, 2026-10-07).
    const onward = event.target.closest('.ob-done-go a[href]');
    if (onward && served && !event.metaKey && !event.ctrlKey && !event.shiftKey) { opening(onward, true); return; }
    const yes = event.target.closest('[data-ob-ev-confirm]');
    if (yes) { evSend(yes); return; }

    // W12a: a row's Block or Tell me; the choice is kept only where it differs from what is in force.
    const half = event.target.closest('[data-ob-row] [data-ob-mode]');
    if (half) {
      const row = half.closest('[data-ob-row]');
      const key = row.dataset.obRow;
      const was = (state.inForce.rows.find((each) => each.key === key) || {}).mode;
      if (half.dataset.obMode === was) delete choices.modes[key]; else choices.modes[key] = half.dataset.obMode;
      drawMode(row, half.dataset.obMode);
    }
  });
})();
`;
