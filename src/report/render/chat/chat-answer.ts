// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { absolutePathAt, insideProject } from '../../../core/project-root.ts';
import { PROVIDER_NAMES } from '../../../core/session-format.ts';
import { silentTrait } from '../../gap-reasons.ts';
import { refusedByRule } from '../../refusals.ts';
import type { GuardChangeView, ReportModel } from '../../report-model.ts';
import { actionsOf } from '../../check/session-actions.ts';
import { allowedOnly } from '../../start/conversations/periods.ts';
import { LOOK_OF_STATUS, statusOfRecord } from '../../start/render/session-status.ts';
import { filesOf } from '../../start/session-start.ts';
import { gapWords } from '../../start/conversations/conversation-columns.ts';
import type { Translate } from '../report-copy.ts';
import { fileRows, type FileAccess } from '../report-page/files.ts';
import { helperViews, type HelperReach } from '../report-page/helpers.ts';
import { nameOf } from '../report-page/item-names.ts';
import { toDoItems } from '../report-page/to-do.ts';
import type { Look } from '../ui/status-look.ts';
import { CHAT_VIEWS } from './chat-choice.ts';
import { stepStrip } from './chat-strip.ts';

/** How many files, helpers and to-dos the default answer names before *+N more* (AY: 15 lines at most). */
const FILES_SHOWN = 5;
const HELPERS_SHOWN = 3;
const TODOS_SHOWN = 3;
/** A task is quoted, never retold; past this it is cut, and the cut is said with an ellipsis. */
const TASK_CHARS = 120;

/** What a helper's reach is called, in the words a file's access is: one vocabulary in the answer. */
const ACCESS_OF_REACH: Readonly<Record<HelperReach, FileAccess>> = {
  read: 'read',
  opened: 'opened',
  named: 'name',
  unknown: 'unknown',
  stopped: 'stopped',
};

export const accessOfReach = (reach: HelperReach): FileAccess => ACCESS_OF_REACH[reach];

/**
 * Where the record is whole or not, read as the row reads it: its gaps all its format's silence on what no finding rests
 * on (`silentTrait`), or not (`session-report.ts`'s `whole`). The reasons are given only where it is not whole.
 */
export function lookOfReport(report: ReportModel): Look {
  const incomplete = !report.gaps.every(silentTrait);
  const look = LOOK_OF_STATUS[statusOfRecord({
    tally: report.tally,
    incomplete,
    ...(incomplete && report.gapReasons !== undefined ? { gaps: report.gapReasons } : {}),
  })];
  // F57a, as the row reads it: a read of only files the person chose Track for is its own look, nothing to fix - measured
  // 2026-11-21, 13 of 183 real conversations said "Read private files" here and "Read — tracked" on their row. A read the
  // person marked done since ("Read, now fixed") needs the record of marks, which `why` does not read (AYO6).
  return look === 'read' && allowedOnly(filesOf(actionsOf(report))) ? 'allowed' : look;
}

/**
 * A value from the record set inside Markdown as a code span: on one line, its fence one backtick longer than the longest
 * run inside it, so no value can close the span or start a line of its own (CommonMark's code span rule).
 */
export function code(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  return longest === 0 ? fence + flat + fence : `${fence} ${flat} ${fence}`;
}

/** Words from the record set as plain Markdown text: every character Markdown would read as markup said as itself. */
export function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]<>#|~!]/g, (mark) => '\\' + mark);
}

/** How the report says where its paths start: from the project's folder, or - with no one folder - as they were written. */
export type PathsRoot = ReportModel['scope']['paths']['root'];

/** A file as the chat says it: what is shown in the code span, and, for a file not in the project, where it lies. */
export interface ChatPath {
  readonly shown: string;
  readonly mark?: string;
}

