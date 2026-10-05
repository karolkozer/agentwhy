// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../../core/redaction/redacted.ts';
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, type Translate } from '../report-copy.ts';
import type { ReportModel } from '../../report-model.ts';
import { avatar } from '../ui/avatar.ts';
import { closeButton, pill } from '../ui/button.ts';
import { pillTabs } from '../ui/pill-tabs.ts';
import { CLOSES, opener, popup, popupFoot } from '../ui/popup.ts';
import { stats } from '../ui/stats.ts';
import { tag } from '../ui/tag.ts';
import { fileStory, type FileStory, type StoryAgent, type StoryEntry, type StoryHolder } from './file-story.ts';
import { nameOf, ruleKey, titleOf, type FileNames } from './item-names.ts';
import type { Clock } from './times.ts';
import type { ToDoItem } from './to-do.ts';
import { fixId, storyId } from './to-do-view.ts';

/**
 * "What happened to this file" (the report page spec P12-P17; design file *agentwhy App*): the story in sentences, the
 * same facts as a diagram, and the full record for a developer. Every sentence is chosen from `fileStory`'s kinds; a
 * helper's job is quoted as what it was asked, and nothing is said about what the file holds (F51).
 *
 * The record has no time column yet: times are M4, their own slice. Order is the record's order, as it always is.
 */
export function storyWindow(item: ToDoItem, at: number, report: ReportModel, done: boolean, clock: Clock, names: FileNames): string {
  return storyWindowOf(fileStory(report, item.path), item, at, report.scope.sessionId, done, clock, { names });
}

/**
 * What a page adds to the window beside the story: To fix shows the story of the newest conversation that read the file,
 * says which one it is, and lists every conversation in a tab of its own (to-fix spec T11a); the report names its files
 * as its other views do.
 */
export interface StoryExtras {
  /** A line under the summary, already written in every language. */
  readonly context?: string;
  /** Tabs after Record, already written in every language. */
  readonly tabs?: readonly { readonly label: string; readonly panel: string }[];
  /** How the page names a file, where it tells two of one name apart (R5); by its name alone otherwise. */
  readonly names?: FileNames;
}

/** The same window from a story already told: a page that holds no session's model (To fix) is handed its story. */
export function storyWindowOf(story: FileStory, item: ToDoItem, at: number, sessionId: string, done: boolean, clock: Clock, extras: StoryExtras = {}): string {
  const label = (key: string): string => inLanguages((t) => t(key));
  return storyPopup(story, {
    path: item.path,
    keys: item.kind === 'keys',
    title: inLanguages((t, lang) => titleOf(item, t, lang)),
    ...(item.pattern === undefined ? {} : { pattern: item.pattern }),
    exposed: true,
  }, storyId(at), sessionId, clock, extras,
  // Wrapped, so `hidden` is not beaten by a pill's own `display`; the wizard's script swaps the two once the file is done.
  '<span data-story-fix="' + at + '"' + (done ? ' hidden' : '') + '>' + pill({ label: label('rp.fix'), tone: 'primary', size: 'md', href: '#' + fixId(at), attributes: opener(fixId(at)) }) + '</span>' +
    '<span data-story-fixed="' + at + '"' + (done ? '' : ' hidden') + '>' + tag(label('rp.fixed'), 'mint', 'md') + '</span>');
}

/**
 * The file a window tells the story of. A file on the to-do list is its item; any other private file is told from its
 * row (the maintainer, 2026-09-25: every file of the Files table opens the same window, its story, diagram and record).
 */
export interface StorySubject {
  readonly path: Redacted;
  readonly keys: boolean;
  /** What it is, already written in every language. */
  readonly title: string;
  readonly pattern?: Redacted;
  /**
   * Its contents reached an AI, so the story ends with the company and the diagram draws it. A name only seen or a read
   * refused sent nothing on, and nothing says it did (invariant 4).
   */
  readonly exposed: boolean;
  /**
   * `the-same-window-for-every-file` EF1: no rule marks this file private, and the window never calls it so - the
   * diagram's file box and the record's "Why it's private" are a private file's words (found by a test, 2026-10-05:
   * `README.md` was drawn as "your private file" under a rule nobody wrote).
   */
  readonly everyday?: true;
  /** What happened, in one sentence, where the story's own summary is not the one: a file with nothing to fix. */
  readonly summary?: string;
  /** The diagram's file box where nothing was read: the row's glyph and colour. */
  readonly look?: { readonly glyph: string; readonly tone: 'amber' | 'mint' | 'sand' | 'blue' | 'grey' | 'coral' };
}

