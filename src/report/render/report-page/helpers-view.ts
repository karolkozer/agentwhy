// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';
import { inLanguages, labelAttributes, type Translate } from '../report-copy.ts';
import { avatar, type AvatarTone } from '../ui/avatar.ts';
import { pill } from '../ui/button.ts';
import { drawer } from '../ui/drawer.ts';
import { foldLine } from '../ui/fold-line.ts';
import { hero } from '../ui/hero.ts';
import { pillTabs } from '../ui/pill-tabs.ts';
import { LOOKS } from '../ui/status-look.ts';
import { opener, opens } from '../ui/popup.ts';
import type { StoryAgent } from './file-story.ts';
import { helperViews, type HelperReach, type HelperView } from './helpers.ts';
import { titleOf, type FileNames } from './item-names.ts';
import type { ToDoItem } from './to-do.ts';
import { fixId, storyId } from './to-do-view.ts';

/**
 * "Helpers" (the report page spec P26-P30; design file *agentwhy App*): who your AI brought in, and which of them saw your
 * private files - as the diagram of guidelines §4, shown first, and as a list, where what saw nothing real is folded
 * away. Each AI opens its drawer.
 */
export function helpersView(report: Parameters<typeof helperViews>[0], items: readonly ToDoItem[], names: FileNames): string {
  const views = helperViews(report);
  const helpers = views.filter((view) => view.agent.ordinal !== undefined);
  // With no helper, your AI still did the work: the same list and diagram, of it alone.
  const heading = helpers.length === 0 ? aloneHeading(report, views[0] as HelperView) : helpersHeading(helpers);

  return '<div class="hv' + (heading.tone === 'mint' ? ' hv-clean' : heading.tone === 'amber' ? ' hv-amber' : heading.tone === 'blue' ? ' hv-blue' : '') + '">' +
    hero({ eyebrow: inLanguages((t) => t('hp.eyebrow')), fact: heading.fact, action: heading.action, lead: heading.lead }) +
    pillTabs([
      { label: inLanguages((t) => t('hp.tab.diagram')), panel: diagramPanel(views, items, names) },
      { label: inLanguages((t) => t('hp.tab.list')), panel: listPanel(views) },
    ], 'page') + '</div>';
}

interface Heading {
  readonly fact: string;
  readonly action: string;
  readonly lead: string;
  /** The second line's colour (guidelines §2): coral for a problem, blue for a name only, amber for what is not known, mint for safe. */
  readonly tone: 'coral' | 'amber' | 'blue' | 'mint';
}

/** P26: how many helpers, and how many of them read something private. */
function helpersHeading(helpers: readonly HelperView[]): Heading {
  const readers = helpers.filter((view) => view.status === 'read').length;
  return {
    fact: inLanguages((t) => t('hp.fact', { n: helpers.length })),
    action: readers === 0 ? inLanguages((t) => t('hp.noneRead'))
      : readers === helpers.length ? inLanguages((t) => t('hp.all', { n: helpers.length }))
        : inLanguages((t) => t('hp.some', { n: readers })),
    lead: inLanguages((t) => t('hp.lead')),
    tone: readers === 0 ? 'mint' : 'coral',
  };
}

/**
 * P26 with no helper: your AI worked alone, and what it did to private files, said for each status it can have.
 * "Worked alone" only where the record could have shown a helper: a delegation whose helper is not recorded, a partial
 * record, or no action of your AI at all say "no helper's work was recorded" instead (invariant 4).
 */
function aloneHeading(report: Parameters<typeof helperViews>[0], main: HelperView): Heading {
  const unsure = main.status === 'empty' || report.delegations.length > 0 || report.unattributedAgents.length > 0 || report.scope.completeness !== 'complete';
  const n = main.files.filter((file) => file.reach === (main.status === 'read' ? 'read' : 'named')).length;
  return {
    fact: inLanguages((t) => t(unsure ? 'hp.alone.unsure' : 'hp.alone.fact')),
    action: inLanguages((t) => t('hp.alone.' + main.status, { n })),
    lead: inLanguages((t) => t(main.status === 'empty' ? 'hp.alone.empty.lead' : unsure ? 'hp.alone.unsure.lead' : 'hp.alone.lead')),
    tone: main.status === 'read' ? 'coral' : main.status === 'named' ? 'blue' : main.status === 'unknown' || main.status === 'empty' ? 'amber' : 'mint',
  };
}

