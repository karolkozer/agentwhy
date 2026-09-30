import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { CheckRow } from '../../../../src/report/check/check-lines.ts';
import { translator } from '../../../../src/report/render/report-copy.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import { INTRO_KEY } from '../../../../src/report/start/onboarding/intro.ts';
import { OnboardingRenderer } from '../../../../src/report/start/onboarding/onboarding-renderer.ts';
import { ONBOARDING_SCRIPT } from '../../../../src/report/start/onboarding/onboarding-script.ts';
import type { IndexEntry, IndexHooks, IndexNotices, IndexProject, IndexProjects, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 5: the page, from the index alone.

const NOW = Date.parse('2026-09-24T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' };
const en = translator('en');

const HOOKS: IndexHooks = {
  watch: false,
  refuse: false,
  reads: { watch: 'default', refuse: 'default' },
  path: '.claude/settings.local.json',
  sharedPath: '.claude/settings.json',
};
const NOTICES: IndexNotices = {
  on: 'value',
  clean: 'once',
  say: 'agent',
  notify: ['chat'],
  from: { on: 'default', clean: 'default', say: 'default', notify: 'default' },
  path: '/Users/someone/.agentwhy/notices.json',
  unusable: false,
};

function settings(extra: Partial<IndexSettings> = {}): IndexSettings {
  return { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES, ...extra };
}

function entry(name: string, report: IndexEntry['report'] = { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] }): IndexEntry {
  return { provider: 'claude-code', name, title: ('Asked in ' + name) as Redacted, modifiedAt: NOW - 3_600_000, delegations: 0, report };
}

function row(label: CheckRow['label'], path: string): CheckRow {
  return { label, path: path as Redacted, sessions: ['a'] };
}

function page(extra: Partial<SessionIndex> = {}): string {
  const index: SessionIndex = {
    now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', shared: false, widen: 'agentwhy start --since 14d',
    entries: [entry('a')],
    settings: settings(),
    onboarding: { intro: true },
    ...extra,
  };
  return new OnboardingRenderer(LINKS).render(index);
}

/** The English text a person reads, outside the windows, styles and scripts. */
function readable(html: string): string {
  return html
    .replace(/<dialog[\s\S]*?<\/dialog>/g, '')
    .replace(/<template[\s\S]*?<\/template>/g, '')
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ');
}

/** One screen, from its opening tag to its end. */
function screen(html: string, name: string): string {
  const start = html.indexOf('data-ob-screen="' + name + '"');
  return html.slice(html.lastIndexOf('<section', start), html.indexOf('</section>', start));
}

test('W2, W3, W27: every screen is in the page, the intro and Done hidden until the script shows them, and no sidebar', () => {
  const html = page();
  for (const name of ['intro', 'welcome', 'who', 'files', 'done']) assert.match(html, new RegExp('data-ob-screen="' + name + '"'), name);
  assert.doesNotMatch(html, /data-ob-screen="messages"/, 'step 3 is not drawn (2026-09-25)');
  assert.match(screen(html, 'intro'), /^<section class="ob-screen ob-intro" data-ob-screen="intro" hidden/);
  assert.match(screen(html, 'done'), /^<section class="ob-screen ob-done" data-ob-screen="done" hidden/);
  assert.doesNotMatch(screen(html, 'welcome'), /^<section[^>]*hidden/, 'with no script, the welcome is the first thing on the page');
  assert.doesNotMatch(html, /class="sb"/);
  assert.match(html, /<div class="ob-nojs">/, 'with no script, the page says where the choices are made');
  assert.match(html, /<div class="ob-foot js-only">/, 'the steps’ buttons need a script');
});