/** The window, whoever it is for: the head, the three tabs and the foot, with what the page puts beside Close. */
export function storyPopup(story: FileStory, subject: StorySubject, id: string, sessionId: string, clock: Clock, extras: StoryExtras, action: string): string {
  const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const names = extras.names ?? nameOf;

  const head = '<div class="sw-head">' +
    '<div class="sw-top"><span class="sw-id"><span class="sw-chip" title="' + e(subject.path) + '">' + e(names(subject.path)) + '</span>' +
    '<span class="sw-kind">' + subject.title + '</span></span>' +
    closeButton(labelAttributes((t) => t('app.close')) + CLOSES) + '</div>' +
    '<h2 class="sw-h2" id="' + id + '-title">' + label('st.heading') + '</h2>' +
    '<p class="sw-summary">' + (subject.summary ?? summaryOf(story, subject.keys)) + '</p>' +
    (extras.context === undefined ? '' : '<p class="sw-context">' + extras.context + '</p>') + '</div>';

  const body = '<div class="sw-body">' + pillTabs([
    { label: label('st.tab.story'), panel: storyPanel(story, subject, clock, names) },
    { label: label('st.tab.diagram'), panel: diagramPanel(story, subject, names) },
    { label: label('st.tab.record'), panel: recordPanel(story, subject, sessionId, clock, names) },
    ...(extras.tabs ?? []),
  ], 'inset') + '</div>';

  const foot = popupFoot(label('st.foot'), pill({ label: label('app.close'), tone: 'outline', size: 'md', button: true, attributes: CLOSES }) + action);

  return popup({ id, size: 'wide', labelledBy: id + '-title', body: head + body + foot });
}

/** P12: who read it, and that a copy went on to the company - one sentence, from the readers the story counted. */
function summaryOf(story: FileStory, keys: boolean): string {
  const only = story.holders.filter((holder) => holder.read);
  if (only.length === 0) return inLanguages((t) => t('st.summary.reached'));
  if (only.length === 1 && only[0]?.agent.ordinal !== undefined) return inLanguages((t) => t(keys ? 'st.summary.keysHelper' : 'st.summary.dataHelper'));
  return inLanguages((t) => t(keys ? 'st.summary.keys' : 'st.summary.data', { n: only.length }));
}

/** Your AI, or "Helper 6". */
function whoOf(agent: StoryAgent, t: Translate): string {
  return agent.ordinal === undefined ? t('st.main') : t('st.helper', { ordinal: agent.ordinal });
}

function initialsOf(agent: StoryAgent): string {
  return agent.ordinal === undefined ? 'AI' : 'H' + agent.ordinal;
}

