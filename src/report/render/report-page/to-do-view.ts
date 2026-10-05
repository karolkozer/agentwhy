// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../../core/redaction/redacted.ts';
import { PROVIDER_NAMES } from '../../../core/session-format.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages } from '../report-copy.ts';
import type { ReportModel } from '../../report-model.ts';
import { askCard, writtenAnswer } from '../ui/ask-panel.ts';
import { pill } from '../ui/button.ts';
import { fileChips } from '../ui/file-chip.ts';
import { guideCard } from '../ui/guide-card.ts';
import { hero } from '../ui/hero.ts';
import { LOOKS, type Look, type Tone } from '../ui/status-look.ts';
import { opener } from '../ui/popup.ts';
import { progressBar } from '../ui/progress.ts';
import { tag } from '../ui/tag.ts';
import { taskList } from '../ui/task-list.ts';
import type { FileRow } from './files.ts';
import { helperViews } from './helpers.ts';
import { titleOf, type FileNames } from './item-names.ts';
import type { Clock } from './times.ts';
import type { ToDoItem } from './to-do.ts';

/** The id of the Fix it window of the item at `at`. The page's own counter, never transcript text. */
export const fixId = (at: number): string => 'fix-' + at;
/** The id of the window that says what happened to the item at `at`. */
export const storyId = (at: number): string => 'story-' + at;

/**
 * "Your to-do list" (the report page spec P6-P11, P59): the answer centred, one place to start, where the person is,
 * and one card per file. With nothing to fix, "All good." and what happened - unless a key's shape came back in a result, which is never
 * a clean session. A file with a standing mark (`done`, M5) is drawn done, and the place to start is the first one that
 * is not (P44).
 */
export function toDoView(items: readonly ToDoItem[], report: ReportModel, marked: ReadonlySet<string>, gaps: boolean, clock: Clock, rows: readonly FileRow[], context: CleanContext, names: FileNames): string {
  if (items.length === 0) return '<div class="rp-narrow">' + whenLine(report, clock) + '</div>' + nothingView(report, gaps, rows, context, names);
  const done = items.filter((item) => marked.has(item.path)).length;
  const first = Math.max(items.findIndex((item) => !marked.has(item.path)), 0);
  const finished = done === items.length;
  return '<div class="rp-narrow">' + whenLine(report, clock) +
    hero({
      eyebrow: '',
      fact: inLanguages((t) => t('rp.hero.fact', { n: items.length })),
      action: inLanguages((t) => t('rp.hero.todo', { n: items.length })),
      lead: inLanguages((t) => t('rp.hero.lead')),
      centred: true,
      // The maintainer, 2026-09-30: a mark above the answer, as on every other screen - coral while there is something to fix.
      mark: finished ? 'tick' : 'todo',
    }) +
    '<div data-guide' + (finished ? ' hidden' : '') + '>' + guideCard({
      tone: 'coral',
      title: inLanguages((t) => t('rp.guide.start')),
      body: inLanguages((t) => t('rp.guide.startBody')),
      action: { label: inLanguages((t) => t('rp.guide.go')), href: '#' + fixId(first), attributes: opener(fixId(first)) + ' data-guide-go' },
    }) + '</div>' +
    '<div data-all-done' + (finished ? '' : ' hidden') + '>' + guideCard({
      tone: 'mint',
      title: inLanguages((t) => t('rp.done.title')),
      body: inLanguages((t) => t(items.every((item) => item.kind === 'keys') ? 'rp.done.keys' : 'rp.done.other')),
    }) + '</div>' +
    (gaps ? gapBanner(report) : '') +
    // P4, the maintainer 2026-09-30: "You asked" stands right above the list, as it stands above "What happened".
    youAsked(context.title) +
    '<div class="rp-todo-bar"><span class="rp-todo-label">' + inLanguages((t) => t('rp.todo.heading')) + '</span>' +
    '<span data-progress>' + progressBar(done, items.length, inLanguages((t) => t('rp.todo.progress', { done: '<b data-done>' + done + '</b>', total: items.length }))) + '</span></div>' +
    taskList(
      [inLanguages((t) => t('rp.col.file')), inLanguages((t) => t('rp.col.details')), inLanguages((t) => t('rp.col.action'))],
      items.map((item, at) => ({
        title: inLanguages((t, lang) => titleOf(item, t, lang)),
        path: item.path,
        label: names(item.path),
        done: marked.has(item.path),
        details: pill({ label: inLanguages((t) => t('rp.what')), tone: 'secondary', href: '#' + storyId(at), attributes: opener(storyId(at)) }),
        action: pill({ label: inLanguages((t) => t('rp.fix')), tone: 'primary', size: 'task', href: '#' + fixId(at), attributes: opener(fixId(at)) }) +
          '<span class="rp-done-tag">' + tag(inLanguages((t) => t('rp.fixed')), 'mint', 'md') + '</span>',
        attributes: ' data-item="' + at + '" title="' + e(item.path) + '"',
      })),
    ) + '</div>';
}

