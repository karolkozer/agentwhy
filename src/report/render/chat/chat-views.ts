// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { posix } from 'node:path';
import type { ReportModel, RunStep } from '../../report-model.ts';
import type { Translate } from '../report-copy.ts';
import { fileRows, type FileAccess, type FileRow } from '../report-page/files.ts';
import { helperViews, type HelperReach, type HelperView } from '../report-page/helpers.ts';
import { fileNames, nameOf } from '../report-page/item-names.ts';
import { stepSentence } from '../report-page/step-by-step-view.ts';
import { foldFileOf, foldKey, foldSentence, guardStepsOf, readsPrivate, stepTone, strongest, toneOf, type StepTone } from '../report-page/step-looks.ts';
import { toDoItems } from '../report-page/to-do.ts';
import { stepStrip, STRIP_MARK } from './chat-strip.ts';
import { ACCESS_MARK, ACCESS_ORDER, fileTree, treeLines, type TreeEntry } from './chat-tree.ts';
import { chatPath, code, guardSentence, lookOfReport, stopLines, type PathsRoot } from './chat-answer.ts';

/** How much each view lists before *+N more*: a chat answer is read, not scrolled (the spec's "kills it": a 200-line dump). */
const STEPS_SHOWN = 30;
const ROWS_SHOWN = 15;

/** How many of a folded line's files are named before the rest are counted. */
const FOLD_NAMES = 3;

const ACCESS_OF_REACH: Readonly<Record<HelperReach, FileAccess>> = {
  read: 'read',
  opened: 'opened',
  named: 'name',
  unknown: 'unknown',
  stopped: 'stopped',
};

const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };

/**
 * The page's own sentence as Markdown: its `<code>` spans become code spans, any other tag goes, and its entities are
 * read back. The words stay the page's, so a step is said in the chat as Step by step says it (AY1).
 */