test('W11, W10: Who starts from what is in force, and Files is the last, with Finish', () => {
  const html = page({ settings: settings({ hooks: { ...HOOKS, watch: 'shared' } }) });
  assert.match(screen(html, 'who'), /class="ob-who-card ob-who-on" role="radio" aria-checked="true" data-ob-who="shared"/);
  assert.match(html, /\.ob-who-on,\.ob-who-on:hover\{background:var\(--mint-05\);border-color:var\(--mint-50\)\}/, 'the card chosen is mint, as the project chosen (the maintainer)');
  assert.match(readable(screen(html, 'who')), /Step 2 of 3/);
  assert.match(readable(screen(html, 'files')), /Step 3 of 3/);
  assert.match(screen(html, 'files'), /class="pill pill-light pill-lg" data-ob-finish>/, 'Finish is white too (the maintainer)');
  assert.match(screen(html, 'welcome'), /class="pill pill-light pill-lg" data-ob-go="project">/, 'and Get started');
  assert.match(screen(html, 'who'), /class="pill pill-light pill-lg" data-ob-go="files">/, 'Continue is white in the whole onboarding (the maintainer)');
  assert.doesNotMatch(html, /class="pill pill-primary pill-lg"[^>]*>(<span class="i18n" lang="en">)?Continue/, 'no Continue is coral');
  assert.doesNotMatch(html, /data-ob-switch=/, 'no switch of the messages step is left on the page');
});

// `.ai/specs/2026-09-27-which-project.md` V19-V23, as the maintainer's design *agentwhy - Wybór projektu* draws them.
const MY_APP = { project: '/Users/someone/Projects/my-app', place: '~/Projects/my-app' } as const;

function listed(extra: Partial<IndexProject> = {}): IndexProject {
  return { id: '-Users-someone-Projects-blog', place: '~/Projects/blog', name: 'blog', exists: true, conversations: 4, newest: { modifiedAt: NOW - 86_400_000 }, setUp: true, current: false, ...extra };
}

function projects(extra: Partial<IndexProjects> = {}): IndexProjects {
  return {
    rows: [listed({ id: '-Users-someone-Projects-my-app', place: MY_APP.place, name: 'my-app', conversations: 3, current: true }), listed()],
    unreadable: 0,
    switchable: true,
    choosable: true,
    ...extra,
  };
}

/** The project step's card - where the run started - and its list, apart. */
function card(html: string): string {
  const step = screen(html, 'project');
  return step.includes('data-ob-card') ? step.slice(step.indexOf('data-ob-card'), step.indexOf('data-ob-pick-view')) : '';
}
function pickView(html: string): string {
  const step = screen(html, 'project');
  return step.slice(step.indexOf('data-ob-pick-view'));
}

test('V19: Welcome, then Project, Who and Files - the stepper counts three, and each Back and Get started leads the way the flow goes', () => {
  const html = page(MY_APP);
  const order = ['intro', 'welcome', 'project', 'who', 'files', 'done'].map((name) => html.indexOf('<section class="ob-screen' + (name === 'intro' ? ' ob-intro' : name === 'welcome' ? ' ob-welcome' : name === 'done' ? ' ob-done' : ' ob-step ob-step-' + name)));
  assert.ok(order.every((at) => at > 0), 'every screen is drawn');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the screens come in the flow’s order');
  assert.equal(html.match(/data-ob-step>/g)?.length, 3, 'the stepper counts three steps');
  assert.match(readable(html.slice(html.indexOf('data-ob-stepper'), html.indexOf('</ol>'))), /Project .*Who .*Files/);
  assert.match(screen(html, 'welcome'), /data-ob-go="project"/, 'Get started leads to the project step');
  assert.match(screen(html, 'who'), /data-ob-go="project"/, '← Back on Who leads to it');
  assert.match(pickView(html), /data-ob-unpick/, 'and ← Back on its list to its card');
});

