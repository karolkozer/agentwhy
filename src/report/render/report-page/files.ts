// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from '../../../core/policy/glob.ts';
import type { Redacted } from '../../../core/redaction/redacted.ts';
import type { FileStep, ReportModel } from '../../report-model.ts';
import { helperViews, type HelperReach } from './helpers.ts';
import { nameOf, ruleKey } from './item-names.ts';
import { toDoItems, type ToDoItem } from './to-do.ts';

/**
 * Every file the AI reached, counted once (the report page spec P31-P36): every private file however it was reached,
 * and every everyday file a file tool read or wrote (M6). A file only a shell command named is a row only where it is
 * private - finding a file in a command line is a guess made only against the policy.
 */

/** What the AI did to it: `read` its contents, saw its `name`, an outcome not recorded, `stopped`, or `changed` it. */
export type FileAccess = 'read' | 'name' | 'unknown' | 'stopped' | 'changed';

/**
 * M3: `yes` - a deny rule in the project's own settings matches it, so Claude Code refuses the tool; `no` - only the
 * built-in list or a policy file does; `unknown` - a settings file could not be read, so it cannot be said; `na` - an
 * everyday file, which no rule marks private.
 */
/** `told`: private, and the person chose to let the agent read it and be told (F57) - not a file left unprotected. */
export type FileProtection = 'yes' | 'no' | 'unknown' | 'na' | 'told';

/** `fix` - on the to-do list and not done; `fixed` - on it and done; `none` - nothing to do. */
export type FileGroup = 'fix' | 'fixed' | 'none';

export interface FileRow {
  readonly path: Redacted;
  readonly private: boolean;
  readonly access: FileAccess;
  readonly protection: FileProtection;
  readonly group: FileGroup;
  /** Its place on the to-do list, where it is on it. */
  readonly item?: number;
  /** The word key of what it is (P33): a rule's human name, or one of the fixed table's. Never read from the file. */
  readonly kind: string;
  /** OW1, OW3: the first action that reached it. Absent where the model gives none. */
  readonly step?: RowStep;
}

/**
 * Where a file first came up (`the-order-it-went.md` OW1, OW3): the AI's place in the page's order of AIs, the helper's
 * number where it is one, which time that AI came across files - 1, 2, 3 with no gaps, since a person does not count the
 * actions that touched none (OWD1, amended) - and the file's place among those that came up together.
 */
export interface RowStep {
  readonly rank: number;
  readonly helper?: number;
  readonly number: number;
  readonly place: number;
}

/** Each file's step, by its path, with each AI ranked as the Helpers tab orders them: Your AI, then helpers by number. */
function stepsOf(report: ReportModel, accessOf: ReadonlyMap<string, FileAccess>): ReadonlyMap<string, RowStep> {
  const helpers = [...report.graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index);
  const agents = new Map([report.graph.main, ...helpers].map((agent, rank) => [agent.index, { rank, ordinal: agent === report.graph.main ? undefined : agent.ordinal }]));
  // OW1 as amended 2026-10-05: a row stands at the first step that did to its file what the row says - the read after
  // the listing that named it - else at the first that reached it. The steps come in the page's order of AIs.
  const chosen = new Map<string, FileStep>();
  for (const step of report.fileSteps ?? []) {
    const access = accessOf.get(step.path);
    const fits = (one: FileStep): boolean => access !== undefined && one.how === HOW[access];
    const known = chosen.get(step.path);
    if (known === undefined || (!fits(known) && fits(step))) chosen.set(step.path, step);
  }
  // Each AI's moments, in its own order, numbered from 1: the action's own number stays in Advanced.
  const times = new Map<number, number[]>();
  for (const step of chosen.values()) times.set(step.agentIndex, [...new Set([...(times.get(step.agentIndex) ?? []), step.step])].sort((a, b) => a - b));
  return new Map([...chosen.values()].flatMap((step): [string, RowStep][] => {
    const agent = agents.get(step.agentIndex);
    if (agent === undefined) return [];
    return [[step.path as string, {
      rank: agent.rank, ...(agent.ordinal === undefined ? {} : { helper: agent.ordinal }),
      number: (times.get(step.agentIndex) ?? []).indexOf(step.step) + 1, place: step.place,
    }]];
  }));
}