/**
 * Every AI's drawer. Written outside the views, beside the page's other windows: Advanced and the diagram open them too,
 * and a window inside a view that is not shown would open and not be seen.
 */
export function helperDrawers(report: Parameters<typeof helperViews>[0], items: readonly ToDoItem[], done: ReadonlySet<string>, names: FileNames): string {
  return helperViews(report).map((view, at) => helperDrawer(view, at, items, done, names)).join('');
}

const helperId = (at: number): string => 'helper-' + at;

function whoOf(agent: StoryAgent, t: Translate): string {
  return agent.ordinal === undefined ? t('st.main') : t('st.helper', { ordinal: agent.ordinal });
}

function initialsOf(agent: StoryAgent): string {
  return agent.ordinal === undefined ? 'AI' : 'H' + agent.ordinal;
}

function toneOf(view: HelperView): AvatarTone {
  return view.status === 'read' ? 'coral' : view.status === 'stopped' ? 'mint' : 'grey';
}

/** "The AI you talked to", or who brought a helper in, where the record says. */
function roleOf(agent: StoryAgent, t: Translate): string {
  return agent.ordinal === undefined ? t('st.role.main')
    : agent.broughtBy === undefined ? t('st.role.helperAny')
      : t('st.role.helper', { who: agent.broughtBy === 'main' ? t('st.mainLower') : t('st.helper', { ordinal: agent.broughtBy }) });
}

function lineOf(view: HelperView, t: Translate): string {
  return view.status === 'read' ? t('hp.line.read', { n: view.files.filter((file) => file.reach === 'read').length }) : t('hp.line.' + view.status);
}

/**
 * P28: your AI's card first, then, hanging from it on the diagram's grey "gave work to" line, a card per helper that
 * read a private file, then, folded, the helpers that saw nothing real. Your AI is never folded, and neither is an AI
 * whose outcome is not recorded: "nothing real" is not said of it.
 */
function listPanel(views: readonly HelperView[]): string {
  const card = (view: HelperView, at: number): string =>
    '<a class="hl-card' + (view.status === 'read' ? ' hl-risk' : '') + '"' + opens(helperId(at)) + '>' +
    avatar(initialsOf(view.agent), toneOf(view), 42) +
    '<span class="hl-text"><span class="hl-name">' + inLanguages((t) => whoOf(view.agent, t)) +
    // Who brought a helper in, beside its name: the line it hangs from says it was brought in, this says by whom.
    (view.agent.ordinal === undefined ? '' : '<span class="hl-by">' + inLanguages((t) => roleOf(view.agent, t)) + '</span>') + '</span>' +
    '<span class="hl-line">' + inLanguages((t) => lineOf(view, t)) + '</span></span>' +
    '<span class="hl-see">' + inLanguages((t) => t('hp.seeWhat')) + '</span></a>';
  const branch = (inner: string, fold = false): string =>
    '<div class="hl-branch' + (fold ? ' hl-branch-fold' : '') + '"><span class="hl-arrow" aria-hidden="true"></span>' + inner + '</div>';
  const indexed = views.map((view, at) => ({ view, at }));
  // Neither an outcome not recorded nor actions not recorded is "nothing real": both stay on the list (invariant 4).
  const folded = ({ view }: { view: HelperView }): boolean => view.agent.ordinal !== undefined && view.status !== 'read' && view.status !== 'unknown' && view.status !== 'empty';
  const shown = indexed.filter((each) => !folded(each) && each.view.agent.ordinal !== undefined);
  const rest = indexed.filter(folded);
  const fold = rest.length === 0 ? [] : [branch('<div class="hl-fold">' + foldLine({
    summary: inLanguages((t) => t('hp.safe', { n: rest.length })),
    body: '<div class="hl-list">' + rest.map(({ view, at }) => card(view, at)).join('') + '</div>',
  }) + '</div>', true)];
  const children = [...shown.map(({ view, at }) => branch(card(view, at))), ...fold];
  return '<div class="hl-list">' + card(views[0] as HelperView, 0) +
    (children.length === 0 ? '' : '<div class="hl-tree">' + children.join('') + '</div>') + '</div>';
}