test('V20, 2a: a folder with AI chats - "We found your project.", what is known of it, and Yes or another', () => {
  const html = page({ ...MY_APP, entries: [entry('a'), entry('b'), entry('c'), entry('d')], entryPoints: { editor: 2, terminal: 1, unknown: 1 }, projects: projects() });
  assert.match(readable(card(html)), /Step 1 of 3 We found your project\. This is where you started agentwhy\. Is this the right one\? M my-app ~\/Projects\/my-app This folder ✓ Your AI has worked here: 4 chats · 2 in your code editor, 1 in the terminal and 1 elsewhere/);
  assert.match(card(html), /class="ob-proj-card ob-proj-card-found"/, 'mint: the project found');
  assert.match(card(html), /data-ob-pick>.*No, pick another project/);
  assert.match(card(html), /class="pill pill-light pill-lg" data-ob-go="who">.*Yes, use my-app →/, 'the run’s own project goes on to Who in the page - white, as the maintainer asked');
  assert.doesNotMatch(card(html), /class="ob-hint"/, 'no hint: "Most people just click Yes" misled people (the maintainer)');
  assert.doesNotMatch(readable(card(html)), /files your AI read/, 'nothing read, nothing said');
  const read = page({ ...MY_APP, projects: projects(), check: { rows: [row('rotate', '.env')], refusedAttempts: 0 } });
  assert.match(card(read), /ob-fact-look.*We found 1 file your AI read/, 'the design’s "Found 9 private files", said as To fix counts it');
});

test('V20, 2d, V11: its list - where it started, chosen; five others and the rest a click away; what is hidden, counted', () => {
  const others = Array.from({ length: 7 }, (_, at) => listed({ id: 'p' + at, name: 'p' + at, place: '~/Projects/p' + at }));
  const list = pickView(page({ ...MY_APP, projects: projects({ rows: [projects().rows[0] as IndexProject, ...others, listed({ id: 'g', name: 'gone', exists: false })], temporary: 1 }) }));
  assert.match(readable(list), /Which project is this for\? agentwhy looks at one project at a time\. Pick the one you work on with your AI\. Where you started agentwhy my-app Started here in Projects · Last used/);
  assert.match(list, /<label class="pjl-pick pjl-pick-here"><input type="radio" class="pjl-radio-input" name="ob-project" value="-Users-someone-Projects-my-app" data-pick-name="my-app" data-pick-here checked>/);
  assert.equal(list.match(/<li class="pjl-row-pick"/g)?.length, 7);
  assert.equal(list.match(/data-pjl-extra/g)?.length, 2, 'five shown, two folded');
  assert.match(readable(list), /Show 2 more projects ▾ Hidden: 1 temporary folder, 1 that no longer exists/);
  assert.doesNotMatch(list, /value="g"/, 'a folder that is gone is counted, not offered');
  assert.match(list, /data-ob-choose>.*Choose a folder…/);
  assert.match(list, /class="pill pill-light pill-lg" data-ob-continue>/, 'Continue, white, with this project chosen');
  assert.match(readable(list), /Turn on scripts in your browser to switch projects from here\./, 'V13');
  assert.match(readable(list), /i agentwhy reads your conversations with Claude Code/, 'V5, beside the list');
});

test('V20, 2b: a folder inside a project with chats - that project, and all of it protected', () => {
  const inside = (within: string) => page({ project: '/Users/someone/Projects/my-app/' + within, place: '~/Projects/my-app/' + within, entries: [], projects: projects({
    rows: [listed({ id: '-Users-someone-Projects-my-app', place: MY_APP.place, name: 'my-app', conversations: 3 })],
    above: { id: '-Users-someone-Projects-my-app', within },
  }) });
  const html = inside('src');
  assert.match(readable(card(html)), /You’re inside a project\. You started agentwhy in ~\/Projects\/my-app\/src\. Your AI chats are one folder up\. M my-app ~\/Projects\/my-app One folder up ✓ Your AI has worked here: 3 chats ✓ Includes the src folder You’re in my-app\/src ?\. We’ll protect all of my-app ?\./);
  assert.match(card(html), /class="pill pill-light pill-lg" data-ob-switch="-Users-someone-Projects-my-app" data-ob-name="my-app">.*Use my-app →/);
  assert.match(readable(card(html)), /Protecting the whole project also covers src\./);
  assert.match(readable(card(inside('src/lib'))), /Your AI chats are 2 folders up\..*2 folders up/);
  assert.match(pickView(html), /data-ob-continue disabled>/, 'nothing chosen in its list');
});