/**
 * AY4 as decided 2026-11-22 (AYD9, AYO8): a file the report shows from the project's folder is named as the page names
 * it; any other by its name alone, marked - *outside this project* where the report knows the project's folder, and *the
 * page shows where* where it does not, since a path written whole may then lie inside it. The whole path stays on the
 * page: what the chat holds goes to the AI's provider. Each file keeps its own line, so every count is the page's (TK4).
 *
 * Asked as `--share` and the report's Protect it ask it (`insideProject`), of the path as the report shows it: with the
 * project's folder taken off already, a relative path that does not climb is inside, and nothing else is.
 */
export function chatPath(path: string, root: PathsRoot, t: Translate): ChatPath {
  const { shown, place } = placeInChat(path, root);
  return place === undefined ? { shown } : { shown, mark: t('ch.' + place) };
}

/** The same before any words: what an answer holds as data (`2026-11-24-talking-about-agentwhy.md` CV11). */
export function placeInChat(path: string, root: PathsRoot): { readonly shown: string; readonly place?: 'outside' | 'elsewhere' } {
  return inTheProject(path) ? { shown: path } : { shown: nameAlone(path), place: root === 'known' ? 'outside' : 'elsewhere' };
}

/** Called by a whole path, as Claude Code calls a project's folder (`-Users-someone-work-shop`, `C--Users-someone-shop`), wherever its root is. */
const CALLED_BY_A_PATH = /^(?:-[^-]+-|[A-Za-z]--)/;

/** AYD9: the name of what is no project file - of what holds it, where its own name is a path, as each folder of `.claude/projects` is. */
function nameAlone(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  const records = parts.findLastIndex((part, at) => part === 'projects' && parts[at - 1] === '.claude');
  if (records >= 0 && records >= parts.length - 2 && records < parts.length - 1) return '.claude/projects';
  const own = parts.findLastIndex((part) => !CALLED_BY_A_PATH.test(part));
  return own < 0 ? '…' : own === parts.length - 1 ? nameOf(path) : (parts[own] as string);
}

/** `~`, `~/…` and `~user/…`: a home. Not `~$budget.xlsx`, a lock file Office leaves beside a document. */
const HOME = /^~[\w.-]*(?:[\\/]|$)/;

/**
 * `insideProject`'s answer, but for the two forms it was not asked of (the review of 2026-11-22): a Windows share
 * (`\\server\share\…`), which `withSlashes` leaves with its backslashes and `insideProject` then takes for a relative
 * path - so the chat printed it whole as a project file; and a name that only starts with `~`, which is no home.
 */
function inTheProject(path: string): boolean {
  if (path.startsWith('\\\\')) return false;
  if (path.startsWith('~') && !HOME.test(path)) return insideProject('./' + path, { kind: 'absent' });
  return insideProject(path, { kind: 'absent' });
}

/** A file named in the chat's Markdown: its code span, and after it, in brackets, where it lies when not in the project. */
/**
 * One change to what protects the files, as the page's line says it (OG2, OG5), with each rule's file name as a code span:
 * what it did, and whether it ran.
 */
export function guardSentence(change: GuardChangeView, t: Translate): string {
  const plainEnd = (text: string): string => text.replace(/[.]$/, '');
  if (change.outcome === 'attempted') return `${t('gd.tried')}. ${t('gd.stopped')}`;
  const what = change.file === 'instructions' ? t('gd.instructions')
    : typeof change.said === 'string' ? t('gd.changed') + (change.said === 'not-in-record' ? `. ${plainEnd(t('gd.notInRecord'))}` : '')
    : change.said.map((one) => (one.kind === 'removed-check' ? t('gd.check') : t(GUARD_KEYS[one.kind], { name: code(one.pattern as string) }))).join('; ');
  const known = change.outcome === 'unknown' ? ` - ${plainEnd(t('gd.unknown'))}` : '';
  return `${what}${known}`;
}

