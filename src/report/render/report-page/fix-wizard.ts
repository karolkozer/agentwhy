// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { MarkResult } from '../../check/marks.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, LANGS, translator, type Translate } from '../report-copy.ts';
import { askPanel, askTrigger, type Question } from '../ui/ask-panel.ts';
import { closeButton, pill, textButton } from '../ui/button.ts';
import { checklist, type Check, type TickWords } from '../ui/checklist.ts';
import { foldLine } from '../ui/fold-line.ts';
import { CLOSES, opener, popup } from '../ui/popup.ts';
import { rail, stepper } from '../ui/progress.ts';
import { listOf, nameOf, titleOf, type FileNames } from './item-names.ts';
import type { Provider } from './providers.ts';
import type { ToDoItem } from './to-do.ts';
import { fixId } from './to-do-view.ts';

/** What a wizard knows beyond its file: which files are done already (M5), and whether the page may change anything. */
export interface WizardPage {
  /** Paths with a standing mark that still holds for this session. */
  readonly done: ReadonlySet<string>;
  /** A shared copy of the report writes nothing and hands over no command (P46). */
  readonly shared: boolean;
  /** The window key of each file **Protect it** is offered for: private, not protected yet, inside the project. */
  readonly protectKeys: ReadonlyMap<string, number>;
  /** Files a rule of the project already protects (M3): their step 2 says so instead of offering the rule again. */
  readonly protectedPaths: ReadonlySet<string>;
  /** Files the person chose only to be told about (F57): step 2 says it was their choice, and where to change it. */
  readonly toldPaths?: ReadonlySet<string>;
  /** A page with no Protect window of its own (To fix) leads there instead: Settings, at Private files, where an add protects a file from being opened and searched (F38). */
  readonly protectAt?: string;
  /** How the page names a file, where it tells two of one name apart (R5); by its name alone otherwise. */
  readonly names?: FileNames;
}

/**
 * What a page other than the report adds to one file's wizard (to-fix spec T11-T15): To fix opens the same wizard for a
 * file several conversations read, and says which, and keeps a note with the mark.
 */
export interface WizardExtras {
  /** A line under "Now fixing", already written in every language: To fix's "It's back" (T12). */
  readonly notice?: string;
  /** Where the file was read, already written in every language: folded under "Now fixing", open at every step. */
  readonly where?: { readonly summary: string; readonly body: string };
  /** A note for the person, in the last step before Done, sent with the mark (R37). */
  readonly note?: boolean;
  /** The quiet skip, where the page decides it from what its line may take: a result, or `null` for none. */
  readonly skip?: MarkResult | null;
  /** The run's range, which a handed-over `check --mark` needs to read the lines this page drew (T17). */
  readonly since?: string;
}

/** What the quiet skip says, by the mark it writes. */
const SKIP_WORDS: Readonly<Partial<Record<MarkResult, string>>> = {
  'not-secret': 'wz.skip.keys',
  'not-private': 'wz.skip.data',
  handled: 'fix.skip.handled',
};

/**
 * The Fix it wizard, one window per file (the report page spec P18-P25; design file *agentwhy App*): where the person is,
 * which file, then one step at a time. A file of keys goes New keys → Your app → Done; a file whose contents cannot be
 * changed goes Limit the damage → Stop it next time → Done. With no script every step is on the page in order.
 *
 * Done writes a mark - *rotated* for keys, *handled* for the rest - and the quiet skip writes *not a real secret* (a
 * template's, R31) or *not private* (a file with no key in it, F50); the page's script sends it where the page is
 * served, and shows the command otherwise (P42, P43). A file of keys that is not a template has no skip.
 */