test('V20, 2c, V21: a folder with no chats - "Your AI hasn’t worked here yet.", and use it anyway', () => {
  const html = page({ project: '/Users/someone/Projects/new-shop', place: '~/Projects/new-shop', entries: [], projects: projects({ rows: [listed()] }) });
  assert.match(readable(card(html)), /Your AI hasn’t worked here yet\. That’s fine if it’s a new project\. We’ll start watching from now on\. N new-shop ~\/Projects\/new-shop No AI chats yet ✓ It’s a project folder No AI chats here yet/);
  assert.match(card(html), /class="ob-proj-card ob-proj-card-empty"/, 'amber: not set up yet');
  assert.match(card(html), /class="pill pill-light pill-lg" data-ob-go="who">.*Use it anyway →/);
  assert.match(readable(card(html)), /Expected to see your chats\? You may have started agentwhy in the wrong folder\./);
  assert.match(readable(pickView(html)), /Your projects · newest first/, 'its list has no row of its own');
});

test('V7, 2e: in the home directory the step is the list, nothing chosen, and no Settings', () => {
  const html = page({ project: '/Users/someone', place: '~', notAProject: 'home', entries: [entry('a'), entry('b')], projects: projects({ rows: [listed()] }), onboarding: { intro: false, atProject: true } });
  const step = screen(html, 'project');
  assert.match(step, /^<section class="ob-screen ob-step ob-step-project ob-picking"/, 'the list is open');
  assert.equal(card(html), '', 'no card: no project is shown');
  assert.match(readable(step), /Which project is this for\? You started agentwhy in your home folder, which isn’t a project\. Pick the one you work on with your AI\. Your projects · newest first/);
  assert.doesNotMatch(step, /checked/, 'nothing is chosen');
  assert.match(step, /data-ob-continue disabled>/, 'Continue waits for a choice');
  for (const name of ['who', 'files', 'done']) assert.doesNotMatch(html, new RegExp('<section[^>]*data-ob-screen="' + name + '"'), name + ' is not drawn');
  assert.doesNotMatch(html, /settings\.html|<div class="ob-nojs">|<dialog/, 'nothing leads to a setup');
  assert.match(html, /&quot;atProject&quot;:true/, 'the page opens at the step');
  assert.match(readable(screen(page({ project: '/', notAProject: 'root', entries: [], projects: projects({ rows: [listed()] }) }), 'project')), /at the root of a disk, which isn’t a project/);
});

test('V15, 2f: a switch is said where the step was, while the other project’s run starts', () => {
  const step = screen(page({ ...MY_APP, projects: projects() }), 'project');
  assert.match(step, /<div class="ob-switching" data-ob-switching role="status" hidden>/);
  assert.match(readable(step), /One moment\. Setup goes on right here\./);
});

test('V22, V23: Who and Files say which project they are for, and Done’s line begins with it', () => {
  const html = page(MY_APP);
  assert.match(screen(html, 'who'), /<p class="ob-for"><span class="ob-for-mark" aria-hidden="true">M<\/span>.*For <strong>my-app<\/strong>/);
  assert.match(readable(screen(html, 'who')), /For my-app Step 2 of 3 .* or for everyone who works on my-app ?\./);
  assert.match(readable(screen(html, 'files')), /For my-app Step 3 of 3/);
  assert.match(html, /&quot;name&quot;:&quot;my-app&quot;/);
});

test('a run that cannot show another project offers no list, and a project’s name is escaped wherever the step writes it', () => {
  const alone = screen(page({ ...MY_APP, projects: projects({ switchable: false }) }), 'project');
  assert.doesNotMatch(alone, /data-ob-pick>|data-ob-list|data-ob-switch/);
  assert.match(readable(alone), /We only list folders where you used Claude Code or Codex\./, 'it says how a project comes onto the list');
  const html = page({ project: '/Users/someone/<b>x', place: '~/<b>x', entries: [], projects: projects({ rows: [listed({ name: '"><img src=x>' })] }) });
  assert.doesNotMatch(html, /<b>x|<img src=x>/);
});