/**
 * P4, M4: which conversation this is - the day, and the first and last record's time, in the machine's time zone. A
 * record with no time says nothing here rather than a guessed one.
 */
function whenLine(report: ReportModel, clock: Clock): string {
  // X28: the page names the AI the conversation was with, a shared page too, on a line of its own above when it was.
  const ai = '<p class="rp-ai">' + tag(e(PROVIDER_NAMES[report.scope.provider]), 'grey', 'badge') + '</p>';
  const times = report.scope.times;
  if (times === undefined) return ai;
  // A conversation that ran over more than one day names both days: "18:46 – 15:28" under one day would read as backwards.
  const oneDay = clock.day(times.first, 'en') === clock.day(times.last, 'en');
  const when = (lang: Parameters<Clock['day']>[1]): string => oneDay
    ? clock.day(times.first, lang) + ', ' + clock.time(times.first).slice(0, 5) + ' – ' + clock.time(times.last).slice(0, 5)
    : clock.day(times.first, lang) + ', ' + clock.time(times.first).slice(0, 5) + ' – ' + clock.day(times.last, lang) + ', ' + clock.time(times.last).slice(0, 5);
  return ai + '<p class="rp-when">' + inLanguages((t, lang) => t('rp.when', { when: '<b>' + e(when(lang)) + '</b>' })) + '</p>';
}

/**
 * Why a Codex record has a gap, where that is what its format cannot show (`2026-09-27-what-codex-wrote.md` X23): an
 * older record that shows no command at all (`legacy`), or one that does not show every step. Absent for any other record.
 */
function codexGap(report: ReportModel): 'legacy' | 'partial' | undefined {
  if (report.scope.provider !== 'codex') return undefined;
  const { capabilities } = report.recorded;
  if (capabilities.some((one) => one.question === 'access' && one.state === 'absent')) return 'legacy';
  return capabilities.some((one) => one.question === 'actions' && one.state !== 'supported') ? 'partial' : undefined;
}

/**
 * Whether a record's gaps leave nothing about a private file not known (F17, amended 2026-10-05): no private file whose
 * row is an attempt without a known end - an attempt like that at a file the row already shows read adds nothing to
 * what is known of it - no file's text a process printed that no agent is shown to have received (X14), no command of a
 * cell left unread (X23a), and no gap but the format's own - what it never records, a text that may not be whole, a copy
 * of the agent's own words joined to no utterance (X31). A missing source, a record that could not be read, an action
 * or an agent left unjoined: each leaves what happened not known.
 */