/**
 * Node geometry, drawn on a board 1138 wide: four columns, boxes of 240 by 56, a row every 74. You and your AI are
 * one box each and say little, so theirs are narrower, and what that frees goes to the gaps before the helpers and the
 * files, where the lines cross. The board then takes the page's width, and every x and width with it, from 0.8 to 1.6
 * times its own.
 */
const NODE_WIDTH = 240;
const START_WIDTH = 170;
const MAIN_WIDTH = 200;
const COLUMNS = [24, 224, 524, 874] as const;
const rowY = (row: number): number => 90 + row * 74;

interface DiagramNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly sub: string;
  readonly icon: string;
  readonly tone: 'coral' | 'mint' | 'sand' | 'blue' | 'grey' | 'you';
  readonly mono?: boolean;
  /** What a click opens; absent for a box that opens nothing. */
  readonly opens?: string;
  readonly first?: boolean;
  readonly last?: boolean;
}

/**
 * P29: Start → your AI → the helpers → the private files, on dots. With no helper: Start → your AI → the files. A line is coral where it read, dashed blue where it
 * only saw a name or the outcome is not recorded (one key in the legend), dashed mint where it was stopped, grey where work was handed over.
 * Drawn in the page with no script; the script only dims what a hovered box is not joined to.
 */
