// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PROVIDER_NAMES } from '../../core/session-format.ts';
import type { FileHow, ReportModel, RunFile, RunStep, WroteBefore } from '../report-model.ts';
import { accessOfReach, lookOfReport, placeInChat, quotedPlain } from '../render/chat/chat-answer.ts';
import { mainSteps } from '../render/chat/chat-strip.ts';
import { notKnownOf, stepLines } from '../render/chat/chat-views.ts';
import type { Translate } from '../render/report-copy.ts';
import { fileRows, type FileAccess } from '../render/report-page/files.ts';
import { helperViews, type HelperView } from '../render/report-page/helpers.ts';
import { labelOf, readsPrivate, TAG_KEY, type StepTone } from '../render/report-page/step-looks.ts';
import { toDoItems } from '../render/report-page/to-do.ts';
import { gapWords } from '../start/conversations/conversation-columns.ts';
import { accessOfRow } from './file-access.ts';
import type { AnswerMet, AnswerFile, AnswerMoment, AnswerPath, ConversationAnswer } from './answer-model.ts';

/** A chat answer is read, not scrolled. */
const FILES_SHOWN = 24;
const HELPERS_SHOWN = 12;
const HELPER_FILES = 6;
const TODO_SHOWN = 6;
const MOMENTS_SHOWN = 12;

/**
 * What is answered about one conversation (CV1), from what the page reads and by its own functions (CV12): one model for every
 * question about it. Paths as the chat names them (AYD9), words as the page says them.
 */