function nothingUnknown(report: ReportModel, rows: readonly FileRow[]): boolean {
  const formats = new Set(['capability-absent', 'capability-unmeasured', 'result-incomplete']);
  const formatOwn = (gap: ReportModel['gaps'][number]): boolean =>
    (formats.has(gap.kind) && !(gap.kind === 'capability-unmeasured' && gap.question === 'actions')) ||
    (gap.kind === 'relation-unresolved' && gap.question === 'own-words');
  return !rows.some((row) => row.private && row.access === 'unknown') && (report.tally.printedUnseen ?? 0) === 0 && report.gaps.every(formatOwn);
}

/** P60: a record with a gap says so above the list, and where to read what is missing - for Codex, in its own words (X23). */
function gapBanner(report: ReportModel): string {
  const words = codexGap(report) === undefined ? 'rp.gap.banner' : 'rp.gap.codex.banner';
  return '<div class="rp-gap" role="note"><span class="rp-gap-mark" aria-hidden="true">!</span><span>' + inLanguages((t) => t(words)) + ' ' +
    '<a class="rp-gap-link" href="#advanced" data-record-link>' + inLanguages((t) => t('rp.gap.link')) + '</a></span></div>';
}

/** What the page knows beyond the model (P4, a-way-back R8): the session's title, and whether Conversations is beside it. */
export interface CleanContext {
  readonly title?: Redacted;
  readonly back: boolean;
}

