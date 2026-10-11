// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { escapeHtml as e } from '../html-report-components.ts';

/**
 * A path drawn so it is read at a glance (`2026-10-10-a-path-at-a-glance.md` PG1, PG2): its name in the file chip
 * (guidelines §4), whole, and its folder under it - grey, after a folder mark, its folders joined by `›` and broken only
 * between them. Found 2026-10-10: one chip holding the whole path broke inside a word, `…/exerci` over `se.py`, which cut
 * the very part a person recognises. Each page gives the chip its own class, so it keeps its own size and spacing.
 */

/** The folders a path lies in and its own name. A closing `/` is a folder's, and no part of its name. */
export function pathParts(path: string): { readonly folders: readonly string[]; readonly name: string } {
  const parts = path.replace(/\/+$/, '').split('/').filter((part) => part !== '');
  const name = parts.pop() ?? path;
  // A whole path keeps where it starts: `/etc/hosts` lies in `/` and `etc`, never in `etc` alone.
  return { folders: path.startsWith('/') ? ['/', ...parts] : parts, name };
}

/** The folder mark, the same wherever a folder is drawn. */
export const FOLDER_MARK = '<svg class="fp-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';

/** A breadcrumb of folders: each whole, `›` between them, a line broken only after a `›`. */
export function folderCrumbs(folders: readonly string[]): string {
  return folders.map(e).join('<span class="fp-sep" aria-hidden="true">›</span><wbr>');
}

export interface PathOptions {
  /** The chip's class on the page that draws it: `fl-chip` in the Files list, `chip set-rule-chip` in Settings. */
  readonly chip: string;
  /** The path is a folder (PG2): the chip carries the folder mark and a closing `/`. */
  readonly folder?: boolean;
  /** What the chip says where the path has no folder - a page's own short name for a file at the root. */
  readonly rootName?: string;
  /** The chip's tooltip where it is not the path: Settings keeps the rule as it is written. */
  readonly title?: string;
}

/**
 * PG1: the name in the chip, and the folder under it where there is one. The folder line is `fp-where`, which a page may
 * hide where the folder is said once above the rows (PG3); the whole path stays the chip's tooltip either way, unless the
 * page gives its own.
 */
export function pathCell(path: string, options: PathOptions): string {
  const { folders, name } = pathParts(path);
  const shown = folders.length === 0 && options.rootName !== undefined ? options.rootName : name;
  const chip = '<span class="' + options.chip + ' fp-name' + (options.folder === true ? ' fp-folder' : '') + '" title="' + e(options.title ?? path) + '">' +
    (options.folder === true ? FOLDER_MARK : '') + e(shown) + (options.folder === true ? '/' : '') + '</span>';
  return chip + folderLine(path);
}

/** PG1's folder line alone, for a page that draws the name in a chip of its own layout: nothing at the root. */
export function folderLine(path: string): string {
  const { folders } = pathParts(path);
  return folders.length === 0 ? '' : '<span class="fp-where">' + FOLDER_MARK + '<span class="fp-crumbs">' + folderCrumbs(folders) + '</span></span>';
}

/**
 * PG3: what a folder's row says over the files grouped under it - its mark and its breadcrumb. The project's own main
 * folder, `''`, has no breadcrumb, and is said in the page's words (`rootLabel`, already drawn).
 */
export function folderHeading(folder: string, rootLabel: string): string {
  return '<span class="fp-heading">' + FOLDER_MARK + (folder === ''
    ? '<span class="fp-root">' + rootLabel + '</span>'
    : '<span class="fp-crumbs">' + folderCrumbs(pathParts(folder + '/x').folders) + '</span>') + '</span>';
}

export const FILE_PATH_STYLE = String.raw`
.fp-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.fp-folder{display:inline-flex;align-items:center;gap:5px}
.fp-mark{width:14px;height:14px;flex:none;color:var(--text-4)}
.fp-folder .fp-mark{color:var(--text-3)}
.fp-where{display:flex;align-items:flex-start;gap:6px;margin-top:7px;font-family:var(--mono);font-size:12.5px;line-height:1.5;color:var(--text-3);overflow-wrap:normal;word-break:normal;min-width:0}
.fp-where .fp-mark{margin-top:2px}
.fp-sep{color:var(--text-4);padding-inline:5px}
.fp-heading{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:13px;font-weight:500;line-height:1.5;color:var(--text-2);overflow-wrap:normal;word-break:normal;min-width:0}
.fp-heading .fp-mark{width:15px;height:15px;color:var(--text-3)}
.fp-root{font-family:var(--sans);font-size:13.5px}
`;