export function fixWizard(items: readonly ToDoItem[], at: number, page: WizardPage, extras: WizardExtras = {}): string {
  const item = items[at] as ToDoItem;
  const id = fixId(at);
  const keys = item.kind === 'keys';
  const names = page.names ?? nameOf;
  const name = e(names(item.path));
  const next = at + 1 < items.length ? fixId(at + 1) : undefined;
  const label = (key: string): string => inLanguages((t) => t(key));

  const top = '<div class="wz-top"><span class="wz-file" id="' + id + '-title">' + inLanguages((t) => t('wz.file', { n: at + 1, total: items.length })) + '</span>' +
    '<span data-wz-stepper>' + stepper((keys ? ['wz.step.keys', 'wz.step.app', 'wz.step.done'] : ['wz.step.limit', 'wz.step.stop', 'wz.step.done'])
      .map((key, step) => ({ label: label(key), state: step === 0 ? 'current' as const : 'future' as const }))) + '</span>' +
    closeButton(labelAttributes((t) => t('app.close')) + CLOSES, 'sm') + '</div>';

  const now = '<div class="wz-now">' +
    rail(items.map((each, index) => ({
      state: index === at ? 'now' as const : page.done.has(each.path) ? 'done' as const : 'waiting' as const,
      title: e(names(each.path)),
      item: index,
    }))) +
    '<div class="wz-now-label">' + label('wz.now') + '</div>' +
    '<div class="wz-now-row"><span class="wz-chip" title="' + e(item.path) + '">' + name + '</span>' +
    '<span class="wz-now-title">' + inLanguages((t, lang) => titleOf(item, t, lang)) + '</span></div>' +
    '<div class="wz-context">' + inLanguages((t) => t(keys ? 'wz.context.keys' : 'wz.context.data', { n: item.readers, name: '<code>' + name + '</code>' }) +
      // Found 2026-09-24: asked for one value, the AI opened the file and was shown every line. Said where more than one
      // line held a key (M2a), so the count is a fact of this file.
      (keys && item.keyCount > 1 ? ' ' + t('wz.context.every', { n: item.keyCount }) : '')) + '</div>' +
    (extras.notice === undefined ? '' : '<div class="wz-notice">' + extras.notice + '</div>') +
    (extras.where === undefined ? '' : '<details class="wz-where"><summary class="wz-where-toggle">' + extras.where.summary + '</summary>' +
      '<div class="wz-where-body">' + extras.where.body + '</div></details>') +
    '</div>';

  const note = extras.note === true && !page.shared ? noteField(id + '-note') : '';
  const steps = keys ? keySteps(item, note) : dataSteps(item, page, note);
  const done = '<section class="wz-step wz-done" data-step="3">' +
    '<div class="wz-done-mark" aria-hidden="true">✓</div>' +
    '<h2 class="wz-h2">' + label(keys ? 'wz.done.keys.title' : 'wz.done.data.title') + '</h2>' +
    '<p class="wz-done-text">' + label(keys ? 'wz.done.keys.text' : 'wz.done.data.text') + ' ' +
    (next === undefined ? label('wz.last') : inLanguages((t) => t('wz.left', { n: items.length - at - 1 }))) + '</p>' +
    '<div class="wz-handover" data-handover hidden><p class="wz-handover-text">' + label('wz.cmd.mark') + '</p>' + commandRow() + '</div></section>';
  const standard: MarkResult | undefined = keys ? (item.template ? 'not-secret' : undefined) : 'not-private';
  const skip = page.shared ? undefined : extras.skip === undefined ? standard : extras.skip ?? undefined;

  const ask = askPanel(questionsFor(item), id + '-ask');
  const foot = '<div class="wz-foot"><span class="wz-foot-left">' +
    '<button type="button" class="wz-back" data-wz-back hidden>' + label('wz.back') + '</button>' +
    askTrigger(label('app.stuck'), id + '-ask') + '</span>' +
    '<span class="wz-foot-right">' +
    (skip === undefined ? '' : textButton(label(SKIP_WORDS[skip] ?? 'wz.skip.data'), ' data-wz-skip="' + skip + '"', 'wz-skip js-only')) +
    '<button type="button" class="pill pill-outline pill-lg wz-later js-only" data-wz-later>' + label('wz.later') + '</button>' +
    '<button type="button" class="pill pill-primary pill-lg wz-main js-only" data-wz-next>' + label('wz.all') + '</button>' +
    (next === undefined
      ? pill({ label: label('wz.backToList'), tone: 'light', size: 'lg', button: true, attributes: CLOSES + ' data-wz-last hidden' })
      : pill({ label: label('wz.nextFile'), tone: 'light', size: 'lg', href: '#' + next, attributes: opener(next) + ' data-wz-last hidden' })) +
    '</span></div>';

  return popup({
    id,
    size: 'wizard',
    labelledBy: id + '-title',
    body: '<div class="wz" data-wizard data-kind="' + item.kind + '" data-item="' + at + '" data-path="' + e(item.path) + '"' +
      (page.shared ? ' data-shared' : '') + (extras.since === undefined ? '' : ' data-since="' + e(extras.since) + '"') + '>' + top + now +
      '<div class="wz-body">' + steps + done + ask + '<p class="wz-hint" data-wz-hint role="status" hidden></p>' +
      '<p class="wz-reason" data-wz-reason role="alert" hidden></p></div>' + foot + '</div>',
  });
}