export function conversationAnswer(report: ReportModel, t: Translate, done: ReadonlySet<string> = new Set()): ConversationAnswer {
  const root = report.scope.paths.root;
  const inChat = (path: string): AnswerPath => {
    const { shown, place } = placeInChat(path, root);
    return place === undefined ? { path: shown } : { path: shown, place };
  };
  const asked = toDoItems(report);
  // What the person marked done leaves the list, as on the page; with every file of it done, what it read is fixed.
  const items = asked.filter((item) => !done.has(item.path as string));
  const said = lookOfReport(report);
  const look = said === 'read' && asked.length > 0 && items.length === 0 ? 'fixed' : said;
  const listed = fileRows(report, asked, done, undefined);
  const counts = new Map((report.fileCounts ?? []).map((count) => [count.path as string, count]));
  const rows = listed.filter((row) => row.private).map((row) => ({ path: row.path, access: accessOfRow(row, counts) }));
  const withAccess = (access: FileAccess): number => rows.filter((row) => row.access === access).length;
  const views = helperViews(report);
  const helpers = views.filter((view) => view.agent.ordinal !== undefined);
  const mine = views.find((view) => view.agent.index === report.graph.main.index)?.files ?? [];
  // Those that met a private file first; one that met none is a helper the person asks about too (the maintainer, 2026-11-25).
  const inOrder = [...helpers.filter((view) => view.files.length > 0), ...helpers.filter((view) => view.files.length === 0)];
  const ordinalOf = new Map(helpers.map((view) => [view.agent.index, view.agent.ordinal as number]));
  // A record of reaches has no word for a file an AI only wrote; its steps have (TK4).
  const written = new Map((report.runs ?? []).map((agent) => [agent.agentIndex, new Set(agent.runs.flatMap((run) => run.steps).flatMap((step) => step.files.filter((file) => file.how === 'changed').map((file) => file.path as string)))]));
  const metBy = (agent: number, file: HelperView['files'][number]): FileAccess => {
    const access = accessOfReach(file.reach);
    return access === 'name' && written.get(agent)?.has(file.path as string) === true ? 'changed' : access;
  };
  const steps = mainSteps(report);
  const lines = stepLines(report, t);
  const wrote = new Map((report.runs ?? []).flatMap((agent) => agent.runs.flatMap((run) => run.steps.map((step) => [step, run.wrote] as const))));
  const moments = lines.filter((line) => !line.ordinary).map((line): AnswerMoment => {
    const helper = ordinalOf.get(line.agentIndex);
    return {
      from: line.from,
      to: line.to,
      tone: line.tone,
      said: plainOf(line.guard === undefined ? line.words : `${line.words} ${line.guard}`),
      files: line.files,
      ...metIn(line.steps, inChat),
      label: labelOfLine(line.tone, line.steps),
      ...wroteBefore(wrote.get(line.steps[0] as RunStep)),
      ...(helper === undefined ? {} : { helper }),
      ...(line.first ? { first: true as const } : {}),
    };
  });
  const main = report.graph.main.index;
  const own = report.runs?.find((agent) => agent.agentIndex === main)?.runs.flatMap((run) => run.steps) ?? [];
  const ordinary = lines.filter((line) => line.ordinary);
  const countOf = (some: typeof ordinary): number => some.reduce((sum, line) => sum + line.steps.length, 0);
  const notKnown = notKnownOf(ordinary.flatMap((line) => line.steps), t);
  const gaps = report.gapReasons;
  const told = gaps !== undefined && (look === 'unchecked' || (look === 'none' && gaps.format === true));
  return {
    about: 'conversation',
    look,
    numbers: {
      read: withAccess('read'), name: withAccess('name'), stopped: withAccess('stopped'), opened: withAccess('opened'),
      unknown: withAccess('unknown'), changed: withAccess('changed'), helpers: helpers.length,
    },
    steps: {
      n: steps.length,
      leftOut: report.runs?.find((agent) => agent.agentIndex === report.graph.main.index)?.stepsLeftOut ?? 0,
      list: steps.map((step) => ({ tone: step.tone, label: step.label })),
      moments: moments.slice(0, MOMENTS_SHOWN),
      momentsMore: Math.max(0, moments.length - MOMENTS_SHOWN),
      reads: own.filter(readsPrivate).length,
      ordinary: countOf(ordinary.filter((line) => line.agentIndex === main)),
      helperSteps: countOf(ordinary.filter((line) => line.agentIndex !== main)),
      ...(notKnown.length === 0 ? {} : { notKnown }),
    },
    files: rows.slice(0, FILES_SHOWN).map((row): AnswerFile => ({ ...inChat(row.path as string), access: row.access, ...whoMet(row.path as string, row.access, views, report.graph.main.index, metBy) })),
    filesMore: Math.max(0, rows.length - FILES_SHOWN),
    mine: mine.slice(0, HELPER_FILES).map((file): AnswerFile => ({ ...inChat(file.path as string), access: metBy(report.graph.main.index, file) })),
    mineMore: Math.max(0, mine.length - HELPER_FILES),
    helpers: inOrder.slice(0, HELPERS_SHOWN).map((view) => ({
      helper: view.agent.ordinal as number,
      ...(view.agent.askedTo === undefined ? {} : { asked: quotedPlain(view.agent.askedTo as string) }),
      files: view.files.slice(0, HELPER_FILES).map((file): AnswerFile => ({ ...inChat(file.path as string), access: metBy(view.agent.index, file) })),
      filesMore: Math.max(0, view.files.length - HELPER_FILES),
      // The page's own word for it: no action of its was recorded, which is not the same as doing nothing.
      ...(view.status === 'empty' ? { unrecorded: true as const } : {}),
    })),
    helpersMore: Math.max(0, inOrder.length - HELPERS_SHOWN),
    todo: items.slice(0, TODO_SHOWN).map((item) => ({ ...inChat(item.path as string), kind: item.kind })),
    todoMore: Math.max(0, items.length - TODO_SHOWN),
    todoKeys: items.filter((item) => item.kind === 'keys').length,
    all: listed.length,
    ...(told ? { notChecked: gapWords(gaps, PROVIDER_NAMES[report.scope.provider]).map(({ key, vars }) => plainOf(t(key, vars))) } : {}),
  };
}

/**
 * The AIs a file's strongest thing happened with, each by its own record. Writing is no reach of a record's: a file only written was
 * written by the one AI that met it, where one alone did. Where neither says, nobody is named.
 */