const GUARD_KEYS: Readonly<Record<'took-out-block' | 'added-block' | 'added-allow' | 'changed-rule' | 'took-off-track', string>> = {
  'took-out-block': 'gd.tookOut',
  'added-block': 'gd.added',
  'added-allow': 'gd.allow',
  'changed-rule': 'gd.rule',
  'took-off-track': 'gd.offTrack',
};

export function named(path: string, root: PathsRoot, t: Translate): string {
  const { shown, mark } = chatPath(path, root, t);
  return code(shown) + (mark === undefined ? '' : ` (${mark})`);
}

/** The same as plain words, for a line with no code span: a diagram's, or a path inside a quoted task. */
export function namedPlain(path: string, root: PathsRoot, t: Translate): string {
  const { shown, mark } = chatPath(path, root, t);
  return mark === undefined ? shown : `${shown} (${mark})`;
}

/** A Windows share or a path that climbs out of the project, where free text holds one: places `--share`'s pattern leaves. */
const SHARE_OR_CLIMB = /(?<![\w.~@+-])(?:\\\\|\.\.[\\/])/;

/**
 * Where a task first names a place written whole - `--share`'s pattern (`absolutePathAt`), a share or a path that climbs
 * out - taken back to its URL's scheme where it has one (`https://…` is matched from its `//`); or -1.
 */
function placeAt(task: string): number {
  const found = [absolutePathAt(task), task.search(SHARE_OR_CLIMB)].filter((at) => at >= 0);
  if (found.length === 0) return -1;
  const first = Math.min(...found);
  const scheme = /[A-Za-z][\w+.-]*:$/.exec(task.slice(0, first));
  return scheme === null ? first : first - scheme[0].length;
}

/**
 * A task as it was given, on one line, quoted, so nothing in it reads as agentwhy's words or markup; cut where it is long,
 * and cut where it first names a place written whole (AYD11, decided 2026-11-22 after AYO11): where such a path ends
 * cannot be told - `OneDrive - Contoso Ltd\payroll` holds spaces - nor a route or a URL from a file, so the words before
 * it are quoted and nothing after it reaches the chat. The whole task stays on the page.
 */
function quoted(task: string): string {
  const { short, cut } = shortened(task);
  return plain(short) + (cut ? '…' : '');
}

/** The same with no Markdown: for a card, which sets its own text. */
export function quotedPlain(task: string): string {
  const { short, cut } = shortened(task);
  return short + (cut ? '…' : '');
}

function shortened(task: string): { readonly short: string; readonly cut: boolean } {
  const flat = task.replace(/\s+/g, ' ').trim();
  const at = placeAt(flat);
  const kept = at < 0 ? flat : flat.slice(0, at).trimEnd();
  const short = kept.length > TASK_CHARS ? kept.slice(0, TASK_CHARS - 1).trimEnd() : kept;
  return { short, cut: at >= 0 || short !== kept };
}

/**
 * What was stopped, said as who-stopped-it has it (WS4, `refusedByRule`): "your rules held" counts only the stops a rule
 * made - never one by the person at a prompt, by auto mode's reviewer or by a check that is not agentwhy's - and claims
 * nothing about what else was opened, since the look "Stopped" outranks an open file or a gap (the review of 2026-11-21).
 */
export function stopLines(report: ReportModel, look: Look, t: Translate): readonly string[] {
  const refused = report.tally.refusedAttempts;
  const byRule = refusedByRule(refused, report.tally.refusedByOthers);
  if (look === 'stopped' && byRule > 0) {
    return [t('ch.held', { n: byRule }), ...(refused > byRule ? [t('ch.stopped.notRule', { n: refused - byRule })] : [])];
  }
  return refused > 0 ? [t('ch.stopped', { n: refused })] : [];
}

/**
 * The default answer of `agentwhy why` (`2026-11-20-ask-your-ai-why.md` §3, AY1-AY4): the conversation's look in the
 * row's words, the good news first where the rules held, each private file with what happened to it, each helper that
 * reached one with its task quoted, what to do, what could not be checked - and the words that show more. Every part
 * is read from what the page reads, so the chat and the page cannot answer one question two ways (TK4).
 */