/** P14: an entry's line and the line under it, from its kind; the sentence under a helper's first entry is its job. */
function sentences(entries: readonly StoryEntry[], keys: boolean, names: FileNames): readonly { readonly title: (t: Translate) => string; readonly sub: (t: Translate) => string }[] {
  const readers = new Set<number>();
  const seen = new Set<number>();
  return entries.map((entry) => {
    const first = !seen.has(entry.agent.index);
    seen.add(entry.agent.index);
    const did = (t: Translate): string => entry.did === undefined ? '' : t('st.sub.didTimes', { n: entry.count, did: '<code>' + e(entry.did) + '</code>' });
    const job = (t: Translate): string => entry.agent.askedTo === undefined ? t('st.sub.notAsked') : t('st.sub.asked', { task: e(entry.agent.askedTo) });
    const helperFirst = first && entry.agent.ordinal !== undefined;
    switch (entry.kind) {
      case 'read': {
        const again = readers.has(entry.agent.index);
        const earlier = readers.size > 0;
        readers.add(entry.agent.index);
        const kind = keys ? 'keys' : 'data';
        // X10: text its own code handed back is read, but no file was opened by it, so it is never said so.
        const title = entry.inResult === true ? 'st.e.inResult.' + kind
          : again ? 'st.e.again' : entry.agent.ordinal !== undefined ? (earlier ? 'st.e.helperReadToo.' : 'st.e.helperRead.') + kind
            : entry.received === true ? 'st.e.received.' + kind : 'st.e.read.' + kind;
        if (entry.received === true) return { title: (t) => t(title), sub: helperFirst ? job : (t) => t('st.sub.received') };
        const inResult = (t: Translate): string => t('st.sub.inResult', { did: entry.did === undefined ? '' : '<code>' + e(entry.did) + '</code>' });
        // search-hits-are-reads H8: how it was read, where a search printed its lines - and still that nothing asked for it.
        const lines = (t: Translate): string => t(entry.inResult === true ? 'st.sub.inResultLines' : 'st.sub.lines', { n: entry.lines ?? 0, did: entry.did === undefined ? '' : '<code>' + e(entry.did) + '</code>' });
        return { title: (t) => t(title), sub: helperFirst ? job : entry.lines !== undefined ? lines : entry.inResult === true ? inResult : did };
      }
      case 'changed': return { title: (t) => t('st.e.changed'), sub: helperFirst ? job : did };
      case 'named': return { title: (t) => t('st.e.named'), sub: helperFirst ? job : did };
      case 'unknown': return { title: (t) => t('st.e.unknown'), sub: helperFirst ? job : (t) => t('st.sub.unknown') };
      case 'stopped': return { title: (t) => t('st.e.stopped'), sub: helperFirst ? job : did };
      case 'passed': return {
        title: (t) => t('st.e.passed', { to: entry.to === undefined || entry.to.ordinal === undefined ? t('st.mainLower') : t('st.helper', { ordinal: entry.to.ordinal }) }),
        sub: (t) => t('st.sub.passed'),
      };
      case 'saved': return {
        title: (t) => t('st.e.saved'),
        sub: (t) => entry.into === undefined ? t('st.sub.savedAny') : t('st.sub.saved', { files: entry.into.map((file) => '<code>' + e(names(file)) + '</code>').join(', ') }),
      };
      case 'handed': return { title: (t) => t('st.e.handed'), sub: (t) => t('st.sub.handed') };
      case 'repeated': return { title: (t) => t('st.e.repeated'), sub: (t) => t('st.sub.repeated') };
      case 'used': return {
        title: (t) => t('st.e.used'),
        sub: (t) => entry.into === undefined ? t('st.sub.usedAny') : t('st.sub.used', { programs: entry.into.map((program) => '<code>' + e(program) + '</code>').join(', ') }),
      };
    }
  });
}

/**
 * P13: one entry per record that named the file, then the AI company - whose line never says what it keeps (F24) - where
 * its contents reached an AI at all.
 */
function storyPanel(story: FileStory, subject: StorySubject, clock: Clock, names: FileNames): string {
  const { keys, exposed } = subject;
  // EF1: the same fact, in the tone the file deserves. "It was exposed", in coral, warns about a file nobody marked
  // private and that the row says there is nothing to do about; the contents did reach the AI, and that is all it says.
  const everyday = subject.everyday === true;
  const lines = sentences(story.entries, keys, names);
  // P13, M4: each entry's time beside it where the record has one; the entries stay in the record's order either way.
  const timed = story.entries.some((each) => each.at !== undefined);
  const entry = (avatarHtml: string, who: string, title: string, sub: string, last: boolean, alert: boolean, at?: number): string =>
    '<li class="sw-ev' + (alert ? ' sw-ev-alert' : '') + (timed ? ' sw-timed' : '') + '">' +
    (timed ? '<span class="sw-time">' + (at === undefined ? '' : e(clock.time(at))) + '</span>' : '') +
    '<div class="sw-rail">' + avatarHtml + (last ? '' : '<span class="sw-line"></span>') + '</div>' +
    '<div class="sw-ev-body"><div class="sw-who">' + who + '</div><div class="sw-ev-title">' + title + '</div>' +
    (sub === '' ? '' : '<div class="sw-ev-sub">' + sub + '</div>') + '</div></li>';
  return '<ol class="sw-story">' +
    story.entries.map((each, at) => entry(
      avatar(initialsOf(each.agent), each.agent.ordinal === undefined ? 'coral' : 'grey', 40),
      inLanguages((t) => whoOf(each.agent, t)),
      inLanguages((t) => lines[at]?.title(t) ?? ''),
      inLanguages((t) => lines[at]?.sub(t) ?? ''),
      !exposed && at === story.entries.length - 1,
      false,
      each.at,
    )).join('') +
    (exposed ? entry(avatar('↗', everyday ? 'grey' : 'alert', 40), inLanguages((t) => t(everyday ? 'st.company.everyday' : 'st.company')),
      inLanguages((t) => t('st.e.company')), inLanguages((t) => t('st.sub.company')), true, !everyday) : '') +
    '</ol>';
}

