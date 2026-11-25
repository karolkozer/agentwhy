// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

import { PROVIDER_NAMES } from '../../../core/session-format.ts';

/**
 * Draws one answer from the data the app hands the card (MCP Apps: `ui/notifications/tool-result`, CVB20). Every text is set as
 * text, never as markup. It asks nothing of its server - the app refuses a card's own call (CVB21) - so every tab is of data
 * already here; what it does not hold is asked for in the chat, in words the person sees before they go.
 */
export const CARD_SCRIPT = String.raw`
(function () {
'use strict';
let tables = JSON.parse(document.getElementById('words').textContent), lang, words, plural;
function speak(to) {
  lang = tables[to] ? to : 'en';
  words = tables[lang];
  plural = new Intl.PluralRules(lang);
  document.documentElement.lang = lang;
}
speak(document.documentElement.lang);
let view = document.getElementById('view'), tabs = document.getElementById('tabs'), where = document.getElementById('where');
let wide = false, last = 0, host = {}, can = null, room = 0, roomAt = 0, several = false, TALL = 560, card = document.getElementById('card');
let answer = null, now = null, asked = 0, waiting = {}, handed = false, side = 0;
let CONVERSATION = ['summary', 'steps', 'files', 'helpers', 'todo'], LIST = ['okay', 'conversations', 'often'];
let GROUPS = ['attention', 'fixed', 'tracked', 'stopped', 'seen', 'none', 'partly', 'failed'];
let GROUP_TONE = { attention: 'coral', fixed: 'mint', tracked: 'sand', stopped: 'mint', seen: 'blue', none: 'grey', partly: 'amber', failed: 'amber' };
let LOOK_TONE = { read: 'coral', guard: 'coral', fixed: 'mint', allowed: 'sand', opened: 'blue', name: 'blue', stopped: 'mint', none: 'grey', unchecked: 'amber', failed: 'amber' };
let ACCESS = ['read', 'changed', 'unknown', 'opened', 'stopped', 'name'], FIRST = 10, GOOD_FOR = 25 * 60 * 1000;
let ACCESS_TONE = { read: 'coral', changed: 'coral', opened: 'blue', name: 'blue', stopped: 'mint', unknown: 'amber' };
let RANK = { coral: 6, sand: 5, amber: 4, blue: 3, mint: 2, grey: 0 }, STRIP = 400;
let AI = ${JSON.stringify(PROVIDER_NAMES)};
let TONE_MARK = { coral: '!', sand: '✓', blue: '○', mint: '⊘', amber: '?', grey: '·' };

function t(key, vars) {
  let text = vars && typeof vars.n === 'number' ? words[key + '.' + plural.select(vars.n)] || words[key + '.other'] || words[key + '.many'] : undefined;
  text = text || words[key] || '';
  return text.replace(/\{(\w+)\}/g, function (_, name) { return vars && vars[name] !== undefined ? String(vars[name]) : ''; });
}
function el(tag, options, children) {
  let node = document.createElement(tag), o = options || {};
  if (o.c) node.className = o.c;
  if (o.text !== undefined) node.textContent = o.text;
  if (o.label) node.setAttribute('aria-label', o.label);
  if (o.click) { node.type = 'button'; node.addEventListener('click', o.click); }
  (children || []).forEach(function (child) { if (child) node.appendChild(child); });
  return node;
}
function fact(text, ask, calm) {
  let h = el('h1', { c: 'fact', text: text });
  if (ask) { h.appendChild(el('br')); h.appendChild(el('span', { c: calm ? 't-grey' : 'ask', text: ask })); }
  return h;
}
function mark(tone) { return el('span', { c: 'mark m-' + tone, text: TONE_MARK[tone] }); }

/** Which AI met a file; nothing where the record does not say. */
function who(file) { return (file.by || []).map(function (one) { return one === 0 ? t('ch.ai') : t('st.helper', { ordinal: one }); }).join(', '); }
function place(file) { return file.place ? el('span', { c: 'dim', text: ' ' + t('ch.' + file.place) }) : null; }
function dim(text) { return el('p', { c: 'dim', text: text }); }

function post(message) { message.jsonrpc = '2.0'; parent.postMessage(message, '*'); }
function request(method, params) {
  asked += 1;
  let id = 'a' + asked;
  return new Promise(function (resolve) {
    waiting[id] = resolve;
    post({ id: id, method: method, params: params });
    setTimeout(function () { if (waiting[id]) { delete waiting[id]; resolve({ error: {}, late: true }); } }, 5000);
  });
}
function say(text) { return request('ui/message', { role: 'user', content: [{ type: 'text', text: text }] }); }
/** A page stops half an hour after it was last asked, and a card stays: past that its link is nobody's, so the AI is asked to open it. */
function openPage(key) { return openLink(answer.pages ? answer.pages + (key ? encodeURIComponent(key) + '.html' : 'index.html') : '', key); }
function openLink(url, key) {
  let ask = function () { return say(key ? t('an.ask.reportOf', { ref: key }) : t('an.ask.report')); };
  if (!url || !answer.at || Date.now() - answer.at > GOOD_FOR || (can && !can.openLinks)) return ask();
  let sent = request('ui/open-link', { url: url }).then(function (done) { if (done.late) return; if (done.error || (done.result && done.result.isError)) ask(); });
  // An app may take the link and show nothing, or ask the person first: what always works stands under it, theirs to press.
  let old = document.getElementById('opened');
  if (old) old.remove();
  let note = acts([dim(t('an.opened.not')), quiet(t('an.opened.chat'), ask)]);
  note.id = 'opened';
  view.appendChild(note);
  view.scrollTop = 1e6;
  if (!room && note.scrollIntoView) note.scrollIntoView({ block: 'nearest' });
  size();
  return sent;
}

/** A line that opens in place, what is inside made only when it is opened. */
function opens(tone, title, side, inside, under) {
  let body = el('div', { c: 'inside' }), made = false;
  body.hidden = true;
  let line = el('button', { c: 'row', click: function () {
    if (!made) { inside().forEach(function (node) { if (node) body.appendChild(node); }); made = true; }
    body.hidden = !body.hidden;
    line.setAttribute('aria-expanded', String(!body.hidden));
  } }, [mark(tone), el('span', {}, [el('strong', { text: title })].concat(under || [])), el('span', { c: 'dim side' + (under ? ' at' : ''), text: side })]);
  line.setAttribute('aria-expanded', 'false');
  return el('div', {}, [line, body]);
}
function acts(nodes) { return el('div', { c: 'acts' }, nodes); }
function go(text, click) { return el('button', { c: 'go', text: text, click: click }); }
function quiet(text, click) { return el('button', { c: 'quiet', text: text, click: click }); }
function more(n) { return n > 0 ? dim(t('an.more', { n: n })) : null; }
function reportButton() {
  let key = dataOf(now) === answer.conversation ? answer.key || answer.self : undefined;
  return quiet(t('an.report'), function () { openPage(key); });
}
function notChecked(c) { return c.notChecked ? dim((c.look === 'unchecked' ? t('an.unchecked') + ': ' : '') + c.notChecked.join(' · ')) : null; }
/** No step of it named a private file: one sentence, and no squares that all say the same. */
function plain(c) { return c.steps.leftOut === 0 && c.steps.list.length > 0 && c.steps.list.every(function (step) { return step.tone === 'grey'; }); }
function strip(c) {
  let all = c.steps.list;
  if (plain(c)) {
    return [dim(t('an.strip.none', { n: all.length })), c.steps.notKnown ? dim(c.steps.notKnown.join(' · ')) : null];
  }
  if (all.length < 2) return [];
  // A long conversation is drawn in marks of several steps, each in the strongest look of them: the frame is as wide as it is.
  let per = Math.ceil(all.length / STRIP), hint = per > 1 ? t('an.strip.per', { n: per }) : t('an.strip.hint'), say = dim(hint), row = el('div', { c: 'strip' });
  let first = null, matters = 0;
  for (let at = 0; at < all.length; at += per) {
    let some = all.slice(at, at + per), step = some.reduce(function (best, one) { return RANK[one.tone] > RANK[best.tone] ? one : best; });
    let from = at + 1, to = at + some.length;
    let place = from === to ? t('an.steps.one', { n: from }) : t('an.steps.some', { from: from, to: to });
    let label = place + ': ' + (step.tone === 'grey' ? t('ch.strip.grey') : t(step.label));
    let one = el('button', { c: step.tone === 'grey' ? '' : 'b-' + step.tone, label: label, click: function () {
      row.querySelectorAll('button').forEach(function (each) { each.setAttribute('aria-pressed', 'false'); });
      one.setAttribute('aria-pressed', 'true');
      let moment = step.tone === 'grey' ? null : c.steps.moments.find(function (m) { return m.helper === undefined && m.from <= to && from <= m.to; });
      say.textContent = moment ? place + ': ' + moment.said : label;
    } });
    row.appendChild(one);
    if (RANK[step.tone] > matters) { first = one; matters = RANK[step.tone]; }
  }
  // Opened on the step that matters most: a row of squares by itself says nothing.
  if (first) first.click();
  let counts = {}, order = [];
  all.forEach(function (one) { if (!counts[one.label]) { counts[one.label] = { n: 0, tone: one.tone }; order.push(one.label); } counts[one.label].n += 1; });
  order.sort(function (a, b) { return RANK[counts[b].tone] - RANK[counts[a].tone]; });
  let legend = el('div', { c: 'legend' }, order.map(function (key) { return el('span', {}, [el('i', { c: counts[key].tone === 'grey' ? '' : 'b-' + counts[key].tone }), el('b', { text: String(counts[key].n) }), el('span', { text: ' ' + (counts[key].tone === 'grey' ? t('ch.strip.grey') : t(key)) })]); }));
  return [row, legend, say, first ? el('p', { c: 'faint', text: hint }) : null];
}
/** The private files a summary names: what to do about first, then the rest. Files of one shown name are two: each keeps its row. */
function met(c) {
  let left = c.files.slice();
  let first = c.todo.map(function (item) {
    let own = left.filter(function (f) { return f.path === item.path && f.place === item.place; });
    let found = own.find(function (f) { return f.access === 'read'; }) || own[0];
    if (found) left.splice(left.indexOf(found), 1);
    return { path: item.path, place: item.place, kind: item.kind, access: found && found.access, by: found && found.by };
  });
  return first.concat(left);
}
/** A read of what the person tracks asks for nothing, as the list draws it. */
function toneOf(c, access) { return c.look === 'allowed' && (access === 'read' || access === 'changed') ? 'sand' : ACCESS_TONE[access] || 'coral'; }
function fileRows(c) {
  let all = met(c), shown = all.slice(0, 6);
  if (shown.length === 0) return [];
  return [el('div', { c: 'panel' }, shown.map(function (f) {
    return el('div', { c: 'cell3' }, [mark(toneOf(c, f.access)), el('span', {}, [el('code', { text: f.path }), place(f)].concat(f.kind ? [el('span', { c: 'under dim', text: t('an.todo.' + f.kind) })] : [])),
      el('span', { c: 'dim side at', text: [f.access ? t('ch.access.' + f.access) : '', who(f)].filter(Boolean).join(' · ') })]);
  })), more(all.length - shown.length + c.filesMore)];
}
let GLYPH = { coral: '!', sand: '✓', blue: '○', mint: '⊘', amber: '?', grey: '·' };
/** The steps that matter as the report tells them: a rail, what the AI wrote, first and then, the files in sight, the look; and how many stood between. */
function story(c) {
  let nodes = [], last = 0, agent, told = false;
  c.steps.moments.forEach(function (m) {
    let who = m.helper === undefined ? '' : t('st.helper', { ordinal: m.helper });
    if (nodes.length === 0 || agent !== m.helper) { agent = m.helper; last = m.helper === undefined ? 0 : -1; told = false; if (who) nodes.push(el('div', { c: 'whose', text: who })); }
    let between = last >= 0 && m.helper === undefined ? m.from - last - 1 : 0;
    if (between > 0) nodes.push(el('div', { c: 'between dim', text: t('an.steps.between', { n: between }) }));
    nodes.push(momentCard(c, m, who, told));
    told = true;
    last = m.to;
  });
  return el('div', { c: 'story' }, nodes);
}
function momentCard(c, m, who, told) {
  let at = m.from === m.to ? t('an.steps.one', { n: m.from }) : t('an.steps.some', { from: m.from, to: m.to });
  let files = m.met || m.files.map(function (f) { return { path: f }; }), shown = files.slice(0, 6), left = files.length - shown.length + (m.metMore || 0);
  // A read of what the person tracks is drawn as the moment is, whatever else the conversation met.
  let toneIn = function (f) { return m.tone === 'sand' && (f.access === 'read' || f.access === 'changed') ? 'sand' : toneOf(c, f.access); };
  let chip = function (f) { return el('code', { c: f.everyday ? '' : 'p-' + (f.access ? toneIn(f) : m.tone), text: f.path }); };
  let chips = el('div', { c: 'chips' }, shown.map(chip).concat(left > 0 ? [el('span', { c: 'dim', text: t('an.more', { n: left }) })] : []));
  let body = el('div', { c: 'inside' }), made = false;
  body.hidden = true;
  let label = m.label ? t(m.label) : '';
  let line = el('button', { c: 'moment', click: function () {
    if (!made) {
      [m.first ? dim(t('an.steps.first')) : null, el('div', { c: 'met' }, files.map(function (f) {
        return el('div', {}, [el('code', { text: f.path }), place(f), f.access ? el('span', { c: f.everyday ? 'dim' : 't-' + toneIn(f), text: ' ' + t('ch.access.' + f.access) }) : null]);
      })), more(m.metMore || 0), m.ran ? dim(t('an.steps.ran', { what: m.ran.join(', ') })) : null, acts([quiet(t('an.steps.report'), function () { openPage(answer.key || answer.self); })])].forEach(function (node) { if (node) body.appendChild(node); });
      made = true;
    }
    body.hidden = !body.hidden;
    line.setAttribute('aria-expanded', String(!body.hidden));
    size();
  } }, [el('span', { c: 'glyph m-' + m.tone, text: GLYPH[m.tone] || '·' }), el('span', { c: 'told' }, [el('span', { c: 'eyebrow', text: t(told ? 'sb.then' : 'sb.first') + ' · ' + at }), el('strong', { text: m.said }),
    m.first ? el('span', { c: 'ask', text: t('an.steps.first') }) : null, files.length > 0 ? chips : null]), label ? el('span', { c: 'look m-' + m.tone, text: label }) : null]);
  line.setAttribute('aria-expanded', 'false');
  let wrote = m.wrote ? el('div', { c: 'wrote' }, [el('span', { c: 'ai', text: 'AI' }), el('span', {}, [el('span', { c: 'dim', text: t((m.wrote.noted ? 'sb.noted.' : 'sb.said.') + (who ? 'helper' : 'main'), { who: who }) }),
    el('span', { c: 'quote', text: t('an.quote', { text: m.wrote.text + (m.wrote.cut ? '…' : '') }) })])]) : null;
  return el('div', { c: 'stop d-' + m.tone }, [el('div', { c: 'box' }, [wrote, line, body])]);
}
function todoRows(c) {
  return c.todo.map(function (item, i) {
    return el('div', { c: 'cell3' }, [el('span', { c: 'mark m-coral', text: String(i + 1) }), el('span', {}, [el('code', { text: item.path }), place(item), el('span', { c: 'under dim', text: t('an.todo.' + item.kind) })]),
      el('button', { c: 'go small', text: t('an.todo.fix'), click: function () { openPage(answer.key || answer.self); } })]);
  });
}
/** The files as the report's Files draws them: under what happened to each, then under the folder each is in. */
function filePanel(c) {
  let parts = [];
  ['read', 'unknown', 'changed', 'opened', 'stopped', 'name'].forEach(function (access) {
    let own = c.files.filter(function (f) { return f.access === access; });
    let all = Math.max(own.length, c.numbers[access] || 0);
    if (all === 0) return;
    let tone = toneOf(c, access), folders = {}, order = [];
    own.forEach(function (f) {
      let at = f.path.lastIndexOf('/'), key = f.place ? '\u0000' + f.place : at < 0 ? '' : f.path.slice(0, at);
      if (!folders[key]) { folders[key] = []; order.push(key); }
      folders[key].push(f);
    });
    order.sort(function (x, y) { let away = (x[0] === '\u0000') - (y[0] === '\u0000'); return away || (x < y ? -1 : x > y ? 1 : 0); });
    parts.push(el('div', { c: 'part-head' }, [el('i', { c: 'b-' + tone }), el('strong', { text: t('ch.count.' + access, { n: all }) })]));
    order.forEach(function (key) {
      parts.push(el('span', { c: 'folder', text: key === '' ? t('ch.folder.main') : key[0] === '\u0000' ? t('ch.folder.' + key.slice(1)) : key }));
      folders[key].forEach(function (f) {
        let named = key === '' || key[0] === '\u0000' ? f.path : f.path.slice(key.length + 1);
        parts.push(el('div', { c: 'cell3' }, [el('span', { c: 'mark m-' + tone, text: TONE_MARK[tone] }), el('span', {}, [el('code', { text: named })]), who(f) ? el('span', { c: 'dim', text: who(f) }) : null]));
      });
    });
  });
  return el('div', { c: 'panel' }, parts);
}
function metRow(c, f) { let tone = toneOf(c, f.access); return el('div', {}, [el('code', { c: 'p-' + tone, text: f.path }), place(f), el('span', { c: 't-' + tone, text: ' ' + t('ch.access.' + f.access) })]); }
/** Your AI, and under it each helper that met a private file: its task and what happened to each file. */
function diagram(c) {
  let boxes = c.helpers.map(function (h) {
    let tones = h.files.map(function (f) { return toneOf(c, f.access); });
    let worst = tones.reduce(function (best, one) { return RANK[one] > RANK[best] ? one : best; }, 'grey');
    return el('div', { c: 'node e-' + worst }, [el('div', { c: 'who' }, [el('span', { c: 'ai m-' + worst, text: String(h.helper) }), el('strong', { text: t('st.helper', { ordinal: h.helper }) })]),
      h.asked ? el('p', { c: 'dim', text: t('an.quote', { text: h.asked }) }) : null,
      el('div', { c: 'met' }, h.files.length === 0 ? [el('div', { c: 'dim', text: t(h.unrecorded ? 'an.helper.empty' : 'an.helper.none') })] : h.files.map(function (f) { return metRow(c, f); })), more(h.filesMore)]);
  });
  let mine = c.mine || [], own = mine.reduce(function (best, f) { let tone = toneOf(c, f.access); return RANK[tone] > RANK[best] ? tone : best; }, 'grey');
  let top = el('div', { c: 'node main e-' + own }, [el('div', { c: 'who' }, [el('span', { c: 'ai m-' + own, text: 'AI' }), el('strong', { text: t('ch.ai') })]),
    mine.length > 0 ? el('div', { c: 'met' }, mine.map(function (f) { return metRow(c, f); })) : null, more(c.mineMore || 0)]);
  return el('div', { c: 'diagram' }, [top, el('span', { c: 'stem' }), el('div', { c: boxes.length === 4 ? 'nodes four' : 'nodes' }, boxes)]);
}

let DRAW = {
  summary: function (c) {
    let all = c.todo.length + c.todoMore;
    let what = c.todoKeys > 0 ? 'an.sum.keys' : 'an.sum.data';
    let ask = all === 0 ? '' : c.numbers.read === 1 && all === 1 ? t(what + '.it') : t(what, { n: c.todoKeys > 0 ? c.todoKeys : all });
    let tiles = el('div', { c: 'tiles' });
    [['read', 'coral'], ['changed', 'coral'], ['opened', 'blue'], ['name', 'blue'], ['stopped', 'mint'], ['unknown', 'amber'], ['helpers', 'grey']].forEach(function (pair) {
      let n = c.numbers[pair[0]];
      if (n > 0) tiles.appendChild(el('div', { c: 'tile' }, [el('b', { c: 't-' + (c.look === 'allowed' && pair[1] === 'coral' ? 'sand' : pair[1]), text: String(n) }), el('span', { c: 'dim', text: t('an.n.' + pair[0], { n: n }) })]));
    });
    let n = c.steps.n + c.steps.leftOut;
    let size = [n > 0 ? t('an.row.steps', { n: n }) : '', c.all > 0 ? t('an.row.files', { n: c.all }) : ''].filter(Boolean).join(' · ');
    return [fact(c.numbers.read > 0 ? t('an.sum.read', { n: c.numbers.read }) : t('look.' + c.look), ask), size ? dim(size) : null].concat(tiles.childNodes.length > 1 ? [tiles] : [], fileRows(c), strip(c), [c.steps.leftOut > 0 ? dim(t('an.steps.left', { n: c.steps.leftOut })) : null, notChecked(c),
      acts([c.todo.length > 0 ? go(t('an.act.todo'), function () { show('todo'); }) : null, reportButton()])]);
  },
  steps: function (c) {
    if (c.steps.n === 0) return [fact(t('an.steps.none')), notChecked(c), acts([reportButton()])];
    let reads = c.steps.reads;
    let rows = story(c);
    return [fact(t('an.steps.fact', { n: c.steps.n + c.steps.leftOut }), reads > 0 ? t('an.steps.act', { n: reads }) : '')].concat(strip(c), [rows, more(c.steps.momentsMore),
      c.steps.ordinary > 0 && !plain(c) ? dim(t('an.steps.ordinary', { n: c.steps.ordinary })) : null, c.steps.helperSteps > 0 ? dim(t('an.steps.helpers', { n: c.steps.helperSteps })) : null,
      c.steps.leftOut > 0 ? dim(t('an.steps.left', { n: c.steps.leftOut })) : null, c.steps.notKnown && !plain(c) ? dim(c.steps.notKnown.join(' · ')) : null, notChecked(c),
      acts([c.todo.length > 0 ? go(t('an.act.todo'), function () { show('todo'); }) : null, reportButton()])]);
  },
  files: function (c) {
    if (c.files.length === 0) return [fact(t('an.files.none')), notChecked(c), acts([reportButton()])];
    return [fact(t('an.files.fact', { n: c.files.length + c.filesMore })), filePanel(c), more(c.filesMore), notChecked(c), acts([c.todo.length > 0 ? go(t('an.act.todo'), function () { show('todo'); }) : null, reportButton()])];
  },
  helpers: function (c) {
    if (c.helpers.length === 0) return [fact(c.numbers.helpers > 0 ? t('an.helpers.fact', { n: c.numbers.helpers }) : t('an.helpers.none')), c.numbers.helpers > 0 ? dim(t('an.helpers.none')) : null, notChecked(c), acts([reportButton()])];
    let quietOnes = Math.max(0, c.numbers.helpers - c.helpers.length - c.helpersMore);
    return [fact(t('an.helpers.fact', { n: c.numbers.helpers })), c.helpers.some(function (h) { return h.files.length > 0 || h.unrecorded; }) ? null : dim(t('an.helpers.none')), diagram(c), more(c.helpersMore), quietOnes > 0 ? dim(t('ch.diagram.others', { n: quietOnes })) : null, notChecked(c), acts([reportButton()])];
  },
  todo: function (c) {
    if (c.todo.length === 0) return [fact(t('an.todo.none')), notChecked(c), acts([reportButton()])];
    return [fact(t('an.todo.fact', { n: c.todo.length + c.todoMore })), el('div', { c: 'panel' }, todoRows(c)), more(c.todoMore),
      c.todo.some(function (i) { return i.kind === 'keys'; }) ? el('p', { text: t('an.todo.warn') }) : null, notChecked(c), acts([reportButton()])];
  },
  okay: function (l) {
    let known = GROUPS.filter(function (g) { return l.groups[g] > 0; });
    let partWay = l.checked.read < l.checked.of;
    let calm = l.groups.attention === 0 && l.groups.partly === 0 && l.groups.failed === 0 && l.checked.read === l.checked.of && !l.reading;
    let bar = el('div', { c: 'bar' }, known.map(function (g) { let i = el('i', { c: GROUP_TONE[g] === 'grey' ? '' : 'b-' + GROUP_TONE[g] }); i.style.flex = String(l.groups[g]); return i; }));
    let chips = el('div', { c: 'chips' }, known.map(function (g) {
      let text = [el('b', { c: 't-' + GROUP_TONE[g], text: String(l.groups[g]) }), document.createTextNode(' ' + t('an.g.' + g))];
      return g === 'attention' || g === 'tracked' || g === 'stopped' ? el('button', { c: 'chip', click: function () { show(g); } }, text) : el('span', { c: 'chip' }, text);
    }));
    // From some of the conversations, what is counted is of those: that comes first, and no number of them stands for all.
    return [soFar(l), fact(partWay ? t('an.checked', l.checked) : t('an.okay.fact', { n: l.checked.read }), l.groups.attention > 0 ? t('an.okay.act', { n: l.groups.attention }) : calm ? t('an.okay.calm') : '', l.groups.attention === 0), known.length > 1 ? bar : null, chips, partWay ? null : part(l),
      acts([partWay ? again('an.ask.list') : null, l.groups.attention > 0 ? go(t('an.act.todo'), function () { show('attention'); }) : null, quiet(t('an.tab.conversations'), function () { show('conversations'); })]), el('p', { c: 'faint', text: t('an.covers') })];
  },
  conversations: function (l) { return rows(l, 'conversations'); },
  attention: function (l) { return rows(l, 'attention'); },
  tracked: function (l) { return rows(l, 'tracked'); },
  stopped: function (l) { return rows(l, 'stopped'); },
  often: function (l) {
    let named = l.namedOnly > 0 ? dim(t('an.often.named', { n: l.namedOnly })) : null;
    if (l.often.length === 0) return [fact(t('an.often.none')), named].concat(unsure(l), [part(l)]);
    let PARTS = [['read', 'coral'], ['changed', 'coral'], ['opened', 'blue'], ['stopped', 'mint'], ['unknown', 'amber'], ['named', 'blue']];
    return [fact(t('an.often.fact')), el('div', { c: 'panel' }, l.often.map(function (f) {
      let bar = el('div', { c: 'bar' }), said = [];
      PARTS.forEach(function (p) {
        if (!f[p[0]]) return;
        let i = el('i', { c: 'b-' + (f.tracked && p[0] === 'read' ? 'sand' : p[1]) }); i.style.flex = String(f[p[0]]); bar.appendChild(i);
        said.push(f[p[0]] + ' ' + t('an.o.' + p[0]));
      });
      said.push(t('an.often.in', { n: f.conversations }));
      if (f.tracked) said.push(t('an.often.track'));
      let times = t('an.often.times', { n: f.wanted });
      return el('div', { c: 'file' }, [el('div', { c: 'head' }, [el('span', {}, [el('code', { text: f.path }), place(f), f.project ? el('span', { c: 'dim', text: ' ' + f.project }) : null]),
        el('span', {}, [times.indexOf(String(f.wanted)) < 0 ? el('span', { c: 'big', text: f.wanted + ' ' }) : null, el('span', { c: 'dim', text: times })])]), bar, el('span', { c: 'dim', text: said.join(' · ') })]);
    }))].concat([more(l.oftenMore), named], unsure(l), [part(l), el('p', { c: 'faint', text: t('an.often.counted') })]);
  }
};
function rows(l, kind) {
  let own = kind === 'conversations' ? l.rows.slice(0, l.recent) : l.rows.filter(function (r) { return r.group === kind; });
  let rest = kind === 'conversations' ? l.rowsMore : Math.max(0, l.groups[kind] - own.length);
  let all = kind === 'conversations';
  let shown = own.slice(0, FIRST), later = own.slice(FIRST);
  let nodes = days(shown), held = el('div', { c: 'later' }, days(later, shown));
  held.hidden = true;
  let open = later.length > 0 ? quiet(t('an.more', { n: later.length }), function () { held.hidden = false; open.remove(); }) : null;
  let partWay = l.checked.read < l.checked.of;
  return [el('div', { c: 'topic' }, [fact(t('an.rows.' + kind)), el('span', { c: 'dim', text: t('an.rows.n', { n: all ? l.checked.read : l.groups[kind] }) })]), partWay ? part(l) : null, partWay ? acts([again(all ? 'an.ask.rows' : 'an.ask.list')]) : null,
    own.length === 0 && rest === 0 ? dim(t('an.rows.none')) : el('div', { c: 'days' }, nodes.concat([held])), open ? acts([open]) : null, more(rest)].concat(unsure(l), [partWay ? null : part(l), el('p', { c: 'faint', text: t('an.titles') })]);
}
/** Rows under their days; a day the rows before these ended in goes on without its name. */
function days(list, before) {
  let nodes = [], last = before && before.length > 0 ? keyOf(before[before.length - 1]) : '';
  list.forEach(function (r) {
    if (keyOf(r) !== last || nodes.length === 0) {
      if (keyOf(r) !== last) nodes.push(el('div', { c: 'day', text: r.relative ? t('an.' + r.relative) : new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(new Date(r.day.year, r.day.month - 1, r.day.day)) }));
      nodes.push(el('div', { c: 'panel rows' }));
      last = keyOf(r);
    }
    nodes[nodes.length - 1].appendChild(rowOf(r));
  });
  return nodes;
}
function keyOf(r) { return r.day.year + '-' + r.day.month + '-' + r.day.day; }
/** What a conversation met, in numbers: its private files by what happened to them, all its files, its helpers. */
function filesSaid(r) {
  return ACCESS.filter(function (a) { return r.files[a] > 0; }).map(function (a) {
    let tone = r.look === 'allowed' && (a === 'read' || a === 'changed') ? 'sand' : ACCESS_TONE[a];
    return el('span', {}, [el('b', { c: 't-' + tone, text: String(r.files[a]) }), document.createTextNode(' ' + t('an.n.' + a, { n: r.files[a] }))]);
  });
}
function rowOf(r) {
  let title = r.title || t('an.untitled'), tone = LOOK_TONE[r.look] || 'grey';
  let rest = [AI[r.provider], r.held ? t('held.' + r.held) : '', r.all ? t('an.row.files', { n: r.all }) : '', r.helpers ? r.helpers + ' ' + t('an.n.helpers', { n: r.helpers }) : '', r.project];
  let under = el('span', { c: 'under' }, [el('span', { c: 't-' + tone, text: t('look.' + r.look) })].concat(filesSaid(r)));
  let more = el('span', { c: 'under dim' }, rest.filter(Boolean).map(function (w) { return el('span', { text: w }); }));
  return opens(tone, title, r.time, function () {
    return [acts([go(t('an.row.more'), function () { say(t('an.ask.more', { title: title, ref: r.ref })); }),
      r.report ? quiet(t('an.report'), function () { openPage(r.key); }) : null])];
  }, [under, more]);
}
function unsure(l) {
  return ['partly', 'failed'].filter(function (g) { return l.groups[g] > 0; }).map(function (g) { return dim('? ' + l.groups[g] + ' ' + t('an.g.' + g)); });
}
/** A card holds one answer: the rest of a reading is another, asked for in the chat. */
function again(asked) { return quiet(t('an.act.again'), function () { say(t(asked)); }); }
function soFar(l) {
  if (l.checked.read >= l.checked.of) return null;
  let fill = el('i'); fill.style.width = Math.round(100 * l.checked.read / l.checked.of) + '%';
  return el('div', { c: 'part' }, [fill]);
}
function part(l) {
  return l.checked.read >= l.checked.of ? (l.reading ? dim(t('an.again')) : null) : el('div', {}, [soFar(l), dim(t('an.checked', { read: l.checked.read, of: l.checked.of }))]);
}
function whereOf(kind) {
  if (CONVERSATION.indexOf(kind) >= 0) return answer.title || t('an.where.conversation');
  let l = dataOf(kind);
  let range = /^(\d{1,4})d$/.exec(l.asked);
  return t(l.scope === 'project' ? 'an.where.project' : 'an.where.' + (l.list || 'computer')) + ', ' + (range ? t('an.days', { n: Number(range[1]) }) : t('an.since', { asked: l.asked }));
}
/** This computer is two lists (CV15), one shown at a time: which, with how many conversations each holds. */
function lists() { return answer && answer.list ? [answer.list].concat(answer.list.beside ? [answer.list.beside] : []) : []; }
function sides() {
  let all = lists();
  if (all.length < 2) return null;
  return el('div', { c: 'sides' }, all.map(function (l, i) {
    let one = el('button', { c: 'chip', text: t('cs.' + l.list) + ' · ' + l.checked.of, click: function () { side = i; room = 0; show(now); } });
    one.setAttribute('aria-pressed', String(i === side));
    return one;
  }));
}
function dataOf(kind) { return CONVERSATION.indexOf(kind) >= 0 ? answer.conversation : lists()[side] || answer.list; }
/** No answer to draw: still on its way, said in one sentence, or a page to open. */
function sentence() {
  if (!handed) return [el('div', { c: 'wait' }, [el('p', { text: t('an.card.wait') }), el('div', { c: 'part' }, [el('i')]), el('p', { c: 'dim', text: t('an.card.first') })])];
  if (!answer || !answer.said) return [fact(t('an.card.none'))];
  let link = answer.link;
  return [el('p', { c: 'said', text: answer.said }), link ? acts([go(t('an.report'), function () { openLink(link, answer.key); })]) : null];
}
/** Whether a tab has anything in it: one that would say there is nothing is not offered. */
function holds(kind) {
  let c = answer.conversation;
  if (!c || CONVERSATION.indexOf(kind) < 0) return true;
  return kind === 'files' ? c.files.length > 0 : kind === 'helpers' ? c.helpers.length > 0 || c.numbers.helpers > 0 : kind === 'todo' ? c.todo.length > 0 : kind === 'steps' ? c.steps.n > 0 : true;
}
/** How many a tab holds, where that is a number: the list tabs say theirs when they are open. */
function heldIn(kind) {
  let c = answer.conversation;
  return !c ? 0 : kind === 'files' ? c.files.length + c.filesMore : kind === 'helpers' ? c.numbers.helpers : kind === 'todo' ? c.todo.length + c.todoMore : 0;
}
function fill(kind) {
  view.textContent = '';
  let data = answer && DRAW[kind] ? dataOf(kind) : null, nodes;
  try {
    nodes = !data ? sentence() : data.about === 'list' && data.checked.of === 0 ? [fact(t('an.empty'))] : data.about === 'list' && data.checked.read === 0 ? [fact(t('an.reading'))] : DRAW[kind](data);
  } catch (e) {
    nodes = [fact(t('an.card.none'))];
  }
  if (data && data.about === 'list') nodes = [sides()].concat(nodes);
  nodes.forEach(function (node) { if (node) view.appendChild(node); });
  return data;
}
/**
 * The card is as tall whatever tab is open: a chat follows its end, so a card that grew or shrank under a press moved the page away from
 * it. As tall as its tallest tab, and no taller than a window; the rest is scrolled inside. The whole screen is the app's to fill.
 */
function steady(kinds, kind) {
  let width = Math.round(card.getBoundingClientRect().width);
  several = kinds.length > 1;
  // A frame of no size yet says nothing of how tall anything is: it is asked again once it has one.
  if (!several || width <= 0 || host.displayMode === 'fullscreen') { room = 0; roomAt = width; view.style.height = ''; return; }
  if (!room || roomAt !== width) {
    view.style.height = '';
    room = kinds.reduce(function (tallest, one) { fill(one); return Math.max(tallest, Math.ceil(view.getBoundingClientRect().height)); }, 0);
    room = Math.min(room, TALL);
    roomAt = width;
    fill(kind);
  }
  view.style.height = room + 'px';
}
function show(kind) {
  now = kind;
  let data = fill(kind);
  view.scrollTop = 0;
  where.textContent = data ? whereOf(kind) : '';
  let offered = answer ? (answer.conversation ? CONVERSATION : []).concat(answer.list ? LIST : []).filter(function (one) { return holds(one); }) : [];
  tabs.hidden = offered.length < 2;
  steady(offered, kind);
  tabs.textContent = '';
  let on = null;
  offered.forEach(function (one) {
    let n = heldIn(one);
    let tab = el('button', { click: function () { show(one); let open = [].find.call(tabs.childNodes, function (b) { return b.getAttribute('aria-current'); }); if (open && open.focus) open.focus({ preventScroll: true }); } },
      [el('span', { text: t('an.tab.' + one) }), n > 0 ? el('span', { c: 'n', text: String(n) }) : null]);
    if (one === kind) tab.setAttribute('aria-current', 'true');
    tabs.appendChild(tab);
    if (one === kind) on = tab;
  });
  // On a narrow card the open tab can be past the edge: it is brought into its row's sight.
  if (on && on.offsetLeft + on.offsetWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - 24;
  size();
}

/** Larger, where the app says it can: its own word for it, asked for by a press and by nothing else. */
let larger = document.getElementById('larger');
function hosted(context) {
  Object.keys(context || {}).forEach(function (key) { host[key] = context[key]; });
  let modes = host.availableDisplayModes, open = host.displayMode === 'fullscreen';
  if (answer && open !== wide) { wide = open; show(now); }
  larger.hidden = !(modes && modes.indexOf && modes.indexOf(open ? 'inline' : 'fullscreen') >= 0);
  larger.textContent = open ? '⤡' : '⤢';
  nameLarger();
}
function nameLarger() {
  let said = t(host.displayMode === 'fullscreen' ? 'an.smaller' : 'an.larger');
  larger.setAttribute('aria-label', said);
  larger.setAttribute('title', said);
}
larger.addEventListener('click', function () {
  request('ui/request-display-mode', { mode: host.displayMode === 'fullscreen' ? 'inline' : 'fullscreen' }).then(function (done) { if (done.result && done.result.mode) hosted({ displayMode: done.result.mode }); });
});
function size() {
  let box = card.getBoundingClientRect(), height = Math.ceil(box.height);
  if (height === last) return;
  last = height;
  post({ method: 'ui/notifications/size-changed', params: { width: Math.ceil(box.width), height: height } });
}
addEventListener('message', function (event) {
  let m = event.data;
  if (event.source !== parent || !m || m.jsonrpc !== '2.0') return;
  if (m.id !== undefined && waiting[m.id] && (m.result || m.error)) { waiting[m.id](m); delete waiting[m.id]; return; }
  if (m.method === 'ui/notifications/host-context-changed') return hosted(m.params);
  if (m.method !== 'ui/notifications/tool-result') return;
  let data = m.params && m.params._meta && m.params._meta['agentwhy/answer'];
  answer = data && typeof data === 'object' ? data : null;
  handed = true;
  if (answer && answer.lang) { speak(answer.lang); nameLarger(); }
  side = 0;
  room = 0;
  show(answer ? answer.about : null);
});
show(null);
new ResizeObserver(size).observe(card);
addEventListener('resize', function () { if (several && host.displayMode !== 'fullscreen' && Math.round(card.getBoundingClientRect().width) !== roomAt) show(now); });
request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'agentwhy', version: '1' }, appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] } }).then(function (done) {
  if (done.result) {
    can = done.result.hostCapabilities || null;
    hosted(done.result.hostContext);
    post({ method: 'ui/notifications/initialized', params: {} }); size(); }
});
})();
`;