function nothingView(report: ReportModel, gaps: boolean, rows: readonly FileRow[], context: CleanContext, names: FileNames): string {
  const say = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  // P59 is a key in no private file. One in a private file's text is that file's (SW7): a tracked file says so below.
  const shapes = [...new Set(report.secretShapes.filter((finding) => finding.inPrivateFile !== true).flatMap((finding) => finding.classes.map(String)))];
  const back = context.back ? '<div class="rp-back">' + pill({ label: say('rp.nothing.back'), tone: 'light', size: 'lg', href: 'index.html' }) + '</div>' : '';
  // P59: a key's shape in a result is never a clean screen - but it is not a to-do item either, since no protected file
  // is known to hold it. The answer says what to do and where the record shows it, and the summary says what else the AI
  // did, as on a clean screen (unless the record has a gap, P60). Drawn as every other screen is (the maintainer,
  // 2026-09-30): the mark, the two lines, the lead, its one button.
  if (shapes.length > 0) {
    return '<div class="rp-narrow rp-alone">' +
      hero({
        eyebrow: '',
        fact: say('rp.shape.fact'),
        action: say('rp.shape.action'),
        lead: inLanguages((t) => t('rp.shape.title') + ' ' + t('rp.shape.body', { kinds: '<code>' + shapes.map((shape) => e(shape)).join(', ') + '</code>' }) + ' ' + t('rp.shape.next')),
        centred: true,
        mark: 'alert',
      }) +
      heroGo(say('rp.shape.link')) + youAsked(context.title) + whatHappened(report, rows, { shape: true, gaps }, names) + back + '</div>';
  }
  // P60, invariant 4: with a gap in the record, no evidence is not "nothing happened", so the all-clear is not drawn.
  // The screen is the clean one's all the same (the maintainer, 2026-09-30): the centred answer - nothing to fix that
  // the record shows, in amber, since the rest is not known - where to read what is missing, and what the record does show.
  if (gaps) {
    // X23: a Codex record says what its format cannot show - never "part of it is missing", which blames nobody right.
    const codex = codexGap(report);
    // The maintainer, 2026-09-30: where the record shows a private file stopped, and none whose outcome is not recorded,
    // that is said in mint - the protection worked - and the gap moves to the line under it; never "All good.".
    const stopped = rows.some((row) => row.private && row.access === 'stopped') && !rows.some((row) => row.private && row.access === 'unknown');
    // F17 as amended 2026-10-05 by the maintainer, here as on the conversation's row: a Codex record whose gaps are the
    // format's own, and that leaves nothing about a private file not known, is answered as the clean page answers -
    // "All good." / "Nothing to fix." ("Claude's looks better", the same day) - and what Codex does not write down is
    // said in the lead, after what the clean page would say there. Only where it reached a private file or was stopped
    // from one: with neither, the gaps are all the record says, and its row says "Couldn't check fully".
    const known = codex !== undefined && (stopped || report.tally.filesReached > 0) && nothingUnknown(report, rows);
    const calm = stopped || known;
    // A read the person let happen is said as the clean page says it (F57a); names alone, as nothing private read.
    const answer = stopped ? 'rp.gap.stopped' : allowedReads(rows).length > 0 ? 'rp.nothing.allowed' : 'rp.nothing.title';
    const codexLead = codex === 'legacy' ? 'rp.gap.codex.legacy' : 'rp.gap.codex.lead';
    return '<div class="rp-narrow rp-alone">' +
      hero({
        eyebrow: '',
        fact: say(known ? 'rp.nothing.fact' : 'rp.gap.fact'),
        action: say(known ? 'rp.nothing.action' : stopped ? 'rp.gap.stopped'
          : codex === undefined ? 'rp.gap.action' : codex === 'legacy' ? 'rp.gap.codex.legacyAction' : 'rp.gap.codex.action'),
        lead: known ? inLanguages((t) => t(answer) + ' ' + t(codexLead))
          : say(codex === undefined ? 'rp.gap.body' : codex === 'legacy' ? 'rp.gap.codex.legacy' : stopped ? 'rp.gap.codex.lead' : 'rp.gap.codex.body'),
        centred: true,
        ...(calm ? { calm: true, mark: 'tick' as const } : { mark: 'unsure' as const }),
      }) +
      // The maintainer, 2026-10-05: always white. Reading what the record misses fixes nothing, and coral is for a fix
      // (guidelines §1); a stop and "All good." stood over a coral button that read as one more thing to do.
      heroGo(say('rp.gap.link'), 'light') +
      youAsked(context.title) + whatHappened(report, rows, { shape: false, gaps }, names) + back + '</div>';
  }
  const named = rows.filter((row) => row.private && row.access === 'name').length;
  // F57a: a private file read with nothing to do is one the person chose Tell me for - never "didn't read anything private".
  const allowed = allowedReads(rows).length > 0;
  return '<div class="rp-narrow rp-alone">' +
    hero({ eyebrow: '', fact: say('rp.nothing.fact'), action: say('rp.nothing.action'), lead: say(allowed ? 'rp.nothing.allowed' : 'rp.nothing.title'), centred: true, calm: true, mark: 'tick' }) +
    youAsked(context.title) + whatHappened(report, rows, { shape: false, gaps: false }, names) + back +
    askCard(say('rp.ask.title'), [...(named > 0 ? ['name'] : []), 'safe', 'change'].map((key) => ({
      question: say('rp.ask.' + key),
      answer: inLanguages((t) => writtenAnswer(t('rp.ask.' + key + (key === 'safe' && allowed ? 'AllowedA' : 'A')))),
    })), 'rp-ask') +
    '<details class="rp-dev"><summary class="rp-dev-line">' + say('rp.dev.title') + '<span class="rp-dev-caret" aria-hidden="true">▾</span></summary>' +
    '<div class="rp-dev-body"><span class="rp-did-note">' + say('fl.commands') + '</span>' +
    pill({ label: say('rp.clean.record'), tone: 'secondary', href: '#advanced' }) + '</div></details></div>';
}

/** The one button under a screen's answer, where it leads to the record (P59, P60). */
function heroGo(label: string, tone: 'primary' | 'light' = 'primary'): string {
  return '<div class="rp-hero-go">' + pill({ label, tone, size: 'lg', href: '#advanced', attributes: ' data-record-link' }) + '</div>';
}

/**
 * The private files the AI read that ask for nothing (F57a): on a screen with nothing to fix, every private file read is
 * one the person chose Tell me for - keys or not, since 2026-10-02 (SW7) - and the to-do list keeps every other read.
 */
