// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { PROVIDER_NAMES } from '../../core/session-format.ts';
import { code, plain } from '../render/chat/chat-answer.ts';
import type { Translate } from '../render/report-copy.ts';
import type { FileAccess } from '../render/report-page/files.ts';
import type { AnswerKind, ListAnswerKind } from './answer-kinds.ts';
import type { AnswerFile, AnswerGroup, AnswerModel, AnswerPath, AnswerRow, ConversationAnswer, ListAnswer } from './answer-model.ts';

/** The order the groups are said in: what asks to act, then what was allowed, then what is not known, never last and lost. */
export const GROUPS: readonly AnswerGroup[] = ['attention', 'fixed', 'tracked', 'stopped', 'seen', 'none', 'partly', 'failed'];

/** Nothing asks to act, and that is known of every conversation: one not checked fully, or not read yet, leaves it unsaid. */
export const isCalm = (answer: ListAnswer): boolean =>
  answer.groups.attention === 0 && answer.groups.partly === 0 && answer.groups.failed === 0 && answer.checked.read === answer.checked.of && answer.reading !== true;

/** What an answer is about, in words: this conversation, this project, or which list of this computer (CV15). */
export function whereOf(answer: AnswerModel, t: Translate): string {
  if (answer.about === 'conversation') return t('an.where.conversation');
  return t(answer.scope === 'project' ? 'an.where.project' : 'an.where.' + (answer.list ?? 'computer'));
}

/** The range, as it was asked for: days where it is days, else as it was written. */
export function rangeOf(answer: ListAnswer, t: Translate): string {
  const days = /^(\d{1,4})d$/.exec(answer.asked)?.[1];
  return days === undefined ? t('an.since', { asked: answer.asked }) : t('an.days', { n: Number(days) });
}

/**
 * One answer in words (`2026-11-24-talking-about-agentwhy.md` CV11): what the model reads, and what is shown where no card is
 * drawn. Markdown, in the person's language; it says nothing the card does not.
 */
export function answerText(answer: AnswerModel, kind: AnswerKind, t: Translate, other?: OtherConversation): string {
  if (answer.about === 'conversation') {
    const where = other === undefined ? whereOf(answer, t) : other.title === undefined ? t('an.untitled') : plain(other.title);
    return [`**agentwhy** · ${where}`, '', ...aboutConversation(answer, kind, t), ...notChecked(answer, t)].join('\n') + '\n';
  }
  const asked = kind as ListAnswerKind;
  const beside = answer.beside === undefined ? [] : ['', `**${whereOf(answer.beside, t)}**`, '', ...aboutList(answer.beside, asked, t)];
  const lists = answer.beside === undefined ? [answer] : [answer, answer.beside];
  const foot = lists.some((list) => hasFoot(list, asked)) ? ['', t(asked === 'okay' ? 'an.covers' : asked === 'often' ? 'an.often.counted' : 'an.titles')] : [];
  return [`**agentwhy** · ${whereOf(answer, t)}, ${rangeOf(answer, t)}`, '', ...aboutList(answer, asked, t), ...beside, ...foot].join('\n') + '\n';
}

/** Whether a list says anything its one last line is about: what it covers, what a count is, the titles it named. */
const hasFoot = (list: ListAnswer, kind: ListAnswerKind): boolean =>
  list.checked.read > 0 && (kind === 'okay' || (kind === 'often' ? list.often.length > 0 : rowsOf(list, kind).rows.length > 0));

/** A conversation that is not the one being held: what it is called, where it has a title. */
export interface OtherConversation {
  readonly title?: string;
}