function diagramPanel(views: readonly HelperView[], items: readonly ToDoItem[], names: FileNames): string {
  const main = views[0] as HelperView;
  const helpers = views.slice(1);
  const files = [...new Map(views.flatMap((view) => view.files).map((file) => [file.path as string, file.path])).values()];
  const height = 90 + Math.max(helpers.length, files.length, 1) * 74 + 20;
  // A column is headed only where it has boxes: with no helper the files move up beside your AI, and no heading stands
  // over an empty column. The board keeps the width of its files' column, so the legend always has room.
  const filesX = helpers.length === 0 ? COLUMNS[2] : COLUMNS[3];
  const columns = [
    { key: 'hp.col.start', x: COLUMNS[0] },
    { key: 'hp.col.main', x: COLUMNS[1] },
    ...(helpers.length === 0 ? [] : [{ key: 'hp.col.helpers', x: COLUMNS[2] }]),
    ...(files.length === 0 ? [] : [{ key: 'hp.col.files', x: filesX }]),
  ];
  const middle = (90 + height - 20 - 74) / 2;
  const itemAt = (path: string): number => items.findIndex((item) => item.path === path);

  const nodes: DiagramNode[] = [
    { id: 'you', x: COLUMNS[0], y: middle, label: inLanguages((t) => t('st.you')), sub: inLanguages((t) => t('hp.you.sub')), icon: 'You', tone: 'you', first: true },
    {
      id: 'a0', x: COLUMNS[1], y: middle, label: inLanguages((t) => t('st.main')), sub: inLanguages((t) => lineOf(main, t)), icon: 'AI',
      tone: main.status === 'read' ? 'coral' : 'grey', opens: helperId(0),
      // No line leaves it: no connector dot on its right promises one.
      ...(helpers.length === 0 && files.length === 0 ? { last: true } : {}),
    },
    ...helpers.map((view, row): DiagramNode => ({
      id: 'a' + (row + 1), x: COLUMNS[2], y: rowY(row), label: inLanguages((t) => whoOf(view.agent, t)),
      sub: view.agent.askedTo === undefined ? inLanguages((t) => lineOf(view, t)) : e(view.agent.askedTo),
      icon: initialsOf(view.agent), tone: view.status === 'read' ? 'coral' : view.status === 'stopped' ? 'mint' : 'grey', opens: helperId(row + 1),
    })),
    ...files.map((path, row): DiagramNode => {
      const at = itemAt(path);
      const item = items[at];
      const reach = strongest(views, path);
      return {
        id: 'f' + row, x: filesX, y: rowY(row), label: e(names(path)), mono: true, last: true,
        sub: item === undefined ? inLanguages((t) => t('hp.file.' + reach)) : inLanguages((t, lang) => titleOf(item, t, lang)),
        // One meaning, one look (`status-look.ts`): a tracked file read is the table's sand tick, a name seen its blue
        // eye, a file opened without being read its blue ring, and what was stopped or not recorded the mint tick this
        // box has always drawn.
        icon: item !== undefined ? '!' : reach === 'named' ? LOOKS.name.glyph : reach === 'opened' ? LOOKS.opened.glyph : LOOKS.allowed.glyph,
        tone: item !== undefined ? 'coral' : reach === 'read' ? 'sand' : reach === 'named' || reach === 'opened' ? 'blue' : 'mint',
        ...(item === undefined ? {} : { opens: storyId(at) }),
      };
    }),
  ];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: { from: string; to: string; kind: 'work' | HelperReach }[] = [
    { from: 'you', to: 'a0', kind: 'work' },
    ...helpers.map((view, row) => ({ from: parentNode(view, helpers), to: 'a' + (row + 1), kind: 'work' as const })),
    ...views.flatMap((view, at) => view.files.map((file) => ({ from: 'a' + at, to: 'f' + files.indexOf(file.path), kind: file.reach }))),
  ];
  const width = filesX + NODE_WIDTH + 24;
  // Across, the board is as wide as the page: an x is a share of it, and the lines stretch with the boxes.
  const across = (x: number): string => Number((x / width * 100).toFixed(3)) + '%';
  const widthOf = (node: DiagramNode): number => node.first === true ? START_WIDTH : node.id === 'a0' ? MAIN_WIDTH : NODE_WIDTH;
  // The two narrow boxes keep their words: a second line for them, the box as much taller, and its middle where it was.
  const narrow = (node: DiagramNode): boolean => widthOf(node) < NODE_WIDTH;
  const path = (from: DiagramNode, to: DiagramNode): string => {
    const x1 = from.x + widthOf(from);
    const y1 = from.y + 28;
    const x2 = to.x;
    const y2 = to.y + 28;
    const d = (x2 - x1) / 2;
    return 'M' + x1 + ',' + y1 + ' C' + (x1 + d) + ',' + y1 + ' ' + (x2 - d) + ',' + y2 + ' ' + x2 + ',' + y2;
  };
  const lines = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    return from === undefined || to === undefined ? [] : ['<path class="hd-edge hd-' + edge.kind + '" data-from="' + edge.from + '" data-to="' + edge.to + '" d="' + path(from, to) + '"/>'];
  });
  const box = (node: DiagramNode): string => {
    const inner = (node.first === true ? '' : '<span class="hd-port hd-in"></span>') + (node.last === true ? '' : '<span class="hd-port hd-out"></span>') +
      '<span class="hd-icon hd-icon-' + node.tone + '">' + node.icon + '</span>' +
      '<span class="hd-text"><span class="hd-label' + (node.mono === true ? ' hd-mono' : '') + '">' + node.label + '</span>' +
      '<span class="hd-sub' + (node.tone === 'coral' ? ' hd-sub-coral' : '') + '">' + node.sub + '</span></span>';
    const at = ' class="hd-node' + (node.tone === 'coral' ? ' hd-risk' : '') + (narrow(node) ? ' hd-narrow' : '') + '" data-node="' + node.id + '"' +
      ' style="left:' + across(node.x) + ';top:' + (narrow(node) ? node.y - 8 : node.y) + 'px;width:' + across(widthOf(node)) + '"';
    return node.opens === undefined ? '<span' + at + '>' + inner + '</span>' : '<a' + at + opens(node.opens) + '>' + inner + '</a>';
  };
  const legend = '<div class="hd-legend">' + (['read', 'named', 'stopped', 'work'] as const).map((kind) =>
    '<span><span class="hd-key hd-key-' + kind + '"></span>' + inLanguages((t) => t('hp.key.' + kind)) + '</span>').join('') + '</div>';
  const headings = columns.map(({ key, x }) =>
    '<span class="hd-col" style="left:' + across(x) + '">' + inLanguages((t) => t(key)) + '</span>').join('');

  return '<div class="hd-scroll"><div class="hd-board" data-diagram style="min-width:' + Math.round(width * 0.8) + 'px;max-width:' + Math.round(width * 1.6) + 'px;height:' + height + 'px">' +
    '<svg class="hd-lines" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">' + lines.join('') + '</svg>' +
    legend + headings + nodes.map(box).join('') + '</div></div>' +
    '<p class="hd-hint js-only">' + inLanguages((t) => t('hp.hint')) + '</p>';
}

