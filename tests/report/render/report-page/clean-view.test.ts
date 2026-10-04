// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../../src/core/policy/policy.ts';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { FIX_WIZARD_SCRIPT } from '../../../../src/report/render/report-page/fix-wizard-script.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';

// `specs/2026-09-23-the-report-page.md` P11, P59, P60: with nothing to fix, the to-do list says what the AI did in the
// conversation, from the model's facts only - and a key's shape in a result or a gap in the record is never that screen.
// Keys are assembled at run time, so no string here has the shape of a real one.
const fake = (...parts: string[]): string => parts.join('');

let sequence = 0;
function call(path: string, agentId = 'main', extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: 'export {};', evidence }, ...extra,
  };
}

const edit = (path: string): ToolEvent => call(path, 'main', { toolName: 'Edit', resultShape: 'none', written: ['export const x = 2;'] });
const refused = (path: string): ToolEvent => call(path, 'main', { outcome: 'blocked' });

function delegation(helper: string): Delegation {
  return {
    followUps: [],
    id: 'task-' + helper, parentAgentId: 'main', childAgentId: helper, description: 'Look around', prompt: 'Look around the app',
    reports: [{ content: 'Done.', evidence: { source: { kind: 'agent', agentId: helper }, record: 900 } }],
    evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
  };
}

function page(events: ToolEvent[], helpers: string[] = [], completeness: SessionModel['completeness'] = 'complete', extra: { title?: string; withIndexLink?: boolean; policy?: Policy } = {}): string {
  const model: SessionModel = {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations: helpers.map(delegation), events, completeness, messages: [], gaps: [],
  };
  return new ReportPageRenderer().render({
    report: buildReport(model, extra.policy ?? DEFAULT_POLICY, new Redactor('test')),
    withIndexLink: extra.withIndexLink === true,
    ...(extra.title === undefined ? {} : { title: extra.title as Redacted }),
  });
}

/** The to-do view alone, as an English reader has it. */
const toDo = (html: string): string => (html.slice(html.indexOf('<section id="todo"'), html.indexOf('<section id="files"')))
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// P11: the clean screen answers first - "All good." - then what happened, each line from a fact, each with its tag.
test('a clean conversation says it is all good, then what the AI only came near, and who helped', () => {
  const html = toDo(page([call('src/app.ts'), call('README.md'), edit('src/app.ts'), refused('apps/web/.env'), call('src/util.ts', 'helper')], ['helper']));
  assert.match(html, /class="hero-tick"[\s\S]*?All good\.[\s\S]*?class="hero-action hero-calm"[^>]*>Nothing to fix\.[\s\S]*?Your AI didn’t read anything private in this conversation\./, 'the answer first');
  assert.match(html, /What happened/);
  assert.match(html, /It didn’t open any private file\.[\s\S]*?None[\s\S]*?Your passwords, keys and customer data stayed closed\./);
  assert.match(html, /It tried to open 1 private file\. It was stopped in time\.[\s\S]*?Stopped[\s\S]*?Your protection worked\. Nothing to do\.[\s\S]*?<span class="chip" title="apps\/web\/\.env">\.env<\/span>/);
  assert.match(html, /It brought in 1 helper\.[\s\S]*?Nothing private[\s\S]*?It didn’t read your private files\./);
  for (const view of ['#files', '#helpers', '#advanced']) assert.match(html, new RegExp('<a class="pill pill-secondary pill-md" href="' + view + '"'), view);
  assert.match(html, /See every file it opened/, 'P11’s pill');
  assert.match(html, /We only see what the AI wrote down, not what it was thinking\./, 'and what the record cannot show');
  assert.doesNotMatch(html, /private file name/i, 'no line for what did not happen');
  assert.doesNotMatch(html, /guide-mint/, 'the hero replaces the mint card');
});

test('alone, the AI is said to have worked alone, and no pill leads to a view with nobody in it', () => {
  const html = toDo(page([edit('src/app.ts')]));
  assert.match(html, /It worked alone\.[\s\S]*?No helpers[\s\S]*?It didn’t start any other AI to help\./);
  assert.doesNotMatch(html, /href="#helpers"/, 'no pill to a view with nobody in it');
  assert.doesNotMatch(html, /stopped in time|protection worked/, 'nothing was stopped, so nothing says so');
});