function allowedReads(rows: readonly FileRow[]): readonly string[] {
  return rows.filter((row) => row.private && row.access === 'read' && row.item === undefined).map((row) => row.path as string);
}

/** P4: "You asked" - the title Claude Code gave the session, which is what Conversations lists it by. Absent says nothing. */
function youAsked(title: Redacted | undefined): string {
  if (title === undefined) return '';
  return '<div class="rp-asked"><span class="rp-asked-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/></svg></span>' +
    '<span><span class="rp-asked-label">' + inLanguages((t) => t('rp.asked')) + '</span>' +
    '<span class="rp-asked-title">' + e(title as string) + '</span></span></div>';
}

/** One line of "What happened": a glyph in its colour, what the AI did in one sentence with a tag, why it asks nothing, and its files. */
interface DidRow {
  readonly glyph: string;
  readonly tone: Tone;
  readonly title: string;
  readonly tag: { readonly label: string; readonly tone: Tone };
  readonly line: string;
  readonly paths?: readonly string[];
  readonly link?: { readonly label: string; readonly href: string };
}

/**
 * P11: what the AI did in this conversation, so a clean screen says what happened - from the model's facts only: that
 * no private file was opened, or the ones it read because the person let it (F57a), the private files it only saw the
 * name of, was stopped from, or whose outcome is not recorded, and the helpers it brought in. Each line says why it asks nothing, in the colours every page uses (mint =
 * nothing reached, blue = only saw the name, grey = not known). The foot says what the record cannot show and leads to
 * every file. Under P59's card (`shape`) no line says the keys stayed closed: a result carried something like one.
 */
function whatHappened(report: ReportModel, rows: readonly FileRow[], under: { readonly shape: boolean; readonly gaps: boolean }, names: FileNames): string {
  const say = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const privately = (access: FileRow['access']): readonly string[] => rows.filter((row) => row.private && row.access === access).map((row) => row.path as string);
  const lines: DidRow[] = [];
  // Invariant 4: an outcome not recorded is said as that, and then no line says no private file was opened - nor
  // under P60's card, where part of the record is missing.
  const unknown = privately('unknown');
  const allowed = allowedReads(rows);
  if (unknown.length === 0 && allowed.length === 0 && !under.gaps) {
    lines.push({ glyph: '✓', tone: 'mint', title: say('rp.clean.private'), tag: { label: say('rp.clean.privateTag'), tone: 'mint' },
      line: say(under.shape ? 'rp.clean.privateShape' : 'rp.clean.privateLine') });
  }
  // It read them, and that stays said (F57a); in Track's sand, since the choice was the person's and there is nothing to do.
  if (allowed.length > 0) {
    lines.push({ glyph: LOOKS.allowed.glyph, tone: LOOKS.allowed.tone, title: say('rp.clean.allowed', { n: allowed.length }), tag: { label: say('fl.mode.told'), tone: 'sand' },
      line: say('rp.clean.allowedLine', { n: allowed.length }), paths: allowed });
  }
  const named = privately('name');
  // A file whose text a process printed and no agent is shown to have seen (X14): what it saw of it is not known.
  const printed = new Set(report.stories.filter((story) => story.read === true).map((story) => story.path as string));
  if (named.length > 0) {
    lines.push({ glyph: LOOKS.name.glyph, tone: LOOKS.name.tone, title: say('rp.clean.named', { n: named.length }), tag: { label: say(LOOKS.name.label), tone: 'blue' },
      // X10: a name seen is not "nothing to do" where an attempt has no known end - the record cannot show the AI saw no
      // more. Amended 2026-10-05 by the maintainer: under P60's gap card alone, with every attempt's end known, it is,
      // as its row in Conversations says.
      line: say(under.gaps && (unknown.length > 0 || named.some((path) => printed.has(path))) ? 'rp.clean.namedLineGap' : 'rp.clean.namedLine',
        { n: named.length }), paths: named });
  }
  const stopped = privately('stopped');
  if (stopped.length > 0) {
    lines.push({ glyph: LOOKS.stopped.glyph, tone: 'mint', title: say('rp.clean.stopped', { n: stopped.length }), tag: { label: say(LOOKS.stopped.label), tone: 'mint' },
      line: say('rp.clean.stoppedLine'), paths: stopped });
  }
  if (unknown.length > 0) {
    lines.push({ glyph: LOOKS.unchecked.glyph, tone: 'grey', title: say('rp.clean.unknown', { n: unknown.length }), tag: { label: say(LOOKS.unchecked.label), tone: 'grey' },
      line: say('rp.clean.unknownLine'), paths: unknown });
  }
  lines.push(helpersLine(report));

  return '<section class="rp-did"><h2 class="rp-did-heading">' + say('rp.clean.heading') + '</h2>' +
    '<div class="rp-did-card"><ul class="rp-did-list">' + lines.map((row) => didRow(row, names)).join('') + '</ul>' +
    '<div class="rp-did-foot"><span class="rp-did-note">' + say('st.foot') + '</span>' +
    (rows.length === 0 ? '' : pill({ label: say('rp.clean.seeFiles'), tone: 'secondary', href: '#files' })) + '</div></div></section>';
}

