// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import { LANGS, TABLES } from '../../../../src/report/render/report-copy.ts';
import { EVERYWHERE_WORDS } from '../../../../src/report/render/ui/words/everywhere-words.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import { OnboardingRenderer } from '../../../../src/report/start/onboarding/onboarding-renderer.ts';
import type { IndexEntry, IndexEverywhere, IndexHooks, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { globalDefaults } from '../../../../src/setup/global-defaults.ts';

// `.ai/specs/2026-10-05-protected-everywhere.md` G7-G10, GD11-GD14, as the maintainer approved the mock on 2026-10-06:
// the fork, the computer-wide Files step, its confirmation and its Done - from the index alone.

const NOW = Date.parse('2026-10-06T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' };
const HOOKS: IndexHooks = { watch: false, refuse: false, reads: { watch: 'default', refuse: 'default' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' };

function settings(extra: Partial<IndexSettings> = {}): IndexSettings {
  return { level: 'no-read', protected: ['**/.env*'], allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, ...extra };
}

function entry(name: string): IndexEntry {
  return { provider: 'claude-code', name, title: ('Asked in ' + name) as Redacted, modifiedAt: NOW - 3_600_000, delegations: 0, report: { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] } };
}

/** A Mac with an SSH folder, AWS and GitHub's login; its own SSH keys blocked already and Kubernetes tracked. */
function everywhere(extra: Partial<IndexEverywhere> = {}): IndexEverywhere {
  const here = new Set(['ssh', 'aws', 'github']);
  return {
    rows: globalDefaults('darwin').map((row) => ({ ...row, present: here.has(row.id) })),
    blocked: ['**/.ssh/**', '**/ledger.csv'],
    told: ['**/.kube/**'],
    codex: true,
    ...extra,
  };
}

function page(extra: Partial<SessionIndex> = {}, offered = true): string {
  return new OnboardingRenderer(LINKS).render({
    now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', shared: false, widen: 'agentwhy start --since 14d',
    entries: [entry('a'), entry('b')],
    settings: settings(),
    onboarding: { intro: true },
    project: '/Users/someone/Projects/my-app',
    place: '~/Projects/my-app',
    ...(offered ? { everywhere: everywhere() } : {}),
    ...extra,
  });
}

function screen(html: string, name: string): string {
  const start = html.indexOf('data-ob-screen="' + name + '"');
  assert.ok(start >= 0, name);
  return html.slice(html.lastIndexOf('<section', start), html.indexOf('</section>', start));
}

/** The English a person reads, scripts and styles out. */
function english(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

const dialog = (html: string): string => /<dialog class="pp pp-confirm" id="ob-ev-confirm"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';

test('G7: after the welcome, the fork - this project chosen, with its name, chats and place - and no number', () => {
  const html = page();
  assert.match(html, /data-ob-go="scope"/, 'Get started leads to the fork');
  const fork = screen(html, 'scope');
  assert.match(fork, /^<section class="ob-screen ob-step ob-scope" data-ob-screen="scope" hidden/);
  assert.match(fork, /<button type="button" class="ob-scope-card ob-scope-on" role="radio" aria-checked="true" data-ob-scope="project">/);
  assert.match(fork, /<button type="button" class="ob-scope-card" role="radio" aria-checked="false" data-ob-scope="everywhere">/);
  assert.match(english(fork), /my-app · 2 AI chats/);
  assert.match(fork, /<span class="chip ob-scope-place">~\/Projects\/my-app<\/span>/);
  assert.match(english(fork), /Kept from your AI in every project, in Claude Code and in Codex\./);
  assert.doesNotMatch(fork, /ob-step-no/, 'asked before the steps, with no number of its own');
  assert.match(fork, /data-ob-go="welcome"/);
});

// GD13 with G17: Codex is named only where its check is turned on with the rules.
test('GD13: a computer without Codex is told Claude Code alone, on the fork, in the window and on Done', () => {
  const html = page({ everywhere: everywhere({ codex: false }) });
  assert.match(english(screen(html, 'scope')), /in every project, in Claude Code\./);
  assert.doesNotMatch(english(screen(html, 'scope')), /Codex/);
  assert.doesNotMatch(english(dialog(html)), /Codex/);
  assert.match(english(dialog(html)), /This holds in every project on this computer, in Claude Code\./);
});

test('GD13: no page of the path names a settings file', () => {
  const html = page();
  for (const name of ['scope', 'everywhere', 'everywhere-done']) assert.doesNotMatch(english(screen(html, name)), /settings\.json|\.claude|\.agentwhy|private-files/, name);
  assert.doesNotMatch(english(dialog(html)), /settings\.json|\.claude|\.agentwhy/);
});

// G9, GD14, drawn as step 3 draws its list (the maintainer, 2026-10-06): the same heads and parts; what is here in, on
// Block; what is not out and folded; what the computer holds already drawn as it is, with a line saying so.
const rowOf = (html: string, pattern: string): string =>
  new RegExp('<li class="ob-rule [^"]*" data-ob-ev-row data-ob-ev-pattern="' + pattern.replace(/[*.]/g, '\\$&') + '">[\\s\\S]*?</li>').exec(html)?.[0] ?? '';
const nameOf = (row: string): string => /<span class="ob-rule-name"><span class="i18n" lang="en">([^<]*)<\/span>/.exec(row)?.[1] ?? '';
const chipOf = (row: string): string => /<span class="chip ob-rule-chip"[^>]*>([^<]*)<\/span>/.exec(row)?.[1] ?? '';

test('GD14: the list is step 3\u2019s - its heads, and each row\u2019s mark, name, chip, switch, who added it and its action', () => {
  const step = screen(page(), 'everywhere');
  assert.match(step, /^<section class="ob-screen ob-step ob-step-files ob-step-ev" data-ob-screen="everywhere" hidden/);
  assert.match(english(step), /For everything on this computer Step 2 of 2 Which files on this computer are private\?/);
  assert.match(step, /<div class="ob-list ob-ev-list" data-ob-ev-list><div class="ob-rules-head" aria-hidden="true">/);
  assert.match(english(step), /File When your AI reaches it Added by Action/);

  const aws = rowOf(step, '~/.aws/**');
  assert.match(aws, /^<li class="ob-rule ob-rule-is-block ob-ev-row ob-ev-on"/, 'here: in, on Block');
  assert.equal(nameOf(aws), 'Your Amazon Web Services login');
  assert.equal(chipOf(aws), '.aws');
  assert.match(aws, /<span class="ob-icon" aria-hidden="true">/, 'the mode\u2019s mark');
  assert.match(aws, /<span class="ob-info" tabindex="0"/, 'the tip beside the name');
  assert.match(aws, /<span class="ob-ev-in"><span class="ob-mode ob-mode-is-block"[\s\S]*?data-ob-mode="tell"/);
  assert.match(aws, /<span class="ob-ev-out"><button type="button" class="pill pill-outline pill-sm" data-ob-ev-add>/, 'Add, shown when it is out');
  assert.match(aws, /<span class="ob-rule-src"><span class="tag tag-grey[^"]*"[^>]*>[\s\S]*?agentwhy/);
  assert.match(aws, /data-ob-ev-leave/, 'the bin, as a name added here has');
  assert.doesNotMatch(aws, /type="checkbox"/, 'no ticks: in or out, as step 3 draws a row');

  const ssh = rowOf(step, '~/.ssh/**');
  assert.match(ssh, /ob-ev-held/);
  assert.match(english(ssh), /Already blocked in every project/);
  assert.doesNotMatch(ssh, /data-ob-ev-add|data-ob-ev-leave|<button[^>]*data-ob-mode/, 'held: drawn still, not chosen again');

  const kube = rowOf(step, '~/.kube/**');
  assert.match(kube, /ob-rule-is-tell/);
  assert.match(english(kube), /Already tracked in every project/);

  const azure = rowOf(step, '~/.azure/**');
  assert.match(azure, /^<li class="ob-rule ob-rule-is-block ob-ev-row ob-ev-folded"/, 'not here: out, and folded');
  assert.match(english(azure), /Not on this computer yet/);

  const ledger = rowOf(step, '**/ledger.csv');
  assert.equal(nameOf(ledger), 'A private file');
  assert.match(ledger, /<span class="ob-rule-src"><span class="tag tag-mint/, 'a rule of the person\u2019s own: added by you');
  // Here first, then the person's own, then what is folded - and one line says how many are folded.
  const order = [...step.matchAll(/data-ob-ev-pattern="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order.slice(0, 5), ['~/.ssh/**', '~/.aws/**', '~/.config/gh/**', '~/.kube/**', '**/ledger.csv']);
  assert.match(english(step), /6 more, for tools not on this computer · Show/, 'Kubernetes is tracked, so it is shown, not folded');
});

test('GD14: on Windows the rows name the places Windows keeps them', () => {
  const rows = globalDefaults('win32').map((row) => ({ ...row, present: true }));
  const step = screen(page({ everywhere: everywhere({ rows, blocked: [], told: [] }) }), 'everywhere');
  assert.equal(chipOf(rowOf(step, '**/AppData/Roaming/GitHub CLI/**')), 'AppData/Roaming/GitHub CLI');
  assert.equal(nameOf(rowOf(step, '**/_netrc')), 'Logins saved for other tools');
  assert.doesNotMatch(step, /ob-ev-more/, 'nothing to fold where every tool is here');
});

// The maintainer, 2026-10-06: the add button is the onboarding's own, "identical" - the same call, other words.
test('the add button is the project step’s own, opening the same window; Continue opens the confirmation', () => {
  const html = page();
  const step = screen(html, 'everywhere');
  assert.match(step, /<div class="ob-add js-only"><button type="button" class="pill pill-light pill-lg" data-popup-open="ob-add-place"><span class="ob-plus" aria-hidden="true">\+<\/span><span class="i18n" lang="en">Add another private file or folder<\/span>/, 'its own window, which names places (a-file-in-its-place IP2)');
  assert.match(html, /<dialog class="pp pp-pick" id="ob-add"/, 'one add window on the page');
  assert.match(step, /<div class="ob-dock"><div class="ob-foot js-only">/, 'the way on stays at the foot of the window');
  assert.match(step, /data-ob-ev-continue/);
});

test('the confirmation lists what is kept and what is read, says what each costs, and confirms in mint', () => {
  const window = dialog(page());
  assert.match(english(window), /Protect these files on this computer\?/);
  assert.match(english(window), /This holds in every project on this computer, in Claude Code and in Codex\./);
  assert.match(window, /data-ob-ev-group="block" hidden>[\s\S]*?data-ob-ev-title="block"[\s\S]*?No project can turn this off/);
  assert.match(window, /data-ob-ev-group="tell" hidden>[\s\S]*?data-ob-ev-title="tell"[\s\S]*?agentwhy tells you when your AI reads one/);
  assert.match(english(window), /This also turns on agentwhy’s check in Codex, so Codex keeps to these too\./);
  assert.match(window, /class="pill pill-mint pill-lg" data-ob-ev-confirm>/);
  // Step 3: Settings lists the computer's rules and switches and takes them out, so the window may say so.
  assert.match(english(window), /You can switch or take out any of these later in Settings, under Private files\./);
});

test('a computer whose rules cannot be read says so, and offers nothing to choose or add', () => {
  const step = screen(page({ everywhere: everywhere({ blocked: 'unreadable' }) }), 'everywhere');
  assert.match(english(step), /agentwhy couldn’t read your Claude Code settings, so nothing can be changed here\./);
  assert.doesNotMatch(step, /<input type="checkbox"|class="ob-add/);
  assert.match(step, /data-ob-ev-continue disabled/);
});

// GD12: the computer-wide path sets no project up, so Done offers the one this run is for where agentwhy runs nowhere in it.
test('GD12: Done offers this project where it is not set up, and nothing where it is', () => {
  const fresh = screen(page(), 'everywhere-done');
  assert.match(english(fresh), /You’re set up on this computer\./);
  assert.match(english(fresh), /my-app isn’t set up yet/);
  assert.match(fresh, /data-ob-go="project"><span class="i18n" lang="en">Set up <strong>my-app<\/strong> too<\/span>/);
  assert.match(fresh, /<span data-ob-ev-codex="on" hidden>[\s\S]*?in Claude Code or in Codex\.[\s\S]*?<span data-ob-ev-codex="else">/, 'Codex said only once its check is on');
  assert.match(fresh, /class="pill pill-mint pill-lg" href="index.html"/);
  assert.match(fresh, /Change any of this later in <a class="ob-link" href="settings\.html">Settings<\/a>, under Private files\./);

  const setUp = screen(page({ settings: settings({ hooks: { ...HOOKS, watch: 'local' } }) }), 'everywhere-done');
  assert.doesNotMatch(english(setUp), /isn’t set up yet/);
});

// which-project V7, amended 2026-10-07 by the maintainer ("czemu zmieniłeś onboarding z tych dwóch kafelków"): in the
// home directory the same two tiles - a project, picked next from the list, or the computer - and no card above the list.
test('G10: in the home directory the two tiles too - a project, picked next, or the computer - and no card on the list', async () => {
  const html = page({ notAProject: 'home', onboarding: { intro: false, atProject: true } });
  const tiles = screen(html, 'scope');
  assert.match(english(tiles), /A project[\s\S]*?The one you work on with your AI\. You pick it next, from your projects or any folder\./);
  assert.match(english(tiles), /Everything on this computer/);
  assert.match(english(tiles), /Not sure\? Start with the project you work on\./);
  assert.match(screen(html, 'welcome'), /data-ob-go="scope"/, 'Get started leads to the tiles');
  assert.doesNotMatch(html, /ob-ev-wayin/, 'the computer is a tile, not a card above the list');
  assert.match(screen(html, 'everywhere'), /data-ob-go="scope"/, 'Back goes to the tiles');
  assert.match(english(screen(html, 'everywhere-done')), /Now the project you work on/);
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  assert.match(ONBOARDING_SCRIPT, /\} else if \(state\.atProject\) \{\n[^\n]*\n[^\n]*\n    show\(state\.scope \? 'scope' : 'project'\);/, 'someone who has been through it before starts at the tiles');
});

test('no computer-wide path where the run offers none: no fork, no step, no window', () => {
  const html = page({}, false);
  const drawn = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(drawn, /data-ob-screen="(scope|everywhere|everywhere-done)"|ob-ev-confirm|ob-ev-wayin|data-ob-stepper-ev/);
  assert.match(html, /data-ob-go="project"/, 'Get started leads to the project step, as before');
});

test('W28: every word of the path is in every language, with the same placeholders, and no key is shown', () => {
  const en = Object.keys(EVERYWHERE_WORDS.en);
  for (const lang of LANGS) {
    const table = EVERYWHERE_WORDS[lang];
    for (const key of en.filter((one) => !/\.(one|few|many|other)$/.test(one))) {
      assert.ok(table[key] !== undefined, `${lang} ${key}`);
      assert.deepEqual((table[key] ?? '').match(/\{\w+\}/g)?.sort() ?? [], (EVERYWHERE_WORDS.en[key] ?? '').match(/\{\w+\}/g)?.sort() ?? [], `${lang} ${key}`);
    }
    // A counted word has every form its language reads: English and German one and other, Polish one, few and many.
    for (const base of [...new Set(en.filter((one) => /\.(one|other)$/.test(one)).map((one) => one.replace(/\.(one|other)$/, '')))]) {
      for (const form of lang === 'pl' ? ['one', 'few', 'many'] : ['one', 'other']) assert.ok(TABLES[lang][base + '.' + form] !== undefined, `${lang} ${base}.${form}`);
    }
  }
  const text = page().replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /\bob\.ev\.[a-z][\w.-]*/, 'a key is shown in place of its word');
});

// G10: the projects window's way in lands on the computer-wide step, as `#who` lands on Who (which-project V16).
test('the page opens at the computer-wide step when its address names it', async () => {
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  const { EVERYWHERE_STEP } = await import('../../../../src/report/start/onboarding/everywhere-address.ts');
  assert.equal(EVERYWHERE_STEP, 'everywhere');
  assert.match(ONBOARDING_SCRIPT, /location\.hash === '#everywhere' && screens\.some\(\(screen\) => screen\.dataset\.obScreen === 'everywhere'\)\) \{\n    show\('everywhere'\);/);
});

// GD16, amended 2026-10-07: on the computer's page the onboarding is the home folder's - the two tiles, a project to pick.
test('on the computer\u2019s page the onboarding is the home folder\u2019s: the two tiles, a project picked next', () => {
  const html = page({ scope: 'computer', project: undefined as never, place: undefined as never, onboarding: { intro: false, atProject: true } });
  assert.match(english(screen(html, 'scope')), /A project/);
  assert.doesNotMatch(html, /ob-ev-wayin/);
});

// Step 4 (GD15): from a project's page, Done's way on is the computer's own view; on the computer's page, its own.
test('Done leads to the computer\u2019s view from a project\u2019s page, and to its own Conversations on the computer\u2019s', () => {
  const projects = { rows: [], unreadable: 0, switchable: true, choosable: false, removable: false };
  assert.match(screen(page({ projects }), 'everywhere-done'), /<button type="button" class="pill pill-mint pill-lg" data-ob-switch-computer>/);
  assert.match(screen(page({ projects, scope: 'computer', project: undefined as never, place: undefined as never }), 'everywhere-done'), /class="pill pill-mint pill-lg" href="index\.html"/);
  assert.match(screen(page(), 'everywhere-done'), /class="pill pill-mint pill-lg" href="index\.html"/, 'where the run cannot switch, the page it has');
});

// The maintainer, 2026-10-06, in a new project where every file here was protected already: Continue was greyed, and
// the step had no way on. With nothing new chosen it goes to Done, nothing to confirm - amended 2026-10-07 (GD26): one
// request records the step finished, with the alerts where they are ticked, so the home folder opens the computer's view.
test('with nothing new chosen, Continue finishes the step - recorded, nothing to confirm - and goes to Done', async () => {
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  assert.match(ONBOARDING_SCRIPT, /if \(onward && state\.ev && state\.ev\.writable\) onward\.disabled = false;/);
  assert.match(ONBOARDING_SCRIPT, /if \(chosen\.length === 0\) \{ evFinish\(root\.querySelector\('\[data-ob-ev-continue\]'\)\); return; \}/);
  assert.match(ONBOARDING_SCRIPT, /JSON\.stringify\(\{ finish: true, \.\.\.\(evAlerts\(\) \? \{ alerts: true \} : \{\}\) \}\)/);
  assert.doesNotMatch(screen(page(), 'everywhere'), /data-ob-ev-continue disabled/, 'drawn ready, where the rules can be written');
});


// GD23 with the maintainer's "dlaczego jak user wybrał computer global to When my AI reads a private file nie jest
// zaznaczone z defaultu?", and then "to nie powinno być widoczne - to jest z defaultu": alerts in every project come with
// the computer's step, not asked on it; its confirmation and Done say so. And the confirmation counts the files chosen,
// not lists them: "zabiera miejsce, jak będzie więcej plików, ten modal będzie ogromny".
test('GD23: the computer step turns alerts on by default, says so in its confirmation, and counts the files there', async () => {
  const off = page({ everywhere: everywhere({ alerts: false }) });
  assert.doesNotMatch(screen(off, 'everywhere'), /data-ob-ev-alerts|type="checkbox"/, 'not asked on the step');
  assert.match(off, /data-ob-state="[^"]*&quot;ev&quot;:\{&quot;writable&quot;:true,&quot;alerts&quot;:true\}/);
  assert.match(off, /data-ob-ev-group="alerts" hidden>[\s\S]*?Alerts in every project/, 'the confirmation says it');
  assert.match(screen(off, 'everywhere-done'), /data-ob-ev-line="alerts" hidden/);
  assert.match(screen(off, 'everywhere-done'), /data-ob-ev-fail="alerts" hidden/);
  // The maintainer, 2026-10-07, of a grey heading and a lone number: "zrób lepszy UI, bo user tego nie widzi" - a card,
  // its mark in its colour, and a title that counts in each language's plural.
  assert.match(off, /<div class="ob-ev-group ob-ev-group-block" data-ob-ev-group="block" hidden><span class="ob-ev-group-mark" aria-hidden="true">[\s\S]*?<span class="ob-ev-group-title"><span class="i18n" lang="en"><span data-ob-ev-title="block"><\/span>/);
  assert.match(off, /&quot;evConfirmBlocked\.few&quot;:&quot;\{n\} prywatne pliki chronione przed AI&quot;/, 'Polish has its few');
  assert.match(off, /&quot;evConfirmBlocked\.other&quot;:&quot;\{n\} private files kept from your AI&quot;/);
  assert.doesNotMatch(off, /data-ob-ev-chips/, 'no list of files');
  for (const alerts of [true, 'unreadable', undefined] as const) {
    assert.match(page({ everywhere: everywhere(alerts === undefined ? {} : { alerts }) }), /&quot;ev&quot;:\{&quot;writable&quot;:true,&quot;alerts&quot;:false\}/, String(alerts));
  }
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  assert.match(ONBOARDING_SCRIPT, /const evAlerts = \(\) => Boolean\(state\.ev && state\.ev\.alerts\);/);
  assert.match(ONBOARDING_SCRIPT, /\.\.\.\(evAlerts\(\) \? \{ alerts: true \} : \{\}\),\n[^\n]*\n      finish: true,\n    \};/, 'sent with the files, the step finished');
  assert.match(ONBOARDING_SCRIPT, /slot\.textContent = counted\(mode === 'block' \? 'evConfirmBlocked' : 'evConfirmTracked', mine\.length, \(slot\.closest\('\[lang\]'\) \|\| \{\}\)\.lang \|\| 'en'\);/);
});

// `2026-10-07-several-at-once.md` AS8: the add window hands over everything it gathered, and both lists of the
// onboarding - step 2's and the computer's - add a row for each item, as they added one before.
test('AS8: both of the onboarding’s lists add a row for each item the add window hands over', async () => {
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  assert.match(ONBOARDING_SCRIPT, /const eachAdded = \(event, take\) => \(\(event\.detail && event\.detail\.files\) \|\| \[\]\)\.forEach\(take\);/);
  assert.equal((ONBOARDING_SCRIPT.match(/(?:p|placeP)icker\.addEventListener\('add-files', \(event\) => eachAdded\(event, \(\{ name, kind, pattern \}\) => \{/g) ?? []).length, 2, 'step 2 and the computer step, each its own window');
  assert.doesNotMatch(ONBOARDING_SCRIPT, /'add-file'/, 'nothing listens for the one name any more');
});

// The maintainer, 2026-10-07: "jak klikam Open agentwhy, to nic się nie dzieje i po kilku sekundach dopiero mam otwartą
// conversation page". Both ways on - the link from the home folder, the switch from a project - say at once that the
// page is on its way: the button's spinner and a veil over the page, in the page's own words.
test('Open agentwhy shows a loader at once, by link and by switch, and takes it away where it could not open', async () => {
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  assert.match(ONBOARDING_SCRIPT, /const onward = event\.target\.closest\('\.ob-done-go a\[href\]'\);\n\s*if \(onward && served && !event\.metaKey && !event\.ctrlKey && !event\.shiftKey\) \{ opening\(onward, true\); return; \}/);
  assert.match(ONBOARDING_SCRIPT, /toComputer\.disabled = true;\n\s*opening\(toComputer, true\);/);
  assert.match(ONBOARDING_SCRIPT, /toComputer\.disabled = false;\n\s*opening\(toComputer, false\);/, 'a switch that failed takes the veil away');
  assert.match(ONBOARDING_SCRIPT, /veil\.className = 'pjw-veil pjw-veil-page';/, 'the switch’s own veil');
  assert.match(ONBOARDING_SCRIPT, /window\.addEventListener\('pageshow'/, 'and a page come back to is not left veiled');
});

// G7a, GD31, asked for by the maintainer on 2026-10-07 after meeting the fork a second time: it said the same words as
// the first time, and its hint offered the setup again from Settings to a person who had just come from there.
const SET_UP_HOOKS: IndexHooks = { ...HOOKS, watch: 'local', refuse: 'local', reads: { watch: 'local', refuse: 'local' } };
const setUpProject = (): Partial<SessionIndex> => ({
  onboarding: { intro: false, setUp: true },
  settings: settings({ hooks: SET_UP_HOOKS, held: { local: ['**/.env*'], shared: [] } }),
});

test('G7a: the first time, neither card is tagged and the words are the first time’s', () => {
  const fork = screen(page({ everywhere: everywhere({ blocked: [], told: [] }) }), 'scope');
  assert.doesNotMatch(fork, /ob-scope-tag/, 'nothing is set up, so nothing says it is');
  assert.doesNotMatch(fork, /ob-scope-again/, 'not the setup seen again');
  assert.match(english(fork), /Most people start with the project they work on/);
  assert.match(english(fork), /Not sure\? Start with this project/);
});

test('G7a: a project set up says so - the quiet line, the sentence, the hint, the tag and what is in force', () => {
  const fork = screen(page(setUpProject()), 'scope');
  assert.match(english(fork), /Setting up again\. Nothing is written until you finish\./);
  assert.match(english(fork), /Pick one to see what’s in force and change it\./);
  assert.match(english(fork), /Each step shows what is set now\. Only what you change is written, when you press Finish\./);
  assert.doesNotMatch(english(fork), /going through the setup again from Settings/, 'which is where they came from');
  assert.doesNotMatch(english(fork), /Most people start with the project they work on/);
  // The tag is the list of projects' own (V10), with the tick drawn in it - and the card says nothing else of what it
  // holds: the counts and the alerts were built and taken out the same day (GD31, amended).
  const card = /data-ob-scope="project">[\s\S]*?data-ob-scope="everywhere"/.exec(fork)?.[0] ?? '';
  assert.match(card, /<span class="ob-scope-tag"><span class="tag tag-mint tag-badge"><svg /);
  assert.match(english(card), /Set up/);
  assert.doesNotMatch(english(card), /blocked|tracked|Alerts/, 'the card is not a report of the rules');
});

test('G7a: the computer card is tagged where the computer holds a rule, a tracked file or the alerts', () => {
  for (const held of [everywhere({ told: [] }), everywhere({ blocked: [] }), everywhere({ blocked: [], told: [], alerts: true })]) {
    const fork = screen(page({ everywhere: held }), 'scope');
    assert.match(fork.slice(fork.indexOf('data-ob-scope="everywhere"')), /<span class="ob-scope-tag">/);
  }
});

test('G7a: a computer that holds nothing is drawn as on a first run, with no tag and no “not set up yet”', () => {
  const fork = screen(page({ everywhere: everywhere({ blocked: [], told: [] }) }), 'scope');
  const card = fork.slice(fork.indexOf('data-ob-scope="everywhere"'));
  assert.doesNotMatch(card, /ob-scope-tag/);
  assert.doesNotMatch(english(card), /Not set up|Set up/);
});

test('G7a: the computer alone being set up leaves the first time’s words - that person is still setting this project up', () => {
  const fork = screen(page({ everywhere: everywhere({ alerts: true }) }), 'scope');
  assert.doesNotMatch(fork, /ob-scope-again/);
  assert.match(english(fork), /Most people start with the project they work on/);
  assert.match(fork, /data-ob-scope="everywhere">[\s\S]*ob-scope-tag/, 'its own card still says it is set up');
});

test('G7a: one line names what the chosen card leads to, and the script follows the choice', async () => {
  const { ONBOARDING_SCRIPT } = await import('../../../../src/report/start/onboarding/onboarding-script.ts');
  const fork = screen(page(), 'scope');
  assert.match(fork, /<p class="ob-scope-next js-only"><span data-ob-scope-next="project">/);
  assert.match(fork, /<span data-ob-scope-next="everywhere" hidden>/);
  assert.match(english(fork), /Next: three short steps\./);
  assert.match(english(fork), /Next: one step\./);
  assert.match(ONBOARDING_SCRIPT, /root\.querySelectorAll\('\[data-ob-scope-next\]'\)\.forEach\(\(line\) => \{ line\.hidden = line\.dataset\.obScopeNext !== scope; \}\);/);
});

// The maintainer, 2026-10-07, of the fork with the tag drawn: "to kolko slabo wyglada ... jak mamy label set up".
// The radio was the one fixed thing in the card's top row with no `flex:none`, so the name and the tag squeezed it into
// an egg. It is fixed where the class is written, since a radio is never right squashed.
test('G7a: the radio keeps its circle beside a long name and the tag', async () => {
  const { STEPS_STYLE } = await import('../../../../src/report/start/onboarding/steps.ts');
  assert.match(STEPS_STYLE, /\.ob-radio\{flex:none;width:22px;height:22px;border-radius:50%/);
  const { EVERYWHERE_STYLE } = await import('../../../../src/report/start/onboarding/everywhere-screens.ts');
  assert.match(EVERYWHERE_STYLE, /\.ob-scope-name\{min-width:0/, 'and the name wraps rather than pushing');
  assert.match(screen(page(setUpProject()), 'scope'), /<span class="ob-radio" aria-hidden="true">[\s\S]*?ob-scope-tag/, 'both are in the one row');
});
