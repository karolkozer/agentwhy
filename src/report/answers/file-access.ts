// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { FileCount } from '../file-counts.ts';
import type { FileAccess, FileRow } from '../render/report-page/files.ts';

/**
 * A private file by the strongest thing that happened to it, as the page's own rows rank it: what is not known and what was stopped
 * before what was written. A list counts by it and a conversation's card too (TK4).
 */
export const accessOfCount = (count: FileCount): FileAccess =>
  count.read > 0 ? 'read' : count.unknown > 0 ? 'unknown' : count.opened > 0 ? 'opened' : count.stopped > 0 ? 'stopped' : count.changed > 0 ? 'changed' : 'name';

/** The page's own answer, but for a file an AI wrote and nothing more: its row has no word for that and says the name was seen. */
export const accessOfRow = (row: FileRow, counts: ReadonlyMap<string, FileCount>): FileAccess =>
  row.access === 'name' && (counts.get(row.path as string)?.changed ?? 0) > 0 ? 'changed' : row.access;