/**
 * The helpers it brought in. "None of them read your private files" is said only where every helper's own steps say so;
 * a helper whose actions or outcome were not recorded is never counted as one that read nothing (invariant 4).
 */
function helpersLine(report: ReportModel): DidRow {
  const say = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const helpers = helperViews(report).filter((view) => view.agent.ordinal !== undefined);
  if (helpers.length === 0) {
    return { glyph: '✓', tone: 'mint', title: say('rp.clean.noHelpers'), tag: { label: say('rp.clean.noHelpersTag'), tone: 'mint' }, line: say('rp.clean.alone') };
  }
  const n = helpers.length;
  const read = helpers.filter((view) => view.status === 'read').length;
  const unrecorded = helpers.some((view) => view.status === 'unknown' || view.status === 'empty');
  const look: Look = read > 0 ? 'read' : unrecorded ? 'unchecked' : 'none';
  const tone: Tone = look === 'none' ? 'mint' : LOOKS[look].tone;
  return {
    glyph: LOOKS[look].glyph,
    tone,
    title: say('rp.clean.helpers', { n }),
    tag: { label: say(LOOKS[look].label), tone },
    line: read > 0 ? (read === n ? say('hp.all', { n }) : say('hp.some', { n: read }))
      : unrecorded ? say('rp.clean.helpersUnknown', { n }) : say('rp.clean.helpersClean', { n }),
    link: { label: say('rp.clean.seeHelpers'), href: '#helpers' },
  };
}

function didRow(row: DidRow, names: FileNames): string {
  return '<li class="rp-did-row"><span class="look look-' + row.tone + '"><span class="look-glyph" aria-hidden="true">' + row.glyph + '</span></span>' +
    '<span class="rp-did-text"><span class="rp-did-title">' + row.title + ' ' + tag(row.tag.label, row.tag.tone, 'badge') + '</span>' +
    '<span class="rp-did-line">' + row.line + '</span>' +
    (row.paths === undefined ? '' : '<span class="rp-did-chips">' + fileChips(row.paths, 3, names) + '</span>') + '</span>' +
    (row.link === undefined ? '' : pill({ label: row.link.label, tone: 'secondary', href: row.link.href })) + '</li>';
}