function aboutConversation(answer: ConversationAnswer, kind: AnswerKind, t: Translate): string[] {
  const { numbers, steps } = answer;
  if (kind === 'steps') {
    if (steps.n === 0) return [t('an.steps.none')];
    return [
      `**${t('an.steps.fact', { n: steps.n + steps.leftOut })}**${steps.reads === 0 ? '' : ` ${t('an.steps.act', { n: steps.reads })}`}`,
      ...steps.moments.map((moment) => {
        const where = moment.from === moment.to ? t('an.steps.one', { n: moment.from }) : t('an.steps.some', { from: moment.from, to: moment.to });
        const who = moment.helper === undefined ? '' : `${t('st.helper', { ordinal: moment.helper })}: `;
        return `- ${where}: ${who}${plain(moment.said)}${moment.first === true ? ` - ${t('an.steps.first')}` : ''}`;
      }),
      ...(steps.momentsMore === 0 ? [] : [`- ${t('an.more', { n: steps.momentsMore })}`]),
      ...(steps.ordinary === 0 ? [] : [`- ${t('an.steps.ordinary', { n: steps.ordinary })}`]),
      ...(steps.helperSteps === 0 ? [] : [`- ${t('an.steps.helpers', { n: steps.helperSteps })}`]),
      ...(steps.leftOut === 0 ? [] : [`- ${t('an.steps.left', { n: steps.leftOut })}`]),
      ...(steps.notKnown ?? []).map((each) => `- ${plain(each)}`),
    ];
  }
  if (kind === 'files') {
    if (answer.files.length === 0) return [t('an.files.none')];
    return [
      `**${t('an.files.fact', { n: answer.files.length + answer.filesMore })}**`,
      ...answer.files.map((file) => `- ${fileOf(file, t)} - ${t('ch.access.' + file.access)}${whoOf(file, t)}`),
      ...more(answer.filesMore, t),
    ];
  }
  if (kind === 'helpers') {
    if (answer.helpers.length === 0) return [...(numbers.helpers === 0 ? [] : [`**${t('an.helpers.fact', { n: numbers.helpers })}**`]), t('an.helpers.none')];
    return [
      `**${t('an.helpers.fact', { n: numbers.helpers })}**`,
      ...(answer.helpers.some((helper) => helper.files.length > 0 || helper.unrecorded === true) ? [] : [t('an.helpers.none')]),
      ...((answer.mine ?? []).length === 0 ? [] : [`- ${t('ch.ai')}: ${(answer.mine ?? []).map((file) => `${fileOf(file, t)} ${t('ch.access.' + file.access)}`).join(', ')}${(answer.mineMore ?? 0) === 0 ? '' : `, ${t('an.more', { n: answer.mineMore ?? 0 })}`}`]),
      ...answer.helpers.map((helper) => {
        const asked = helper.asked === undefined ? '' : ` (${t('an.helpers.asked', { task: plain(helper.asked) })})`;
        const files = helper.unrecorded === true ? t('an.helper.empty') : helper.files.length === 0 ? t('an.helper.none') : helper.files.map((file) => `${fileOf(file, t)} ${t('ch.access.' + file.access)}`).join(', ');
        return `- ${t('st.helper', { ordinal: helper.helper })}${asked}: ${files}${helper.filesMore === 0 ? '' : `, ${t('an.more', { n: helper.filesMore })}`}`;
      }),
      ...more(answer.helpersMore, t),
    ];
  }
  if (kind === 'todo') {
    if (answer.todo.length === 0) return [t('an.todo.none')];
    return [
      `**${t('an.todo.fact', { n: answer.todo.length + answer.todoMore })}**`,
      ...answer.todo.map((item) => `- ${fileOf(item, t)} - ${t('an.todo.' + item.kind)}`),
      ...more(answer.todoMore, t),
      ...(answer.todo.some((item) => item.kind === 'keys') ? ['', t('an.todo.warn')] : []),
    ];
  }
  const counted = (['read', 'changed', 'opened', 'name', 'stopped', 'unknown'] as const).filter((each) => numbers[each] > 0);
  return [
    `**${factOf(answer, t)}**${askOf(answer, t) === '' ? '' : ` ${askOf(answer, t)}`}`,
    ...(counted.length === 0 ? [] : [counted.map((each) => `${numbers[each]} ${t('an.n.' + each, { n: numbers[each] })}`).join(' · ')]),
    ...(sizeOf(answer, t) === '' ? [] : [sizeOf(answer, t)]),
    ...metOf(answer).map((file) => `- ${fileOf(file, t)}${file.access === undefined ? '' : ` - ${t('ch.access.' + file.access)}${whoOf(file, t)}`}${file.kind === undefined ? '' : ` - ${t('an.todo.' + file.kind)}`}`),
    ...more(restOf(answer), t),
  ];
}

