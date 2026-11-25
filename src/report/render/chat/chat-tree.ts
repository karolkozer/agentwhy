// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Translate } from '../report-copy.ts';
import type { FileAccess } from '../report-page/files.ts';

/**
 * SG12a (`specs/2026-11-23-the-story-at-a-glance.md`): what happened to a file, as one character - the strip's, so the
 * views and the strip say the same - and the order it is told in, worst first.
 */
export const ACCESS_MARK: Readonly<Record<FileAccess, string>> = { read: '■', changed: '■', unknown: '?', opened: '○', stopped: '×', name: '○' };
export const ACCESS_ORDER: readonly FileAccess[] = ['read', 'changed', 'unknown', 'opened', 'stopped', 'name'];

/** Names of one line before the rest are counted. */
const NAMES_SHOWN = 4;

/** A file as a tree holds it: its path as the chat may say it, and, outside the project, where it lies instead (AYD9). */
export interface TreeFile {
  readonly path: string;
  readonly mark?: string;
  readonly access: FileAccess;
}

/** A line of a tree and the lines under it. */
export interface TreeEntry {
  readonly text: string;
  readonly inner: readonly TreeEntry[];
}

interface Folder {
  readonly folders: Map<string, Folder>;
  readonly files: { readonly name: string; readonly mark?: string; readonly access: FileAccess }[];
  access?: FileAccess;
}

const emptyFolder = (): Folder => ({ folders: new Map(), files: [] });

/** A path on one line of a code block, with no backtick, so that it cannot close it. */
const flat = (text: string): string => text.replace(/\s+/g, ' ').replace(/`/g, "'");

/**
 * The files as a tree by folder: each folder named once, a chain of folders that hold nothing but one another said as one
 * name, and the files of a folder that ended alike on one line. A folder that is itself a file of the record - a search
 * refused, a name seen - carries its own mark before its name.
 */
export function fileTree(files: readonly TreeFile[], t: Translate): readonly TreeEntry[] {
  const root = emptyFolder();
  for (const file of files) {
    // Outside the project only the name and where it lies reach the chat (AYD9): it has no folder to stand in.
    const segments = file.mark === undefined ? file.path.split('/').filter((each) => each !== '') : [file.path];
    let at = root;
    for (const segment of segments.slice(0, -1)) {
      const next = at.folders.get(segment) ?? emptyFolder();
      at.folders.set(segment, next);
      at = next;
    }
    const name = segments.at(-1) ?? file.path;
    at.files.push({ name, access: file.access, ...(file.mark === undefined ? {} : { mark: file.mark }) });
  }
  return entriesOf(root, t);
}

function entriesOf(folder: Folder, t: Translate): readonly TreeEntry[] {
  // A file named as one of the folders beside it is that folder's own look.
  const own = folder.files.filter((file) => file.mark === undefined && folder.folders.has(file.name));
  for (const file of own) (folder.folders.get(file.name) as Folder).access = file.access;
  const files = folder.files.filter((file) => !own.includes(file));
  const groups = ACCESS_ORDER.flatMap((access) => {
    const alike = files.filter((file) => file.access === access);
    if (alike.length === 0) return [];
    const names = alike.map((file) => flat(file.name) + (file.mark === undefined ? '' : ` (${file.mark})`));
    const more = names.length - NAMES_SHOWN;
    return [{ text: `${ACCESS_MARK[access]} ${names.slice(0, NAMES_SHOWN).join(', ')}${more > 0 ? ' ' + t('sb.moreFiles', { n: more }) : ''}`, inner: [] }];
  });
  const folders = [...folder.folders].map(([name, inside]): TreeEntry => {
    let path = flat(name);
    let here = inside;
    while (here.files.length === 0 && here.access === undefined && here.folders.size === 1) {
      const [next] = [...here.folders] as [[string, Folder]];
      path += '/' + flat(next[0]);
      here = next[1];
    }
    return { text: `${here.access === undefined ? '' : ACCESS_MARK[here.access] + ' '}${path}/`, inner: entriesOf(here, t) };
  });
  return [...groups, ...folders];
}

/** The entries as the lines of a code block, each under its parent by a branch. */
export function treeLines(entries: readonly TreeEntry[], indent: string): readonly string[] {
  return entries.flatMap((entry, at) => {
    const last = at === entries.length - 1;
    return [`${indent}${last ? '└── ' : '├── '}${entry.text}`, ...treeLines(entry.inner, indent + (last ? '    ' : '│   '))];
  });
}