test('W12a: every row carries Settings\u2019 Block | Tell me at the mode in force, switchable only where Settings would be', () => {
  // No told lists read: the switch is drawn, and still - as Settings draws it.
  const drawn = (html: string): string => screen(html, 'files').replace(/<template[\s\S]*?<\/template>/g, '');
  const still = drawn(page());
  assert.equal(still.match(/<span class="ob-mode ob-mode-is-block" role="group"/g)?.length, 4, 'F57: every row starts on Block');
  assert.doesNotMatch(still, /data-ob-mode="tell"/);
  // Both lists read: each half is a button, Block pressed; the lead is Settings\u2019 own.
  const lists = page({ settings: settings({ told: { local: [], shared: [] } }) });
  const files = drawn(lists);
  assert.equal(files.match(/<button type="button" class="ob-mode-half ob-mode-on" aria-pressed="true" data-ob-mode="block">/g)?.length, 4);
  assert.equal(files.match(/<button type="button" class="ob-mode-half" aria-pressed="false" data-ob-mode="tell">/g)?.length, 4);
  assert.match(files, /<li class="ob-rule ob-rule-is-block" data-ob-row="env" data-ob-secret="true">/);
  assert.ok(readable(files).includes(en('set.files.lead').replace(/’/g, '’')), 'the lead is Settings\u2019 words');
  assert.match(lists, /<span class="ob-tip-tell">/, 'what Tell me does is said in Settings\u2019 own words, beside the name');
});

test('KD2: after Uninstall the groups not watched are drawn on Block, since Finish writes them, with the switch; unwritable, they say so', () => {
  const drawn = (html: string): string => screen(html, 'files').replace(/<template[\s\S]*?<\/template>/g, '');
  // A rule of the person's own left in the local file: the hooks would read it, and it holds none of the groups.
  const uninstalled = settings({ hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } }, held: { local: ['**/own.txt'], shared: [] }, told: { local: [], shared: [] } });
  const files = drawn(page({ settings: uninstalled }));
  assert.match(files, /<li class="ob-rule ob-rule-is-block" data-ob-row="env" data-ob-secret="true"><span class="ob-icon" aria-hidden="true"><span class="ob-icon-block">/);
  const groups = files.match(/<li class="ob-rule[^"]*" data-ob-row="(?:env|npmrc|secrets|ssh)"[\s\S]*?<\/li>/g) ?? [];
  assert.equal(groups.length, 4);
  assert.ok(groups.every((group) => group.includes('<button type="button" class="ob-mode-half ob-mode-on" aria-pressed="true" data-ob-mode="block">') &&
    group.includes('data-ob-mode="tell"')), 'Block, with Tell me to put it on the told list instead');
  const { told: _told, ...noLists } = uninstalled;
  const still = drawn(page({ settings: noLists })).match(/<li class="ob-rule[^"]*" data-ob-row="env"[\s\S]*?<\/li>/)?.[0] ?? '';
  assert.ok(still.includes('<span class="ob-mode-half ob-mode-on">') && !still.includes('data-ob-mode='), 'no told list read: Block, and no switch');
  assert.doesNotMatch(readable(files), new RegExp(en('set.rule.notWatched')));
  const { mine: _mine, ...unwritable } = uninstalled;
  const policy = drawn(page({ settings: unwritable }));
  assert.match(readable(policy), new RegExp(en('set.rule.notWatched')), 'where nothing can be written, it is not watched');
});

