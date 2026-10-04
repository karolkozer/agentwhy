// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { matchesGlob } from '../../../core/policy/glob.ts';
import type { Redacted } from '../../../core/redaction/redacted.ts';
import type { ReportModel } from '../../report-model.ts';
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
}

const REACH: Readonly<Record<HelperReach, FileAccess>> = { read: 'read', unknown: 'unknown', named: 'name', stopped: 'stopped' };
const STRENGTH: readonly FileAccess[] = ['read', 'unknown', 'name', 'stopped', 'changed'];

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
    access: file.how === 'changed' ? 'changed' : file.how === 'stopped' ? 'stopped' : 'read',
    protection: 'na',
    group: 'none',
    kind: kindOfName(nameOf(file.path)),
  }));
  return [...privateRows, ...everydayRows];
}

/** A private file the AI only saw the name of: nothing shows it opened it, or that it exists. */
export function onlyNamed(row: FileRow): boolean {
  return row.private && row.access === 'name';
}

/**
 * How many files the Files tab lists, as the report's sidebar counts them: every row but a name only seen. Marks and
 * rules change a row's group and protection, never whether it is a row, so none is needed to count them.
 */
export function listedFiles(report: ReportModel): number {
  return fileRows(report, toDoItems(report), new Set(), undefined).filter((row) => !onlyNamed(row)).length;
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