/** The words on a checklist row's button, in every language. */
const TICK = (): TickWords => ({ mark: inLanguages((t) => t('app.tick')), done: inLanguages((t) => t('app.ticked')) });

function keySteps(item: ToDoItem, note: string): string {
  const label = (key: string, vars = {}): string => inLanguages((t) => t(key, vars));
  const code = (name: string): string => '<code class="wz-ck-line">' + e(name) + '</code>';
  const service = (provider: Provider, guessed?: readonly string[]): Check => ({
    name: e(provider.name),
    // O11: a service read from a line's name is said as a guess, with the name it was read from.
    what: label(provider.what) + (guessed === undefined ? ''
      : '<span class="wz-guess">' + inLanguages((t) => t('wz.keys.guess', { names: guessed.map(code).join(', ') })) + '</span>'),
    ...(provider.checked === undefined ? {} : { link: { label: label('wz.open', { provider: e(provider.name) }), href: provider.url } }),
  });
  // F45: a service by a key's format, then by its line's name; a key line neither names is listed by its name, for the
  // person to read. P20b: the secrets first, a test key after them with a word that it is one.
  const tests = new Set(item.tests.map(String));
  const test = '<span class="wz-guess">' + label('wz.keys.testNote') + '</span>';
  const guessed = (testing: boolean): Check[] => item.guesses.filter((guess) => guess.names.every((each) => tests.has(each)) === testing)
    .map((guess) => { const check = service(guess.provider, guess.names.map(String)); return testing ? { ...check, what: check.what + test } : check; });
  const lined = (testing: boolean): Check[] => item.lines.filter((each) => tests.has(each) === testing)
    .map((each) => ({ name: code(each), what: label('wz.keys.lineWhat') + (testing ? test : '') }));
  const checks: Check[] = [...item.providers.map((provider) => service(provider)), ...guessed(false), ...lined(false), ...guessed(true), ...lined(true)];
  // No line was seen holding a key, yet a rule says the file holds them: every line read is listed, and the one that is
  // no key is ticked by the person.
  const everyLine = checks.length === 0 && !item.keyedNames && item.names.length > 0;
  if (everyLine) {
    for (const name of item.names) checks.push({ name: code(name), what: label('wz.keys.lineWhat') });
  } else if (item.unnamed || checks.length === 0) {
    checks.push({ name: label(checks.length === 0 ? 'wz.keys.unnamed' : 'wz.keys.others'), what: label('wz.keys.unnamedWhat') });
  }
  const text = item.guesses.length > 0 ? label('wz.keys.textGuess')
    : item.providers.length > 0 ? inLanguages((t, lang) => t('wz.keys.text', { providers: e(listOf(item.providers.map((provider) => provider.name), lang)) }))
      : item.lines.length > 0 || everyLine ? label('wz.keys.textLines') : label('wz.keys.textUnnamed');
  // A long list shows its first rows and folds the rest; "I did it" still counts every row (F52).
  const SHOWN = 5;
  const list = checks.length <= SHOWN + 1 ? checklist(checks, TICK())
    : checklist(checks.slice(0, SHOWN), TICK()) + '<details class="wz-more"><summary class="wz-more-line">' +
      inLanguages((t) => t('wz.keys.more', { n: checks.length - SHOWN })) + '</summary>' + checklist(checks.slice(SHOWN), TICK()) + '</details>';
  // P20b: keys named as public are set apart, said as a guess, and are nothing to change.
  const open = item.open.length === 0 ? '' : '<div class="wz-open">' + foldLine({
    summary: inLanguages((t) => t('wz.keys.open', { n: item.open.length })),
    body: '<p class="wz-note">' + label('wz.keys.openWhy') + '</p><p class="wz-open-names">' + item.open.map((each) => code(each)).join(' ') + '</p>',
  }) + '</div>';
  const after = (everyLine ? '<p class="wz-note">' + label('wz.keys.notKey') + '</p>' : '') + open;

  const lines = item.names.length === 0
    ? '<p class="wz-line">' + label('wz.app.linesGeneric') + '</p>'
    : '<div class="wz-line">' + label('wz.app.lines') + '</div><div class="wz-env">' + item.names.map((name) =>
      '<div class="wz-env-line"><span class="wz-env-key">' + e(name) + '</span><span class="wz-env-eq">=</span>' +
      '<span class="wz-env-new">' + label('wz.app.placeholder') + '</span></div>').join('') + '</div>';

  return '<section class="wz-step" data-step="1">' + stepHead('wz.stepOf', 1, 'wz.keys.title') + '<p class="wz-p">' + text + '</p>' +
    list + after + '</section>' +
    '<section class="wz-step" data-step="2">' + stepHead('wz.stepOf', 2, 'wz.app.title') + '<p class="wz-p wz-p-tight">' + label('wz.app.text') + '</p>' +
    '<div class="wz-warn"><span class="wz-warn-mark" aria-hidden="true">!</span><span><strong>' + label('wz.app.warnStrong') + '</strong> ' +
    '<span class="wz-warn-why">' + label('wz.app.warn') + '</span></span></div>' +
    '<ol class="wz-howto">' +
    '<li><span class="wz-n" aria-hidden="true">1</span><div><div class="wz-line">' + label('wz.app.open') + '</div>' +
    '<div class="wz-path-row"><span class="wz-path">' + e(item.path) + '</span>' + copyButton(item.path) + '</div></div></li>' +
    '<li><span class="wz-n" aria-hidden="true">2</span><div>' + lines + '</div></li>' +
    '<li><span class="wz-n" aria-hidden="true">3</span><div class="wz-line">' + label('wz.app.save') + '</div></li>' +
    '</ol>' + note + '</section>';
}