test('W12a: the list is drawn as Settings draws it - a name, the file as a chip, the column heads, and a bin on a name added', () => {
  const files = screen(page(), 'files');
  assert.match(files, /<div class="ob-rules-head" aria-hidden="true">/);
  assert.match(files, /<span class="chip ob-rule-chip" title="\*\*\/\.npmrc">\.npmrc<\/span>/, 'the chip shortens the pattern, as Settings’ does');
  const added = /<template data-ob-added-row>([\s\S]*?)<\/template>/.exec(files)?.[1] ?? '';
  assert.match(added, /<span class="chip ob-rule-chip" data-ob-name><\/span>/, 'a long name is a chip, cut short with its whole name as the tooltip');
  assert.match(added, /<button type="button" class="close close-md trash" data-label-en="Remove" data-label-pl="Usuń" data-label-de="Entfernen" aria-label="Remove" data-ob-untick><svg /, 'a bin, named in every language');
});

test('W12, N3: no count of files found, and an add only where one can be written', () => {
  const files = screen(page(), 'files');
  assert.doesNotMatch(readable(files), /Found \d|customers\.csv/);
  assert.match(files, /data-popup-open="ob-add"/);
  assert.match(page(), /<dialog class="pp pp-pick" id="ob-add"/);

  const policy = page({ settings: settings({ hooks: { ...HOOKS, reads: { watch: 'policy', refuse: 'policy' } } }) });
  assert.doesNotMatch(policy, /data-popup-open="ob-add"|id="ob-add"/, 'hooks reading a policy take no name');
});

test('W14, amended: no list above Finish - a quiet i beside each name says what its choice does, Block or Tell me', () => {
  const html = page();
  assert.doesNotMatch(html, /id="ob-finish"|data-ob-send|data-ob-changes/, 'Finish asks nothing more, and lists nothing');
  const files = screen(html, 'files');
  assert.match(files, /<div class="ob-dock"><div class="ob-foot js-only">/, 'Finish stays docked at the bottom');
  const env = files.match(/<li class="ob-rule[^"]*" data-ob-row="env"[\s\S]*?<\/li>/)?.[0] ?? '';
  assert.match(env, /<span class="ob-rule-name" data-ob-row-name>[\s\S]*<span class="ob-info" tabindex="0" data-label-en="What this does"[^>]*aria-label="What this does">/, 'beside the name, focusable, named in every language');
  // The name is bold, and its tags read as spaces: none is left before a full stop.
  const tip = readable(env.slice(env.indexOf('class="ob-tip"'))).replace(/ ([.,])/g, '$1');
  assert.ok(tip.includes(en('set.confirm.block.text', { name: en('set.rule.env') })), 'Block: Settings\u2019 words');
  assert.ok(tip.includes(en('ob.change.honest')), '\u00a79.2: blocking says what it cannot promise');
  assert.ok(tip.includes(en('set.confirm.tell.secret.text', { name: en('set.rule.env') })), 'Tell me: the cost, for passwords and keys');
  assert.doesNotMatch(tip, new RegExp(en('set.confirm.tell.alertsOff')), 'alerts are on');
  const added = /<template data-ob-added-row>([\s\S]*?)<\/template>/.exec(files)?.[1] ?? '';
  assert.match(added, /<span class="ob-tip-block"><span data-ob-kind="file">[\s\S]*?<code class="ob-code" data-ob-name><\/code>/, 'an added name is only ever text, filled in by the script');
});

test('W18: files to fix - three named, the rest counted, and Fix them now opens the first file\'s report', () => {
  const html = page({
    check: { rows: [row('rotate', '.env'), row('rotate', 'app/.env.production'), row('template', '.env.example'), row('unknown', 'config/app.yml')], refusedAttempts: 0 },
  });
  const done = readable(screen(html, 'done'));
  assert.match(done, /Setup done\. One thing left\./);
  assert.match(done, /But in the last 7 days, your AI already read 4 private files\./);
  assert.match(done, /We found 4 files your AI read The keys in them may still work\. Change them now\./);
  assert.match(done, /\+1 more on your To fix list/);
  assert.match(screen(html, 'done'), /<a class="pill pill-primary pill-lg" href="a.html">/, 'W18a: the report of the conversation that read it');
  assert.equal(screen(html, 'done').match(/class="ob-found-row"/g)?.length, 3);
  assert.doesNotMatch(done, /old keys still work|real keys/i, 'T21: never says a key is real');
  assert.match(screen(html, 'done'), /class="ob-fix-knot"><svg class="brand-mark"/, 'W17a: the knot, in coral');
  assert.doesNotMatch(screen(html, 'done'), /ob-done-tick|ob-done-glow|ob-ripple|ob-conf/, 'W17a: no mint ✓, glow, ripples or confetti');
  assert.match(screen(page(), 'done'), /class="ob-done-tick"/, 'W17: nothing to fix keeps the ✓');
});