/** What a node of the diagram says it did: "read the keys · 2×", "passed it back". */
function didOf(holder: StoryHolder, story: FileStory, keys: boolean): string {
  const reads = story.entries.filter((entry) => entry.agent.index === holder.agent.index && entry.kind === 'read').reduce((sum, entry) => sum + entry.count, 0);
  const named = story.entries.some((entry) => entry.agent.index === holder.agent.index && entry.kind === 'named');
  return inLanguages((t) => [
    ...(holder.read ? [t(keys ? 'st.d.readKeys' : 'st.d.readIt') + (reads > 1 ? ' · ' + t('st.d.times', { n: reads }) : '')] : []),
    ...(holder.changed ? [t('st.d.changed')] : []),
    ...(!holder.read && !holder.changed && named ? [t('st.d.named')] : []),
    ...(holder.passed ? [t('st.d.passed')] : []),
    ...(holder.saved ? [t('st.d.saved')] : []),
    ...(holder.stopped ? [t('st.d.stopped')] : []),
  ].join(' · '));
}

/** What the diagram's file box is called: a private file, or a file no rule marks private (EF1). */
function fileSub(subject: StorySubject): string {
  return subject.everyday === true ? 'st.d.fileEveryday' : 'st.d.file';
}

type Reach = 'read' | 'named' | 'stopped';

/** How an AI's line reaches the file: read beats stopped beats only its name; none where it only passed something on. */
function reachOf(holder: StoryHolder, story: FileStory): Reach | undefined {
  if (holder.read) return 'read';
  if (holder.stopped) return 'stopped';
  // A write reaches the file as surely as a listing names it, and says nothing about what was shown to the AI.
  return story.entries.some((entry) => entry.agent.index === holder.agent.index && (entry.kind === 'named' || entry.kind === 'changed')) ? 'named' : undefined;
}

const NODE_HEIGHT = 64;
const ROW = 84;
const TOP = 64;
const GAP = 60;

/**
 * P15: You → your AI → the helpers in the story → the file → the company, in the Helpers diagram's look (P29): boxes
 * with an icon and connector dots on a dotted board, curves between them, one colour per kind of line. What each one
 * did is its box's second line, so no label sits on a line or over a box. The Helpers script dims what a hovered box is
 * not joined to.
 */