/** Who a helper's line starts from: the helper that brought it in, where the record names one, else your AI. */
function parentNode(view: HelperView, helpers: readonly HelperView[]): string {
  const by = view.agent.broughtBy;
  if (by === undefined || by === 'main') return 'a0';
  const at = helpers.findIndex((each) => each.agent.ordinal === by);
  return at < 0 ? 'a0' : 'a' + (at + 1);
}

/**
 * What was done to a file, for its box, strongest first: read, an outcome not recorded, its name seen, stopped - the
 * ladder the Files tab climbs. Found 2026-10-07 by the maintainer: this read three of the four and fell back to
 * `stopped`, so a tracked file the AI had read - which asks for nothing, and so has no row on the to-do list to take
 * the caption from - was drawn "Stopped in time" beside a table saying "Read it", on one page.
 */
function strongest(views: readonly HelperView[], path: string): HelperReach {
  const reaches = views.flatMap((view) => view.files.filter((file) => file.path === path).map((file) => file.reach));
  // Every reach there is, strongest first, and `stopped` only where nothing else was found: a value this list forgets
  // is drawn as a stop, which is what a tracked read was until this was written (2026-10-07, twice).
  for (const reach of ['read', 'unknown', 'opened', 'named'] as const) if (reaches.includes(reach)) return reach;
  return 'stopped';
}

/**
 * P30: the drawer of one AI - its job as it was asked, whether it opened a private file, what it did next, the same
 * facts in sentences (F53: no model), and the way to the files it read.
 */