/** How much there was of it: every step of your AI and every file its report lists. */
function sizeOf(answer: ConversationAnswer, t: Translate): string {
  const steps = answer.steps.n + answer.steps.leftOut;
  return [...(steps === 0 ? [] : [t('an.row.steps', { n: steps })]), ...(answer.all === 0 ? [] : [t('an.row.files', { n: answer.all })])].join(' · ');
}

const MET_SHOWN = 6;
/** The private files a summary names: what to do about first, then the rest. Files of one shown name are two (AYD9): each keeps its line. */
function allMet(answer: ConversationAnswer): readonly (AnswerPath & { readonly access?: FileAccess; readonly by?: readonly number[]; readonly kind?: 'keys' | 'data' })[] {
  const left = [...answer.files];
  const first = answer.todo.map((item) => {
    const own = left.map((file, at) => ({ file, at })).filter(({ file }) => file.path === item.path && file.place === item.place);
    const found = own.find(({ file }) => file.access === 'read') ?? own[0];
    if (found === undefined) return item;
    left.splice(found.at, 1);
    return { ...item, access: found.file.access, ...(found.file.by === undefined ? {} : { by: found.file.by }) };
  });
  return [...first, ...left];
}
const metOf = (answer: ConversationAnswer): ReturnType<typeof allMet> => allMet(answer).slice(0, MET_SHOWN);
/** How many private files a summary leaves to the list of them. */
const restOf = (answer: ConversationAnswer): number => Math.max(0, allMet(answer).length - MET_SHOWN) + answer.filesMore;

/** The conversation in one sentence: how many private files it read, or the row's own look where it read none. */
export function factOf(answer: ConversationAnswer, t: Translate): string {
  return answer.numbers.read > 0 ? t('an.sum.read', { n: answer.numbers.read }) : t('look.' + answer.look);
}

/** What it asks of the person, or nothing. */
export function askOf(answer: ConversationAnswer, t: Translate): string {
  const all = answer.todo.length + answer.todoMore;
  if (all === 0) return '';
  const what = answer.todoKeys > 0 ? 'an.sum.keys' : 'an.sum.data';
  // One file read and one thing to do is that file; a page's to-do may hold more than what was read.
  return answer.numbers.read === 1 && all === 1 ? t(what + '.it') : t(what, { n: answer.todoKeys > 0 ? answer.todoKeys : all });
}

function aboutList(answer: ListAnswer, kind: ListAnswerKind, t: Translate): string[] {
  const { groups, checked } = answer;
  if (checked.of === 0) return [t('an.empty')];
  if (checked.read === 0) return [t('an.reading')];
  const isPart = checked.read < checked.of;
  const partWay = isPart ? ['', t('an.checked', { read: checked.read, of: checked.of })] : answer.reading === true ? ['', t('an.again')] : [];
  if (kind === 'okay') {
    // An answer from some of the conversations is said as that before anything it counts.
    return [
      `**${t(isPart ? 'an.checked' : 'an.okay.fact', { n: checked.read, read: checked.read, of: checked.of })}**${groups.attention > 0 ? ` ${t('an.okay.act', { n: groups.attention })}` : isCalm(answer) ? ` ${t('an.okay.calm')}` : ''}`,
      ...GROUPS.filter((group) => groups[group] > 0).map((group) => `- ${groups[group]} ${t('an.g.' + group)}`),
      ...(isPart ? [] : partWay),
    ];
  }
  if (kind === 'often') {
    const named = answer.namedOnly === 0 ? [] : [`- ${t('an.often.named', { n: answer.namedOnly })}`];
    if (answer.often.length === 0) return [t('an.often.none'), ...named, ...unsure(answer, t), ...partWay];
    return [
      `**${t('an.often.fact')}**`,
      ...answer.often.map((row) => {
        const parts = (['read', 'changed', 'opened', 'stopped', 'unknown', 'named'] as const).filter((each) => row[each] > 0).map((each) => `${row[each]} ${t('an.o.' + each)}`);
        return `- ${fileOf(row, t)}${row.project === undefined ? '' : ` (${plain(row.project)})`}: ${timesOf(t('an.often.times', { n: row.wanted }), row.wanted)} - ${parts.join(', ')}, ${t('an.often.in', { n: row.conversations })}${row.tracked ? `, ${t('an.often.track')}` : ''}`;
      }),
      ...more(answer.oftenMore, t), ...named, ...unsure(answer, t), ...partWay,
    ];
  }
  const { rows, rest } = rowsOf(answer, kind);
  return [
    `**${t('an.rows.' + kind)}**`,
    ...(rows.length === 0 && rest === 0 ? [t('an.rows.none')] : rows.map((row) => rowLine(row, t))),
    ...more(rest, t), ...unsure(answer, t), ...partWay,
  ];
}

