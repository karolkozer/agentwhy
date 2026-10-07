// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { INDEX_CONTENT_SECURITY_POLICY_META } from '../../../../src/report/render/html-head.ts';
import { addFilePopup, ADD_FILE_POPUP_SCRIPT } from '../../../../src/report/render/ui/add-file-popup.ts';
import { POPUP_SCRIPT } from '../../../../src/report/render/ui/popup.ts';
import { askPanel, askTrigger } from '../../../../src/report/render/ui/ask-panel.ts';
import { backdrop, BACKDROP_STYLE } from '../../../../src/report/render/ui/backdrop.ts';
import { avatar, avatarGroup } from '../../../../src/report/render/ui/avatar.ts';
import { appSidebar, SUPPORT_ADDRESSES } from '../../../../src/report/render/ui/app-sidebar.ts';
import { closeButton, pill } from '../../../../src/report/render/ui/button.ts';
import { checklist } from '../../../../src/report/render/ui/checklist.ts';
import { confirmDialog } from '../../../../src/report/render/ui/confirm-dialog.ts';
import { dataTable } from '../../../../src/report/render/ui/data-table.ts';
import { drawer } from '../../../../src/report/render/ui/drawer.ts';
import { labelledSelect } from '../../../../src/report/render/ui/labelled-select.ts';
import { LIVE_SCRIPT } from '../../../../src/report/render/ui/live-script.ts';
import { pageShell } from '../../../../src/report/render/ui/page-shell.ts';
import { pillTabs } from '../../../../src/report/render/ui/pill-tabs.ts';
import { opens, popup, POPUP_STYLE } from '../../../../src/report/render/ui/popup.ts';
import { progressBar, rail, stepper } from '../../../../src/report/render/ui/progress.ts';
import { stats } from '../../../../src/report/render/ui/stats.ts';
import { tag, TAG_STYLE } from '../../../../src/report/render/ui/tag.ts';
import { taskList } from '../../../../src/report/render/ui/task-list.ts';

// The pieces the report page is made of (`.ai/plans/2026-09-23-report-redesign.md`, step 3). Each is checked for what
// it writes, what it escapes, and what it is with no script at all.