/** F49: what a file holds decides what limiting the damage is. The person says it; the page never guesses it. */
const ANSWERS: readonly (readonly [answer: string, checks: readonly (readonly [name: string, what: string])[]])[] = [
  ['wz.data.people', [['wz.data.report', 'wz.data.reportWhat'], ['wz.data.team', 'wz.data.teamWhat'], ['wz.data.move', 'wz.data.moveWhat']]],
  ['wz.data.business', [['wz.data.agreement', 'wz.data.agreementWhat'], ['wz.data.team', 'wz.data.teamWhat'], ['wz.data.move', 'wz.data.moveWhat']]],
  ['wz.data.other', [['wz.data.team', 'wz.data.teamWhat'], ['wz.data.move', 'wz.data.moveWhat']]],
];

function dataSteps(item: ToDoItem, page: WizardPage, note: string): string {
  const label = (key: string): string => inLanguages((t) => t(key));
  const key = page.protectKeys.get(item.path);
  // P38a: only a file inside the project can be protected from here, and a shared copy changes nothing (P46). A file a
  // rule protects already (M3) says so; its window is the one the Files view offers, keyed the same.
  const protect = page.toldPaths?.has(item.path) === true
    ? '<p class="wz-p">' + label('wz.stop.told') + '</p>'
    : page.protectedPaths.has(item.path)
    ? '<span class="wz-protected">' + label('pr.done') + '</span><p class="wz-honest">' + label('wz.stop.honest') + '</p>'
    : key === undefined && page.protectAt !== undefined && !page.shared
      ? pill({ label: label('wz.protect'), tone: 'light', size: 'lg', href: e(page.protectAt) }) + '<p class="wz-honest">' + label('wz.stop.honest') + '</p>'
    : key === undefined
      ? '<p class="wz-p">' + label(page.shared ? 'wz.stop.shared' : 'wz.stop.outside') + '</p>'
      : pill({ label: label('wz.protect'), tone: 'light', size: 'lg', href: '#protect-' + key, attributes: opener('protect-' + key) + ' data-protect-open="' + key + '"' }) +
        // BT7: the window writes one of two answers, so the step holds both and the script shows the one chosen.
        '<span class="wz-protected" data-made="block" data-made-key="' + key + '" hidden>' + label('pr.done') + '</span>' +
        '<span class="wz-protected wz-tracked" data-made="tell" data-made-key="' + key + '" hidden>' + label('md.done.tell') + '</span>' +
        '<p class="wz-honest">' + label('wz.stop.honest') + '</p>';
  return '<section class="wz-step" data-step="1">' + stepHead('wz.stepOf', 1, 'wz.data.title') +
    '<div class="wz-ask">' + label('wz.data.ask') + '</div>' +
    '<p class="wz-p wz-p-tight">' + label('wz.data.askHelp') + '</p>' +
    '<div class="wz-answers" role="radiogroup">' +
    // Each answer says what it means, so a person who has never sorted their files this way can still pick one (F49).
    // The fourth answer, "Nothing private in it", is the wizard's own skip in its foot (F50), as the design file has it.
    ANSWERS.map(([answer], index) => '<button type="button" class="wz-answer" role="radio" aria-checked="false" data-answer="' + index + '">' +
      '<span class="wz-option-mark" aria-hidden="true"></span><span class="wz-option"><span class="wz-option-name">' + label(answer) + '</span>' +
      '<span class="wz-option-what">' + label(answer + 'What') + '</span></span></button>').join('') +
    '</div>' +
    ANSWERS.map(([answer, checks], index) => '<div class="wz-answered" data-for-answer="' + index + '"><h3 class="wz-answer-title">' + label(answer) + '</h3>' +
      '<p class="wz-p">' + label('wz.data.text') + '</p>' +
      checklist(checks.map(([name, what]) => ({ name: label(name), what: label(what) })), TICK()) + '</div>').join('') +
    '</section>' +
    '<section class="wz-step" data-step="2">' + stepHead('wz.stepOf', 2, 'wz.stop.title') + '<p class="wz-p">' + label('wz.stop.text') + '</p>' +
    protect + '<p class="wz-path-note"><code>' + e(item.path) + '</code></p>' + note + '</section>';
}