function diagramPanel(story: FileStory, subject: StorySubject, names: FileNames): string {
  const { keys, exposed } = subject;
  const main = story.holders.find((holder) => holder.agent.ordinal === undefined);
  const helpers = story.holders.filter((holder) => holder.agent.ordinal !== undefined);
  // Where nothing was read, the file is the last box: nothing went on to the company.
  const widths = (helpers.length === 0 ? [190, 240, 240, 240] : [170, 200, 210, 250, 220]).slice(0, exposed ? undefined : -1);
  const xs = widths.reduce<number[]>((all, width, at) => [...all, at === 0 ? 24 : (all[at - 1] as number) + (widths[at - 1] as number) + GAP], []);
  const column = (at: number): { x: number; w: number } => ({ x: xs[at] as number, w: widths[at] as number });
  const [you, ai] = [column(0), column(1)];
  const help = helpers.length === 0 ? undefined : column(2);
  const file = column(help === undefined ? 2 : 3);
  const company = exposed ? column(help === undefined ? 3 : 4) : undefined;
  const width = (company ?? file).x + (company ?? file).w + 24;
  // The file's row runs straight through. Where your AI has a line of its own to the file, the helpers hang below that
  // row, so no box stands on it; where it has none, the first helper stands on the row, and the chain from you to the
  // company is one straight line rather than a dip down to a helper and back up to the file.
  const mainReach = main === undefined ? undefined : reachOf(main, story);
  const below = mainReach === undefined ? 0 : 1;
  const height = TOP + Math.max(1, below + helpers.length) * ROW + 8;
  const middle = TOP;

  interface Box { readonly id: string; readonly x: number; readonly w: number; readonly y: number; readonly first?: boolean; readonly last?: boolean }
  const across = (units: number): string => Number((units / width * 100).toFixed(3)) + '%';
  const box = (node: Box, icon: string, tone: string, label: string, sub: string, extra = ''): string =>
    '<span class="hd-node sd-node' + extra + '" tabindex="0" data-node="' + node.id + '" style="left:' + across(node.x) + ';top:' + node.y + 'px;width:' + across(node.w) + '">' +
    (node.first === true ? '' : '<span class="hd-port hd-in"></span>') + (node.last === true ? '' : '<span class="hd-port hd-out"></span>') +
    '<span class="hd-icon hd-icon-' + tone + '">' + icon + '</span>' +
    '<span class="hd-text"><span class="hd-label">' + label + '</span>' + (sub === '' ? '' : '<span class="hd-sub">' + sub + '</span>') + '</span></span>';

  const toneOf = (reach: Reach | undefined): string => reach === 'read' ? 'coral' : reach === 'stopped' ? 'mint' : 'grey';
  const nodes: Box[] = [
    { id: 'you', ...you, y: middle, first: true },
    { id: 'a0', ...ai, y: middle },
    ...helpers.map((holder, row): Box => ({ id: 'h' + holder.agent.index, x: (help as { x: number }).x, w: (help as { w: number }).w, y: TOP + (row + below) * ROW })),
    { id: 'file', ...file, y: middle, ...(company === undefined ? { last: true } : {}) },
    ...(company === undefined ? [] : [{ id: 'company', ...company, y: middle, last: true }]),
  ];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const idOf = (holder: StoryHolder): string => holder.agent.ordinal === undefined ? 'a0' : 'h' + holder.agent.index;
  const parentOf = (holder: StoryHolder): string => {
    const by = holder.agent.broughtBy;
    const parent = by === undefined || by === 'main' ? undefined : helpers.find((each) => each.agent.ordinal === by);
    return parent === undefined ? 'a0' : idOf(parent);
  };

  const edges: { from: string; to: string; kind: 'work' | Reach }[] = [
    { from: 'you', to: 'a0', kind: 'work' },
    ...helpers.map((holder) => ({ from: parentOf(holder), to: idOf(holder), kind: 'work' as const })),
    ...[...(main === undefined ? [] : [main]), ...helpers].flatMap((holder) => {
      const reach = reachOf(holder, story);
      return reach === undefined ? [] : [{ from: idOf(holder), to: 'file', kind: reach }];
    }),
    ...(exposed ? [{ from: 'file', to: 'company', kind: 'read' as const }] : []),
  ];
  const centre = (node: Box): number => node.y + NODE_HEIGHT / 2;
  const path = (from: Box, to: Box): string => {
    // A helper brought in by another helper stands in the same column: its line bows out to the left, clear of both boxes.
    if (from.x === to.x) return 'M' + from.x + ',' + centre(from) + ' C' + (from.x - 40) + ',' + centre(from) + ' ' + (to.x - 40) + ',' + centre(to) + ' ' + to.x + ',' + centre(to);
    const [x1, y1, x2, y2] = [from.x + from.w, centre(from), to.x, centre(to)];
    const d = (x2 - x1) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + (x1 + d) + ',' + y1 + ' ' + (x2 - d) + ',' + y2 + ' ' + x2 + ',' + y2;
  };
  const lines = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from === undefined || to === undefined ? [] : ['<path class="hd-edge hd-' + edge.kind + '" data-from="' + edge.from + '" data-to="' + edge.to + '" d="' + path(from, to) + '"/>'];
  });

  const kinds = new Set(edges.map((edge) => edge.kind));
  const key = (kind: 'work' | Reach, words: string): string => kinds.has(kind) ? '<span><span class="hd-key hd-key-' + kind + '"></span>' + inLanguages((t) => t(words)) + '</span>' : '';
  const legend = '<div class="hd-legend">' + key('read', 'st.d.legendRead') + key('named', 'hp.key.named') + key('stopped', 'hp.key.stopped') + key('work', 'st.d.legendWork') + '</div>';

  const at = (id: string): Box => byId.get(id) as Box;
  const boxes =
    box(at('you'), 'You', 'you', inLanguages((t) => t('st.you')), inLanguages((t) => t('st.d.asked'))) +
    box(at('a0'), 'AI', toneOf(mainReach), inLanguages((t) => t('st.main')), main === undefined ? '' : didOf(main, story, keys), mainReach === 'read' ? ' hd-risk' : '') +
    helpers.map((holder) => {
      const reach = reachOf(holder, story);
      return box(at(idOf(holder)), initialsOf(holder.agent), toneOf(reach), inLanguages((t) => whoOf(holder.agent, t)), didOf(holder, story, keys), reach === 'read' ? ' hd-risk' : '');
    }).join('') +
    (exposed || subject.look === undefined
      ? box(at('file'), subject.everyday === true ? '·' : '!', subject.everyday === true ? 'grey' : 'coral',
        '<span class="hd-mono">' + e(names(subject.path)) + '</span>', inLanguages((t) => t(fileSub(subject))), subject.everyday === true ? '' : ' hd-risk')
      : box(at('file'), subject.look.glyph, subject.look.tone, '<span class="hd-mono">' + e(names(subject.path)) + '</span>', inLanguages((t) => t(fileSub(subject))))) +
    (company === undefined ? '' : box(at('company'), '↗', subject.everyday === true ? 'grey' : 'company',
      inLanguages((t) => t(subject.everyday === true ? 'st.company.everyday' : 'st.company')), inLanguages((t) => t('st.d.company')),
      subject.everyday === true ? '' : ' sd-company'));

  return '<div class="hd-scroll sd-diagram"><div class="hd-board" data-diagram style="min-width:' + Math.round(width * 0.8) + 'px;height:' + height + 'px">' +
    '<svg class="hd-lines" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">' + lines.join('') + '</svg>' +
    legend + boxes + '</div></div>' +
    '<p class="hd-hint js-only">' + inLanguages((t) => t('st.d.hint')) + '</p>';
}