test('a window is a dialog opened by a link to it, so with no script the link still goes there', () => {
  const html = popup({ id: 'file-3', size: 'small', labelledBy: 'file-3-title', body: '<h2 id="file-3-title">x</h2>' });
  assert.equal(html, '<dialog class="pp pp-small" id="file-3" aria-labelledby="file-3-title"><h2 id="file-3-title">x</h2></dialog>');
  // A wide window carries the page's sky - its glow and its points - under its content, hidden from a screen reader.
  const wide = popup({ id: 'file-4', size: 'wide', labelledBy: 'file-4-title', body: '<h2 id="file-4-title">x</h2>' });
  assert.match(wide, /^<dialog class="pp pp-wide" id="file-4" aria-labelledby="file-4-title"><div class="pp-sky" aria-hidden="true">(<i class="bd-star[^"]*" style="[^"]*"><\/i>){34}<\/div><h2 id="file-4-title">x<\/h2><\/dialog>$/);
  assert.match(POPUP_STYLE, /dialog\.pp-wide\{background:radial-gradient/);
  assert.equal(opens('file-3'), ' href="#file-3" data-popup-open="file-3"');
  assert.match(POPUP_STYLE, /html:not\(\.js\) dialog\.pp:target\{display:block/, 'a window a link went to is drawn in the page');
});

test('the confirmation has Cancel and a mint confirm, and says what it applies to', () => {
  const html = confirmDialog({
    id: 'protect-1', title: 'Protect this file?', subject: '<span class="chip">.env</span>', sentence: 'You can undo this anytime.',
    option: '<label>Also every file called .env</label>', cancel: 'Cancel', confirm: 'Yes, protect it', confirmAttributes: ' data-protect="1"',
  });
  assert.match(html, /<dialog class="pp pp-confirm" id="protect-1" aria-labelledby="protect-1-title">/);
  assert.match(html, /<button type="button" class="pill pill-outline pill-lg" data-popup-close>Cancel<\/button>/);
  assert.match(html, /<button type="button" class="pill pill-mint pill-lg" data-protect="1">Yes, protect it<\/button>/);
  assert.match(html, /class="cf-option"><label>Also every file called \.env<\/label>/);
});

test('a drawer is a dialog from the right, with its close button named', () => {
  const html = drawer({ id: 'helper-6', labelledBy: 'helper-6-name', tone: 'coral', title: 'Helper 6', sub: 'Brought in by your AI',
    body: '<p>job</p>', foot: '<a>Fix these files</a>', closeLabel: ' aria-label="Close"' });
  assert.match(html, /^<dialog class="dr" id="helper-6" aria-labelledby="helper-6-name">/);
  assert.match(html, /<span class="dr-dot dr-dot-coral"/);
  assert.match(html, /<button type="button" class="close close-sm" aria-label="Close" data-popup-close>×<\/button>/);
  assert.match(html, /<div class="dr-foot"><a>Fix these files<\/a><\/div>/);
  assert.ok(!drawer({ id: 'x', labelledBy: 'y', tone: 'grey', title: '', sub: '', body: '', closeLabel: '' }).includes('dr-foot'));
});

test('tabs are pills with a script, and every panel under its heading without one', () => {
  const html = pillTabs([{ label: 'List', panel: '<p>list</p>' }, { label: 'Diagram', panel: '<p>diagram</p>' }], 'page', 1);
  assert.match(html, /<div class="tabs-bar tabs-page js-only" role="tablist">/);
  assert.match(html, /data-tab="1" aria-selected="true">Diagram<\/button>/);
  assert.match(html, /<section class="tabs-panel" role="tabpanel" data-tab-panel="0"><h3 class="tabs-fallback">List<\/h3><p>list<\/p><\/section>/);
  assert.match(html, /<section class="tabs-panel tabs-on" role="tabpanel" data-tab-panel="1">/);
});

test('tags carry a dot, and the Done tag is larger and has none', () => {
  assert.equal(tag('Protected', 'mint'), '<span class="tag tag-mint tag-sm"><span class="tag-dot" aria-hidden="true"></span>Protected</span>');
  assert.equal(tag('Done ✓', 'mint', 'md'), '<span class="tag tag-mint tag-md">Done ✓</span>');
});

test('where a person is: the bar, the rail and the stepper', () => {
  assert.match(progressBar(2, 7, '2 of 7 done'), /aria-valuenow="2"><span class="pg-fill" style="width:28\.6%"><\/span>/);
  assert.match(progressBar(0, 0, 'none'), /style="width:0%"/, 'nothing to do is not a division by zero');
  assert.equal((rail([{ state: 'done', title: 'a' }, { state: 'now', title: 'b' }, { state: 'waiting', title: 'c' }]).match(/rl-dash/g) ?? []).length, 3);
  const steps = stepper([{ label: 'New keys', state: 'past' }, { label: 'Your app', state: 'current' }, { label: 'Done', state: 'future' }]);
  assert.match(steps, /<li class="st-step st-past"><span class="st-mark" aria-hidden="true">✓<\/span>New keys<\/li>/);
  assert.match(steps, /<li class="st-step st-current" aria-current="step"><span class="st-mark" aria-hidden="true">2<\/span>Your app/);
});

test('avatars escape what they are given, and a group overlaps them small', () => {
  assert.equal(avatar('<b>', 'grey'), '<span class="av av-grey av-42" aria-hidden="true">&lt;b&gt;</span>');
  assert.equal((avatarGroup([{ initials: 'AI', tone: 'coral' }, { initials: 'H6', tone: 'grey' }]).match(/av-30/g) ?? []).length, 2);
});

test('a task card escapes its path and draws a done task done', () => {
  const html = taskList(['File', 'Details', 'Action'], [
    { title: 'Keys for your payments', path: 'apps/<web>/.env', done: false, details: '<a>What happened</a>', action: '<a>Fix it</a>' },
    { title: 'Passwords', path: '.env.test', done: true, details: '', action: '<span>Done ✓</span>' },
  ]);
  assert.match(html, /<span class="tc-chip" title="apps\/&lt;web&gt;\/\.env">apps\/&lt;web&gt;\/\.env<\/span>/);
  assert.match(html, /<li class="tc tc-done"><div class="tc-row"><span class="tc-main"><span class="tc-check" aria-hidden="true">✓<\/span>/);
  assert.match(html, /<span class="tl-file">File<\/span>/);
});

// Found 2026-09-24: a round tick alone was not read as something to click. The button says what a click does.
test('a checklist row ticks on the page only, says so on its button, and links out without a referrer', () => {
  const html = checklist([{ name: 'Stripe', what: 'Payments', link: { label: 'Open Stripe', href: 'https://dashboard.stripe.com/apikeys' } }], { mark: 'Mark as done', done: 'Done' });
  assert.match(html, /<button type="button" class="ck-tick js-only" aria-pressed="false" data-check><span class="ck-mark">Mark as done<\/span><span class="ck-done">✓ Done<\/span><\/button><\/li>/);
  assert.match(html, /href="https:\/\/dashboard\.stripe\.com\/apikeys" target="_blank" rel="noopener noreferrer"/);
});

test('a labelled select carries its question', () => {
  assert.equal(labelledSelect('What the AI did:', [{ value: 'any', label: 'Anything' }], ' data-filter="access"'),
    '<label class="ls"><span class="ls-q">What the AI did:</span><select class="ls-select" data-filter="access"><option value="any">Anything</option></select></label>');
});

test('I’m stuck holds written answers only: no field to type in, and every answer on the page without a script', () => {
  const html = askPanel([{ question: 'Will my app stop working?', answer: 'Only until the new key is in.' }], 'ask-1');
  assert.match(askTrigger('✦ I’m stuck', 'ask-1'), /aria-controls="ask-1" data-ask-toggle>/, 'the trigger names the panel it opens');
  assert.ok(!/<input|<textarea|<form/.test(html), 'nothing to type, so nothing to send');
  assert.match(html, /<dt>Will my app stop working\?<\/dt><dd data-ask-a="0">Only until the new key is in\.<\/dd>/);
  assert.match(html, /<button type="button" class="ak-q" data-ask-q="0">/);
});

test('numbers carry their tone on the number only', () => {
  assert.match(stats([{ label: 'Fixed', value: '2 / 7', tone: 'mint' }], 'page'), /<div class="sx-value sx-mint">2 \/ 7<\/div>/);
  assert.match(stats([{ label: 'Record', value: 'Complete' }], 'record'), /class="sx sx-record"/);
});

test('buttons are links, spans or buttons, and a close button is named by its caller', () => {
  assert.equal(pill({ label: 'Fix it →', tone: 'primary', size: 'task', button: true, attributes: ' data-fix="0"' }),
    '<button type="button" class="pill pill-primary pill-task" data-fix="0">Fix it →</button>');
  assert.equal(closeButton(' aria-label="Close"'), '<button type="button" class="close close-md" aria-label="Close">×</button>');
});

test('a page carries each piece’s style once, however often the piece is used', () => {
  const html = pageShell({ title: 'conv.title', policy: INDEX_CONTENT_SECURITY_POLICY_META, styles: [POPUP_STYLE, POPUP_STYLE], scripts: [], sidebar: '', main: '' });
  assert.equal(html.split('dialog.pp::backdrop').length - 1, 1);
});

// the-agent-tells-you R29: a language picked on a served page is written where the hook reads it, so the line in the
// conversation speaks it too; a page opened as a file has nowhere to write, and does not try.
test('a page served by agentwhy writes the language picked on it to the notice choices, and only a served one', () => {
  const html = pageShell({ title: 'conv.title', policy: INDEX_CONTENT_SECURITY_POLICY_META, styles: [], scripts: [], sidebar: '', main: '' });
  assert.match(html, /if \(location\.protocol === 'http:' \|\| location\.protocol === 'https:'\) \{\s*fetch\('api\/notify'/);
  assert.match(html, /JSON\.stringify\(\{ scope: 'everywhere', lang: next \}\)/);
});

// Found by review (2026-09-23): rows and cells need a table around them, and a row holds cells and nothing else.
test('a data table is a table of rows of cells, and a row link sits in its first cell', () => {
  const html = dataTable({ head: ['A', 'B'], columns: '1fr 1fr', minWidth: 100, rows: [{ cells: ['a', 'b'], href: 'r.html', linkAttributes: ' aria-label="Row"' }], empty: 'None' });
  assert.match(html, /^<div class="dt" role="table">/);
  assert.match(html, /<div class="dt-row dt-linked" role="row"[^>]*><span class="dt-cell" role="cell"><a class="dt-link" href="r.html" aria-label="Row"><\/a>a<\/span>/);
  assert.match(html, /<div class="dt-empty" role="row" hidden><span role="cell">None<\/span><\/div>/);
});

// Found by review (2026-09-24): an outlined badge takes its own tone's border.
test('an outlined badge is outlined in its own tone', () => {
  assert.equal(tag('Back again', 'coral', 'badge', true), '<span class="tag tag-coral tag-badge tag-outlined">Back again</span>');
  assert.match(TAG_STYLE, /\.tag-outlined\.tag-mint\{border-color:var\(--mint-35\)\}/);
  assert.match(TAG_STYLE, /\.tag-outlined\.tag-amber\{border-color:var\(--amber-35\)\}/);
});

// Onboarding plan, step 4: what the onboarding needed from the kit, and the add popup Settings and it now share.
test('the add popup picks a name, never a file: the pickers need a script, and the page is handed a pattern', () => {
  const html = addFilePopup('ob-add');
  assert.match(html, /<dialog class="pp pp-pick" id="ob-add" aria-labelledby="ob-add-title">/);
  assert.match(html, /<div class="af-picks js-only">/, 'without a script, only typing the name is offered');
  assert.match(html, /<form class="af-type" data-af-type>/);
  assert.match(html, /<p class="af-cannot" data-af-cannot hidden>/, 'a refusal is written in every language, and hidden');
  assert.doesNotMatch(ADD_FILE_POPUP_SCRIPT, /FileReader|\.text\(\)|arrayBuffer|fetch\(/, 'F36: nothing reads what was picked, or sends it');
  assert.match(ADD_FILE_POPUP_SCRIPT, /new CustomEvent\('add-files', \{ detail: \{ files \} \}\)/);
});

// `2026-10-07-several-at-once.md` AS1-AS5, from the maintainer ("jest okej", of the mock): several files in one pick,
// a folder one at a time, files and folders dropped together, all gathered in the window and handed over at once.
test('the add popup gathers several - picked, dropped, typed - and hands them over together', () => {
  const html = addFilePopup('set-add');
  assert.match(html, /<input type="file" class="af-file" data-af-file="file" multiple hidden/, 'AS1: several files in one pick');
  assert.doesNotMatch(html, /data-af-file="folder" [^>]*multiple/, 'AS2: a folder is one at a time');
  assert.match(html, /<span data-af-keys="mac" hidden>[\s\S]*?lang="en">⌘-click to pick several</);
  assert.match(html, /<span data-af-keys="other">[\s\S]*?lang="en">Ctrl-click to pick several</);
  assert.match(html, /lang="en">One at a time</);
  assert.match(html, /<div class="af-drop js-only" data-af-drop>[\s\S]*?lang="en">Or drag files and folders here</, 'AS3');
  assert.match(html, /<div class="af-chosen" data-af-chosen hidden>[\s\S]*?lang="en">To keep from your AI<[\s\S]*?<\/span> <span class="af-count" data-af-count>0<\/span><\/span>/, 'AS4, AS9: a number, not a sentence');
  assert.match(html, /<div class="af-foot" data-af-foot hidden>[\s\S]*?class="pill pill-light pill-lg" data-af-continue>/, 'Continue, white as every Continue');
  // AS3: a dropped entry is read by its name and whether it is a folder - nothing inside it, and nothing sent.
  assert.match(ADD_FILE_POPUP_SCRIPT, /entries\.map\(\(entry\) => \(\{ name: entry\.name, kind: entry\.isDirectory \? 'folder' : 'file' \}\)\)/);
  assert.doesNotMatch(ADD_FILE_POPUP_SCRIPT, /createReader|\.file\(|readEntries/, 'no folder is walked, no file opened');
  assert.match(ADD_FILE_POPUP_SCRIPT, /files\.map\(\(file\) => \(\{ name: file\.name, kind: 'file' \}\)\)/, 'every file of a pick');
  assert.match(ADD_FILE_POPUP_SCRIPT, /if \(!chosen\.some\(\(item\) => item\.pattern === pattern\)\) chosen\.push/, 'each once');
});

test('a page may stand without a sidebar', () => {
  const html = pageShell({ title: 'conv.title', policy: INDEX_CONTENT_SECURITY_POLICY_META, styles: [], scripts: [], main: '<p>Hello</p>' });
  assert.match(html, /<div class="shell"><main class="shell-main" id="main"><p>Hello<\/p><\/main><\/div>/);
});

test('the backdrop can turn mint, and is warm until a page says so', () => {
  assert.match(backdrop(), /^<div class="bd" aria-hidden="true">/);
  assert.match(BACKDROP_STYLE, /\.bd:after\{[^}]*opacity:0/);
  assert.match(BACKDROP_STYLE, /\.bd-mint:after\{opacity:1\}/);
});

test('a confirmation can list every change it makes, under its sentence', () => {
  const html = confirmDialog({
    id: 'ob-finish', title: 'Set it up?', subject: '', sentence: 'We will make these changes.', option: '',
    detail: '<ul><li>One</li><li>Two</li></ul>', cancel: 'Back', confirm: 'Yes, set it up', confirmAttributes: ' data-ob-finish',
  });
  assert.match(html, /<p class="cf-sentence">We will make these changes\.<\/p><div class="cf-detail"><ul><li>One<\/li><li>Two<\/li><\/ul><\/div>/);
  const without = confirmDialog({ id: 'x', title: 't', subject: '', sentence: 's', option: '', cancel: 'c', confirm: 'k', confirmAttributes: '' });
  assert.doesNotMatch(without, /cf-detail/, 'nothing is drawn where there is nothing to list');
});

// `change-it-from-the-row` QE13: a link to a window is the way in for a page with no script. Where there is one and
// the window named is not on the page, following the address would leave the reader at the top of a page with no
// window open, which reads as being taken off the view they were on (the maintainer, 2026-10-06).
test('a link to a window the page does not hold takes the reader nowhere', () => {
  assert.match(POPUP_SCRIPT, /if \(document\.documentElement\.classList\.contains\('js'\)\) event\.preventDefault\(\);/);
  assert.doesNotThrow(() => new Function(POPUP_SCRIPT));
});

// live-pages L5-L8, L13, L15: every page carries the pill and the stopped line, hidden, and a script that updates the
// page only where nothing can move under the reader, and draws nothing while it asks.
test('a page carries the live pill and stopped line, hidden, and a script that waits for the reader', () => {
  const html = pageShell({ title: 'conv.title', policy: INDEX_CONTENT_SECURITY_POLICY_META, styles: [], scripts: [], sidebar: '', main: '' });
  assert.match(html, /<button type="button" class="pill pill-light pill-sm live-pill" data-live-pill data-live-words="[^"]+" hidden><\/button>/);
  assert.match(html, /<p class="live-stopped" data-live-stopped role="status" hidden><\/p>/);
  const words = JSON.parse((/data-live-words="([^"]+)"/.exec(html)?.[1] ?? '{}').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
  assert.deepEqual(Object.keys(words.pl).sort(), ['few', 'go.few', 'go.many', 'go.one', 'many', 'one', 'stopped', 'updated'], 'Polish counts three ways');
  assert.equal(words.de['go.other'], '{n} neue Unterhaltungen · Anzeigen', 'and says a new row out of view in every language');
  assert.equal(words.en.other, '{n} new conversations ↑');

  const script = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html)?.[1] ?? '';
  for (const condition of ["dialog[open]", 'document.activeElement', 'getSelection', 'window.scrollY <= 80', "visibilityState === 'visible'"]) {
    assert.ok(script.includes(condition), condition);
  }
  assert.match(script, /2000 : 60000/, 'every 2 s while visible, every minute while hidden');
  assert.match(script, /misses >= 3/, 'three failed asks say the server has gone');
  assert.doesNotMatch(script, /spinner|loading|progress/i, 'nothing is drawn while it asks');
  assert.match(script, /if \(!sent \|\| \(location\.protocol !== 'http:' && location\.protocol !== 'https:'\)\) return;/, 'a file or an unstamped page is left alone');
});

// live-pages: a form worked through once - the onboarding - does not update itself and lose what was answered.
test('a page can say it does not update itself', () => {
  const html = pageShell({ title: 'conv.title', policy: INDEX_CONTENT_SECURITY_POLICY_META, styles: [], scripts: [], sidebar: '', main: '', live: false });
  assert.doesNotMatch(html, /data-live-pill|api\/version/);
});

// live-pages L9, found 2026-09-25: what an update keeps is put back after the page's own scripts are listening. The
// page's scripts come after this one in the same <script>; a pill it pressed again before them was pressed for nobody,
// and a filter kept in its field was shown and not applied.
test('what an update kept is put back once the page\u2019s own scripts listen', () => {
  const later: (() => void)[] = [];
  let heard = 0;
  const pill = { hidden: true, dataset: {}, textContent: '', addEventListener: () => {} };
  const pressed = {
    tagName: 'BUTTON', dataset: {}, hasAttribute: (name: string) => name === 'aria-pressed', getAttribute: () => 'false',
    onclick: undefined as (() => void) | undefined,
    click() { this.onclick?.(); },
  };
  const document = {
    documentElement: { dataset: { version: 'v1', lang: 'en' } },
    visibilityState: 'visible',
    querySelector: (selector: string) => (selector === '[data-live-pill]' ? { ...pill, dataset: { liveWords: '{}' } } : selector === '[data-live-stopped]' ? pill : null),
    querySelectorAll: (selector: string) => (selector === '[data-live-keep]' ? [pressed] : []),
    addEventListener: () => {},
  };
  const store = new Map([['agentwhy.live.index.html', JSON.stringify({ kept: [{ pressed: true }], keys: [], scroll: 0 })]]);
  const sessionStorage = { getItem: (key: string) => store.get(key) ?? null, removeItem: (key: string) => store.delete(key), setItem: () => {} };
  const window = { addEventListener: () => {}, scrollTo: () => {}, scrollY: 0 };
  const location = { protocol: 'http:', pathname: '/index.html', reload: () => {} };
  const setTimeout = (run: () => void, wait: number): number => { if (wait === 0) later.push(run); return 0; };
  new Function('document', 'window', 'location', 'sessionStorage', 'setTimeout', 'clearTimeout', 'fetch', 'Event', LIVE_SCRIPT)(
    document, window, location, sessionStorage, setTimeout, () => {}, () => new Promise(() => {}), class {},
  );
  // The page's own script, after the live one: it listens only now.
  pressed.onclick = () => { heard += 1; };
  assert.equal(heard, 0, 'nothing is put back before the page listens');
  later.forEach((run) => run());
  assert.equal(heard, 1, 'the pill kept pressed is pressed again, for a page that hears it');
});

// live-pages L7a, the maintainer 2026-09-25: scrolled down on Conversations, a new conversation was not seen - the pill
// at the top went unnoticed, and a reload would flash and move the rows. A page that can take its new version in place
// is handed it wherever the reader is: never reloaded, what changed lit, a new row out of view said at the foot.
function livePage(options: { swap: 'rows' | 'none' | 'absent'; rowInView: boolean; scrollY: number; gone?: true }) {
  const timers: { run: () => void; wait: number }[] = [];
  const classes = (initial: string[]) => {
    const set = new Set(initial);
    return { add: (...names: string[]) => names.forEach((name) => set.add(name)), remove: (...names: string[]) => names.forEach((name) => set.delete(name)), contains: (name: string) => set.has(name), set };
  };
  let onPill: (() => void) | undefined;
  const pill = { hidden: true, dataset: { liveWords: JSON.stringify({ en: { one: '1 new conversation ↑', 'go.one': '1 new conversation · Show', updated: 'Updated · Show' } }) } as Record<string, string>, textContent: '',
    classList: classes(['pill', 'pill-light', 'pill-sm', 'live-pill']), addEventListener: (_: string, run: () => void) => { onPill = run; } };
  const gone = { hidden: true, textContent: '' };
  const row = { hidden: false, offsetParent: options.rowInView ? {} : null, isConnected: true, offsetWidth: 1, classList: classes([]),
    getBoundingClientRect: () => ({ top: 10, bottom: 90 }), scrolled: 0, scrollIntoView() { this.scrolled += 1; } };
  const revealed: unknown[] = [];
  const html = { dataset: { version: 'v1', lang: 'en', conversations: '3' } as Record<string, string> };
  const document = {
    documentElement: html, visibilityState: 'visible', activeElement: null,
    querySelector: (selector: string) => (selector === '[data-live-pill]' ? pill : selector === '[data-live-stopped]' ? gone : null),
    querySelectorAll: () => [], addEventListener: () => {},
  };
  const reloads: number[] = [];
  const window: Record<string, unknown> = { addEventListener: () => {}, scrollTo: () => {}, scrollY: options.scrollY, innerHeight: 900, getSelection: () => '' };
  if (options.swap !== 'absent') {
    window.agentwhyLiveSwap = () => (options.swap === 'none' ? null : { fresh: [row], added: [row], reveal: (element: unknown) => revealed.push(element) });
  }
  const next = { documentElement: { dataset: { version: 'v2', conversations: '4' } } };
  const fetch = (url: string) => Promise.resolve(url.startsWith('api/version/')
    ? options.gone === true ? { ok: false, status: 410, json: () => Promise.resolve({ gone: true }) } : { ok: true, status: 200, json: () => Promise.resolve({ version: 'v2', conversations: 4 }) }
    : { ok: true, text: () => Promise.resolve('<html>') });
  new Function('document', 'window', 'location', 'sessionStorage', 'setTimeout', 'clearTimeout', 'fetch', 'Event', 'DOMParser', 'matchMedia', LIVE_SCRIPT)(
    document, window, { protocol: 'http:', pathname: '/tok/index.html', reload: () => reloads.push(1) },
    { getItem: () => null, removeItem: () => {}, setItem: () => {} },
    (run: () => void, wait: number) => { timers.push({ run, wait }); return 0; }, () => {}, fetch, class {},
    class { parseFromString() { return next; } }, () => ({ matches: true }),
  );
  const tick = async (): Promise<void> => {
    const due = timers.splice(0).filter((timer) => timer.wait === 2000);
    due.forEach((timer) => timer.run());
    for (let at = 0; at < 20; at += 1) await Promise.resolve();
  };
  return { tick, pill, gone, row, html, reloads, revealed, click: () => onPill?.() };
}

// which-project V14, amended 2026-09-28: a page of a project the process no longer shows is told so by its server (410),
// and says so at once - not after three asks that reach nothing, as when the process has gone.
test('a page whose project was given up for another says so at the first ask', async () => {
  const page = livePage({ swap: 'rows', rowInView: true, scrollY: 0, gone: true });
  await page.tick();
  assert.equal(page.gone.hidden, false);
  assert.equal(page.reloads.length, 0);
});

test('a page that can take a new version in place is never reloaded; a new row out of view is said at the foot', async () => {
  const page = livePage({ swap: 'rows', rowInView: false, scrollY: 1200 });
  await page.tick();
  assert.equal(page.reloads.length, 0, 'no reload, no flash');
  assert.equal(page.html.dataset.version, 'v2', 'the page is now the new version, and does not take it again');
  assert.equal(page.html.dataset.conversations, '4');
  assert.ok(page.row.classList.contains('live-lit'), 'what changed is lit');
  assert.equal(page.pill.hidden, false);
  assert.equal(page.pill.textContent, '1 new conversation · Show');
  assert.ok(page.pill.classList.contains('live-foot') && page.pill.classList.contains('pill-primary') && !page.pill.classList.contains('pill-light'), 'at the foot, in coral');
  page.click();
  assert.deepEqual(page.revealed, [page.row], 'a filter that hides it is set aside');
  assert.equal(page.row.scrolled, 1, 'and it is brought into view');
  assert.equal(page.pill.hidden, true);
  assert.equal(page.reloads.length, 0);
});

test('a new row in view is only lit; a page that cannot take it in place is updated as before', async () => {
  const seen = livePage({ swap: 'rows', rowInView: true, scrollY: 0 });
  await seen.tick();
  assert.equal(seen.pill.hidden, true, 'nothing to say about a row already in view');
  assert.ok(seen.row.classList.contains('live-lit'));

  const other = livePage({ swap: 'absent', rowInView: true, scrollY: 1200 });
  await other.tick();
  assert.equal(other.reloads.length, 0, 'read down the page, it is not reloaded under the reader');
  assert.equal(other.pill.hidden, false);
  assert.equal(other.pill.textContent, '1 new conversation ↑', 'the pill at the top, as before');

  const refused = livePage({ swap: 'none', rowInView: true, scrollY: 0 });
  await refused.tick();
  assert.equal(refused.reloads.length, 1, 'periods it did not have (a week begun): reloaded, at the top, as before');
});

// F7, added 2026-10-05 by the maintainer: the sidebar asks, quietly, for support - two links to agentwhy's own site, the
// only outside addresses a page holds, each opened in a new tab with no referrer, since a served page's address holds
// its token. A link is no request: the page still sends nothing anywhere until a person clicks.
test('the sidebar links to the sponsors and companies pages, quietly, in a new tab and with no referrer', () => {
  const html = appSidebar({ home: 'index.html', items: [] });
  assert.deepEqual(SUPPORT_ADDRESSES, ['https://www.agentwhy.dev/sponsors.html', 'https://www.agentwhy.dev/companies.html']);
  for (const address of SUPPORT_ADDRESSES) assert.match(html, new RegExp('<a class="sb-support-link[^"]*" href="' + address.replace(/[.]/g, '\\.') + '" target="_blank" rel="noopener noreferrer">'));
  assert.match(html, /lang="en">Sponsor agentwhy<[\s\S]*?lang="pl">Wesprzyj agentwhy<[\s\S]*?lang="de">agentwhy unterstützen</);
  assert.match(html, /lang="en">For companies<[\s\S]*?lang="pl">Dla firm<[\s\S]*?lang="de">Für Unternehmen</);
  assert.ok(html.indexOf('sb-support') < html.indexOf('sb-local'), 'above the line that says nothing is uploaded');
});

// The maintainer, 2026-10-07: "Saving… to słaby UX i UI, user tego nie widzi - musi być loader na buttonie albo na całą
// stronę". Every write a page makes shows the kit's loader - the button spins, and a veil with a spinner and the word
// covers its window, or the page - and no page says "Saving…" in a line alone any more.
test('every write shows the kit’s loader on its button and over its window or the page', async () => {
  const { WORKING_JS, BUTTON_STYLE } = await import('../../../../src/report/render/ui/button.ts');
  assert.match(WORKING_JS, /button\.classList\.toggle\('pill-busy', on\)/);
  assert.match(WORKING_JS, /const host = \(button && button\.closest\('dialog'\)\) \|\| document\.body;/, 'the window it is in, or the page');
  assert.match(BUTTON_STYLE, /\.busy-veil\{position:absolute;inset:0/);
  assert.match(BUTTON_STYLE, /\.busy-veil-page\{position:fixed/);
  const scripts = [
    (await import('../../../../src/report/start/settings/settings-script.ts')).SETTINGS_SCRIPT,
    (await import('../../../../src/report/start/to-fix/to-fix-script.ts')).TO_FIX_SCRIPT,
    (await import('../../../../src/report/start/onboarding/onboarding-script.ts')).ONBOARDING_SCRIPT,
    (await import('../../../../src/report/render/report-page/fix-wizard-script.ts')).FIX_WIZARD_SCRIPT,
    (await import('../../../../src/report/start/conversations/conversation-columns.ts')).CONVERSATION_ROW_SCRIPT,
  ];
  for (const script of scripts) {
    assert.ok(script.includes(WORKING_JS), 'each page script carries the helper');
    assert.match(script, /working\([a-zA-Z[\]0-9]+, true, (word\('saving'\)|say\('wz\.saving'\), true)\)/);
    assert.doesNotMatch(script, /say\((where, )?word\('saving'\)|evSay\(word\('saving'\)\)|main\.innerHTML = say\('wz\.saving'\)/, 'no "Saving…" in a line alone');
  }
});

// `2026-10-07-a-file-in-its-place.md` IP2, IPD2: on the computer's page the window names places - the system's own window,
// through the server, on a Mac for both kinds at once and on Windows one card for each; no drop zone, which gives a name
// only; a typed place, and a name alone said to belong to a project. The window's own script still sends nothing (F36):
// asking the server is ADD_PLACE_SCRIPT's alone, and it sends the language and the kind, never a path.
test('IP2: the computer’s add window names places, through the system’s window, and still sends nothing itself', async () => {
  const { ADD_PLACE_SCRIPT } = await import('../../../../src/report/render/ui/add-file-popup.ts');
  const mac = addFilePopup('set-add', 'both');
  assert.match(mac, /<div class="af" data-af data-af-places>/);
  assert.match(mac, /<div class="af-picks af-picks-one js-only"><button type="button" class="af-pick" data-af-place="both">[\s\S]*?lang="en">Choose files or folders</);
  assert.doesNotMatch(mac, /type="file"|data-af-drop/, 'no browser window and no drop: both give a name only');
  assert.match(mac, /lang="en">Or type where it is</);
  assert.match(mac, /<p class="af-cannot" data-af-notplace hidden>[\s\S]*?add it in that project’s Settings instead/);
  const windows = addFilePopup('set-add', 'separate');
  assert.match(windows, /data-af-place="files"[\s\S]*?data-af-place="folder"/);
  assert.doesNotMatch(addFilePopup('set-add', 'typed'), /data-af-place=/, 'no window known: only a typed place');

  assert.doesNotMatch(ADD_FILE_POPUP_SCRIPT, /fetch\(/, 'F36 holds for the window itself');
  assert.match(ADD_FILE_POPUP_SCRIPT, /window_\.addEventListener\('af-places'/);
  assert.match(ADD_FILE_POPUP_SCRIPT, /if \(placesMode\) \{[\s\S]*?const place = \/\^\(\?:~\\\/\|\\\/\)\.\/\.test\(text\);/, 'IPD2: typed, only a place');
  assert.match(ADD_PLACE_SCRIPT, /fetch\('api\/choose-places'[\s\S]*?body: JSON\.stringify\(\{ lang: document\.documentElement\.dataset\.lang \|\| 'en', kind: button\.dataset\.afPlace \}\)/);
  assert.match(ADD_PLACE_SCRIPT, /window_\.dispatchEvent\(new CustomEvent\('af-places', \{ detail: \{ places: answer\.places \} \}\)\)/);
});