/** TK2: the conversations that could not be checked, or not fully, in no list of another group and never left out beside one. */
const unsure = (answer: ListAnswer, t: Translate): string[] =>
  (['partly', 'failed'] as const).filter((group) => answer.groups[group] > 0).map((group) => `- ${answer.groups[group]} ${t('an.g.' + group)}`);

/** The conversations a list answer names, and how many more there are: the newest, or the newest of one group. */
export function rowsOf(answer: ListAnswer, kind: ListAnswerKind): { readonly rows: readonly AnswerRow[]; readonly rest: number } {
  if (kind !== 'attention' && kind !== 'tracked' && kind !== 'stopped') return { rows: answer.rows.slice(0, answer.recent), rest: answer.rowsMore };
  const rows = answer.rows.filter((row) => row.group === kind);
  return { rows, rest: Math.max(0, answer.groups[kind] - rows.length) };
}

/** Polish has no number in its word (*razy chciało otworzyć*); English and German do. */
const timesOf = (said: string, n: number): string => (said.includes(String(n)) ? said : `${n} ${said}`);

function rowLine(row: AnswerRow, t: Translate): string {
  const title = row.title === undefined ? t('an.untitled') : plain(row.title);
  const day = row.relative === undefined ? `${row.day.year}-${String(row.day.month).padStart(2, '0')}-${String(row.day.day).padStart(2, '0')}` : t('an.' + row.relative);
  return `- ${title} (${day} ${row.time}, ${heldOf(row, t)}${row.project === undefined ? '' : `, ${plain(row.project)}`}): ${t('look.' + row.look)}${filesSaid(row, t)} #${row.ref}`;
}

/** Which AI, and where it was held where the record says so: the row's badge, in words. */
const heldOf = (row: AnswerRow, t: Translate): string => `${PROVIDER_NAMES[row.provider]}${row.held === undefined ? '' : ` · ${t('held.' + row.held)}`}`;

/** What it met, in numbers: its private files by what happened to them, all its files, its helpers. */
function filesSaid(row: AnswerRow, t: Translate): string {
  const said = [
    ...(['read', 'changed', 'unknown', 'opened', 'stopped', 'name'] as const).filter((how) => row.files[how] > 0).map((how) => `${row.files[how]} ${t('an.n.' + how, { n: row.files[how] })}`),
    ...(row.all === undefined || row.all === 0 ? [] : [t('an.row.files', { n: row.all })]),
    ...(row.helpers === 0 ? [] : [`${row.helpers} ${t('an.n.helpers', { n: row.helpers })}`]),
  ];
  return said.length === 0 ? '' : ` - ${said.join(', ')}`;
}

const more = (n: number, t: Translate): string[] => (n === 0 ? [] : [`- ${t('an.more', { n })}`]);

const notChecked = (answer: ConversationAnswer, t: Translate): string[] =>
  answer.notChecked === undefined ? [] : ['', `${answer.look === 'unchecked' ? `${t('an.unchecked')}: ` : ''}${answer.notChecked.join(' · ')}`];

function fileOf(file: AnswerPath, t: Translate): string {
  return code(file.path) + (file.place === undefined ? '' : ` (${t('ch.' + file.place)})`);
}

/** Which AI met a file, in brackets; nothing where the record does not say. */
function whoOf(file: { readonly by?: readonly number[] }, t: Translate): string {
  const by = file.by ?? [];
  return by.length === 0 ? '' : ` (${by.map((one) => (one === 0 ? t('ch.ai') : t('st.helper', { ordinal: one }))).join(', ')})`;
}