/** P16: the numbers, every record in order, what each AI did, and the file's details - for a developer. */
function recordPanel(story: FileStory, subject: StorySubject, sessionId: string, clock: Clock, names: FileNames): string {
  const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const lines = sentences(story.entries, subject.keys, names);
  const numbers = stats([
    { label: label('st.stat.opened'), value: String(story.opened) },
    // Coral counts a private file's readers. On a file nobody marked private it would colour an ordinary read as a
    // finding, and the row beside it says there is nothing to do (EF1).
    { label: label('st.stat.readers'), value: String(story.readers), ...(subject.everyday === true ? {} : { tone: 'coral' as const }) },
    { label: label('st.stat.stopped'), value: String(story.stopped) },
    { label: label('st.stat.record'), value: label(story.complete ? 'st.complete' : 'st.gaps'), ...(story.complete ? { tone: 'mint' as const } : {}) },
  ], 'record');

  const heading = (title: string, note: string): string => '<div class="sw-rec-head"><span class="sw-rec-title">' + title + '</span><span class="sw-rec-note">' + note + '</span></div>';
  const cells = (values: readonly string[]): string => values.map((value) => '<span>' + value + '</span>').join('');

  // P16, M4: a Time column where the record has times, and the note that says what they are.
  const timed = story.entries.some((entry) => entry.at !== undefined);
  const every = heading(label('st.rec.every'), label('st.rec.count', { n: story.entries.length })) +
    (timed ? '<p class="sw-times-note">' + label('st.rec.timesNote') + '</p>' : '') +
    '<div class="sw-table"><div class="sw-grid sw-grid-every' + (timed ? ' sw-grid-timed' : '') + ' sw-grid-head">' +
    cells(['st.col.n', ...(timed ? ['st.col.time'] : []), 'st.col.who', 'st.col.what', 'st.col.tool', 'st.col.result', 'st.col.evidence'].map((key) => label(key))) + '</div>' +
    story.entries.map((entry, at) => '<div class="sw-grid sw-grid-every' + (timed ? ' sw-grid-timed' : '') + '">' +
      '<span class="sw-mono sw-dim">' + (at + 1) + '</span>' +
      (timed ? '<span class="sw-mono">' + (entry.at === undefined ? '<span class="sw-dim">—</span>' : e(clock.time(entry.at))) + '</span>' : '') +
      '<span class="sw-who-cell"><span class="sw-dot' + (entry.agent.ordinal === undefined ? '' : ' sw-dot-grey') + '"></span>' + inLanguages((t) => whoOf(entry.agent, t)) + '</span>' +
      '<span>' + inLanguages((t) => lines[at]?.title(t) ?? '') + '</span>' +
      '<span>' + (entry.did === undefined ? '<span class="sw-dim">—</span>' : '<span class="sw-tool">' + e(entry.did) + '</span>') + '</span>' +
      '<span>' + tag(label('st.res.' + entry.outcome), entry.outcome === 'succeeded' ? 'mint' : entry.outcome === 'blocked' ? 'grey' : 'coral', 'sm') + '</span>' +
      '<span class="sw-mono sw-dim">' + entry.evidence.map((one) => e(one)).join(' – ') + '</span></div>').join('') +
    '</div>' +
    // EF8: a story stops at the calls a window is worth, and the rest are counted - never dropped in silence.
    (story.leftOut === undefined ? '' : '<p class="sw-times-note">' + label('st.rec.leftOut', { n: story.leftOut }) + '</p>');

  const yes = (on: boolean): string => '<span class="sw-yn' + (on ? ' sw-yes' : '') + '">' + label(on ? 'st.yes' : 'st.no') + '</span>';
  // EF4: agentwhy follows a value out of a protected file only, so for any other file these four were never looked for.
  // "No" would be a claim it cannot support, and invariant 4 forbids exactly that.
  const followed = (on: boolean): string => story.traced ? yes(on) : '<span class="sw-yn sw-untracked">' + label('st.untracked') + '</span>';
  const roleOf = (agent: StoryAgent, t: Translate): string =>
    agent.ordinal === undefined ? t('st.role.main')
      : agent.broughtBy === undefined ? t('st.role.helperAny')
        : t('st.role.helper', { who: agent.broughtBy === 'main' ? t('st.mainLower') : t('st.helper', { ordinal: agent.broughtBy }) });
  const each = heading(label('st.rec.each'), label('st.rec.yes')) +
    '<div class="sw-table"><div class="sw-grid sw-grid-each sw-grid-head">' +
    cells(['st.col.who', 'st.col.role', 'st.col.read', 'st.col.passed', 'st.col.saved', 'st.col.repeated', 'st.col.used', 'st.col.actions'].map((key) => label(key))) + '</div>' +
    story.holders.map((holder) => '<div class="sw-grid sw-grid-each">' +
      '<span class="sw-strong">' + inLanguages((t) => whoOf(holder.agent, t)) + '</span>' +
      '<span class="sw-dim">' + inLanguages((t) => roleOf(holder.agent, t)) + '</span>' +
      '<span>' + yes(holder.read) + '</span>' +
      [holder.passed, holder.saved, holder.repeated, holder.used].map((on) => '<span>' + followed(on) + '</span>').join('') +
      '<span class="sw-mono">' + holder.agent.actions + '</span></div>').join('') +
    '</div>';

  const rule = ruleKey(subject.pattern);
  const fact = (key: string, value: string, mono: boolean): string =>
    '<div class="sw-fact"><span class="sw-fact-key">' + label(key) + '</span><span class="sw-fact-value' + (mono ? ' sw-mono' : '') + '">' + value + '</span></div>';
  const details = '<div class="sw-rec-title sw-rec-alone">' + label('st.rec.details') + '</div><div class="sw-facts">' +
    fact('st.fact.path', e(subject.path), true) +
    fact('st.fact.rule', subject.pattern === undefined ? '—' : e(subject.pattern), true) +
    // EF1: a file no rule marks private has no answer to "why it's private", and is not given one.
    (subject.everyday === true ? '' : fact('st.fact.why', label(rule === undefined ? 'st.why.other' : rule.replace('rule.', 'st.why.')), false)) +
    fact('st.fact.session', e(sessionId), true) +
    fact('st.fact.complete', label(story.complete ? 'st.complete.yes' : 'st.complete.no'), false) +
    '</div>';

  return numbers + every + each + details;
}

