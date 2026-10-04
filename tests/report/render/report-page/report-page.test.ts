// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Delegation } from '../../../../src/core/delegation.ts';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import type { Policy } from '../../../../src/core/policy/policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../../../src/report/render/report-page/to-do.ts';
import { FIX_WIZARD_SCRIPT } from '../../../../src/report/render/report-page/fix-wizard-script.ts';

// `specs/2026-09-23-the-report-page.md` P6-P25, F45-F52: the to-do list and the Fix it wizard of the new report page.
// Keys are assembled at run time, so no string here has the shape of a real one.
const fake = (...parts: string[]): string => parts.join('');
const STRIPE = fake('sk_', 'live_', 'Test0000000000000000000');
const JWT = fake('eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.', 'signature00');
const WITH_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };

let sequence = 0;
function read(path: string, content: string, agentId = 'main', extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' as const } : { kind: 'agent' as const, agentId }, record: sequence };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content, evidence }, ...extra,
  };
}

function session(events: ToolEvent[], delegations: Delegation[] = []): SessionModel {
  const helpers = [...new Set(events.map((event) => event.agentId).filter((id) => id !== 'main'))];
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }, ...helpers.map((id) => ({ id, depth: 1 }))],
    delegations, events, completeness: 'complete', messages: [], gaps: [],
  };
}

const report = (events: ToolEvent[], policy: Policy = DEFAULT_POLICY, delegations: Delegation[] = []) =>
  buildReport(session(events, delegations), policy, new Redactor('test'));
const page = (events: ToolEvent[], policy: Policy = DEFAULT_POLICY) => new ReportPageRenderer().render({ report: report(events, policy), withIndexLink: false });
/** The page as an English reader has it: the other languages taken out, the English left as plain text in its place. */
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// F45: what a file is, from facts, never from its name.
test('a file with a Stripe key is a file of keys for Stripe', () => {
  const [item] = toDoItems(report([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]));
  assert.equal(item?.kind, 'keys');
  assert.deepEqual(item?.providers.map((provider) => provider.name), ['Stripe']);
  assert.equal(item?.unnamed, false, 'the name beside the Stripe key does not add a key nobody can name');
});

test('a key with no provider is a key we couldn’t name, and its file is named by its rule, not its name', () => {
  const [item] = toDoItems(report([read('apps/web/.env.local', `SESSION_TOKEN=${JWT}`)]));
  assert.equal(item?.kind, 'keys');
  assert.deepEqual(item?.providers, []);
  assert.deepEqual(item?.guesses, [], 'SESSION is no service');
  assert.deepEqual(item?.lines, ['SESSION_TOKEN'], 'so the line is listed, for the person to read');
  assert.equal(item?.unnamed, false, 'and no key is left that no line accounts for');
  const html = english(page([read('apps/web/.env.local', `SESSION_TOKEN=${JWT}`)]));
  assert.match(html, /<span class="tc-title">Passwords and keys<\/span>/, 'the rule names it');
  assert.ok(!/OpenAI|AI account/.test(html), 'and nothing is read into ".local"');
});

test('a private file with no key in it is a file the person is asked about', () => {
  const [item] = toDoItems(report([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV));
  assert.equal(item?.kind, 'data');
  const html = english(page([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV));
  assert.match(html, /<span class="tc-title">A private file<\/span>/);
  assert.ok(!/customer list|1,900|names and emails/i.test(html.replace(/People’s details \(customers, users, staff\)/g, '')), 'nothing is said about what it holds');
  assert.equal((html.match(/data-answer="\d"/g) ?? []).length, 3, 'three answers; "nothing private" is the foot’s skip');
});

test('a file only listed, or read and refused, is not on the list', () => {
  const listed = read('apps/web', 'apps/web/.env\nREADME.md', 'main', { toolName: 'Bash', targets: [], commands: ['ls -a apps/web'], resultShape: 'listing' });
  const refused = read('apps/web/.env', 'Permission denied', 'main', { outcome: 'blocked' });
  assert.deepEqual(toDoItems(report([listed, refused])), []);
});

// F21: a value that went further first, then keys, then files whose contents cannot be changed.
test('the list puts a file a value went further from first, then keys, then the rest', () => {
  const events = [
    read('data/customers.csv', 'name,email\nAda,ada@example.test'),
    read('apps/api/.env', `STRIPE_SECRET_KEY=${STRIPE}`),
    read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`, 'helper'),
  ];
  const delegations: Delegation[] = [{
    followUps: [],
    id: 'task', parentAgentId: 'main', childAgentId: 'helper', description: 'Look', prompt: 'p',
    reports: [{ content: `found ${STRIPE}`, evidence: { source: { kind: 'agent', agentId: 'helper' }, record: 90 } }],
    evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
  }];
  const items = toDoItems(report(events, WITH_CSV, delegations));
  assert.deepEqual(items.map((item) => [item.path, item.further, item.kind]), [
    ['apps/web/.env', true, 'keys'],
    ['apps/api/.env', false, 'keys'],
    ['data/customers.csv', false, 'data'],
  ]);
});

test('a template file is said as one, and its skip says there are no real keys', () => {
  const [item] = toDoItems(report([read('apps/web/.env.example', `STRIPE_SECRET_KEY=${STRIPE}`)]));
  assert.equal(item?.template, true);
  assert.match(english(page([read('apps/web/.env.example', `STRIPE_SECRET_KEY=${STRIPE}`)])), /A sample file with keys in it/);
});

// P21, M2: the lines to replace are the file's own variable names; never a value.
test('the wizard shows the file’s variables to replace, and no value anywhere on the page', () => {
  const html = page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}\nPORT=3000`)]);
  assert.match(html, /<span class="wz-env-key">STRIPE_SECRET_KEY<\/span><span class="wz-env-eq">=<\/span>/);
  assert.ok(!html.includes(STRIPE), 'the key is not in the page');
  assert.ok(!html.includes('3000'), 'nor any other value');
  assert.match(english(html), /Don’t paste the new keys into your AI\./, 'and the warning is always there');
});

