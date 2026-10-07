// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { IndexHooks, IndexNotices, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { SettingsRenderer } from '../../../../src/report/start/settings/settings-renderer.ts';
import { SETTINGS_SCRIPT } from '../../../../src/report/start/settings/settings-script.ts';
import { withoutSupportLinks } from '../../../helpers/support-links.ts';

// `.ai/plans/2026-09-23-settings-redesign.md`, steps 3 and 5: the Settings page, and what the spec's §6 asks of it.

const NOW = Date.parse('2026-09-23T10:00:00Z');
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const HOOKS: IndexHooks = {
  watch: 'local',
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

function page(settings: Partial<IndexSettings> = {}, extra: Partial<SessionIndex> = {}): string {
  const index: SessionIndex = {
    now: NOW, timeZone: 'UTC', since: NOW - 30 * 86_400_000, asked: '30d', project: '/Users/someone/projects/demo-shop', shared: false,
    widen: 'agentwhy start --since 60d', entries: [],
    settings: { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES, ...settings },
    ...extra,
  };
  return new SettingsRenderer({ conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html' }).render(index);
}

/** The English text of the page, outside the developer details and the windows: what a person reads first. */
function readable(html: string): string {
  return html
    .replace(/<details class="set-dev">[\s\S]*?<\/details>/, '')
    .replace(/<dialog[\s\S]*?<\/dialog>/g, '')
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '')
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ');
}

test('the tabs carry their state as a dot, and Settings is the page the sidebar marks', () => {
  const html = page();
  assert.match(html, /<span class="tabs-dot tabs-dot-mint"[^>]*><\/span><span class="i18n" lang="en">Alerts</);
  // F56 (2026-09-24): General replaced Stop the AI, whose one job is now a card under Private files.
  assert.match(html, /<span class="tabs-dot tabs-dot-mint"[^>]*><\/span><span class="i18n" lang="en">General</);
  assert.doesNotMatch(html, /Stop the AI/);
  assert.match(html, /<a class="sb-item sb-active" href="settings.html" aria-current="page">/);
  // 880px since 2026-09-24: the rows' columns - switch, source, action - no longer fit beside a name at 780px.
  assert.match(html, /<main class="shell-main shell-list"/);
});

test('row 1 says for whom it is on; rows 2 and 3 wait for it while it is off', () => {
  assert.match(readable(page()), /On — for just you/);
  assert.match(readable(page({ hooks: { ...HOOKS, watch: 'shared' } })), /On — for everyone on this project/);

  const off = page({ hooks: { ...HOOKS, watch: false } });
  // The switch still answers a click: a bubble, hidden until then, says why and turns row 1 on.
  assert.equal(off.match(/<div class="set-tip" id="set-need-(stopped|fine)" role="status" data-set-tip hidden><span class="set-tip-text"><span class="i18n" lang="en">First turn on “When my AI reads a private file”\. This one only works with it on\./g)?.length, 2);
  assert.equal(off.match(/data-popup-open="set-watch-on"[^>]*>(<span class="i18n" lang="en">)?Turn on the first one/g)?.length, 2, 'each bubble turns row 1 on');
  assert.equal(off.match(/class="set-msg set-msg-opt set-msg-locked"/g)?.length, 2);
  assert.equal(off.match(/role="switch" aria-checked="false"[^>]* aria-disabled="true" aria-describedby="set-need-(stopped|fine)" data-set-needs-first>/g)?.length, 2, 'both dependent switches do not move, yet answer a click');
  assert.doesNotMatch(off, /data-set-needs-first[^>]*data-set-notice|data-set-notice[^>]*data-set-needs-first/, 'a locked switch writes nothing');
});

test('F34: the project rules the hooks do not read are counted in a coral card, in its plural', () => {
  // Every file blocked whole, so the only coral card there could be is F34's own.
  assert.doesNotMatch(page({ hooks: { ...HOOKS, refuse: 'local' }, held: { local: BUILT_IN, shared: [] } }), /class="co co-coral"/);
  const one = page({ mine: { '**/.env.local': { file: 'local', rule: './.env.local', whole: true } }, held: { local: ['**/.env.local'], shared: [] } });
  assert.match(readable(one), /Your project marks 1 more file as private\./);
  assert.match(readable(one), /Watch it too/);
  const two = page({
    mine: { '**/a.key': { file: 'local', rule: 'a.key', whole: true }, '**/b.key': { file: 'shared', rule: 'b.key', whole: true } },
    held: { local: ['**/a.key'], shared: ['**/b.key'] },
  });
  assert.match(readable(two), /Your project marks 2 more files as private\./);
  assert.match(two, /lang="pl">[^<]*<strong>Twój projekt oznacza jeszcze 2 pliki jako prywatne\.<\/strong>/);
});

test('no settings file is named outside the developer details and the windows (F32, guidelines §9.2)', () => {
  const text = readable(page({ hooks: { ...HOOKS, refuse: 'shared' } }));
  assert.doesNotMatch(text, /settings\.(local\.)?json|\.claude|notices\.json|--settings/);
  assert.match(page(), /<details class="set-dev">[\s\S]*\.claude\/settings\.local\.json[\s\S]*<\/details>/);
});

test('every change is posted only from inside a confirmation window (F40)', () => {
  const html = page({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/contract.pdf': { file: 'local', rule: '**/contract.pdf', whole: true } },
    held: { local: ['**/contract.pdf'], shared: [] },
  });
  const outside = html.replace(/<dialog[\s\S]*?<\/dialog>|<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(outside, /data-set-write|data-set-add=/);
  assert.match(html, /<dialog class="pp pp-confirm" id="set-watch-off"[\s\S]*?data-set-write="\{&quot;change&quot;:&quot;hooks&quot;,&quot;hooks&quot;:\[&quot;watch&quot;\],&quot;on&quot;:false,&quot;where&quot;:&quot;local&quot;\}"/);
  // F56: who a change is for is General's to say, once; Finish blocking, with every rule there, installs refuse alone.
  assert.match(html, /id="set-finish"[\s\S]*?data-set-write="\{&quot;change&quot;:&quot;hooks&quot;,&quot;hooks&quot;:\[&quot;refuse&quot;\],&quot;on&quot;:true,&quot;where&quot;:&quot;local&quot;\}"/);
  assert.doesNotMatch(html, /<fieldset class="sc">/, 'no window asks who it is for');
  assert.match(html, /id="set-remove-4"[\s\S]*?&quot;change&quot;:&quot;unprotect&quot;,&quot;pattern&quot;:&quot;\*\*\/contract\.pdf&quot;/);
  // The cards of notices are the one change written at once (R26a) - and they write preferences, not the project.
  assert.match(outside, /data-set-notice="\{&quot;on&quot;:&quot;refused&quot;\}"/);
});

test('a rule read out of a settings file is escaped wherever it is written', () => {
  const rule = '**/x"><img src=y>';
  const html = page({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { [rule]: { file: 'local', rule, whole: true } },
    held: { local: [rule], shared: [] },
  });
  assert.ok(!html.includes('<img src=y>'), 'no markup from a file reaches the page');
  assert.match(html, /\*\*\/x&quot;&gt;&lt;img src=y&gt;/);
});

test('a picked file is never read: the page holds no FileReader and names no address but its own (spec §6)', () => {
  const html = page();
  // A picked file would be read with \`file.text()\`; the one \`.text()\` a page holds is the live script reading the
  // server's answer - this page as it is now (live-pages L7a) - which is a response, never a file.
  assert.doesNotMatch(html, /FileReader|readAsText|arrayBuffer\(|(?<!response)\.text\(\)/);
  assert.equal(html.match(/\.text\(\)/g)?.length, 1, 'that one, and no other');
  assert.doesNotMatch(withoutSupportLinks(html.replace(/<meta http-equiv[^>]*>/, '')), /https?:\/\//);
  assert.match(html, /fetch\(url/);
  assert.match(html, /post\('api\/settings'|'api\/settings'/);
});

test('with no script, every tab is on the page under its own heading, and the writes offer nothing', () => {
  const html = page();
  assert.equal(html.match(/<h3 class="tabs-fallback">/g)?.length, 3);
  assert.match(html, /<div class="tabs-bar tabs-state js-only"/);
  assert.match(html, /<div class="af-picks js-only">/, 'the pickers need a script, and are not drawn without one');
});

test('a project file that cannot be read offers no switch and no window, and says why', () => {
  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = {
    level: 'no-read' as const, protected: BUILT_IN, allowed: [], origin: { kind: 'default' as const }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES,
  };
  const index: SessionIndex = {
    now: NOW, since: NOW, asked: '30d', shared: false, widen: '', entries: [], settings: rest,
  };
  const html = new SettingsRenderer({ conversations: 'index.html', toFix: 't', month: 'm', settings: 'settings.html' }).render(index);
  assert.match(readable(html), /couldn’t be read, so nothing can be changed here/);
  assert.doesNotMatch(html, /<dialog/);
  assert.doesNotMatch(readable(html), /Add a private file|Protect them/);
});

test('the page speaks the glossary: private, not sensitive (spec §6, O9)', () => {
  assert.doesNotMatch(readable(page()).toLowerCase(), /sensitive|delegation|tool result/);
});

// Found by review: a shared run writes this page too, and it carried no hook state - so it said everything was off.
test('a shared page shows none of this machine\'s settings, and says why', () => {
  const html = page({}, { shared: true });
  assert.match(readable(html), /This page was shared, so it shows none of the settings/);
  const markup = html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(markup, /class="tabs-bar|<dialog|set-dev-rows/);
});

// Found by review: unknown is not off. Where the project's file could not be read, no switch, dot or card says "off".
test('where the hooks could not be read, nothing says they are off', () => {
  const { hooks: _hooks, mine: _mine, held: _held, ...rest } = {
    level: 'no-read' as const, protected: BUILT_IN, allowed: [], origin: { kind: 'default' as const }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES,
  };
  const html = new SettingsRenderer({ conversations: 'index.html', toFix: 't', month: 'm', settings: 'settings.html' })
    .render({ now: NOW, since: NOW, asked: '30d', shared: false, widen: '', entries: [], settings: rest });
  const text = readable(html);
  // Row 2's switch is the preferences file's answer, which was read; the hooks' state is what is unknown.
  assert.doesNotMatch(text, /data-set-needs-first|Right now we only watch/);
  assert.doesNotMatch(text, /\bOff\b/, 'a switch states on or off, no line repeats it');
  assert.equal(text.match(/Couldn’t be read/g)?.length, 1, 'card 1; the search card says nothing it does not know');
  // Only Private files keeps its dot (F28): the two whose state is unknown have none, rather than a grey one.
  assert.equal(html.replace(/<style>[\s\S]*?<\/style>/g, '').match(/class="tabs-dot /g)?.length, 1);
  assert.equal(html.match(/role="switch"/g)?.length, 3, 'only the notice cards and General\'s system notifications, which the preferences file decides');
  assert.match(html, /<dd><span class="i18n" lang="en">unknown - the project settings file could not be read/);
});

test('Watch it too names in its plural how many rules it writes', () => {
  const html = page({ hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } }, held: { local: ['**/.env*'], shared: [] } });
  assert.match(readable(html), /Some files we keep private aren’t watched yet/);
  assert.match(readable(html), /Watch them too/);
});

test('a group the hooks do not read yet is watched from its row, through its own confirmation', () => {
  const html = page({ hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } }, held: { local: ['**/.env*'], shared: [] } });
  const rows = html.match(/<li class="set-rule set-rule-off set-rule-watchable" data-set-row>[\s\S]*?<\/li>/g) ?? [];
  assert.ok(rows.length > 0, 'every group not watched yet is a row that watches it');
  assert.match(rows[0]!, /<a class="pill pill-primary pill-sm" href="#set-watch-row-(\d+)" data-popup-open="set-watch-row-\1"><span class="i18n" lang="en">Start watching</);
  assert.doesNotMatch(rows.join(''), /data-set-write/, 'the row writes nothing itself');
  const at = /data-popup-open="(set-watch-row-\d+)"/.exec(rows[0]!)![1]!;
  const window = new RegExp('<dialog class="pp pp-confirm" id="' + at + '"[\\s\\S]*?</dialog>').exec(html)?.[0] ?? '';
  assert.match(window, /Start watching these files\?/);
  assert.match(window, /and Claude Code will be stopped from opening or searching through them\./, 'it says what the rule does, not only that it watches');
  assert.match(window, /data-set-write="\{&quot;change&quot;:&quot;adopt&quot;,&quot;patterns&quot;:\[[^\]]+\],&quot;where&quot;:&quot;local&quot;\}"/);
  assert.doesNotMatch(window, /\*\*\/\.env\*/, 'a group already watched is not written again');

  const { mine: _mine, ...rest } = {
    level: 'no-read' as const, protected: BUILT_IN, allowed: [], origin: { kind: 'default' as const }, notices: NOTICES, mine: {},
    hooks: { ...HOOKS, reads: { watch: 'local' as const, refuse: 'local' as const } }, held: { local: ['**/.env*'], shared: [] },
  };
  const readOnly = new SettingsRenderer({ conversations: 'index.html', toFix: 't', month: 'm', settings: 'settings.html' })
    .render({ now: NOW, since: NOW, asked: '30d', shared: false, widen: '', entries: [], settings: rest });
  assert.doesNotMatch(readOnly, /<li[^>]*data-set-row/, 'where the page cannot write, the row only says it is not watched');
  assert.match(readable(readOnly), /Not watched yet/);
});

// `block-means-blocked` K7-K10: a row that says Block and is not blocked whole says so on the row, one line above the
// list counts them with the one button that closes every gap, and where every block is whole nothing more is said.
const finishWindow = (html: string): string => /<dialog class="pp pp-confirm" id="set-finish"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';

test('K7, K8: with no rule anywhere, every row is not blocked yet, and Finish blocking writes the list with refuse', () => {
  const html = page();
  assert.match(readable(html), /4 private files aren’t fully blocked\./);
  assert.match(html, /<a class="pill pill-primary pill-task" href="#set-finish" data-popup-open="set-finish"><span class="i18n" lang="en">Finish blocking</);
  assert.equal((readable(html).match(/Not blocked yet — Claude Code can still open it\./g) ?? []).length, 4);
  assert.equal((html.match(/class="set-icon set-icon-gap"/g) ?? []).length, 4, 'an open padlock where the block icon was');
  assert.match(readable(html), /\b0\s+blocked/, 'K10: what is not blocked whole is not counted as blocked');
  const window = finishWindow(html);
  assert.match(window, /&quot;change&quot;:&quot;adopt&quot;/);
  assert.match(window, /data-set-command-local="agentwhy init --protect \*\*\/\.env\* [^"]*--refuse --watch"/, 'as a file: the rules, refuse, and alerts kept');
  assert.match(window, /Claude Code won’t be able to open <strong>Passwords and keys<\/strong>, [^.]* or search through them\./);
  assert.match(window, /Yes, block them/);
  assert.match(window, /This stops the obvious tries, not every trick\./);
  assert.match(html, /lang="pl">[^<]*<strong>4 prywatne pliki nie są w pełni zablokowane\.<\/strong>/);
  assert.match(html, /lang="pl">Dokończ blokowanie</);
  assert.match(html, /lang="de">Blockieren abschließen</);
});

test('K7, K8: rules without refuse are not fully blocked, and Finish blocking installs refuse alone', () => {
  const html = page({ held: { local: BUILT_IN, shared: [] } });
  assert.match(readable(html), /Not fully blocked — Claude Code can still read what’s inside with a search or a command\./);
  assert.match(finishWindow(html), /&quot;change&quot;:&quot;hooks&quot;,&quot;hooks&quot;:\[&quot;refuse&quot;\],&quot;on&quot;:true/);
  assert.match(finishWindow(html), /data-set-command-local="agentwhy init --refuse --watch"/);
});

test('K7: a whole block says nothing more, and no switch takes refuse away', () => {
  const html = page({ hooks: { ...HOOKS, refuse: 'local' }, held: { local: BUILT_IN, shared: [] } });
  assert.doesNotMatch(readable(html), /fully blocked|Not blocked yet|Finish blocking|searches/);
  assert.doesNotMatch(html, /class="set-icon set-icon-gap"|id="set-finish"|id="set-refuse-/);
  assert.match(readable(html), /\b4\s+blocked/);
});

test('K8: where refuse runs over other rules, the line says so and offers nothing one write cannot do', () => {
  const html = page({
    hooks: { ...HOOKS, refuse: 'local', reads: { watch: 'local', refuse: 'default' } },
    mine: { '**/contract.pdf': { file: 'local', rule: '**/contract.pdf', whole: true } },
    held: { local: [...BUILT_IN, '**/contract.pdf'], shared: [] },
  });
  assert.match(readable(html), /1 private file isn’t fully blocked\./);
  assert.doesNotMatch(html, /href="#set-finish"|id="set-finish"/);
});

test('an add says the file can be neither opened nor searched, and its command installs search protection with it', () => {
  const html = page();
  const window = /<dialog class="pp pp-confirm" id="set-add-confirm"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  assert.match(window, /Claude Code won’t be able to open it or search through it\./);
  assert.match(window, /data-set-add="\{&quot;builtIn&quot;:\[[^\]]*\],&quot;where&quot;:&quot;local&quot;,&quot;watch&quot;:true\}"/, 'alerts run from that file, so the command keeps them');
});

// `2026-10-07-several-at-once.md` AS6, AS7: one confirmation for everything chosen - one item as before, several as
// four names and "+N" - asking Block or Track, Block first; and one write for all of them.
test('the add asks once for one or several, Block or Track, and writes them in one change', () => {
  const html = page();
  const window = /<dialog class="pp pp-confirm" id="set-add-confirm"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  assert.match(window, /<span data-set-one>[\s\S]*?lang="en">Protect this file\?<[\s\S]*?<span data-set-many hidden>[\s\S]*?lang="en">Keep these from your AI\?</);
  assert.match(window, /<span class="chip set-pattern" data-set-pattern data-set-one><\/span><span class="set-chips" data-set-chips data-set-many hidden><\/span>/);
  assert.match(window, /<input class="cf-radio cf-radio-1" type="radio" name="set-add-confirm-case" value="1" checked>[\s\S]*?lang="en">Block</, 'Block first');
  assert.match(window, /lang="en">Track</);
  assert.match(window, /data-set-mode="block"/);
  assert.match(window, /data-set-mode="tell"/);
  assert.match(SETTINGS_SCRIPT, /picker\.addEventListener\('add-files'/);
  assert.match(SETTINGS_SCRIPT, /files\.slice\(0, 4\)/, 'four names at most');
  assert.match(SETTINGS_SCRIPT, /more\.textContent = '\+' \+ rest;/);
  assert.match(SETTINGS_SCRIPT, /\{ change: 'adopt', patterns: \[\.\.\.settings\.builtIn, \.\.\.patterns\], where: settings\.where \}/, 'Block: one adopt');
  assert.match(SETTINGS_SCRIPT, /\{ change: 'mode', to: 'tell', patterns, rules: \[\], where: settings\.where \}/, 'Track: one mode change');
  assert.match(SETTINGS_SCRIPT, /track \? \{ block: \[\], tell: patterns \} : \{ block: patterns, tell: \[\] \}/, 'the computer: one request');
});

// F56: who it is all for, once. The card in force is marked; the other switches to it through a confirmation that
// moves every rule and hook agentwhy wrote.
test('General marks who the settings are for, and switching moves what agentwhy wrote', () => {
  const html = page({
    hooks: { ...HOOKS, refuse: 'local', reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/customers.csv': { file: 'local', rule: '**/customers.csv', whole: true } },
    held: { local: ['**/customers.csv'], shared: [] },
  });
  assert.match(html, /<div class="set-scope set-scope-on" aria-current="true">[\s\S]*?lang="en">Just me<[\s\S]*?lang="en">Current</);
  assert.match(html, /<a class="set-scope" href="#set-scope-shared" data-popup-open="set-scope-shared">[\s\S]*?lang="en">Everyone on this project</, 'the other card is itself the way to it');
  assert.doesNotMatch(html, /id="set-scope-local"/, 'nothing to move into where everything already is');
  const window = /<dialog class="pp pp-confirm" id="set-scope-shared"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  assert.match(window, /Make these settings for everyone on this project\?/);
  assert.match(window, /data-set-write="\{&quot;change&quot;:&quot;scope&quot;,&quot;patterns&quot;:\[&quot;\*\*\/customers\.csv&quot;\],&quot;hooks&quot;:\[&quot;watch&quot;,&quot;refuse&quot;\],&quot;where&quot;:&quot;shared&quot;\}"/);
  assert.match(window, /data-set-command-shared="agentwhy init --remove --unprotect \*\*\/customers\.csv &amp;&amp; agentwhy init --protect \*\*\/customers\.csv --shared &amp;&amp; agentwhy init --watch --refuse --shared"/);
});

// which-project V5: which AI agentwhy sees, said in General in the words the project step and the list of projects say it.
test('General says which AI agentwhy sees, as the project step says it', () => {
  const general = /<section class="set-box set-who">[\s\S]*?<\/section>/.exec(page())?.[0] ?? '';
  assert.match(general, /<span class="i18n" lang="en">agentwhy reads your conversations with Claude Code - in the terminal and in your code editor - and with Codex\. It protects files in both\. It doesn’t see Cursor’s own AI or chats on claude\.ai\.<\/span>/);
  assert.match(general, /lang="pl">agentwhy czyta Twoje rozmowy z Claude Code/);
});

// F59: everything agentwhy put into the project, taken out behind one coral confirmation - and offered only where there is
// something of it there.
test('Uninstall asks first, and takes both hooks and agentwhy rules out of each file that holds them', () => {
  const html = page({
    hooks: { ...HOOKS, refuse: 'shared', reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/customers.csv': { file: 'local', rule: '**/customers.csv', whole: true } },
    held: { local: ['**/customers.csv'], shared: [] },
  });
  assert.match(html, /<a class="pill pill-outline-coral pill-lg" href="#set-uninstall" data-popup-open="set-uninstall"><span class="i18n" lang="en">Uninstall…</);
  const window = /<dialog class="pp pp-confirm" id="set-uninstall"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? '';
  const said = window.replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(said, /Uninstall agentwhy from this project\?[\s\S]*Your own files are not touched\. Everyone on this project gets this change\./);
  assert.match(window, /class="pill pill-primary pill-lg"[^>]*data-set-write="\{&quot;change&quot;:&quot;uninstall&quot;,&quot;rules&quot;:\{&quot;local&quot;:\[&quot;\*\*\/customers\.csv&quot;\],&quot;shared&quot;:\[\]\}\}"/);
  assert.match(window, /data-set-command-local="agentwhy init --remove --watch --refuse --unprotect \*\*\/customers\.csv &amp;&amp; agentwhy init --remove --watch --refuse --shared"/);

  const nothing = page({ hooks: { ...HOOKS, watch: false, refuse: false } });
  assert.doesNotMatch(nothing, /data-popup-open="set-uninstall"|id="set-uninstall"/, 'nothing of agentwhy is there to take out');
});

test('General says where the project is split, and either card makes it one', () => {
  const html = page({
    hooks: { ...HOOKS, refuse: 'shared' },
    mine: { '**/customers.csv': { file: 'shared', rule: '**/customers.csv', whole: true } },
    held: { local: [], shared: ['**/customers.csv'] },
  });
  assert.match(readable(html), /Some of your settings are for just you, and some for everyone on this project\./);
  assert.match(html, /<span class="tabs-dot tabs-dot-grey"[^>]*><\/span><span class="i18n" lang="en">General</);
  assert.match(html, /data-popup-open="set-scope-local"/);
  assert.match(html, /data-popup-open="set-scope-shared"/);
});

// F57, decided 2026-09-24: every private file is Block or Tell me. Passwords and keys start blocked; letting the AI read
// them is the coral button of a window that says what it costs.
test('each private file is Block or Tell me, and telling instead of blocking keys says what it costs', () => {
  const html = page({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/.env*': { file: 'local', rule: '**/.env*', whole: true } },
    held: { local: ['**/.env*'], shared: [] },
    told: { local: ['**/customers.csv'], shared: [] },
  });
  const rows = html.match(/<li class="set-rule[^"]*"[\s\S]*?<\/li>/g) ?? [];
  const env = rows.find((row) => row.includes('Passwords and keys')) ?? '';
  assert.match(env, /<span class="set-mode-half set-mode-on" aria-current="true"><span class="i18n" lang="en">Block</);
  const at = /<a class="set-mode-half" href="#(set-mode-\d+)"/.exec(env)?.[1] ?? '';
  const window = new RegExp('<dialog class="pp pp-confirm" id="' + at + '"[\\s\\S]*?</dialog>').exec(html)?.[0] ?? '';
  assert.match(window, /Let your AI read your passwords and keys\?/);
  assert.match(window, /The only fix is to change these passwords or keys/);
  assert.match(window, /class="pill pill-primary pill-lg" data-set-write="\{&quot;change&quot;:&quot;mode&quot;,&quot;to&quot;:&quot;tell&quot;,&quot;patterns&quot;:\[&quot;\*\*\/\.env\*&quot;\],&quot;rules&quot;:\[&quot;\*\*\/\.env\*&quot;\],&quot;where&quot;:&quot;local&quot;\}"/);

  const customers = rows.find((row) => row.includes('**/customers.csv')) ?? '';
  assert.match(customers, /<span class="set-mode-half set-mode-on" aria-current="true"><span class="i18n" lang="en">Track</);
  assert.match(customers, /data-popup-open="set-untell-\d+"/, 'a told file can be taken off the list');
  assert.ok(!customers.includes('set-rule-gap'), 'a tracked file no written rule covers says nothing');
});

/*
 * SW19, found by the maintainer on 2026-10-02: `demo.env` on Track, and Claude Code still refused every read - its
 * deny rule for every `.env` file covers that name. The row says so, in each language, naming the covering rule.
 */
test('a tracked file a Block rule still covers says Claude Code still blocks it', () => {
  const html = page({
    hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } },
    mine: { '**/.env*': { file: 'local', rule: '**/.env*', whole: true }, '**/*.env': { file: 'local', rule: '**/*.env', whole: true } },
    held: { local: ['**/.env*', '**/*.env'], shared: [] },
    told: { local: ['**/demo.env'], shared: [] },
  });
  const rows = html.match(/<li class="set-rule[^"]*"[\s\S]*?<\/li>/g) ?? [];
  const demo = rows.find((row) => row.includes('**/demo.env')) ?? '';

  assert.match(demo, /<span class="set-rule-gap"><span class="i18n" lang="en">Claude Code still blocks this file — its Block rule \*\.env also covers it\. Switch that rule to Track, or rename the file\./);
  assert.match(demo, /lang="pl">Claude Code nadal blokuje ten plik — obejmuje go też reguła blokady \*\.env\./);
  assert.match(demo, /class="set-icon set-icon-gap"/, 'the open lock, as a half block wears it');
});

test('with no told lists to write, the switch is drawn and does nothing', () => {
  const html = page({ hooks: { ...HOOKS, reads: { watch: 'local', refuse: 'local' } }, mine: { '**/.env*': { file: 'local', rule: '**/.env*', whole: true } }, held: { local: ['**/.env*'], shared: [] } });
  assert.match(html, /<span class="set-mode-half set-mode-off"><span class="i18n" lang="en">Track</);
  assert.doesNotMatch(html, /id="set-mode-\d+"/);
});

// Asked for 2026-09-24: every column of the list is named, the last one too.
test('the list names its columns, the action column included', () => {
  const head = /<div class="set-rules-head" aria-hidden="true">[\s\S]*?<\/div>/.exec(page())?.[0] ?? '';
  assert.match(head, /lang="en">When your AI reaches it<[\s\S]*lang="en">Added by<[\s\S]*<span class="set-rules-head-act"><span class="i18n" lang="en">Action</);
});

// `codex-approves-its-own-hook` AO10: in a project that uses Codex, whether the files blocked here are kept from Codex too.
test('Codex: not blocked yet is a coral line with one write, which the window confirms and a file hands over as a command', () => {
  const html = page({ hooks: { ...HOOKS, refuse: 'local', reads: { watch: 'default', refuse: 'default' }, codex: 'off' } });
  assert.match(html, /<span class="i18n" lang="en"><strong>Codex isn’t blocked yet\.<\/strong>/);
  assert.match(html, /href="#set-codex"/);
  const window = /<[^>]+id="set-codex"[\s\S]*?<\/dialog>|<[^>]+id="set-codex"[\s\S]*?data-set-write[^>]*>/.exec(html)?.[0] ?? '';
  // AO8, AO10: the window names the person's own Codex settings, agentwhy's own confirmation, and where it then holds.
  assert.match(window, /agentwhy will add its check to your own Codex settings on this computer and confirm it there itself, so Codex can’t open the files blocked here or search through them — from the first message, in the terminal and in VS Code, with nothing to confirm in Codex\. The check only acts in projects where files are blocked\./);
  assert.match(window, /lang="pl">[^<]*agentwhy doda swoją kontrolę do Twoich własnych ustawień Codexa na tym komputerze i sam ją tam potwierdzi/);
  assert.match(window, /lang="de">[^<]*agentwhy fügt seine Kontrolle deinen eigenen Codex-Einstellungen auf diesem Computer hinzu und bestätigt sie dort selbst/);
  assert.match(html, /data-set-write="\{&quot;change&quot;:&quot;codex&quot;\}"/);
  assert.match(html, /data-set-command-local="agentwhy init --codex"/);
  assert.match(html, /lang="pl"><strong>Codex nie jest jeszcze zablokowany\./);
  assert.match(html, /lang="de"><strong>Codex ist noch nicht blockiert\./);
});

// AO3, AO10: verified is a grey fact - from the first message, nothing to confirm in Codex - and offers nothing.
test('Codex: verified, a grey line states the fact and offers nothing', () => {
  const html = page({ hooks: { ...HOOKS, refuse: 'local', codex: 'on' } });
  assert.match(html, /class="co co-grey"><span class="co-mark" aria-hidden="true">i<\/span><span class="co-body"><span class="i18n" lang="en"><strong>Codex is kept from the same files — from the first message, in the terminal and in VS Code\.<\/strong> <span class="set-soft">agentwhy set up its check in your own Codex settings and confirmed it there itself, so there is nothing to confirm in Codex\.<\/span>/);
  assert.match(html, /lang="pl"><strong>Codex nie dostanie się do tych samych plików — od pierwszej wiadomości, w terminalu i w VS Code\.<\/strong>/);
  assert.match(html, /lang="de"><strong>Codex kommt an dieselben Dateien nicht heran — von der ersten Nachricht an, im Terminal und in VS Code\.<\/strong>/);
  assert.doesNotMatch(html, /Trust all/);
  assert.doesNotMatch(html, /id="set-codex"/);
});

// AO3, AO10: written but not verified - the old project copy, a drifted approval - says Codex may still ask, with the
// one write that makes it automatic, and never claims the block holds.
test('Codex: stale is a coral line that Codex may still ask, with the write that makes it automatic', () => {
  const html = page({ hooks: { ...HOOKS, refuse: 'local', codex: 'stale' } });
  assert.match(html, /<span class="i18n" lang="en"><strong>Codex may still ask before it blocks\.<\/strong>/);
  assert.match(html, /lang="pl"><strong>Codex może jeszcze pytać, zanim zablokuje\.<\/strong>/);
  assert.match(html, /lang="de"><strong>Codex fragt womöglich noch, bevor es blockiert\.<\/strong>/);
  assert.match(html, /href="#set-codex"/, 'the same window installs and heals');
  assert.match(html, /Set it up for me/);
  assert.doesNotMatch(html, /Codex is kept from the same files/);
});

// AO17: Uninstall says the Codex check stays for the other projects, and offers taking it out, unticked.
test('Uninstall offers taking the check out of Codex too, unticked, only where the project uses Codex', () => {
  const withCodex = page({
    hooks: { ...HOOKS, refuse: 'local', codex: 'on' },
    mine: { '**/customers.csv': { file: 'local', rule: '**/customers.csv', whole: true } },
    held: { local: ['**/customers.csv'], shared: [] },
  });
  const window = /<dialog[^>]*id="set-uninstall"[\s\S]*?<\/dialog>/.exec(withCodex)?.[0] ?? '';
  assert.match(window, /<label class="set-tick"><input type="checkbox" name="set-uninstall-codex">/);
  assert.match(window, /Also take agentwhy’s check out of Codex on this computer\. Left unticked, it stays for your other projects — and does nothing where no files are blocked\./);
  assert.match(window, /lang="pl">Usuń też kontrolę agentwhy z Codexa na tym komputerze\./);
  assert.match(window, /lang="de">Nimm agentwhys Kontrolle auch aus Codex auf diesem Computer\./);
  assert.match(window, /data-set-tick="set-uninstall-codex"/);

  const without = page({
    hooks: { ...HOOKS, refuse: 'local' },
    mine: { '**/customers.csv': { file: 'local', rule: '**/customers.csv', whole: true } },
    held: { local: ['**/customers.csv'], shared: [] },
  });
  assert.doesNotMatch(/<dialog[^>]*id="set-uninstall"[\s\S]*?<\/dialog>/.exec(without)?.[0] ?? '', /set-uninstall-codex/, 'no sign of Codex, no choice');
});

// CK6: a Claude Code project hears nothing of Codex; and where Claude Code's block is not whole, Finish blocking writes both.
test('Codex: nothing where the project does not use it, or where Claude Code\'s block does not run yet', () => {
  assert.doesNotMatch(page({ hooks: { ...HOOKS, refuse: 'local' } }), /Codex isn’t blocked|set-codex/);
  assert.doesNotMatch(page({ hooks: { ...HOOKS, refuse: false, codex: 'off' } }), /Codex isn’t blocked|set-codex/);
});

/*
 * `2026-10-02-said-where-the-person-is` SW13, asked for by the maintainer: General turns the notification in the corner of
 * the screen on and off, written at once as Alerts' optional rows are, and keeps every other channel in force.
 */
test('General has a switch for system notifications, which changes that channel alone', () => {
  const off = page();
  assert.match(readable(off), /System notifications[\s\S]*?A notification in the corner of the screen/);
  assert.match(off, /role="switch" aria-checked="false"[^>]*data-set-notice="\{&quot;notify&quot;:\[&quot;chat&quot;,&quot;os&quot;\]\}"/);

  const on = page({ notices: { ...NOTICES, notify: ['chat', 'terminal', 'os'] } });
  assert.match(on, /role="switch" aria-checked="true"[^>]*data-set-notice="\{&quot;notify&quot;:\[&quot;chat&quot;,&quot;terminal&quot;\]\}"/);

  const unwritable = page({ notices: { ...NOTICES, unusable: true } });
  assert.match(unwritable, /role="switch" aria-checked="false" disabled[^>]*data-set-notice="\{&quot;notify&quot;/, 'a file that cannot be read is not written over');
});