/** T14: a note the mark carries, typed before the step that writes it. Never a key: the field says what it is for. */
function noteField(field: string): string {
  const placeholder = (lang: (typeof LANGS)[number]): string => e(translator(lang)('fix.window.notePlaceholder'));
  return '<div class="wz-note-field"><label class="wz-note-label" for="' + field + '">' + inLanguages((t) => t('fix.window.note')) + '</label>' +
    '<input class="wz-note-input" id="' + field + '" data-wz-note maxlength="200" autocomplete="off" placeholder="' + placeholder('en') + '"' +
    LANGS.map((lang) => ' data-placeholder-' + lang + '="' + placeholder(lang) + '"').join('') + '></div>';
}

/** A button that copies `text`, saying so for two seconds. Filled in by the page's script where `text` is empty. */
function copyButton(text: string, label = 'wz.copy'): string {
  return '<button type="button" class="wz-copy" data-copy="' + e(text) + '"><span class="wz-copy-idle">' + inLanguages((t) => t(label)) + '</span>' +
    '<span class="wz-copy-done">' + inLanguages((t) => t('wz.copied')) + '</span></button>';
}

/** The command a page that cannot write hands over (P43, R32, R61), with its Copy: filled in by the page's script. */
export function commandRow(): string {
  return '<div class="wz-path-row"><code class="wz-path" data-command></code>' + copyButton('', 'wz.copyCommand') + '</div>';
}