export function markdownOf(html: string): string {
  const text = (fragment: string): string => fragment.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
  // Tags are taken out of each part before its entities are read back, so a name holding `<draft>` - escaped in the
  // page's HTML - is said whole: the review of 2026-11-22 found it stripped from inside the code span already built.
  return html
    .split(/(<code>[\s\S]*?<\/code>)/)
    .map((part) => {
      const inner = /^<code>([\s\S]*?)<\/code>$/.exec(part)?.[1];
      return inner === undefined ? text(part.replace(/<[^>]*>/g, '')) : code(text(inner.replace(/<[^>]*>/g, '')));
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Who each agent of the record is called: your AI, or a helper by its number - the page's words. */
function namesOfAgents(views: readonly HelperView[], t: Translate): (index: number) => string {
  const byIndex = new Map(views.map((view) => [view.agent.index, view.agent.ordinal === undefined ? t('ch.ai') : t('st.helper', { ordinal: view.agent.ordinal })]));
  return (index) => byIndex.get(index) ?? t('ch.ai');
}

/**
 * A step in Step by step's sentence, as Markdown, where a file outside the project is said by its name and, after its
 * code span, where it lies (AYD9). A sentence names one file at most, so each name handed out is found from where the
 * last was.
 */
function sentenceOf(step: RunStep, root: PathsRoot, t: Translate, names: (path: string) => string): string {
  const marked: { readonly shown: string; readonly mark: string }[] = [];
  let text = markdownOf(stepSentence(step, t, (path) => {
    const { shown, mark } = chatPath(path, root, t);
    if (mark === undefined) return names(path);
    marked.push({ shown, mark });
    return shown;
  }));
  let from = 0;
  for (const { shown, mark } of marked) {
    const span = code(shown);
    const at = text.indexOf(span, from);
    // Never dropped: where the span cannot be found, where the file lies is said after the sentence, which names it alone.
    if (at < 0) {
      text += ` (${mark})`;
      continue;
    }
    from = at + span.length;
    text = text.slice(0, from) + ` (${mark})` + text.slice(from);
    from += mark.length + 3;
  }
  return text;
}

/** A step that touched nothing private and was not stopped: part of the story only as how much there was of it. */
const isOrdinary = (step: RunStep): boolean => step.gave === undefined && step.outcome !== 'blocked' && toneOf(step) === 'grey';

/** What an ordinary step was, in one word: the tool, a program it ran, or the MCP tool a server's name would hide. */
const kindOf = (step: RunStep): string => String(step.toolKnown ? step.programs?.[0] ?? step.did : step.mcp?.tool ?? step.did);

/** How many kinds of ordinary step one line names, most frequent first. */
const KINDS_SHOWN = 5;

/**
 * SG12a: the ordinary steps between two that matter, as one line - how many, and what they were. Never that they were clean:
 * what of them is not known is said under the AI's steps (`notKnownLine`).
 */
function ordinaryLine(steps: readonly RunStep[], t: Translate): string {
  const counts = new Map<string, number>();
  for (const step of steps) counts.set(kindOf(step), (counts.get(kindOf(step)) ?? 0) + 1);
  const kinds = [...counts].sort((a, b) => b[1] - a[1]);
  const shown = kinds.slice(0, KINDS_SHOWN).map(([kind, n]) => code(kind) + (n > 1 ? ` ×${n}` : ''));
  if (kinds.length > KINDS_SHOWN) shown.push(t('ch.more', { n: kinds.length - KINDS_SHOWN }));
  return `${t('ch.steps.other', { n: steps.length })}: ${shown.join(', ')}`;
}

/** What is not known of an AI's ordinary steps, once under them rather than on every line (TK2) - nothing where all is. */
function notKnownLine(steps: readonly RunStep[], t: Translate): string | undefined {
  const said = notKnownOf(steps, t);
  return said.length === 0 ? undefined : `_${said.join(' · ')}_`;
}

/** The same in plain words, one a kind of what is not known. */
export function notKnownOf(steps: readonly RunStep[], t: Translate): string[] {
  const unseen = steps.filter((step) => !step.toolKnown).length;
  const open = steps.filter((step) => step.outcome === 'unknown').length;
  return [...(unseen === 0 ? [] : [t('ch.steps.unseen', { n: unseen })]), ...(open === 0 ? [] : [t('ch.steps.notEnded', { n: open })])];
}

/** One line of `steps`: some steps of one AI, in order, as one thing that happened. */
interface StepGroup {
  readonly agentIndex: number;
  readonly entries: readonly { readonly step: RunStep; readonly at: number }[];
  readonly key: string | undefined;
  readonly ordinary: boolean;
}

/** One line of `steps` before it is set as Markdown: which steps of which AI, in which look, and what is said of them. */
export interface StepLine {
  readonly agentIndex: number;
  /** The steps' places among that AI's, from 1. */
  readonly from: number;
  readonly to: number;
  readonly steps: readonly RunStep[];
  readonly ordinary: boolean;
  readonly tone: StepTone;
  /** Markdown, in the page's words. */
  readonly words: string;
  /** The files it names, as the chat names them. */
  readonly files: readonly string[];
  /** SG4: here your AI first read a private file, and it is not the story's first step. */
  readonly first: boolean;
  /** What a step changed of what protects the files, in the page's words. */
  readonly guard?: string;
}

/**
 * What each AI did, in order, a line for each thing that matters - a private file, a stop - and one for the ordinary steps
 * between two of them (SG12a). Asked by `steps` and by the card's answer (`2026-11-24-talking-about-agentwhy.md` CV12).
 */
export function stepLines(report: ReportModel, t: Translate): readonly StepLine[] {
  const agents = report.runs ?? [];
  const root = report.scope.paths.root;
  const paths = agents.flatMap((agent) => agent.runs.flatMap((run) => run.steps.flatMap((step) => step.files.map((file) => file.path as string))));
  // Named against the project's own files alone: a file outside it is said by its name, marked (AYD9), never lengthened.
  const names = fileNames(paths.filter((path) => chatPath(path, root, t).mark === undefined));
  const who = namesOfAgents(helperViews(report), t);
  const byAgent = new Map(agents.map((each) => [each.agentIndex, each]));
  const guard = guardStepsOf(report);
  const groups: StepGroup[] = agents.flatMap((agent) => {
    const steps = agent.runs.flatMap((run) => run.steps);
    // A step that changed what protects the files is a line of its own, never one of those that did nothing.
    const ordinaryAt = (step: RunStep): boolean => isOrdinary(step) && !guard(agent.agentIndex, step);
    const keyAt = (step: RunStep): string | undefined => (guard(agent.agentIndex, step) ? undefined : foldKey(step));
    const found: StepGroup[] = [];
    for (let at = 0; at < steps.length;) {
      const step = steps[at] as RunStep;
      const ordinary = ordinaryAt(step);
      const key = ordinary ? undefined : keyAt(step);
      let end = at + 1;
      while (end < steps.length && (ordinary ? ordinaryAt(steps[end] as RunStep) : key !== undefined && keyAt(steps[end] as RunStep) === key)) end += 1;
      found.push({ agentIndex: agent.agentIndex, key, ordinary, entries: steps.slice(at, end).map((each, offset) => ({ step: each, at: at + offset })) });
      at = end;
    }
    return found;
  });
  /** A file as a folded line names it: as the page names it, or, outside the project, its name and where it lies (AYD9). */
  const fileNamed = (path: string): string => {
    const { shown: name, mark } = chatPath(path, root, t);
    return mark === undefined ? code(names(path)) : `${code(name)} (${mark})`;
  };
  const mainIndex = report.graph.main.index;
  // SG4: your AI's first private read, whichever line of those shown it is on.
  const firstRead = groups.find((group) => group.agentIndex === mainIndex && !group.ordinary && group.entries.some((entry) => readsPrivate(entry.step)));
  return groups.map((group): StepLine => {
    const steps = group.entries.map((entry) => entry.step);
    const first = group.entries[0] as StepGroup['entries'][number];
    const last = group.entries[group.entries.length - 1] as StepGroup['entries'][number];
    const files = [...new Set(steps.flatMap((step) => { const file = foldFileOf(step); return file === undefined ? [] : [file.path as string]; }))];
    const words = ((): string => {
      if (group.ordinary && steps.length > 1) return ordinaryLine(steps, t);
      // Who was given the work is the story of a hand-over, not the tool that did it - in the page's words.
      if (first.step.gave?.agentIndex !== undefined) return t('sb.gave.one', { who: who(first.step.gave.agentIndex) });
      if (steps.length === 1) return sentenceOf(first.step, root, t, names);
      const said = markdownOf(foldSentence(steps, group.key as string, t, (path) => {
        const { shown: name, mark: away } = chatPath(path, root, t);
        return away === undefined ? names(path) : name;
      }));
      // One file is named in the sentence itself; several are listed after it.
      const listed = files.length < 2 ? '' : ': ' + files.slice(0, FOLD_NAMES).map(fileNamed).join(', ') + (files.length > FOLD_NAMES ? ' ' + t('sb.moreFiles', { n: files.length - FOLD_NAMES }) : '');
      return said + listed;
    })();
    const change = (report.guardChanges ?? []).find((each) => each.agentIndex === group.agentIndex && each.step === first.step.sequence);
    return {
      agentIndex: group.agentIndex,
      from: first.at + 1,
      to: last.at + 1,
      steps,
      ordinary: group.ordinary,
      tone: strongest(steps.map((step) => stepTone(byAgent, step, new Set([group.agentIndex])))),
      words,
      files: group.ordinary ? [] : files.map((path) => { const { shown: name, mark } = chatPath(path, root, t); return mark === undefined ? names(path) : name; }),
      first: group === firstRead && first.at > 0,
      ...(change === undefined ? {} : { guard: guardSentence(change, t) }),
    };
  });
}

/**
 * `steps`: those lines as Markdown. Where there are more than fit, the lines that matter are the ones shown, each under its
 * own number, and the ordinary rest is counted: a private step at the 150th place is never hidden.
 */
export function stepsView(report: ReportModel, t: Translate): string {
  const groups = stepLines(report, t);
  if (groups.length === 0) return `${t('ch.steps.none')}\n`;
  const who = namesOfAgents(helperViews(report), t);
  const kept = groups.length <= STEPS_SHOWN ? groups : groups.filter((group) => !group.ordinary);
  const shown = kept.slice(0, STEPS_SHOWN);
  const count = (some: readonly StepLine[]): number => some.reduce((sum, group) => sum + group.steps.length, 0);

  // SG12: the shape first. A step's number is written in its line, so a Markdown list never renumbers it.
  const lines: string[] = [...stepStrip(report, t)];
  let agent: number | undefined;
  // A step alone says of itself what is not known; the ones folded into a line say it together, under their AI's steps.
  const closeAgent = (index: number): void => {
    const note = notKnownLine(groups.filter((group) => group.agentIndex === index && group.ordinary && (group.steps.length > 1 || !shown.includes(group))).flatMap((group) => group.steps), t);
    if (note !== undefined) lines.push('', note);
  };
  for (const group of shown) {
    if (group.agentIndex !== agent) {
      if (agent !== undefined) closeAgent(agent);
      lines.push('', `**${who(group.agentIndex)}**`);
      agent = group.agentIndex;
    }
    const places = group.from === group.to ? `${group.from}` : `${group.from}–${group.to}`;
    const mark = group.first ? ` _← ${t('sb.firstPrivate')}_` : '';
    const guarded = group.guard === undefined ? '' : ` _← ${group.guard}_`;
    lines.push(`- **${places}.** ${STRIP_MARK[group.tone]} ${group.words}${mark}${guarded}`);
  }
  if (agent !== undefined) closeAgent(agent);
  if (kept.length > shown.length) lines.push('', t('ch.more', { n: count(kept.slice(STEPS_SHOWN)) }));
  if (kept.length < groups.length) lines.push('', t('ch.steps.others', { n: count(groups.filter((group) => group.ordinary)) }));
  return lines.join('\n').replace(/^\n/, '') + '\n';
}

/** Every file of the record the page lists, private ones first: what both `folders` and `table` draw. */
function listed(report: ReportModel): readonly FileRow[] {
  const rows = fileRows(report, toDoItems(report), new Set(), undefined);
  return [...rows.filter((row) => row.private), ...rows.filter((row) => !row.private)];
}

/** `folders`: the files by the folder they are in, as By folder groups them. */
export function foldersView(report: ReportModel, t: Translate): string {
  const rows = listed(report);
  if (rows.length === 0) return `${t('ch.files.none')}\n`;
  const root = report.scope.paths.root;
  // A folder's heading, by the folder's path - or, for a file not in the project, one heading for all such files, its
  // folder kept off the chat (AYD9). The key of the second can be no path: a path holds no NUL.
  const folders = new Map<string, { readonly heading: string; readonly rows: FileRow[] }>();
  for (const row of rows.slice(0, ROWS_SHOWN)) {
    const away = chatPath(row.path, root, t).mark !== undefined;
    const folder = away ? '\0' + root : posix.dirname(row.path);
    const heading = away ? t(root === 'known' ? 'ch.folder.outside' : 'ch.folder.elsewhere') : folder === '.' ? t('ch.folder.main') : code(folder + '/');
    folders.set(folder, { heading, rows: [...(folders.get(folder)?.rows ?? []), row] });
  }
  const lines: string[] = [];
  for (const { heading, rows: inside } of folders.values()) {
    lines.push(`**${heading}**`);
    for (const row of inside) lines.push(`- ${code(nameOf(row.path))} - ${t('ch.access.' + row.access)}${row.private ? ` · ${t('ch.private')}` : ''}`);
    lines.push('');
  }
  if (rows.length > ROWS_SHOWN) lines.push(t('ch.more', { n: rows.length - ROWS_SHOWN }));
  return lines.join('\n').trimEnd() + '\n';
}

/** How many rows the two tables draw together before the rest are counted. */
const TABLE_ROWS = 15;

/** `table`: the private files and the other files, each table grouped by what happened and by folder (SG12a). */
export function tableView(report: ReportModel, t: Translate): string {
  const rows = listed(report);
  if (rows.length === 0) return `${t('ch.files.none')}\n`;
  const root = report.scope.paths.root;
  const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ');
  const folderOf = (path: string): string => {
    const { mark } = chatPath(path, root, t);
    if (mark !== undefined) return mark;
    const folder = posix.dirname(path);
    return folder === '.' ? t('ch.folder.main') : folder;
  };
  const tableOf = (some: readonly FileRow[], room: number): { readonly lines: readonly string[]; readonly used: number; readonly left: number } => {
    const groups = ACCESS_ORDER.flatMap((access) => {
      const byFolder = new Map<string, FileRow[]>();
      for (const row of some.filter((each) => each.access === access)) byFolder.set(folderOf(row.path as string), [...(byFolder.get(folderOf(row.path as string)) ?? []), row]);
      return [...byFolder].map(([folder, files]) => ({ access, folder, files }));
    });
    const drawn = groups.slice(0, room);
    return {
      lines: [
        `| ${t('ch.table.what')} | ${t('ch.table.file')} | ${t('ch.table.folder')} |`, '|---|---|---|',
        ...drawn.map(({ access, folder, files }) => {
          const named = files.map((row) => code(nameOf(row.path as string)));
          const more = named.length - FOLD_NAMES;
          return `| ${ACCESS_MARK[access]} ${t('ch.access.' + access)} | ${cell(named.slice(0, FOLD_NAMES).join(', '))}${more > 0 ? ' ' + t('sb.moreFiles', { n: more }) : ''} | ${cell(folder)} |`;
        }),
      ],
      used: drawn.length,
      left: groups.slice(room).reduce((sum, group) => sum + group.files.length, 0),
    };
  };
  const parts: string[] = [];
  let room = TABLE_ROWS;
  let left = 0;
  for (const [key, some] of [['ch.files', rows.filter((row) => row.private)], ['ch.table.others', rows.filter((row) => !row.private)]] as const) {
    if (some.length === 0) continue;
    const table = tableOf(some, room);
    if (table.used > 0) parts.push(`**${t(key)} (${some.length})**`, '', ...table.lines, '');
    room -= table.used;
    left += table.left;
  }
  if (left > 0) parts.push(t('ch.more', { n: left }));
  return parts.join('\n').trimEnd() + '\n';
}

/**
 * `diagram`: who brought in whom and the private files each reached, as a tree in a code block - the one form every
 * surface draws alike. A Mermaid block was drawn as its own code in the Claude desktop app (the maintainer, 2026-11-24).
 */
export function diagramView(report: ReportModel, t: Translate): string {
  const views = helperViews(report);
  const who = namesOfAgents(views, t);
  const main = views.find((view) => view.agent.ordinal === undefined);
  const helpers = views.filter((view) => view.agent.ordinal !== undefined);
  const root = report.scope.paths.root;
  // A helper brought in by another helper hangs under it - `broughtBy` holds that helper's ordinal (`file-story.ts`) - and
  // one brought in by the main AI, by nobody the record names, or by a helper not among them, under the main AI.
  const ordinals = new Set(helpers.map((view) => view.agent.ordinal));
  const parentOf = (view: HelperView): number | 'main' =>
    typeof view.agent.broughtBy === 'number' && ordinals.has(view.agent.broughtBy) ? view.agent.broughtBy : 'main';
  const allChildrenOf = (parent: number | 'main'): readonly HelperView[] => helpers.filter((view) => parentOf(view) === parent);
  const keyOf = (view: HelperView | undefined): number | 'main' => (view === undefined || view === main ? 'main' : view.agent.ordinal ?? 'main');
  // Guidelines §1.8, show only what needs attention: a helper is drawn where it, or one it brought in, reached a private
  // file; the rest are counted in one line, never dropped in silence.
  const reaches = (view: HelperView): boolean => view.files.length > 0 || allChildrenOf(keyOf(view)).some(reaches);
  const childrenOf = (parent: number | 'main'): readonly HelperView[] => allChildrenOf(parent).filter(reaches);
  const folded = helpers.filter((view) => !reaches(view)).length;
  const used = new Set<FileAccess>();
  const entriesOf = (view: HelperView | undefined): readonly TreeEntry[] => [
    ...fileTree((view === undefined ? [] : view.files).map((file) => {
      const access = ACCESS_OF_REACH[file.reach];
      used.add(access);
      const { shown, mark } = chatPath(file.path as string, root, t);
      return { path: shown, access, ...(mark === undefined ? {} : { mark }) };
    }), t),
    ...childrenOf(keyOf(view)).map((child): TreeEntry => ({ text: who(child.agent.index), inner: entriesOf(child) })),
  ];
  const lines = ['```', t('ch.you'), `└── ${t('ch.ai')}`, ...treeLines(entriesOf(main), '    ')];
  if (folded > 0) lines.push(`    (${t('ch.diagram.others', { n: folded })})`);
  lines.push('```');
  const legend = ACCESS_ORDER.filter((access) => used.has(access)).map((access) => `${ACCESS_MARK[access]} ${t('ch.access.' + access)}`);
  // The same mark is said once, and only for looks the tree draws.
  const said = [...new Map(legend.map((line) => [line, line])).values()];
  return lines.join('\n') + (said.length === 0 ? '\n' : `\n\n${said.join(' · ')}\n`);
}

/**
 * `card`: a short block fit to post (AY10, AYD5) - the look and the counts, with no path, no project, no title and no
 * task's words. It is printed and nothing is posted; its last line names agentwhy, and the person may delete it.
 */
export function cardView(report: ReportModel, t: Translate): string {
  const look = lookOfReport(report);
  const rows = fileRows(report, toDoItems(report), new Set(), undefined).filter((row) => row.private);
  const counts = new Map<FileAccess, number>();
  for (const row of rows) counts.set(row.access, (counts.get(row.access) ?? 0) + 1);
  const helpers = helperViews(report).filter((view) => view.agent.ordinal !== undefined).length;
  const lines = [`**agentwhy** · ${t('look.' + look)}`];
  lines.push(...stopLines(report, look, t));
  if (rows.length > 0) lines.push(`${t('ch.files')}: ${ACCESS_ORDER.filter((access) => counts.has(access)).map((access) => `${ACCESS_MARK[access]} ${t('ch.count.' + access, { n: counts.get(access) ?? 0 })}`).join(' · ')}`);
  if (helpers > 0) lines.push(t('ch.card.helpers', { n: helpers }));
  // Step 4 of the AI-changed-its-own-guard plan: a card says how many changes there were to what protects the files, no path.
  if ((report.guardChanges ?? []).length > 0) lines.push(`${t('gd.heading')}: ${(report.guardChanges ?? []).length}`);
  lines.push('', `_${t('ch.card.sign')}_`);
  return lines.join('\n') + '\n';
}