test('with no variable names the wizard says what to look for in words', () => {
  const html = english(page([read('apps/web/.env', STRIPE)]));
  assert.match(html, /Find the lines with your old keys in them/);
});

// F46: a link is drawn only once a person has checked it.
test('no service link is drawn before a person has checked it', () => {
  const html = page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]);
  assert.ok(!/https?:\/\//.test(html), 'no link anywhere: none in the table is checked yet');
});

// F43, guidelines §6: I'm stuck is written answers; nothing to type, nothing sent.
test('I’m stuck has written answers and no field to type in', () => {
  const html = page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]);
  // Files' search filters the rows on the page and is sent nowhere; nothing else takes typed text.
  assert.ok(!/<input(?! type="checkbox")(?! class="fl-search" type="search")|<textarea|<form/.test(html));
  assert.match(english(html), /How do I make a new Stripe key\?/);
  assert.match(html, /connect-src 'none'/, 'and the page can reach nowhere');
});

// P23, P38b: the data file's second step protects it, behind a confirmation that names the path and the wider option.
test('a data file’s second step is Protect it, confirmed in words', () => {
  const html = english(page([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV));
  assert.match(html, /<dialog class="pp pp-confirm" id="protect-0"/);
  assert.match(html, /This protects <code>data\/customers\.csv<\/code>\./);
  assert.match(html, /Also protect every file called <code>customers\.csv<\/code>, wherever it is in your project\./);
  assert.match(html, /This stops the obvious tries, not every trick\./);
});

// P11, P59.
test('nothing read is "All good."; a key’s shape in a result is never clean', () => {
  assert.match(english(page([])), /All good\.[\s\S]*?Nothing to fix\.[\s\S]*?Your AI didn’t read anything private in this conversation\./);
  const shape = read('notes.txt', `AWS_ACCESS_KEY_ID=${fake('AKIA', 'IOSFODNN7EXAMPLE')}`, 'main', { targets: [] });
  const html = english(page([shape]));
  assert.match(html, /A result contains something that looks like a password or key\./);
  assert.match(html, /aws-access-key-id/);
  assert.ok(!(html.split('<section id="files"')[0] ?? '').includes('class="hero-tick"'), 'the to-do list is not the all-clear');
});

// P48, F18, F24: what the page must never say.
test('the page never says a copy stays, can’t be deleted, or that the AI didn’t ask', () => {
  const html = english(page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('data/customers.csv', 'a\nb')], WITH_CSV));
  for (const words of ['stays there', 'can’t delete', 'can\'t be deleted', 'didn’t ask first', 'keeps a copy']) assert.ok(!html.includes(words), words);
});

test('every wizard is a window of its own, numbered, and the last one leads back to the list', () => {
  const html = english(page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/api/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]));
  assert.match(html, /<dialog class="pp pp-wizard" id="fix-0"[\s\S]*?File 1 of 2/);
  assert.match(html, /id="fix-0"[\s\S]*?data-popup-open="fix-1" data-wz-last hidden>Next file →/);
  assert.match(html, /id="fix-1"[\s\S]*?data-popup-close data-wz-last hidden>Back to my list/);
});