export function chatAnswer(report: ReportModel, t: Translate): string {
  const look = lookOfReport(report);
  const root = report.scope.paths.root;
  const lines: string[] = [`**agentwhy** · ${t('ch.this')}: **${t('look.' + look)}**`];

  lines.push(...stopLines(report, look, t));
  // SG12: the shape of the conversation in one line, before its files.
  const strip = stepStrip(report, t);
  if (strip.length > 0) lines.push('', ...strip);

  // The AI-changed-its-own-guard plan step 4: the chat says what changed in what protects the files, in the page's words.
  const guard = report.guardChanges ?? [];
  if (guard.length > 0) {
    lines.push('', `**${t('gd.heading')}**`);
    for (const change of guard.slice(0, FILES_SHOWN)) lines.push(`- ${named(change.path as string, root, t)} - ${guardSentence(change, t)}`);
    if (guard.length > FILES_SHOWN) lines.push(`- ${t('ch.more', { n: guard.length - FILES_SHOWN })}`);
  }

  const items = toDoItems(report);
  const files = fileRows(report, items, new Set(), undefined).filter((row) => row.private);
  if (files.length > 0) {
    lines.push('', `**${t('ch.files')}**`);
    for (const row of files.slice(0, FILES_SHOWN)) lines.push(`- ${named(row.path, root, t)} - ${t('ch.access.' + row.access)}`);
    if (files.length > FILES_SHOWN) lines.push(`- ${t('ch.more', { n: files.length - FILES_SHOWN })}`);
  }

  const helpers = helperViews(report).filter((view) => view.agent.ordinal !== undefined && view.files.length > 0);
  if (helpers.length > 0) {
    lines.push('', `**${t('ch.helpers')}**`);
    for (const view of helpers.slice(0, HELPERS_SHOWN)) {
      const who = t('st.helper', { ordinal: view.agent.ordinal ?? 0 });
      const asked = view.agent.askedTo === undefined ? '' : `, ${t('ch.asked', { task: quoted(view.agent.askedTo) })}`;
      const reached = view.files.slice(0, 2).map((file) => `${named(file.path, root, t)} ${t('ch.access.' + ACCESS_OF_REACH[file.reach])}`).join(', ');
      const more = view.files.length > 2 ? `, ${t('ch.more', { n: view.files.length - 2 })}` : '';
      lines.push(`- ${who}${asked}: ${reached}${more}`);
    }
    if (helpers.length > HELPERS_SHOWN) lines.push(`- ${t('ch.more', { n: helpers.length - HELPERS_SHOWN })}`);
  }

  if (items.length > 0) {
    lines.push('', `**${t('ch.todo')}**`);
    for (const item of items.slice(0, TODOS_SHOWN)) lines.push(`- ${t('ch.todo.' + item.kind, { file: named(item.path, root, t) })}`);
    if (items.length > TODOS_SHOWN) lines.push(`- ${t('ch.more', { n: items.length - TODOS_SHOWN })}`);
  }

  // F17, TK2: what could not be checked is said wherever the row says it, never left out to make the answer look clean.
  const gaps = report.gapReasons;
  if (gaps !== undefined && (look === 'unchecked' || (look === 'none' && gaps.format === true))) {
    const reasons = gapWords(gaps, PROVIDER_NAMES[report.scope.provider]).map(({ key, vars }) => t(key, vars));
    // Under "Nothing private" the row gives the reason alone (F17 as amended): the look is already said above.
    lines.push('', `${look === 'unchecked' ? `${t('look.unchecked')}: ` : ''}${reasons.join(' · ')}`);
  } else if (look === 'none' && files.length === 0) {
    lines.push('', t('ch.none'));
  }

  lines.push('', t('ch.words', { words: CHAT_VIEWS.map((view) => code(view)).join(' · ') }));
  return lines.join('\n') + '\n';
}