function stepHead(of: string, n: number, title: string): string {
  return '<div class="wz-step-of">' + inLanguages((t) => t(of, { n })) + '</div><h2 class="wz-h2">' + inLanguages((t) => t(title)) + '</h2>';
}

/** The ready-made questions of §7.1, answered in advance (F43). */
function questionsFor(item: ToDoItem): readonly Question[] {
  const first = (item.providers[0] ?? item.guesses[0]?.provider)?.name;
  const say = (render: (t: Translate) => string): string => inLanguages(render);
  if (item.kind === 'data') {
    return [['ask.tell', 'ask.tellA'], ['ask.who', 'ask.whoA'], ['ask.next', 'ask.nextA']].map(([question, answer]) => ({
      question: say((t) => t(question as string)), answer: say((t) => t(answer as string)),
    }));
  }
  return [
    first === undefined
      ? { question: say((t) => t('ask.makeAny')), answer: say((t) => t('ask.makeAnyA')) }
      : { question: say((t) => t('ask.make', { provider: e(first) })), answer: say((t) => t('ask.makeA', { provider: e(first) })) },
    { question: say((t) => t('ask.login')), answer: say((t) => t('ask.loginA')) },
    { question: say((t) => t('ask.stop')), answer: say((t) => t('ask.stopA')) },
  ];
}

