/**
 * What the pages read through periods do with a script - Conversations, a week at a time, and This month
 * (`for-people-who-build-with-ai.md` F10-F14; `.ai/plans/2026-09-23-month-redesign.md`): one period shown at a time, a
 * day tile narrowing every list to that day, and over the rest a search, a pill per group and five rows a group until
 * asked for more. It changes visibility and the counts beside it, and nothing else - every row and every word is in
 * the HTML already, and without it every period is on the page, one under another, every row of it shown. Left for a
 * conversation's report, the page is found again where it was.
 */
export const PERIODS_SCRIPT = String.raw`
(() => {
  const periods = [...document.querySelectorAll('[data-period-at]')];
  if (periods.length === 0) return;
  const kind = periods[0].dataset.kind || 'week';
  // F14: a group of the rest shows this many rows while the whole period is shown with no search and no group picked.
  const CAP = 5;
  // The groups of the rest, in period-section.ts REST's order.
  const LOOKS = ['fixed', 'name', 'stopped', 'none'];
  // F13: the rest, once opened, opens again - in this browser only, and folded where it cannot be remembered.
  const REMEMBER = 'agentwhy.conversations.rest';
  const remembered = () => { try { return localStorage.getItem(REMEMBER) === 'open'; } catch (error) { return false; } };
  const remember = (open) => { try { localStorage.setItem(REMEMBER, open ? 'open' : 'shut'); } catch (error) {} };
  // A count in every language the page carries, each with its plural forms beside it (period-section.ts countedLine).
  const counted = (element, n) => {
    const form = new Intl.PluralRules(element.lang).select(n);
    const text = element.getAttribute('data-form-' + form) || element.getAttribute('data-form-other') || '';
    element.textContent = text.replace('{n}', String(n));
  };

  const show = (at, scroll) => {
    const target = periods[at];
    if (!target) return;
    periods.forEach((period) => period.classList.toggle('cw-current', period === target));
    // Every period opens whole (F10, changed 2026-09-24): a day is chosen only by a tap.
    target.dataset.day = '';
    target.dataset.look = 'all';
    const search = target.querySelector('[data-search-input]');
    if (search) search.value = '';
    const others = target.querySelector('[data-others]');
    if (others && !others.closest('.cw-bare') && remembered()) others.open = true;
    apply(target);
    if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const apply = (period) => {
    const day = period.dataset.day || '';
    const search = period.querySelector('[data-search-input]');
    const query = search ? search.value.trim().toLowerCase() : '';
    period.querySelectorAll('button.cw-day[data-day]').forEach((tile) => {
      const on = tile.dataset.day === day;
      tile.classList.toggle('cw-day-on', on);
      tile.setAttribute('aria-pressed', String(on));
    });
    const fits = (row) => (!day || row.dataset.day === day) && (!query || (row.dataset.search || '').includes(query));

    // "Needs your attention", "For your info" and "Not checked": each narrows to the day chosen, and hides where the
    // day leaves none. The rest folds under the first two, and is laid bare where neither has a row in view.
    let toFix = 0;
    period.querySelectorAll('[data-need]').forEach((need) => {
      const rows = [...need.querySelectorAll('.dt-row[data-day]')];
      let shown = 0;
      rows.forEach((row) => { const fit = fits(row); row.hidden = !fit; if (fit) shown += 1; });
      need.hidden = shown === 0;
      if (need.hasAttribute('data-need-fix') || need.hasAttribute('data-need-info')) toFix += shown;
      const count = need.querySelector('[data-need-count]');
      if (count) count.textContent = String(shown);
    });

    // The day chosen, over every list (F10): its name, how many conversations it holds, and × for the whole week.
    const bar = period.querySelector('[data-day-bar]');
    if (bar) {
      const name = day ? period.querySelector('.cw-day[data-day="' + day + '"] .cw-day-name') : null;
      bar.hidden = !name;
      const label = bar.querySelector('[data-day-label]');
      if (name && label) label.innerHTML = name.innerHTML;
      const held = new Set([...period.querySelectorAll('.dt-row[data-day="' + day + '"]')].map((row) => row.dataset.liveKey || row));
      bar.querySelectorAll('[data-day-count]').forEach((element) => counted(element, held.size));
    }

    const others = period.querySelector('[data-others]');
    if (!others) return;
    // With nothing to fix in view the rest is laid bare, open under its own heading (F13); with something, it folds
    // back to what the person last left it as.
    const section = others.closest('.cw-others');
    const bare = toFix === 0;
    if (section && bare !== section.classList.contains('cw-bare')) {
      section.classList.toggle('cw-bare', bare);
      settling = true;
      others.open = bare || remembered();
      settling = false;
    }

    const pick = period.dataset.look || 'all';
    const rows = [...others.querySelectorAll('.dt-row[data-look]')];
    const counts = { all: 0 };
    rows.filter(fits).forEach((row) => { counts.all += 1; counts[row.dataset.look] = (counts[row.dataset.look] || 0) + 1; });
    others.querySelectorAll('[data-look-n]').forEach((element) => { element.textContent = String(counts[element.dataset.lookN] || 0); });
    others.querySelectorAll('[data-pick-look]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.pickLook === pick));
      button.hidden = button.dataset.pickLook !== 'all' && !counts[button.dataset.pickLook];
    });
    others.querySelectorAll('[data-mix-look]').forEach((fact) => { fact.hidden = !counts[fact.dataset.mixLook]; });

    // F14: five rows a group while the whole period is shown; a day, a search or a group picked shows all they match.
    const capped = !day && !query && pick === 'all';
    let shown = 0;
    LOOKS.forEach((look) => {
      const mine = rows.filter((row) => row.dataset.look === look);
      const fit = mine.filter((row) => fits(row) && (pick === 'all' || pick === look));
      const more = others.querySelector('[data-look-more="' + look + '"]');
      const whole = !capped || (more && more.getAttribute('aria-pressed') === 'true');
      mine.forEach((row) => { row.hidden = true; });
      fit.forEach((row, at) => { row.hidden = !whole && at >= CAP; if (!row.hidden) shown += 1; });
      const head = others.querySelector('[data-look-head="' + look + '"]');
      if (head) {
        head.hidden = fit.length === 0;
        const count = head.querySelector('.dt-group-count');
        if (count) count.textContent = String(fit.length);
      }
      const note = others.querySelector('[data-look-note="' + look + '"]');
      if (note) {
        note.hidden = !capped || fit.length <= CAP;
        note.querySelectorAll('[data-look-past="' + look + '"]').forEach((element) => { element.textContent = String(fit.length - CAP); });
      }
    });
    const empty = others.querySelector('.dt-empty');
    if (empty) empty.hidden = shown > 0;
    others.querySelectorAll('[data-shown]').forEach((element) => { element.textContent = String(shown); });
    // The line over the rest counts what it holds for the day and the search: its words carry every plural form.
    others.querySelectorAll('.fold-line [data-counted]').forEach((element) => counted(element, counts.all));
  };
  let settling = false;

  // ── the calendar a period is chosen in ──
  // The earlier page's calendar (Air Datepicker, vendored), opened from the period's name. A week is drawn as the
  // range it is: a click anywhere in a row takes the whole row, Monday to Sunday. A month is picked from a year of
  // months. A period this page holds no conversation in is not offered at all. Days are calendar days, so they cross
  // into the picker's own local dates through their numbers, never through a moment.
  const DAY = 86400000;
  const localOf = (number) => { const at = new Date(number * DAY); return new Date(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()); };
  const numberOf = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY);
  const mondayOf = (number) => number - ((new Date(number * DAY).getUTCDay() + 6) % 7);
  const firstOfMonth = (number) => { const at = new Date(number * DAY); return Math.floor(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1) / DAY); };
  const firstOf = kind === 'month' ? firstOfMonth : mondayOf;
  const offered = new Map(periods.map((period, at) => [Number(period.dataset.first), at]));
  const busy = new Set([...document.querySelectorAll('.cw-day[data-day]:not(:disabled)')].map((tile) => Number(tile.dataset.day)));
  let picker = null;

  const pickerLocale = () => {
    const lang = document.documentElement.dataset.lang || 'en';
    // 2024-01-07 is a Sunday, and the picker reads its day names from Sunday whatever day it starts a week on.
    const names = (options) => {
      const format = new Intl.DateTimeFormat(lang, Object.assign({ timeZone: 'UTC' }, options));
      return Array.from({ length: 7 }, (_, at) => format.format(new Date(Date.UTC(2024, 0, 7 + at))));
    };
    const months = (options) => {
      const format = new Intl.DateTimeFormat(lang, Object.assign({ timeZone: 'UTC' }, options));
      return Array.from({ length: 12 }, (_, at) => format.format(new Date(Date.UTC(2020, at, 1))));
    };
    return {
      days: names({ weekday: 'long' }), daysShort: names({ weekday: 'short' }), daysMin: names({ weekday: 'narrow' }),
      months: months({ month: 'long' }), monthsShort: months({ month: 'short' }),
      today: '', clear: '', dateFormat: 'yyyy-MM-dd', timeFormat: 'HH:mm', firstDay: 1,
    };
  };

  /** A day is not what is chosen here, so the row under the pointer lifts whole. Zero lifts none of them. */
  const paintWeek = (monday) => {
    if (!picker || !picker.$datepicker) return;
    picker.$datepicker.querySelectorAll('.air-datepicker-cell.-day-').forEach((cell) => {
      const number = cell.adpCell ? numberOf(cell.adpCell.date) : 0;
      cell.classList.toggle('cw-week-hover', monday !== 0 && number >= monday && number < monday + 7);
    });
  };

  const close = () => { if (picker) { picker.destroy(); picker = null; } };

  /** The period a picked date falls in, shown once the picker has let go of it. */
  const pickedFrom = (period) => ({ date }) => {
    const dates = Array.isArray(date) ? date : [date];
    const last = dates[dates.length - 1];
    const at = last ? offered.get(firstOf(numberOf(last))) : undefined;
    if (at === undefined) return;
    const target = periods[at];
    setTimeout(() => {
      close();
      if (target !== period) {
        history.replaceState(null, '', '#' + target.id);
        show(at, true);
      }
    }, 0);
  };

  const openPicker = (button) => {
    if (!window.AirDatepicker) return;
    const period = button.closest('[data-period-at]');
    const first = Number(period.dataset.first);
    const anchor = button.querySelector('.cw-pick-anchor');
    close();
    const firsts = [...offered.keys()];
    const common = { position: 'bottom center', locale: pickerLocale(), startDate: localOf(first), onSelect: pickedFrom(period) };
    picker = kind === 'month'
      ? new window.AirDatepicker(anchor, Object.assign(common, {
        view: 'months',
        minView: 'months',
        minDate: localOf(Math.min(...firsts)),
        maxDate: localOf(Math.max(...firsts)),
        selectedDates: [localOf(first)],
        onRenderCell: ({ date, cellType }) => {
          if (cellType !== 'month') return undefined;
          return offered.has(numberOf(date)) ? { classes: 'cw-has-data' } : { disabled: true };
        },
      }))
      : new window.AirDatepicker(anchor, Object.assign(common, {
        range: true,
        toggleSelected: false,
        minDate: localOf(Math.min(...firsts)),
        maxDate: localOf(Math.max(...firsts) + 6),
        selectedDates: [localOf(first), localOf(first + 6)],
        onRenderCell: ({ date, cellType }) => {
          if (cellType !== 'day') return undefined;
          const number = numberOf(date);
          if (!offered.has(mondayOf(number))) return { disabled: true };
          return busy.has(number) ? { classes: 'cw-has-data' } : undefined;
        },
        onHide: () => paintWeek(0),
      }));
    anchor.focus({ preventScroll: true });
    picker.show();
  };

  document.addEventListener('mouseover', (event) => {
    if (kind !== 'week' || !picker || !picker.$datepicker || !event.target.closest) return;
    const cell = event.target.closest('.air-datepicker-cell.-day-');
    paintWeek(cell && cell.adpCell && !cell.classList.contains('-disabled-') ? mondayOf(numberOf(cell.adpCell.date)) : 0);
  });

  document.addEventListener('mousedown', (event) => {
    if (!picker || !event.target.closest) return;
    if (event.target.closest('.air-datepicker') || event.target.closest('[data-period-pick]')) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  document.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-period-pick]');
    if (pick) {
      event.preventDefault();
      openPicker(pick);
      return;
    }
    const go = event.target.closest('[data-period-go]');
    if (go) {
      event.preventDefault();
      show(Number(go.dataset.periodGo), true);
      history.replaceState(null, '', go.getAttribute('href'));
      return;
    }
    // A tile that opens its day in a window (This month) is the window script's, not a filter.
    const tile = event.target.closest('.cw-day[data-day]:not([data-popup-open])');
    if (tile && !tile.disabled) {
      const period = tile.closest('[data-period-at]');
      period.dataset.day = period.dataset.day === tile.dataset.day ? '' : tile.dataset.day;
      apply(period);
      return;
    }
    const clear = event.target.closest('[data-day-clear]');
    if (clear) {
      const period = clear.closest('[data-period-at]');
      period.dataset.day = '';
      apply(period);
      return;
    }
    const group = event.target.closest('[data-pick-look]');
    if (group) {
      const period = group.closest('[data-period-at]');
      period.dataset.look = group.dataset.pickLook;
      apply(period);
      return;
    }
    const more = event.target.closest('[data-look-more]');
    if (more) {
      more.setAttribute('aria-pressed', String(more.getAttribute('aria-pressed') !== 'true'));
      apply(more.closest('[data-period-at]'));
    }
  });

  // What the person does to the fold is what it opens as next time, in this browser; the page's own changes are not.
  document.addEventListener('toggle', (event) => {
    const others = event.target;
    if (settling || !others.matches || !others.matches('[data-others]') || others.closest('.cw-bare')) return;
    remember(others.open);
  }, true);

  document.addEventListener('input', (event) => {
    const search = event.target.closest('[data-search-input]');
    if (search) apply(search.closest('[data-period-at]'));
  });

  // A period named in the address - a link from elsewhere, or the address changed by hand - is the period shown.
  const fromAddress = () => {
    const asked = new RegExp('^#' + kind + '-(\\d+)$').exec(location.hash);
    const at = asked ? periods.findIndex((period) => period.id === kind + '-' + asked[1]) : 0;
    return at < 0 ? 0 : at;
  };
  window.addEventListener('hashchange', () => show(fromAddress(), true));
  show(fromAddress(), false);

  // ── where the person was ──
  // A long list is left through a row's Open report or Fix it. What they were looking at - the period, the day, the
  // search, the group, the groups shown whole, the rest opened or folded - and how far down, is kept in this tab and put
  // back the next time this page opens here, by Back or by the sidebar, and then forgotten. An address that names
  // another period asked for that one, and is not overruled.
  const PLACE = 'agentwhy.place.' + (location.pathname.split('/').pop() || '/');
  const current = () => periods.find((period) => period.classList.contains('cw-current'));
  const leave = () => {
    const period = current();
    if (!period) return;
    const search = period.querySelector('[data-search-input]');
    const others = period.querySelector('[data-others]');
    const place = {
      id: period.id,
      day: period.dataset.day || '',
      look: period.dataset.look || 'all',
      search: search ? search.value : '',
      more: [...period.querySelectorAll('[data-look-more][aria-pressed="true"]')].map((button) => button.dataset.lookMore),
      open: others ? others.open : false,
      scroll: window.scrollY,
    };
    try { sessionStorage.setItem(PLACE, JSON.stringify(place)); } catch (error) {}
  };
  const comeBack = () => {
    let place = null;
    try { place = JSON.parse(sessionStorage.getItem(PLACE) || 'null'); sessionStorage.removeItem(PLACE); } catch (error) { return; }
    if (!place) return;
    const at = periods.findIndex((period) => period.id === place.id);
    if (at < 0 || (location.hash && location.hash !== '#' + place.id)) return;
    const period = periods[at];
    // The address is left as it came: a period named in it now would be scrolled to once the page has loaded.
    show(at, false);
    period.dataset.day = place.day || '';
    period.dataset.look = place.look || 'all';
    const search = period.querySelector('[data-search-input]');
    if (search) search.value = place.search || '';
    period.querySelectorAll('[data-look-more]').forEach((button) => {
      button.setAttribute('aria-pressed', String((place.more || []).includes(button.dataset.lookMore)));
    });
    apply(period);
    const others = period.querySelector('[data-others]');
    if (others && !others.closest('.cw-bare')) { settling = true; others.open = !!place.open; settling = false; }
    window.scrollTo(0, place.scroll || 0);
  };
  document.addEventListener('click', (event) => {
    // A click that opens the report in another tab or window leaves this page where it is: nothing to put back.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.target.closest && event.target.closest('.cw-action a[href]')) leave();
  });
  // Back that brings the page out of the browser's cache brings it as it was left: what was kept is not needed again.
  window.addEventListener('pageshow', (event) => { if (event.persisted) { try { sessionStorage.removeItem(PLACE); } catch (error) {} } });
  comeBack();

  // ── a new version, put in place (live-pages L7a, the maintainer 2026-09-25) ──
  // Conversations takes a new version of itself without a reload: each period keeps its element, and so what the script
  // set on it - the one shown, the day, the group - while what is inside is the new one; the search, the groups shown
  // whole and the fold are put back, and the row at the top of the view is held where it was, so nothing moves under
  // the reader. This month is left to the reload: its day windows stand outside its periods. A page whose periods are
  // not the ones it had (a week begun) answers nothing, and is reloaded as before.
  if (kind !== 'week') return;
  const signature = (row) => row.outerHTML.replace(/ hidden=""/g, '').replace(/ live-new/g, '');
  const visibleRows = () => [...document.querySelectorAll('.dt-row[data-live-key]')].filter((row) => !row.hidden && row.offsetParent !== null);
  window.agentwhyLiveSwap = (next) => {
    const nextPeriods = [...next.querySelectorAll('[data-period-at]')];
    if (nextPeriods.length !== periods.length || nextPeriods.some((period, at) => period.id !== periods[at].id)) return null;
    const before = new Map();
    document.querySelectorAll('.dt-row[data-live-key]').forEach((row) => { if (!before.has(row.dataset.liveKey)) before.set(row.dataset.liveKey, signature(row)); });
    const anchor = visibleRows().find((row) => row.getBoundingClientRect().bottom > 0);
    const anchorKey = anchor ? anchor.dataset.liveKey : '';
    const anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;

    periods.forEach((period, at) => {
      const search = period.querySelector('[data-search-input]');
      const others = period.querySelector('[data-others]');
      const kept = {
        search: search ? search.value : '',
        more: [...period.querySelectorAll('[data-look-more][aria-pressed="true"]')].map((button) => button.dataset.lookMore),
        open: others ? others.open : false,
      };
      period.replaceChildren(...[...nextPeriods[at].childNodes].map((node) => document.importNode(node, true)));
      const searchNow = period.querySelector('[data-search-input]');
      if (searchNow) searchNow.value = kept.search;
      period.querySelectorAll('[data-look-more]').forEach((button) => button.setAttribute('aria-pressed', String(kept.more.includes(button.dataset.lookMore))));
      const othersNow = period.querySelector('[data-others]');
      if (othersNow && !othersNow.closest('.cw-bare')) { settling = true; othersNow.open = kept.open; settling = false; }
      apply(period);
    });
    // The counts beside the page names, and the days the calendar offers, follow the conversations.
    document.querySelectorAll('.sb-item[href]').forEach((item) => {
      const same = next.querySelector('.sb-item[href="' + item.getAttribute('href') + '"]');
      if (same && same.innerHTML !== item.innerHTML) item.innerHTML = same.innerHTML;
    });
    busy.clear();
    document.querySelectorAll('.cw-day[data-day]:not(:disabled)').forEach((tile) => busy.add(Number(tile.dataset.day)));

    const held = anchorKey ? visibleRows().find((row) => row.dataset.liveKey === anchorKey) : undefined;
    if (held) window.scrollBy(0, held.getBoundingClientRect().top - anchorTop);

    const seen = new Set();
    const fresh = [...document.querySelectorAll('.dt-row[data-live-key]')].filter((row) => {
      const key = row.dataset.liveKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return before.get(key) !== signature(row);
    });
    return {
      fresh,
      added: fresh.filter((row) => !before.has(row.dataset.liveKey)),
      // A row a filter hides - another day chosen, a search, a group folded or capped - is shown by setting them aside.
      reveal: (row) => {
        const period = row.closest('[data-period-at]');
        if (!period) return;
        if (!period.classList.contains('cw-current')) show(periods.indexOf(period), false);
        if (row.hidden || row.offsetParent === null) {
          period.dataset.day = '';
          period.dataset.look = 'all';
          const search = period.querySelector('[data-search-input]');
          if (search) search.value = '';
          const look = row.dataset.look;
          const more = look ? period.querySelector('[data-look-more="' + look + '"]') : null;
          if (more) more.setAttribute('aria-pressed', 'true');
          const others = period.querySelector('[data-others]');
          if (others && row.closest('[data-others]')) { settling = true; others.open = true; settling = false; }
          apply(period);
        }
      },
    };
  };
})();
`;