// Nothing is claimed that the model does not hold.
test('with no file on record there is no pill to an empty list, and no claim is "safe"', () => {
  const html = toDo(page([]));
  assert.doesNotMatch(html, /href="#files"/, 'no pill to an empty list');
  assert.doesNotMatch(html, /didn’t open any files/, 'a command may have opened one: it is not said that none was opened');
  // The one "safe" on the page is the reader's own question; nothing the page claims says it.
  const claims = html.slice(0, html.indexOf('class="ak-card"'));
  assert.doesNotMatch(claims, /\bsafe\b/i, 'never "safe"');
});

test('a helper whose actions were not recorded is never said to have read nothing', () => {
  const html = toDo(page([call('src/app.ts')], ['quiet']));
  assert.match(html, /It brought in 1 helper\.[\s\S]*?Not everything it did was recorded\./);
  assert.doesNotMatch(html, /It didn’t read your private files\./);
});

test('a private file only named by a listing is its own blue line, with its chip, and nothing to do', () => {
  const listing = { stage: 'model' as const, completeness: 'complete' as const, content: 'apps/web/.env\nREADME.md', evidence: { source: { kind: 'main' as const }, record: 3 } };
  const listed = call('apps/web', 'main', { toolName: 'Bash', targets: [], commands: ['ls -a apps/web'], resultShape: 'listing', result: listing });
  const html = toDo(page([listed, call('src/app.ts')]));
  assert.match(html, /<span class="look look-blue"><span class="look-glyph" aria-hidden="true"><svg[^>]*>[\s\S]*?<\/svg><\/span><\/span>[\s\S]*?It saw 1 private file name\.[\s\S]*?Only saw a name[\s\S]*?It didn’t see what is inside, so nothing to do\.[\s\S]*?<span class="chip" title="apps\/web\/\.env">\.env<\/span>/);
  assert.match(html, /What does “saw the name” mean\?/, 'and the question about it is offered');
  assert.doesNotMatch(html, /\bSafe\b/, 'the blue tag says what happened, not a verdict');
});

// P4: "You asked" is the session's title, where `start` read one; without one, nothing stands in for it.
test('the title the session is listed by is "You asked", escaped, and absent without one', () => {
  const titled = toDo(page([call('src/app.ts')], [], 'complete', { title: 'Fix the <b>sign-up</b> button' }));
  assert.match(titled, /class="rp-asked"[\s\S]*?You asked[\s\S]*?Fix the &lt;b&gt;sign-up&lt;\/b&gt; button/);
  assert.doesNotMatch(toDo(page([call('src/app.ts')])), /rp-asked/);
});

// P4, the maintainer 2026-09-30: "You asked" stands right above "What happened" on every screen that draws it - under
// the answer, the gap's question mark and the key's card alike.
test('"You asked" is right above "What happened", under the answer, on the clean, gap and key screens', () => {
  const title = { title: 'Find a customer' };
  const shaped = call('notes.txt', 'main', { targets: [], result: { stage: 'model', completeness: 'complete', content: `AWS_ACCESS_KEY_ID=${fake('AKIA', 'IOSFODNN7EXAMPLE')}`, evidence: { source: { kind: 'main' }, record: 1 } } });
  for (const html of [page([call('src/app.ts')], [], 'complete', title), page([call('src/app.ts')], [], 'partial', title), page([shaped], [], 'complete', title)].map(toDo)) {
    assert.match(html, /class="rp-when"|class="rp-ai"/);
    assert.match(html, /class="hero hero-centred"[\s\S]*?class="rp-asked"[\s\S]*?Find a customer<\/span><\/span><\/div><section class="rp-did">/);
  }
});

// The maintainer, 2026-09-30: with something to fix, "You asked" stands right above "Your to-do list", under the answer,
// and the answer has a coral "!" above it, as every other screen has its mark - the tick hidden beside it until all is done.
test('"You asked" is right above "Your to-do list", and a coral "!" is above the answer, when there is something to fix', () => {
  const read = call('apps/web/.env', 'main', { result: { stage: 'model', completeness: 'complete', content: `AWS_ACCESS_KEY_ID=${fake('AKIA', 'IOSFODNN7EXAMPLE')}`, evidence: { source: { kind: 'main' }, record: 1 } } });
  const html = toDo(page([read], [], 'complete', { title: 'Find a customer' }));
  assert.match(html, /class="hero hero-centred"[\s\S]*?class="rp-asked"[\s\S]*?Find a customer<\/span><\/span><\/div><div class="rp-todo-bar">/);
  assert.match(html, /<section class="hero hero-centred"><span class="hero-alert" aria-hidden="true" data-hero-todo>!<\/span><span class="hero-tick" aria-hidden="true" data-hero-done hidden>/);
  assert.match(FIX_WIZARD_SCRIPT, /\[data-hero-todo\][\s\S]*?hidden = true[\s\S]*?\[data-hero-done\][\s\S]*?hidden = false/, 'the script shows the tick once all is done');
});