function helperDrawer(view: HelperView, at: number, items: readonly ToDoItem[], done: ReadonlySet<string>, names: FileNames): string {
  const label = (key: string, vars: Record<string, string | number> = {}): string => inLanguages((t) => t(key, vars));
  const read = view.files.filter((file) => file.reach === 'read').map((file) => file.path);
  const yes = view.status === 'read';
  const job = '<div><div class="hw-label">' + label('hp.job') + '</div><div class="hw-job">' +
    (view.agent.ordinal === undefined ? label('hp.mainJob') : view.agent.askedTo === undefined ? label('st.sub.notAsked') : '“' + e(view.agent.askedTo) + '”') + '</div></div>';
  const box = '<div class="hw-box' + (yes ? ' hw-yes' : '') + '"><div class="hw-q">' + label('hp.opened') + '</div>' +
    '<div class="hw-a">' + label(yes ? 'hp.yes' : 'hp.no') + '</div><div class="hw-text">' + label('hp.answer.' + view.status) + '</div>' +
    (yes ? '<div class="hw-chips">' + read.map((path) => '<span class="hw-chip" title="' + e(path) + '">' + e(names(path)) + '</span>').join('') + '</div>' : '') + '</div>';
  // What it did next is said wherever something went on from it - an AI that never opened the file can still have
  // saved or sent on a value it was given, and a drawer that hid that would read as "stayed away" alone.
  const wentOn = view.passed || view.passedUnknown || view.saved || view.repeated || view.used;
  const next = yes || wentOn ? '<div><div class="hw-label">' + label('hp.next') + '</div>' +
    ([['hp.next.passed', view.passed ? 'yes' : view.passedUnknown ? 'unknown' : 'no'], ['hp.next.saved', view.saved ? 'yes' : 'no'],
      ['hp.next.repeated', view.repeated ? 'yes' : 'no'], ['hp.next.used', view.used ? 'yes' : 'no']] as const).map(([key, answer]) =>
      '<div class="hw-row"><span>' + label(key) + '</span><span class="sw-yn' + (answer === 'yes' ? ' sw-yes' : answer === 'unknown' ? ' hw-unknown' : '') + '">' +
      label(answer === 'yes' ? 'st.yes' : answer === 'unknown' ? 'st.unknownYn' : 'st.no') + '</span></div>').join('') + '</div>' : '';

  // F53: the facts again, as sentences. Said only where there is something beyond the job and the answer above.
  const sentences = (t: Translate): string[] => [
    ...(view.agent.broughtBy === undefined ? [] : [t('hp.ex.brought', { who: view.agent.broughtBy === 'main' ? t('st.main') : t('st.helper', { ordinal: view.agent.broughtBy }) })]),
    ...(read.length === 0 ? [] : [t('hp.ex.read', { files: read.map((path) => '<code>' + e(names(path)) + '</code>').join(', ') })]),
    ...(view.passed ? [t('hp.ex.passed')] : []),
    ...(view.saved ? [t('hp.ex.saved')] : []),
    ...(view.repeated ? [t('hp.ex.repeated')] : []),
    ...(view.used ? [t('hp.ex.used')] : []),
    ...(read.length === 0 ? [] : [t('hp.ex.company')]),
  ];
  const explain = read.length === 0 && !wentOn ? '' :
    '<details class="hw-explain"><summary class="text-link">' + label('hp.explain') + '</summary><div class="hw-explained">' +
    inLanguages((t) => sentences(t).join(' ')) + '</div></details>';

  const firstToFix = items.findIndex((item) => read.some((path) => path === item.path) && !done.has(item.path));
  const anyToFix = firstToFix >= 0 ? firstToFix : items.findIndex((item) => read.some((path) => path === item.path));
  const foot = !yes || anyToFix < 0 ? undefined
    : pill({ label: label('hp.fix'), tone: 'primary', size: 'lg', href: '#' + fixId(anyToFix), attributes: opener(fixId(anyToFix)) });

  return drawer({
    id: helperId(at),
    labelledBy: helperId(at) + '-title',
    tone: view.status === 'read' ? 'coral' : view.status === 'stopped' ? 'mint' : view.status === 'none' ? 'grey' : view.status === 'named' ? 'blue' : 'amber',
    title: inLanguages((t) => whoOf(view.agent, t)),
    sub: inLanguages((t) => roleOf(view.agent, t)),
    body: job + box + next + explain + '<p class="hw-note">' + label('st.foot') + '</p>',
    ...(foot === undefined ? {} : { foot }),
    closeLabel: labelAttributes((t) => t('app.close')),
  });
}

/** P29, P15: a hovered box keeps its own lines and the boxes they join; the rest steps back. */
export const HELPERS_SCRIPT = String.raw`
(() => {
// A page that adds a diagram later - a file's window brought into Conversations (F58) - starts it the same way.
const started = new WeakSet();
window.agentwhyDiagrams = (scope) => scope.querySelectorAll('[data-diagram]').forEach((board) => {
  if (started.has(board)) return;
  started.add(board);
  const nodes = [...board.querySelectorAll('[data-node]')];
  const edges = [...board.querySelectorAll('[data-from]')];
  const show = (id) => {
    const joined = new Set([id]);
    edges.forEach((edge) => {
      const on = edge.dataset.from === id || edge.dataset.to === id;
      if (on) { joined.add(edge.dataset.from); joined.add(edge.dataset.to); }
      edge.classList.toggle('hd-dim', !on);
      edge.classList.toggle('hd-lit', on);
    });
    nodes.forEach((node) => node.classList.toggle('hd-dim', !joined.has(node.dataset.node)));
  };
  const clear = () => {
    edges.forEach((edge) => edge.classList.remove('hd-dim', 'hd-lit'));
    nodes.forEach((node) => node.classList.remove('hd-dim'));
  };
  nodes.forEach((node) => {
    node.addEventListener('mouseenter', () => show(node.dataset.node));
    node.addEventListener('mouseleave', clear);
    node.addEventListener('focus', () => show(node.dataset.node));
    node.addEventListener('blur', clear);
  });
});
window.agentwhyDiagrams(document);
})();
`;