export const FIX_WIZARD_STYLE = String.raw`
.wz-top{display:flex;align-items:center;gap:14px;padding:14px 24px;border-bottom:1px solid var(--white-07)}
.wz-file{flex:none;font-size:13px;font-weight:600;color:var(--text-2);white-space:nowrap}
.wz-top [data-wz-stepper]{flex:1;display:flex}
.wz-now{padding:22px 36px 20px;background:var(--coral-05);border-bottom:1px solid var(--coral-18)}
.wz-now-label{font-size:13px;font-weight:600;color:var(--coral-text);margin-bottom:8px}
.wz-now-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.wz-chip{font-family:var(--mono);font-size:20px;font-weight:600;color:var(--text);background:var(--panel);border:1px solid var(--coral-45);border-radius:8px;padding:6px 12px}
.wz-now-title{font-size:17px;font-weight:650;line-height:1.3}
.wz-context{font-size:14.5px;line-height:1.5;color:var(--text-2);text-wrap:pretty}
.wz-context code{font-family:var(--mono);font-size:13.5px;color:var(--text)}
.wz-body{padding:32px 36px 30px;min-height:340px}
.js .wz-step:not(.wz-on){display:none}
.wz-step+.wz-step{margin-top:32px}.js .wz-step+.wz-step{margin-top:0}
.wz-step-of{font-size:13px;font-weight:600;color:var(--coral-text);margin-bottom:10px}
.wz-h2{margin:0 0 10px;font-size:28px;line-height:1.2;letter-spacing:-0.02em;font-weight:650;text-wrap:balance}
.wz-p{margin:0 0 24px;font-size:16px;line-height:1.5;color:var(--text-2);text-wrap:pretty}.wz-p-tight{margin-bottom:22px}
.wz-warn{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:14px;background:var(--coral-07);border:1px solid var(--coral-35);margin-bottom:22px;font-size:15px;line-height:1.5}
.wz-warn strong{font-weight:650}.wz-warn-why{color:var(--text-soft)}
.wz-warn-mark{flex:none;width:24px;height:24px;border-radius:50%;background:var(--coral);color:var(--on-coral);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
.wz-howto{list-style:none;margin:0 0 22px;padding:0;display:flex;flex-direction:column;gap:18px}
.wz-howto>li{display:grid;grid-template-columns:28px minmax(0,1fr);gap:14px}
.wz-howto>li>div{padding-top:3px;min-width:0}
.wz-n{width:28px;height:28px;border-radius:50%;background:var(--coral-14);color:var(--coral-text);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center}
.wz-line{font-size:16px;line-height:1.5;margin-bottom:10px}p.wz-line{margin:0}
.wz-path-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.wz-path{font-family:var(--mono);font-size:14px;color:var(--text);background:var(--panel);border:1px solid var(--white-10);border-radius:8px;padding:8px 12px;overflow-wrap:anywhere}
.wz-copy{background:transparent;color:var(--text);border:1px solid var(--white-14);border-radius:999px;padding:7px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.wz-copy-done{display:none}.wz-copied{background:var(--mint-14);color:var(--mint)}.wz-copied .wz-copy-idle{display:none}.wz-copied .wz-copy-done{display:inline}
.wz-env{border-radius:10px;background:var(--panel);border:1px solid var(--white-10);padding:10px 14px;font-family:var(--mono);font-size:14px;line-height:1.9;overflow:auto}
.wz-env-line{white-space:nowrap}.wz-env-key{color:var(--text)}.wz-env-eq{color:var(--coral-text)}
.wz-env-new{color:var(--text-3);background:var(--coral-12);border-radius:4px;padding:1px 6px}
.wz-ck-line{font-family:var(--mono);font-size:15px;overflow-wrap:anywhere}
.wz-guess{display:block;margin-top:3px}.wz-guess .wz-ck-line{font-size:12.5px;color:var(--text-2)}
.wz-more{margin-top:10px}.wz-more>.ck{margin-top:10px}
.wz-more-line{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--white-14);color:var(--text-soft);font-size:14px;font-weight:600;cursor:pointer;list-style:none}
.wz-more-line::-webkit-details-marker{display:none}.wz-more-line:hover{background:var(--white-05);color:var(--text)}.wz-more[open]>.wz-more-line{display:none}
.wz-open{margin-top:18px}.wz-open .wz-note{margin:0 0 10px}.wz-open-names{margin:0;display:flex;flex-wrap:wrap;gap:6px 14px}
.wz-note{margin:14px 0 0;font-size:14px;line-height:1.5;color:var(--text-3);text-wrap:pretty}
.wz-ask{font-size:16px;font-weight:600;margin:0 0 12px}
.wz-answers{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.wz-answer{display:flex;align-items:flex-start;gap:14px;width:100%;text-align:left;background:var(--panel);border:1px solid var(--white-10);color:var(--text);border-radius:14px;padding:14px 16px;font:inherit;cursor:pointer}
.wz-answer:hover{border-color:var(--white-30)}
.wz-answer.ck-nudge{border-color:var(--coral-60);box-shadow:0 0 0 3px var(--coral-14)}
.wz-option-mark{flex:none;width:20px;height:20px;margin-top:2px;border-radius:50%;border:1.5px solid var(--white-30)}
.wz-option{display:flex;flex-direction:column;gap:3px}
.wz-option-name{font-size:15.5px;font-weight:600}
.wz-option-what{font-size:14px;line-height:1.45;color:var(--text-2)}
.wz-answer[aria-checked="true"]{border-color:var(--coral-50);background:var(--coral-07)}
.wz-answer[aria-checked="true"] .wz-option-mark{border:6px solid var(--coral)}
.js .wz-answered{display:none}.js .wz-answered.wz-on{display:block}
.wz-answer-title{margin:0 0 8px;font-size:15px;font-weight:650}.js .wz-answer-title{display:none}
.wz-answered+.wz-answered{margin-top:24px}
.wz-honest{margin:18px 0 0;font-size:14px;line-height:1.5;color:var(--text-3)}
.wz-path-note{margin:10px 0 0;font-size:13px;color:var(--text-3)}.wz-path-note code{font-family:var(--mono)}
.wz-done{text-align:center;padding:30px 0 10px}
.wz-done-mark{width:64px;height:64px;border-radius:50%;background:var(--mint);color:var(--on-mint);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;margin:0 auto 22px}
.wz-done .wz-h2{font-size:30px}
.wz-done-text{margin:0 auto;max-width:400px;font-size:16px;line-height:1.5;color:var(--text-2)}
.wz-handover{margin:22px auto 0;max-width:520px;text-align:left}
.wz-handover-text{margin:0 0 10px;font-size:14px;line-height:1.5;color:var(--text-2)}
.wz-reason{margin:18px 0 0;padding:12px 14px;border-radius:12px;background:var(--coral-07);border:1px solid var(--coral-35);font-size:14px;line-height:1.5;white-space:pre-line}
.wz-reason[hidden],.wz-handover[hidden],.wz-protected[hidden]{display:none}
.wz-protected{display:inline-flex;align-items:center;padding:12px 20px;border-radius:999px;background:var(--mint-14);color:var(--mint);font-size:15px;font-weight:600}
.wz-tracked{background:var(--sand-16);color:var(--sand)}
.wz-foot{position:sticky;bottom:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:16px 24px;border-top:1px solid var(--white-07);background:var(--popup-foot)}
.wz-foot-left,.wz-foot-right{display:flex;gap:14px;align-items:center}.wz-foot-right{gap:10px}
.wz-back{background:transparent;border:1px solid var(--white-12);color:var(--text-soft);border-radius:999px;padding:10px 16px;font:inherit;font-size:14px;cursor:pointer}
.wz-foot [hidden]{display:none}
.cf-note .wz-reason,.cf-note .wz-handover{margin:0 0 18px;max-width:none}
.wz-skip{color:var(--text-3);font-weight:400;padding:6px 4px}.wz-skip:hover{color:var(--text)}
.wz-foot-right{flex-wrap:wrap;justify-content:flex-end}
.wz-main.wz-wait{opacity:.5}
.wz-hint{margin:16px 0 0;font-size:14.5px;font-weight:600;color:var(--coral-text)}.wz-hint[hidden]{display:none}
.wz-main.pill-primary,.wz-main.pill-mint{border-color:transparent}
.wz-main{padding:12px 22px}
.wz-notice{margin-top:14px}
.wz-where{margin-top:14px;border-top:1px solid var(--coral-18);padding-top:12px}
.wz-where-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;list-style:none;font-size:14px;font-weight:600;color:var(--text-soft)}
.wz-where-toggle::-webkit-details-marker{display:none}
.wz-where-toggle:after{content:"▾";font-size:12px;color:var(--text-3)}.wz-where[open] .wz-where-toggle:after{content:"▴"}
.wz-where-toggle:hover{color:var(--text)}
.wz-where-body{margin-top:12px}
.wz-note-field{margin-top:26px;padding-top:22px;border-top:1px solid var(--white-07)}
.wz-note-label{display:block;font-size:14px;font-weight:600;color:var(--text-2);margin-bottom:8px}
.wz-note-input{width:100%;background:var(--panel);border:1px solid var(--white-12);border-radius:10px;padding:11px 14px;color:var(--text);font:inherit;font-size:15px;outline:none}
.wz-note-input:focus-visible{border-color:var(--coral-50)}
@media (max-width:640px){.wz-now{padding:18px 20px}.wz-body{padding:24px 20px}.wz-top{flex-wrap:wrap}}
`;
