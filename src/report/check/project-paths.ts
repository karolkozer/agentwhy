// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../core/redaction/redacted.ts';
import type { MarkRecord } from '../../ports/mark-store.ts';
import type { IndexCheck, RowProject } from './check-lines.ts';
import type { Mark } from './marks.ts';
import type { SessionActions } from './session-actions.ts';

/**
 * `.ai/specs/2026-10-05-protected-everywhere.md` GD18: on the computer's page the same file in two projects - `.env` in
 * my-app and in blog - is two files, each with its own mark. A report names a file by its path in its own project, so
 * across projects a file is its project's folder and that path: one key, which the check, the marks and the counts
 * group by as they group by a path, and which is split again before anything is drawn. No path holds the separator.
 */
const BETWEEN = '\u0000';

export function inProject(folder: string, path: string): string {
  return folder + BETWEEN + path;
}

/** The project and the path a key holds; a path that is no key is a path of no project. */
export function outOfProject(key: string): { readonly folder?: string; readonly path: string } {
  const at = key.indexOf(BETWEEN);
  return at < 0 ? { path: key } : { folder: key.slice(0, at), path: key.slice(at + 1) };
}

/**
 * A session's actions with every file it names keyed by its project. Only what the check, the marks and the counts read
 * is keyed - the four lists that name a file; a key is a page's grouping, not a path any report shows.
 */
export function projectActions(folder: string, actions: SessionActions): SessionActions {
  const key = (path: Redacted): Redacted => inProject(folder, path as string) as Redacted;
  return {
    ...actions,
    rotate: actions.rotate.map((file) => ({ ...file, path: key(file.path) })),
    openRoutes: actions.openRoutes.map((route) => ({ ...route, path: key(route.path) })),
    onlyInResults: actions.onlyInResults.map(key),
    unknown: actions.unknown.map(key),
  };
}

/** One project's record of marks, each keyed by the project, so two projects' records read as one (GD18). */
export function projectRecords(folder: string, records: readonly MarkRecord[]): readonly MarkRecord[] {
  return records.map((record) => ({ ...record, path: inProject(folder, record.path) }));
}

/** The marks standing in one project, by the path its own reports name: what a report of it is drawn with. */
export function marksOfProject(folder: string, standing: ReadonlyMap<string, Mark>): ReadonlyMap<string, Mark> {
  const own = new Map<string, Mark>();
  for (const [key, mark] of standing) {
    const { folder: of, path } = outOfProject(key);
    if (of === folder) own.set(path, { ...mark, path });
  }
  return own;
}

/** The check as a page draws it: every row and every mark of the history back at its own path, naming its project. */
export function checkByProject(check: IndexCheck, project: (folder: string) => RowProject): IndexCheck {
  const split = (key: string): { readonly path: string; readonly project?: RowProject } => {
    const { folder, path } = outOfProject(key);
    return folder === undefined ? { path } : { path, project: project(folder) };
  };
  return {
    ...check,
    rows: check.rows.map((row) => {
      const { path, project: of } = split(row.path as string);
      return { ...row, path: path as Redacted, ...(of === undefined ? {} : { project: of }) };
    }),
    ...(check.history === undefined
      ? {}
      : {
          history: check.history.map((line) => {
            const { path, project: of } = split(line.path);
            return { ...line, path, ...(of === undefined ? {} : { project: of }) };
          }),
        }),
  };
}