// M5, P43: a page `start` serves may reach the origin it came from; every other page reaches nowhere.
test('a served page may send to its own server; a page on its own may not', () => {
  const events = [read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)];
  const served = new ReportPageRenderer().render({ report: report(events), withIndexLink: true, served: true });
  const alone = new ReportPageRenderer().render({ report: report(events), withIndexLink: false });
  assert.match(served, /connect-src 'self'/);
  assert.match(served, /id="wizard-words" data-served="true"/);
  assert.match(alone, /connect-src 'none'/);
  assert.match(alone, /id="wizard-words" data-served="false"/);
});

// P44: a file with a standing mark is drawn done - its card, the count, the rail - and the place to start moves on.
test('a file marked done is drawn done, and the guide starts at the first that is not', () => {
  const events = [read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`), read('apps/api/.env', `STRIPE_SECRET_KEY=${STRIPE}`)];
  const html = new ReportPageRenderer().render({ report: report(events), withIndexLink: false, marks: new Map([['apps/web/.env', 'rotated']]) });
  assert.match(html, /<li class="tc tc-done" data-item="0"/);
  assert.match(html, /<li class="tc" data-item="1"/);
  assert.match(html, /<b data-done>1<\/b>/);
  assert.match(html, /<a [^>]*href="#fix-1"[^>]*data-popup-open="fix-1"[^>]* data-guide-go/);
  assert.match(html, /id="fix-1"[\s\S]*?<span class="rl-dash rl-done" title="web\/\.env" data-rail-item="0">/, 'R5: two files named .env, told apart');

  const all = new ReportPageRenderer().render({ report: report(events), withIndexLink: false, marks: new Map([['apps/web/.env', 'rotated'], ['apps/api/.env', 'rotated']]) });
  assert.match(all, /<div data-guide hidden>/);
  assert.match(all, /<div data-all-done>/);
});

/*
 * R5, found by a review: a file a value was saved into is named in a sentence, and is no row where the write never
 * came back (Files lists what finished). The listed file of its name was named `customers.csv` beside it.
 */
test('a listed file is told apart from a file of its name that a value was saved into, listed or not', () => {
  const policy: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: 'data/customers.csv' }] };
  const html = english(page([
    read('data/customers.csv', `STRIPE_SECRET_KEY=${STRIPE}`),
    read('export/customers.csv', '', 'main', { toolName: 'Write', written: [`STRIPE_SECRET_KEY=${STRIPE}`], outcome: 'unknown', resultShape: 'none' }),
  ], policy));

  assert.match(html, /title="data\/customers\.csv">data\/customers\.csv</);
  assert.doesNotMatch(html, /title="data\/customers\.csv">customers\.csv</);
  assert.match(html, /<code>export\/customers\.csv<\/code>/);
});

// R31, F50: the quiet skip is offered only where the server will take it.
test('the skip is a template’s "not a real secret" or a data file’s "not private", and a file of keys has none', () => {
  assert.doesNotMatch(page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]), / data-wz-skip="/);
  assert.match(page([read('apps/web/.env.example', `STRIPE_SECRET_KEY=${STRIPE}`)]), /data-wz-skip="not-secret"/);
  assert.match(page([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV), /data-wz-skip="not-private"/);
});

// P38a, P38b: the rule is the file's own path, or every file of its name; only for a file inside the project.
test('Protect it carries the file’s path and its name, and is not offered for a file outside the project', () => {
  const inside = page([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV);
  assert.match(inside, /data-protect="0" data-pattern="\.\/data\/customers\.csv" data-pattern-every="\*\*\/customers\.csv"/);
  assert.match(inside, /data-protect-open="0"/);

  const outside = english(page([read('/Users/someone/exports/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV));
  assert.doesNotMatch(outside, / data-protect="/, 'no window');
  assert.doesNotMatch(outside, / data-protect-open="/, 'no button');
  assert.match(outside, /This file is outside your project folder, so this page can’t protect it\./);
});

// P46: a shared copy draws no marks, offers no skip and no Protect, and sends nothing.
test('a shared copy draws no marks, writes nothing and hands over no command', () => {
  const events = [read('data/customers.csv', 'name,email\nAda,ada@example.test')];
  const shared = buildReport(session(events), WITH_CSV, new Redactor('test'), { share: true, projectRoot: { kind: 'absent' } });
  const html = new ReportPageRenderer().render({ report: shared, withIndexLink: false, served: true, marks: new Map([['data/customers.csv', 'handled']]) });
  assert.doesNotMatch(html, /class="tc tc-done"/, 'no mark drawn');
  assert.doesNotMatch(html, / data-wz-skip="/, 'no skip');
  assert.doesNotMatch(html, / data-protect(-open)?="/, 'no Protect');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, / data-shared>/);
});

test('the wizard’s script is one that parses', () => {
  assert.doesNotThrow(() => new Function(FIX_WIZARD_SCRIPT));
});

// Found 2026-09-24: a `.env.development` holding only settings no key format matches - `NODE_ENV`, an API address - was
// asked "What's in this file? People's details / a contract / something else", a question for a person's own data. A
// file a built-in rule protects is a file of passwords and keys by that rule, even where no key in it can be named.
test('a file a built-in rule protects is a file of keys even where no key in it can be named', () => {
  // A value no key format matches, found only by its randomness - what the tracing reads and the key formats do not.
  const random = fake('EPzLE4tu9Argh963', 'HgQ7dEAs6bCX9mf1');
  const settings = read('apps/web/.env.development', `NODE_ENV=development\nBUILD_REF=${random}`);
  const items = toDoItems(report([settings]));
  assert.deepEqual(items.map((item) => [item.kind, item.lines]), [['keys', ['BUILD_REF']]]);
  const html = english(page([settings]));
  assert.doesNotMatch(html, /What’s in this file\?/);
  assert.match(html, /<span class="wz-env-key">BUILD_REF<\/span>/, 'and its key line is the one to change');
  assert.doesNotMatch(html, /<span class="wz-env-key">NODE_ENV<\/span>/, 'not a setting beside it (M2a)');
});

// Found 2026-09-24: "Skip for now" stood where the person looked for "I did it". Both are there from the start: the skip
// a quiet outline, the main button the one coral one.
test('the first step offers "Skip for now" beside "I did it"', () => {
  const html = english(page([read('apps/web/.env', `STRIPE_SECRET_KEY=${STRIPE}`)]));
  assert.match(html, /<button type="button" class="pill pill-outline pill-lg wz-later js-only" data-wz-later>Skip for now →<\/button><button type="button" class="pill pill-primary pill-lg wz-main js-only" data-wz-next>I did it →<\/button>/);
  assert.match(html, /<p class="wz-hint" data-wz-hint role="status" hidden><\/p>/);
  assert.doesNotThrow(() => new Function(FIX_WIZARD_SCRIPT));
});

// Found 2026-09-24: one row "A key we couldn't name" left a person with nothing to find and nothing to do. With no
// service named, step 1 lists the file's key lines - what the person can find - and not the settings beside them (M2a).
test('keys no service could be named are listed by their lines, each with what to do', () => {
  const random = fake('EPzLE4tu9Argh963', 'HgQ7dEAs6bCX9mf1');
  const html = english(page([read('apps/web/.env.development', `NODE_ENV=development\nBUILD_REF=${random}`)]));
  const step = html.slice(html.indexOf('<section class="wz-step" data-step="1">'), html.indexOf('<section class="wz-step" data-step="2">'));
  assert.deepEqual([...step.matchAll(/<code class="wz-ck-line">([^<]*)<\/code>/g)].map((match) => match[1]), ['BUILD_REF']);
  assert.match(step, /We don’t know where these keys come from\./);
  assert.match(step, /Make a new one, and delete the old one\./);
  assert.doesNotMatch(step, /Not a key, like NODE_ENV/, 'every line listed holds a key');
  assert.match(step, /<span class="ck-mark">Mark as done<\/span>/, 'and each card says what a click does');
  assert.doesNotMatch(step, /couldn’t name/, 'no row that names nothing');

});

// F45 row 2, O11: a key no format names is given a service by the name of its line - and said as a guess, with the name.
test('a key line’s name gives its service, said as a guess, and a format still wins', () => {
  const lines = [
    `SUPABASE_SERVICE_ROLE_KEY=${JWT}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}x`,
    `NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co`,
    `STRIPE_SECRET_KEY=${STRIPE}`,
    `JWT_SECRET=${fake('EPzLE4tu9Argh963', 'HgQ7dEAs6bCX9mf1')}`,
  ].join('\n');
  const [item] = toDoItems(report([read('apps/web/.env', lines)]));
  assert.deepEqual(item?.providers.map((provider) => provider.name), ['Stripe'], 'the Stripe key by its format, a fact');
  assert.deepEqual(item?.guesses.map((guess) => [guess.provider.name, guess.names]), [['Supabase', ['SUPABASE_SERVICE_ROLE_KEY']]]);
  assert.deepEqual(item?.open, ['NEXT_PUBLIC_SUPABASE_ANON_KEY'], 'P20b: a key shipped to the browser is set apart');
  assert.deepEqual(item?.lines, ['JWT_SECRET'], 'a name that is no service is left to the person');
  assert.ok(!item?.names.includes('NEXT_PUBLIC_SUPABASE_URL' as never), 'an address is no key, and no line to change');

  const html = english(page([read('apps/web/.env', lines)]));
  const step = html.slice(html.indexOf('<section class="wz-step" data-step="1">'), html.indexOf('<section class="wz-step" data-step="2">'));
  assert.match(step, /Each card is a website your keys are for\./);
  assert.match(step, /<div class="ck-name">Supabase<\/div><div class="ck-what">Your Supabase account<span class="wz-guess">We think so from its name: <code class="wz-ck-line">SUPABASE_SERVICE_ROLE_KEY<\/code><\/span>/);
  assert.match(step, /<div class="ck-name">Stripe<\/div><div class="ck-what">Payments<\/div>/, 'a service by its format is said plainly');
});

// F49: the question for a file the person's own rule protects says what each answer means, so it can be answered.
test('each answer to "What’s in this file?" says what it means', () => {
  const html = english(page([read('data/customers.csv', 'name,email\nAda,ada@example.test')], WITH_CSV));
  assert.match(html, /Open the file and look at what’s in it\. Pick what fits best, and we’ll show you what to do\./);
  assert.equal((html.match(/<span class="wz-option-what">/g) ?? []).length, 3);
  assert.match(html, /People’s details \(customers, users, staff\)<\/span><span class="wz-option-what">Names, emails, phone numbers or addresses of real people/);
});

// P20b, found 2026-09-24: asked for one value, the AI opened the whole file - and a long file is a long list. The secrets
// come first, a test key after them and said to be one, a public key is set apart, and a long list folds its tail.
test('keys are ranked by how urgent they are, and a long list folds its tail', () => {
  const random = (n: number): string => fake('EPzLE4tu9Argh963', 'HgQ7dEAs6bCX9mf1', String(n).repeat(4));
  const lines = [
    `TEST_SECRET=${random(1)}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}`,
    `SUPABASE_SERVICE_ROLE_KEY=${JWT}x`,
    ...[2, 3, 4, 5, 6, 7].map((n) => `APP_SECRET_${n}=${random(n)}`),
  ].join('\n');
  const [item] = toDoItems(report([read('apps/web/.env', lines)]));
  assert.deepEqual(item?.tests, ['TEST_SECRET']);
  assert.deepEqual(item?.open, ['NEXT_PUBLIC_SUPABASE_ANON_KEY']);
  assert.equal(item?.keyCount, 9);
  assert.ok(!item?.names.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY' as never), 'a public key is no line to change');

  const html = english(page([read('apps/web/.env', lines)]));
  const step = html.slice(html.indexOf('<section class="wz-step" data-step="1">'), html.indexOf('<section class="wz-step" data-step="2">'));
  const order = [...step.matchAll(/<div class="ck-name">(?:<code class="wz-ck-line">)?([^<]*)/g)].map((match) => match[1]);
  assert.deepEqual(order, ['Supabase', 'APP_SECRET_2', 'APP_SECRET_3', 'APP_SECRET_4', 'APP_SECRET_5', 'APP_SECRET_6', 'APP_SECRET_7', 'TEST_SECRET'], 'secrets first, the test key last');
  assert.match(step, /<summary class="wz-more-line">Show 3 more keys<\/summary>/, 'five shown, the rest folded');
  assert.match(step, /TEST_SECRET<\/code><\/div><div class="ck-what">Make a new one, and delete the old one\.<span class="wz-guess">Looks like a test key from its name - less urgent\.<\/span>/);
  assert.match(step, /1 key looks public - nothing to change[\s\S]*?<code class="wz-ck-line">NEXT_PUBLIC_SUPABASE_ANON_KEY<\/code>/);
  assert.match(html, /Opening a file shows your AI every line in it - here, 9 keys\./);
});

test('a secret under a public prefix is still a secret, and a lone public key is not set apart', () => {
  const exposed = toDoItems(report([read('apps/web/.env', `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=${JWT}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}x`)]))[0];
  assert.deepEqual(exposed?.guesses.map((guess) => guess.names), [['NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY']], 'shown to everyone, and most urgent');
  const alone = toDoItems(report([read('apps/web/.env', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}`)]))[0];
  assert.deepEqual(alone?.open, [], 'with nothing else to fix, it is not folded away');
  assert.deepEqual(alone?.guesses.map((guess) => guess.names), [['NEXT_PUBLIC_SUPABASE_ANON_KEY']]);
  assert.doesNotMatch(english(page([read('apps/web/.env', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${JWT}`)])), /every line in it/, 'one key is no "every line"');
});