// a-way-back R8: the way back to Conversations only where `start` wrote it beside this report.
test('"Done — back to conversations" leads to the index only where there is one', () => {
  assert.match(toDo(page([], [], 'complete', { withIndexLink: true })), /<a class="pill pill-light pill-lg" href="index\.html">Done — back to conversations<\/a>/);
  assert.doesNotMatch(toDo(page([])), /href="index\.html"/);
});

// F43: the questions are answered in writing, stored with the page; nothing is sent anywhere.
test('the questions have written answers, and the developer’s details are folded under the rest', () => {
  const html = toDo(page([call('src/app.ts')]));
  assert.match(html, /class="ak-card"[\s\S]*?Questions about this report\? Ask me\./);
  assert.match(html, /<dt>Is my data safe\?<\/dt><dd data-ask-a="\d">[\s\S]*?Nothing here shows your AI read a private file\./);
  assert.match(html, /<dt>Should I change anything\?<\/dt><dd data-ask-a="\d"><strong class="ak-lead">No\. Nothing here needs fixing\.<\/strong>/);
  assert.doesNotMatch(html, /saw the name/, 'no question about what did not happen');
  assert.match(html, /<details class="rp-dev"><summary class="rp-dev-line">Details for your developer[\s\S]*?Files your AI reached only through a command are listed when they are private\.[\s\S]*?href="#advanced"/);
});

/*
 * `2026-10-02-said-where-the-person-is` SW7, seen by the maintainer: a tracked file holding a key, read with the
 * person's leave, drew P59's coral "!" - "Something looks like a key. It wasn't in a file this project protects" - over
 * a file that is private and was read as allowed. A key in a private file's text is that file's, and asks for nothing.
 */
test('a key in a tracked file the person let the AI read is an allowed read, not a key in no private file', () => {
  const told: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/fake-key.txt', mode: 'tell' }] };
  const read = call('fake-key.txt', 'main', { result: { stage: 'model', completeness: 'complete', content: `AWS_ACCESS_KEY_ID=${fake('AKIA', 'IOSFODNN7EXAMPLE')}`, evidence: { source: { kind: 'main' }, record: 0 } } });
  const html = toDo(page([read], [], 'complete', { policy: told }));

  assert.match(html, /All good\.[\s\S]*?Nothing to fix\./);
  assert.match(html, /You chose Track for it, so your AI may read it, keys and all\. Nothing to do\.[\s\S]*?fake-key\.txt/);
  assert.doesNotMatch(html, /Something looks like a key|held no key we recognise/);
});

// P59: a key's shape in a result is never clean, and the summary is not drawn under it.
// P59, changed 2026-09-24 at the maintainer's request: the answer says what to do and where the record shows it,
// and the summary of what the AI did is under it - never the mint tick, since a key's shape is never a clean session.
// Drawn as every other screen since 2026-09-30: a coral "!", the two lines, the lead and its one button.
test('a key’s shape in a result is a coral "!", says what to do, and has the summary under it', () => {
  const shape = call('notes.txt', 'main', { targets: [], result: { stage: 'model', completeness: 'complete', content: `AWS_ACCESS_KEY_ID=${fake('AKIA', 'IOSFODNN7EXAMPLE')}`, evidence: { source: { kind: 'main' }, record: 1 } } });
  const html = toDo(page([shape, call('src/app.ts')]));
  assert.match(html, /<section class="hero hero-centred"><span class="hero-alert" aria-hidden="true">!<\/span><h1 class="hero-fact">Something looks like a key\.[\s\S]*?Check if it is real\.[\s\S]*?A result contains something that looks like a password or key\.[\s\S]*?aws-access-key-id/);
  assert.match(html, /If it is a real key, change it where it was made/);
  assert.match(html, /href="#advanced" data-record-link/);
  assert.match(html, /What happened[\s\S]*?It didn’t open any private file\.[\s\S]*?The warning above is about something in a result\./);
  assert.doesNotMatch(html, /guide-mint|hero-tick|All good|stayed closed/, 'never the all-clear, and no line says the keys stayed closed');
});