export const STORY_WINDOW_STYLE = String.raw`
.sw-head{padding:26px 32px 0}
.sw-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
.sw-id{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.sw-chip{font-family:var(--mono);font-size:14px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:3px 8px}
.sw-kind{font-size:14px;color:var(--text-2)}
.sw-h2{margin:0 0 6px;font-size:32px;line-height:1.15;letter-spacing:-0.02em;font-weight:650;text-wrap:balance}
.sw-summary{margin:0 0 22px;font-size:16px;line-height:1.5;color:var(--text-2)}
.sw-context{margin:-12px 0 22px;font-size:14px;line-height:1.5;color:var(--text-3)}
.sw-body{padding:0 32px 30px}
.sw-body>.tabs>.tabs-bar{margin-left:auto;margin-right:auto}
.sw-story{list-style:none;margin:0 auto;padding:0;display:flex;flex-direction:column;max-width:720px}
.sw-ev{display:grid;grid-template-columns:40px minmax(0,1fr);gap:14px}
.sw-ev.sw-timed{grid-template-columns:64px 40px minmax(0,1fr)}
.sw-time{font-family:var(--mono);font-size:12.5px;color:var(--text-3);padding-top:11px;text-align:right}
.sw-times-note{margin:-4px 0 12px;font-size:13px;color:var(--text-3)}
.sw-grid-every.sw-grid-timed{grid-template-columns:44px 84px 130px minmax(0,1.5fr) minmax(0,1.2fr) 120px 180px;min-width:980px}
@media (max-width:640px){.sw-ev.sw-timed{grid-template-columns:52px 40px minmax(0,1fr);gap:10px}}
.sw-rail{display:flex;flex-direction:column;align-items:center}
.sw-line{flex:1;width:1.5px;background:var(--coral-30);margin:4px 0}
.sw-ev-body{padding:2px 0 22px}
.sw-who{font-size:13px;font-weight:600;color:var(--text-3);margin-bottom:3px}.sw-ev-alert .sw-who{color:var(--coral-text)}
.sw-ev-title{font-size:16px;font-weight:600;line-height:1.4}
.sw-ev-sub{font-size:14.5px;line-height:1.5;color:var(--text-2);margin-top:3px;text-wrap:pretty}
.sw-ev-sub code{font-family:var(--mono);font-size:13.5px;color:var(--text)}
.sd-diagram .hd-node{height:64px;cursor:default;transition:opacity .15s,border-color .15s,transform .15s,box-shadow .15s}
.sd-diagram .hd-node:hover,.sd-diagram .hd-node:focus-visible{border-color:var(--white-40);transform:translateY(-1px);box-shadow:0 10px 26px var(--node-shadow);outline:none}
.sd-diagram .hd-risk:hover,.sd-diagram .hd-risk:focus-visible{border-color:var(--coral)}
.sd-diagram .hd-sub{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.3}
.sd-company{background:var(--coral-12);border-color:var(--coral)}
.sd-diagram .hd-icon-amber{background:var(--amber-16);color:var(--amber)}
.sd-diagram .hd-icon-sand{background:var(--sand-16);color:var(--sand)}.sd-diagram .hd-icon-blue{background:var(--blue-16);color:var(--blue)}
.sd-company .hd-label{color:var(--coral-text)}.sd-company .hd-sub{color:var(--text-soft)}
.hd-icon-company{background:var(--coral);color:var(--on-coral)}
.sw-rec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px}
.sw-rec-title{font-size:16px;font-weight:650}.sw-rec-alone{margin-bottom:12px}
.sw-rec-note{font-size:13px;color:var(--text-3)}
.sw-table{border-radius:14px;border:1px solid var(--white-09);overflow:auto;margin-bottom:32px}
.sw-grid{display:grid;gap:16px;padding:15px 18px;border-bottom:1px solid var(--white-06);align-items:center;font-size:14.5px}
.sw-grid:last-child{border-bottom:none}
.sw-grid-head{padding:12px 18px;background:var(--panel);font-size:12.5px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--white-08)}
.sw-grid-every{grid-template-columns:44px 130px minmax(0,1.5fr) minmax(0,1.2fr) 120px 180px;min-width:900px}
.sw-grid-each{grid-template-columns:minmax(0,1.2fr) minmax(0,1.3fr) repeat(5,110px) 90px;min-width:1000px}
.sw-mono{font-family:var(--mono);font-size:13px}
.sw-dim{color:var(--text-3)}
.sw-strong{font-size:15px;font-weight:600}
.sw-who-cell{display:flex;align-items:center;gap:8px;font-weight:600}
.sw-dot{width:8px;height:8px;border-radius:50%;background:var(--coral);flex:none}.sw-dot-grey{background:var(--white-35)}
.sw-tool{font-family:var(--mono);font-size:13px;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:3px 8px}
.sw-yn{font-size:12px;font-weight:700;border-radius:999px;padding:4px 11px;color:var(--text-2);background:var(--white-07)}
.sw-untracked{font-size:11px;letter-spacing:0.02em;color:var(--text-3);background:transparent;border:1px solid var(--white-12)}
.sw-yes{color:var(--on-coral);background:var(--coral)}
.sw-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));border-radius:14px;border:1px solid var(--white-09);overflow:hidden}
.sw-fact{display:grid;grid-template-columns:150px minmax(0,1fr);gap:14px;padding:14px 18px;border-bottom:1px solid var(--white-06);border-right:1px solid var(--white-06);align-items:baseline}
.sw-fact-key{font-size:13.5px;color:var(--text-3)}
.sw-fact-value{font-size:14px;color:var(--text);word-break:break-all}
@media (max-width:640px){.sw-head{padding:22px 20px 0}.sw-body{padding:0 20px 24px}.sw-h2{font-size:26px}}
`;