export const HELPERS_VIEW_STYLE = String.raw`
.hv{max-width:840px;margin:0 auto;transition:max-width .35s ease}
/* The diagram takes the page's width, up to 1600px: its boxes widen with it (P29). Between the list and the diagram the
   page widens and narrows, and the panel that comes fades in, rather than jumping. */
.hv:has(> .tabs > [data-tab-panel="0"].tabs-on){max-width:100%}
.shell-main:has(#helpers.rv-on){transition:max-width .35s ease}
.shell-main:has(#helpers.rv-on > .hv > .tabs > [data-tab-panel="0"].tabs-on){max-width:1600px}
.js .hv > .tabs > .tabs-panel.tabs-on{animation:hv-in .3s ease both}
@keyframes hv-in{from{opacity:0;transform:translateY(6px)}}
@media (prefers-reduced-motion:reduce){.js .hv > .tabs > .tabs-panel.tabs-on{animation:none}}
.hv .hero{margin-bottom:28px}
.hv .hero-fact,.hv .hero-action{font-size:34px;line-height:1.15}
.hv .hero-lead{font-size:16px;max-width:560px}
.hv-clean .hero-action{color:var(--mint)}.hv-amber .hero-action{color:var(--amber)}.hv-blue .hero-action{color:var(--blue)}
.hl-list{display:flex;flex-direction:column;gap:10px}
.hl-card{width:100%;display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:16px;background:var(--card);border:1px solid var(--white-09);color:inherit;text-decoration:none}
.hl-card:hover{border-color:var(--white-28);color:inherit}
.hl-risk{border-color:var(--coral-35)}
.hl-text{flex:1;min-width:0}
.hl-name{display:flex;align-items:baseline;flex-wrap:wrap;column-gap:10px;font-size:17px;font-weight:650}
.hl-line{display:block;font-size:15px;color:var(--text-2);margin-top:3px}.hl-risk .hl-line{color:var(--coral-text)}
.hl-see{flex:none;font-size:14px;font-weight:600;color:var(--text-2);white-space:nowrap}
.hl-by{font-size:13.5px;font-weight:500;color:var(--text-3)}
/* The line leaves the middle of your AI's avatar (its card's border, padding and half the avatar in; its padding and
   the avatar's lower half above the list's gap) and reaches each card at its middle; the fold line, whose card can open below it, 29px down. */
.hl-tree{--hl-in:34px;--hl-top:-29px;display:flex;flex-direction:column;gap:10px;margin-left:43px;padding-left:var(--hl-in)}
.hl-branch{position:relative;--hl-mid:50%}.hl-branch-fold{--hl-mid:29px}
.hl-branch::before{content:"";position:absolute;left:calc(-1 * var(--hl-in));top:-10px;bottom:-10px;border-left:1.5px solid var(--white-28)}
.hl-branch:first-child::before{top:var(--hl-top)}
.hl-branch:last-child::before{bottom:auto;height:calc(var(--hl-mid) + 10px)}
.hl-branch:first-child:last-child::before{height:calc(var(--hl-mid) - var(--hl-top))}
.hl-branch::after{content:"";position:absolute;left:calc(-1 * var(--hl-in));top:var(--hl-mid);width:calc(var(--hl-in) - 8px);border-top:1.5px solid var(--white-28)}
.hl-arrow{position:absolute;left:-9px;top:calc(var(--hl-mid) - 4.25px);border-left:8px solid var(--white-28);border-top:5px solid transparent;border-bottom:5px solid transparent}
@media (max-width:640px){.hl-card{padding:16px;gap:12px}.hl-tree{--hl-in:18px;--hl-top:-27px;margin-left:37px}}
.hd-scroll{border-radius:18px;border:1px solid var(--white-09);background-color:var(--panel);background-image:radial-gradient(var(--white-09) 1px,transparent 1px);background-size:22px 22px;overflow:auto}
.hd-board{position:relative;margin:0 auto}
.hd-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hd-edge{fill:none;stroke-width:1.6;vector-effect:non-scaling-stroke;transition:opacity .15s}
.hd-work{stroke:var(--white-18)}.hd-read{stroke:var(--coral)}
.hd-named,.hd-unknown,.hd-opened{stroke:var(--blue);stroke-dasharray:6 5}.hd-stopped{stroke:var(--mint);stroke-dasharray:6 5}
.hd-edge.hd-dim{opacity:.08}.hd-edge.hd-lit{stroke-width:2.5}
.hd-legend{position:absolute;left:24px;top:18px;display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--text-2)}
.hd-legend>span{display:flex;align-items:center;gap:7px}
.hd-key{width:22px}.hd-key-read{height:2px;background:var(--coral)}.hd-key-work{height:2px;background:var(--white-25)}
.hd-key-named{border-top:2px dashed var(--blue)}.hd-key-stopped{border-top:2px dashed var(--mint)}
.hd-col{position:absolute;top:52px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--text-4)}
.hd-node{position:absolute;height:56px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:12px;background:var(--raised);border:1px solid var(--white-12);box-shadow:0 6px 18px var(--node-shadow);color:inherit;text-decoration:none;transition:opacity .15s,border-color .15s}
a.hd-node:hover{border-color:var(--white-40);color:inherit}
.hd-risk{border-color:var(--coral-50)}
.hd-node.hd-dim{opacity:.3}
.hd-narrow{height:72px}
.hd-narrow .hd-sub{white-space:normal;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.3}
.hd-port{position:absolute;top:calc(50% - 4.5px);width:9px;height:9px;border-radius:50%;background:var(--raised-2);border:1.5px solid var(--white-25)}
.hd-in{left:-5px}.hd-out{right:-5px}
.hd-icon{flex:none;width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.hd-icon-coral{background:var(--coral-18);color:var(--coral-text)}.hd-icon-mint{background:var(--mint-14);color:var(--mint)}
.hd-icon-sand{background:var(--sand-16);color:var(--sand)}
.hd-icon-blue{background:var(--blue-16);color:var(--blue)}.hd-icon-blue svg{width:16px;height:16px}
.hd-icon-grey{background:var(--raised-2);color:var(--text-2)}.hd-icon-you{background:var(--raised-2);color:var(--text)}
.hd-text{min-width:0}
.hd-label{display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd-mono{font-family:var(--mono)}
.hd-sub{display:block;font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.hd-sub-coral{color:var(--coral-text)}
.hd-hint{margin:12px 4px 0;font-size:13px;color:var(--text-3)}
.hw-label{font-size:13px;font-weight:600;color:var(--text-3);margin-bottom:8px}
.hw-job{font-size:16px;line-height:1.5}
.hw-box{padding:20px;border-radius:14px;background:var(--mint-06);border:1px solid var(--mint-30)}
.hw-yes{background:var(--coral-07);border-color:var(--coral-35)}
.hw-q{font-size:15px;font-weight:500;color:var(--mint);margin-bottom:6px}.hw-yes .hw-q{color:var(--coral-text)}
.hw-a{font-size:40px;font-weight:700;letter-spacing:-0.02em;color:var(--mint);line-height:1.1;margin-bottom:8px}.hw-yes .hw-a{color:var(--coral-text)}
.hw-text{font-size:15px;line-height:1.5;color:var(--text-soft)}
.hw-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.hw-chip{font-family:var(--mono);font-size:13px;font-weight:500;color:var(--text);background:var(--white-07);border:1px solid var(--white-10);border-radius:6px;padding:2px 7px}
.hw-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--white-06);font-size:15px}
.hw-explain>summary{list-style:none;cursor:pointer;font-size:14px;font-weight:500;width:fit-content}
.hw-explain>summary::-webkit-details-marker{display:none}
.hw-explained{margin-top:12px;font-size:15px;line-height:1.55;background:var(--panel);border:1px solid var(--white-08);border-radius:12px;padding:14px 16px}
.hw-explained code{font-family:var(--mono);font-size:13.5px}
.hw-unknown{color:var(--amber);background:var(--amber-16)}
.hw-note{margin:auto 0 0;font-size:13px;line-height:1.5;color:var(--text-3)}
.dr-foot .pill{width:100%;justify-content:center}
`;