// P60: a record with a gap is never a clean list, and the summary is not drawn under it.
// The maintainer, 2026-09-25: the card alone read as a broken page. What the record does show is under it - never the
// line that no private file was opened, which a record with a gap cannot say.
// The maintainer, 2026-09-30: the screen is drawn as the clean one is, so Codex's reads like Claude Code's - the centred
// answer, with an amber question mark in the tick's place and the second line saying what is not known.
test('a gap in the record says nothing to fix that we can see, in amber, with what happened under it but no all-clear', () => {
  const html = toDo(page([call('src/app.ts')], [], 'partial'));
  assert.match(html, /class="hero hero-centred"><span class="hero-unsure" aria-hidden="true">\?<\/span>[\s\S]*?Nothing to fix that we can see\.[\s\S]*?class="hero-action hero-amber"[^>]*>But part of the record is missing\.[\s\S]*?href="#advanced" data-record-link[\s\S]*?class="rp-did"/);
  assert.match(html, /It worked alone\./);
  assert.doesNotMatch(html, /guide-mint|hero-tick|All good|It didn’t open any private file\./);
});

// The maintainer, 2026-09-30: a private file stopped under a gap is said in mint - the protection worked - with the gap
// under it, and never "All good."; a private file whose outcome is not recorded keeps the question mark.
test('a private file stopped under a gap is the mint tick and "Your protection worked.", never the all-clear', () => {
  const html = toDo(page([refused('apps/web/.env'), call('src/app.ts')], [], 'partial'));
  assert.match(html, /class="hero-tick"[\s\S]*?Nothing to fix that we can see\.[\s\S]*?class="hero-action hero-calm"[^>]*>Your protection worked\.[\s\S]*?Part of this conversation’s record is missing\.[\s\S]*?href="#advanced" data-record-link/);
  assert.match(html, /It tried to open 1 private file\. It was stopped in time\./);
  assert.doesNotMatch(html, /hero-unsure|All good/);
  const unknown = toDo(page([refused('apps/web/.env'), call('apps/web/.env.local', 'main', { outcome: 'unknown' })], [], 'partial'));
  assert.match(unknown, /class="hero-unsure"/);
  assert.doesNotMatch(unknown, /hero-tick/);
});

// Every word of the summary is written in all three languages.
test('the summary is written in English, Polish and German', () => {
  const html = page([call('src/app.ts'), refused('apps/web/.env')]);
  const view = html.slice(html.indexOf('<section id="todo"'), html.indexOf('<section id="files"'));
  assert.match(view, /<span class="i18n" lang="pl">Nie otworzyło żadnego prywatnego pliku\.<\/span>/);
  assert.match(view, /<span class="i18n" lang="de">Sie hat keine private Datei geöffnet\.<\/span>/);
  assert.match(view, /<span class="i18n" lang="pl">Próbowało otworzyć 1 prywatny plik\. Zostało zatrzymane w porę\.<\/span>/);
  assert.doesNotMatch(view, /rp\.(clean|ask|dev|nothing)\./, 'no key is left untranslated');
});

// F57a, found in use (2026-09-25): Conversations offered Fix it for a conversation that read only customer data the
// person chose Tell me for, and its report said "Your AI didn’t read anything private". It read it: that is said, in
// grey, and nothing is asked.
test('a private file read because the person chose Tell me is said, and asks for nothing', () => {
  const told: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };
  const read = call('data/customers.csv', 'main', { result: { stage: 'model', completeness: 'complete', content: 'name,email\nAda,ada@example.test', evidence: { source: { kind: 'main' }, record: 0 } } });
  const html = toDo(page([read], [], 'complete', { policy: told }));
  assert.match(html, /All good\.[\s\S]*?Nothing to fix\.[\s\S]*?Your AI read only private files you let it read in this conversation\./);
  assert.match(html, /<span class="look look-sand"><span class="look-glyph" aria-hidden="true">✓<\/span><\/span>[\s\S]*?It read 1 private file you let it read\.[\s\S]*?Track[\s\S]*?You chose Track for it, so your AI may read it, keys and all\. Nothing to do\.[\s\S]*?customers\.csv/);
  assert.match(html, /Your AI read only the private files you let it read\./, 'the question "Is my data safe?" says so too');
  assert.doesNotMatch(html, /didn’t read anything private|didn’t open any private file|Nothing here shows your AI read a private file/);
});