function whoMet(path: string, access: FileAccess, views: readonly HelperView[], main: number, metBy: (agent: number, file: HelperView['files'][number]) => FileAccess): Pick<AnswerFile, 'by'> {
  const met = views.flatMap((view) => view.files.filter((file) => file.path === path).map((file) => ({ who: view.agent.index === main ? 0 : view.agent.ordinal, same: metBy(view.agent.index, file) === access })));
  const same = met.filter((one) => one.same);
  const by = (same.length > 0 ? same : access === 'changed' && met.length === 1 ? met : []).flatMap((one) => (one.who === undefined ? [] : [one.who]));
  return by.length === 0 ? {} : { by: [...new Set(by)].sort((a, b) => a - b) };
}

/**
 * What a moment is labelled: a key written over, else the look it is drawn in - a hand-over's is its helper's. A moment of no private file
 * is labelled nothing: *Nothing private* is a claim about the whole record (TK2).
 */
function labelOfLine(tone: StepTone, steps: readonly RunStep[]): string {
  const key = TAG_KEY[tone];
  if (tone !== 'grey' && steps.some((step) => labelOf(step) === key)) return key;
  if (steps[0] !== undefined && labelOf(steps[0]) === 'sb.tag.keyWritten') return 'sb.tag.keyWritten';
  return tone === 'grey' ? '' : key;
}

const WROTE_SHOWN = 200;
function wroteBefore(wrote: WroteBefore | undefined): Pick<AnswerMoment, 'wrote'> {
  if (wrote?.sentence === undefined) return {};
  const text = quotedPlain(wrote.sentence as string);
  const cut = wrote.cut === true || text.length > WROTE_SHOWN;
  return { wrote: { text: text.slice(0, WROTE_SHOWN), ...(wrote.kind === 'reasoning' ? { noted: true as const } : {}), ...(cut ? { cut: true as const } : {}) } };
}

const MET_SHOWN = 12;
const RAN_SHOWN = 3;
const HOW_RANK: readonly FileHow[] = ['read', 'unknown', 'opened', 'stopped', 'changed', 'named'];
/** What some steps met and ran: a sentence counts the files, and this names them. */
function metIn(steps: readonly RunStep[], inChat: (path: string) => AnswerPath): Pick<AnswerMoment, 'met' | 'metMore' | 'ran'> {
  const files = new Map<string, RunFile>();
  for (const file of steps.flatMap((step) => step.files)) {
    const known = files.get(file.path as string);
    if (known === undefined || HOW_RANK.indexOf(file.how) < HOW_RANK.indexOf(known.how)) files.set(file.path as string, file);
  }
  const all = [...files.values()].sort((one, other) => Number(other.private ?? false) - Number(one.private ?? false) || HOW_RANK.indexOf(one.how) - HOW_RANK.indexOf(other.how));
  const more = Math.max(0, all.length - MET_SHOWN) + steps.reduce((sum, step) => sum + (step.filesLeftOut ?? 0), 0);
  const ran = [...new Set(steps.map((step) => plainOf(step.did as string)))].slice(0, RAN_SHOWN);
  return {
    ...(all.length === 0 ? {} : { met: all.slice(0, MET_SHOWN).map((file): AnswerMet => ({ ...inChat(file.path as string), access: file.how === 'named' ? 'name' : file.how, ...(file.private === true ? {} : { everyday: true as const }) })) }),
    ...(more === 0 ? {} : { metMore: more }),
    ...(ran.length === 0 ? {} : { ran }),
  };
}

/** The page's sentence as plain words: the chat's Markdown taken back out, a card and a terminal having their own. A name is never touched. */
function plainOf(markdown: string): string {
  const words = (text: string): string => text.replace(/\*\*|(?<![\w\\])_|(?<!\\)_(?![\w])/g, '').replace(/\\([\\`*_[\]<>#|~!])/g, '$1');
  return markdown.split(/((`+) ?.*? ?\2)/).filter((_, at) => at % 3 !== 2)
    .map((part, at) => (at % 2 === 1 ? part.replace(/^(`+) ?(.*?) ?\1$/, '$2') : words(part))).join('').replace(/\s+/g, ' ').trim();
}