test('W18a: Fix them now opens the newest report of the first file, and To fix where it has none', () => {
  const rows = { rows: [row('rotate', '.env'), { ...row('template', '.env.example'), sessions: ['b'] }], refusedAttempts: 0 };
  const older = { ...entry('a'), modifiedAt: NOW - 7_200_000 };
  const two = page({ entries: [older, entry('c'), entry('a2', { kind: 'failed' })], check: { rows: [{ ...row('rotate', '.env'), sessions: ['a', 'c', 'a2'] }], refusedAttempts: 0 } });
  assert.match(screen(two, 'done'), /<a class="pill pill-primary pill-lg" href="c.html">/, 'the newest conversation with a report');

  const none = page({ entries: [entry('a', { kind: 'failed' }), entry('b')], check: rows });
  assert.match(screen(none, 'done'), /<a class="pill pill-primary pill-lg" href="to-fix.html">/, 'no report of the first file: To fix');
});

test('T2, W19, W34: a look only, nothing to fix, and a chat that could not be read', () => {
  assert.match(readable(screen(page({ check: { rows: [row('template', '.env.example')], refusedAttempts: 0 } }), 'done')), new RegExp(en('fix.hero.look')));

  const clean = readable(screen(page(), 'done'));
  assert.match(clean, /Good news — nothing to fix\. We looked at your AI chats in the last 7 days\./);
  assert.match(screen(page(), 'done'), /<a class="pill pill-mint pill-lg" href="index.html">/, 'N8: Open agentwhy is mint');

  const gaps = readable(screen(page({ entries: [entry('a'), entry('b', { kind: 'failed' })] }), 'done'));
  assert.match(gaps, /We couldn’t check every chat\./);
  assert.doesNotMatch(gaps, /nothing to fix/, 'a record with gaps is not called clean');
});

// Found at 390px: a piece of confetti ended up to 250px from the tick, invisible and kept there by its fill mode, so
// the page could be dragged sideways for good. On a narrow screen the burst is smaller; the widest piece, flown
// furthest, still lands inside a 320px phone's page, whose sides are 16px in.
test('W17: the confetti never widens the page', () => {
  const html = page();
  const spread = Number(html.match(/@media \(max-width:640px\)\{[^@]*?\.ob-conf\{--spread:([\d.]+)\}/)?.[1]);
  const reach = Math.max(...[...html.matchAll(/--dx:(-?[\d.]+)px/g)].map(([, dx]) => Math.abs(Number(dx))));
  const widest = Math.max(...[...html.matchAll(/--w:([\d.]+)px/g)].map(([, w]) => Number(w)));

  assert.ok(reach > 0 && widest > 0 && spread > 0, 'the burst is on the page');
  assert.match(html, /translate\(calc\(var\(--dx\) \* var\(--spread,1\)\)/, 'and flies as far as its spread says');
  assert.ok(reach * spread + widest <= (320 - 2 * 16) / 2, `a piece lands ${reach * spread + widest}px from the tick`);
});

test('W1a: no conversations yet - Done leads to Settings, and nothing links to a page that was not written', () => {
  const html = page({ entries: [] });
  assert.match(readable(screen(html, 'done')), /There are no AI chats in this folder yet\./);
  assert.match(screen(html, 'done'), /href="settings.html">/);
  assert.doesNotMatch(html, /href="(index|to-fix)\.html"/);
});

test('a path, a pattern and the state are escaped where they are written', () => {
  const html = page({
    settings: settings({ hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } }, held: { local: [...BUILT_IN, '**/"><img>'], shared: [] } }),
    check: { rows: [row('rotate', 'x/<script>.env')], refusedAttempts: 0 },
  });
  assert.doesNotMatch(html, /<img>|<script>\.env/);
  const state = /data-ob-state="([^"]*)"/.exec(html)?.[1] ?? '';
  const parsed = JSON.parse(state.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
  assert.equal(parsed.inForce.protected.includes('**/"><img>'), false, 'the run read the built-in list; the page shows the hooks’ own list');
});