export const TO_DO_VIEW_STYLE = String.raw`
.rp-narrow{max-width:840px;margin:0 auto}
/* A light gap under "Report from", the same above every screen's mark (the maintainer, 2026-09-30). */
.rp-alone,.rp-narrow:not(.rp-alone)>.hero-centred{padding-top:16px}
.rp-todo-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:0 4px}
.rp-todo-label{font-size:14px;color:var(--text-2)}
.rp-gap{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;margin:0 0 18px;border-radius:14px;background:var(--coral-07);border:1px solid var(--coral-35);font-size:15px;line-height:1.5}
.rp-gap-mark{flex:none;width:24px;height:24px;border-radius:50%;background:var(--coral);color:var(--on-coral);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
.rp-gap-link{font-weight:600;color:var(--text);white-space:nowrap}.rp-gap-link:hover{color:var(--white);text-decoration:underline}
.rp-hero-go{display:flex;justify-content:center;margin:-12px 0 36px}
.rp-narrow .hero-lead code{font-size:14px;color:var(--text-soft)}
/* X28: which AI the page is about, readable at a glance above the heading - the badge of the kit, larger here alone. */
.rp-ai{margin:0 0 14px;text-align:center}
.rp-ai .tag-badge{font-size:15px;padding:7px 18px;color:var(--text);background:var(--white-10);border:1px solid var(--white-28)}
.rp-when{margin:0 0 18px;text-align:center;font-size:14px;color:var(--text-3)}.rp-when b{color:var(--text-soft);font-weight:600}
.rp-did-heading{margin:0 0 12px;padding:0 4px;font-size:14px;font-weight:600;color:var(--text-2)}
.rp-did-card{border-radius:18px;background:var(--card);border:1px solid var(--white-09);overflow:hidden}
.rp-did-list{list-style:none;margin:0;padding:0}
.rp-did-row{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap;padding:22px 24px;border-bottom:1px solid var(--white-06)}
.rp-did-row>.look{margin-top:1px}
.rp-did-row>.look .look-glyph{width:30px;height:30px;font-size:14px}
.rp-did-row>.pill{align-self:center}
.rp-did-text{flex:1;min-width:220px}
.rp-did-title{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;font-size:17px;font-weight:600;line-height:1.35}
.rp-did-line{display:block;margin-top:4px;font-size:15px;line-height:1.5;color:var(--text-2)}
.rp-did-chips{display:block;margin-top:10px}
.rp-did-foot{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;padding:18px 24px}
.rp-did-note{flex:1;min-width:220px;font-size:14px;line-height:1.5;color:var(--text-3)}
.rp-asked{display:flex;align-items:center;gap:16px;margin:0 0 30px;padding:18px 22px;border-radius:18px;background:var(--card);border:1px solid var(--white-09)}
.rp-asked-mark{flex:none;width:36px;height:36px;border-radius:50%;border:1px solid var(--white-14);color:var(--text-soft);display:flex;align-items:center;justify-content:center}
.rp-asked-mark svg{width:18px;height:18px}
.rp-asked-label{display:block;font-size:13px;font-weight:600;color:var(--text-3)}
.rp-asked-title{display:block;margin-top:2px;font-size:17px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}
.rp-back{display:flex;justify-content:center;margin:34px 0 8px}
.rp-dev{margin-top:26px}
.rp-dev-line{display:inline-flex;align-items:center;gap:6px;padding:4px;font-size:14px;font-weight:600;color:var(--text-2);cursor:pointer;list-style:none}
.rp-dev-line::-webkit-details-marker{display:none}
.rp-dev-line:hover{color:var(--text)}
.rp-dev-caret{font-size:11px;transition:transform .15s}.rp-dev[open] .rp-dev-caret{transform:rotate(180deg)}
.rp-dev-body{display:flex;align-items:center;justify-content:space-between;gap:12px 20px;flex-wrap:wrap;margin-top:12px;padding:16px 20px;border-radius:14px;background:var(--panel);border:1px solid var(--white-08)}
@media (max-width:640px){.rp-did-row{padding:18px;gap:14px}.rp-did-foot{padding:16px 18px}.rp-asked{padding:16px 18px}}
.rp-done-tag{display:none}
.tc-done .rp-done-tag{display:inline-flex}.tc-done .tc-action>.pill{display:none}
`;