const REACH: Readonly<Record<HelperReach, FileAccess>> = { read: 'read', unknown: 'unknown', named: 'name', stopped: 'stopped' };
/** What an action did to a file, in the model's words, for each thing a row says. */
const HOW: Readonly<Record<FileAccess, NonNullable<FileStep['how']>>> = { read: 'read', name: 'named', unknown: 'unknown', stopped: 'stopped', changed: 'changed' };
// A stop outranks a name seen (changed 2026-10-05 by the maintainer): `rg --files` found it, `cat` of it was stopped -
// the rule held, which the person is to hear, and the name alone is the step before it.
const STRENGTH: readonly FileAccess[] = ['read', 'unknown', 'stopped', 'name', 'changed'];

export function fileRows(report: ReportModel, items: readonly ToDoItem[], done: ReadonlySet<string>, denied: readonly string[] | undefined): readonly FileRow[] {
  const patternOf = new Map(report.findings.map((finding) => [finding.path as string, finding.pattern as string]));
  const reached = new Map<string, { path: Redacted; access: FileAccess }>();
  const note = (path: Redacted, access: FileAccess): void => {
    const known = reached.get(path);
    if (known === undefined || STRENGTH.indexOf(access) < STRENGTH.indexOf(known.access)) reached.set(path, { path, access });
  };
  // A file on the to-do list had its contents reach an agent, whichever way the record says it did.
  for (const item of items) note(item.path, 'read');
  for (const view of helperViews(report)) for (const file of view.files) note(file.path, REACH[file.reach]);

  const told = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path as string));
  const protectionOf = (path: string): FileProtection => {
    if (denied === undefined) return told.has(path) ? 'told' : 'unknown';
    const forms = [path, path + '/'];
    if (denied.some((pattern) => forms.some((form) => matchesGlob(form, pattern)))) return 'yes';
    return told.has(path) ? 'told' : 'no';
  };
  const privateRows = [...reached.values()].map(({ path, access }): FileRow => {
    const at = items.findIndex((item) => item.path === path);
    return {
      path,
      private: true,
      access,
      protection: protectionOf(path),
      group: at < 0 ? 'none' : done.has(path) ? 'fixed' : 'fix',
      ...(at < 0 ? {} : { item: at }),
      kind: ruleKey(patternOf.get(path)) ?? 'rp.item.private',
    };
  });
  const rank = (row: FileRow): number => (row.group === 'fix' ? 0 : row.group === 'fixed' ? 1 : 2);
  privateRows.sort((a, b) => rank(a) - rank(b) || (a.item ?? Infinity) - (b.item ?? Infinity) || STRENGTH.indexOf(a.access) - STRENGTH.indexOf(b.access));

  const everydayRows = report.everydayFiles.filter((file) => !reached.has(file.path)).map((file): FileRow => ({
    path: file.path,
    private: false,
    access: file.how === 'changed' ? 'changed' : file.how === 'stopped' ? 'stopped' : file.how === 'named' ? 'name' : 'read',
    protection: 'na',
    group: 'none',
    kind: kindOfName(nameOf(file.path)),
  }));
  const rows = [...privateRows, ...everydayRows];
  // A row's step is chosen by what the row says, so it is found once every row is.
  const steps = stepsOf(report, new Map(rows.map((row) => [row.path as string, row.access])));
  return rows.map((row) => {
    const step = steps.get(row.path);
    return step === undefined ? row : { ...row, step };
  });
}

/**
 * A file the AI only saw the name of, private or not: nothing shows it opened it, or that it exists, so it is never
 * counted as opened (P32a) - a row of the table all the same.
 */
export function onlyNamed(row: FileRow): boolean {
  return row.access === 'name';
}

/**
 * How many rows the Files tab lists - what a conversation's "See all {n} files" leads to (F14). Every row, a name only
 * seen among them (changed 2026-10-05: a session whose AI listed a folder had no link to the files it saw); the
 * sidebar's count and the tab's heading keep to the files opened (P32a). Marks and rules change a row's group and
 * protection, never whether it is a row, so none is needed to count them.
 */
export function listedFiles(report: ReportModel): number {
  return fileRows(report, toDoItems(report), new Set(), undefined).length;
}

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|vue|svelte|css|scss|html|sql)$/i;

/** P33's fixed table: what an everyday file is, from its name alone. */
export function kindOfName(name: string): string {
  if (/^(AGENTS|CLAUDE)\.md$/i.test(name)) return 'fl.kind.aiNotes';
  if (/\.(md|txt)$/i.test(name)) return 'fl.kind.notes';
  if (/\.(json|ya?ml|toml)$/i.test(name) || name.startsWith('.')) return 'fl.kind.settings';
  if (SOURCE.test(name)) return 'fl.kind.code';
  return 'fl.kind.file';
}