test('W28: every word on the page is a word - windows and templates included, in every language', () => {
  for (const html of [page(), page({ entries: [] }), page({ check: { rows: [row('rotate', '.env')], refusedAttempts: 0 } })]) {
    const text = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /\b(?:ob|set|fix|app|wz|conv)\.[a-z][\w.]*/, 'a key is shown in place of its word');
  }
});

test('W28: the page speaks the glossary', () => {
  const text = readable(page({ check: { rows: [row('rotate', '.env')], refusedAttempts: 0 } })).toLowerCase();
  assert.doesNotMatch(text, /sensitive|rotate|session|subagent|delegation|hook/);
});

// `2026-09-27-what-codex-wrote.md` X28, found on a project only Codex worked in: Done said "From now on, you'll be told
// right away" of a read Codex made, and nothing agentwhy sets up tells or stops Codex.
test('X28: every promise the setup makes - blocked, told, protected - names Claude Code, in every language', () => {
  const html = page({ check: { rows: [row('rotate', '.env')], refusedAttempts: 0 } });
  const promises = ['ob.lead', 'ob.who.shared.sub', 'ob.change.file', 'ob.done.told', 'ob.done.notTold', 'ob.done.protected', 'ob.done.knowing'];
  for (const lang of ['en', 'pl', 'de'] as const) {
    for (const key of promises) {
      const words = translator(lang)(key, { name: '{name}' });
      assert.match(words, /Claude Code/, `${lang} ${key}`);
      // The Done screen with something to fix, which this page draws: its promises are on it as written here.
      if (key === 'ob.lead' || key === 'ob.done.told') assert.ok(html.includes(words), `${lang} ${key} is on the page`);
    }
  }
  assert.doesNotMatch(html, /Your AI will be stopped|you’ll be told right away\.</, 'no promise is made for every AI');
});

test('W5: the intro’s key is made up, and no pattern of the redactor reads it as a secret', () => {
  const redactor = new Redactor('salt');
  assert.equal(redactor.scan(INTRO_KEY), INTRO_KEY);
  assert.equal(redactor.scan('…and reading one: ' + INTRO_KEY), '…and reading one: ' + INTRO_KEY);
  assert.match(page(), new RegExp(INTRO_KEY));
});

test('the page’s script parses', () => {
  assert.doesNotThrow(() => new Function(ONBOARDING_SCRIPT));
});

// W20a: Codex's two lines are on Done, hidden, for the script to show the one Finish's answer names.
test('W20a: Done holds a line for Codex approved-once and one for Codex not blocked yet, both hidden', () => {
  const done = screen(page(), 'done');
  assert.match(done, /<p class="ob-codex" data-ob-codex="on" hidden><span class="i18n" lang="en">Codex too: it can’t open the same files once you approve agentwhy in Codex\. Until then, Codex doesn’t block anything\.<\/span>/);
  assert.match(done, /<p class="ob-codex" data-ob-codex="off" hidden><span class="i18n" lang="en">Codex isn’t blocked yet: it can still open these files\.<\/span>[\s\S]*?<a class="ob-link" href="settings\.html">/);
  assert.match(done, /lang="pl">Także Codex: nie otworzy tych samych plików/);
  assert.match(done, /lang="de">Auch Codex: Es kann dieselben Dateien nicht öffnen/);
  assert.doesNotMatch(readable(done), /hook/i, 'glossary: never "hook" on a page');
});
