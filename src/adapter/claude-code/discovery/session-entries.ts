// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join } from 'node:path';
import type { DirectoryEntry } from '../../../ports/directory-reader.ts';
import { byString } from '../../../shared/compare.ts';
import { LAYOUT, isToolResultFileName, parseSubagentFileName, subagentFileName } from '../contract/layout.ts';
import type { Presence, SubagentSource } from './discovered-session.ts';

/** A directory as discovery saw it: its presence, and its entries when it could be listed. */
export interface Listing {
  readonly presence: Presence;
  readonly entries: readonly DirectoryEntry[];
}

export function pairSubagentFiles(listing: Listing): { sources: SubagentSource[]; unrecognised: string[] } {
  const found = new Map<string, { transcript: boolean; meta: boolean }>();
  const unrecognised: string[] = [];

  for (const entry of listing.entries) {
    const parsed = entry.kind === 'file' ? parseSubagentFileName(entry.name) : undefined;
    if (parsed === undefined) {
      unrecognised.push(join(LAYOUT.subagentsDir, entry.name));
      continue;
    }
    const seen = found.get(parsed.fileId) ?? { transcript: false, meta: false };
    seen[parsed.kind] = true;
    found.set(parsed.fileId, seen);
  }

  const dir = listing.presence.path;
  const sources = [...found]
    .sort(([a], [b]) => byString(a, b))
    .map(
      ([fileId, seen]): SubagentSource => ({
        fileId,
        transcript: listed(dir, subagentFileName(fileId, 'transcript'), seen.transcript),
        meta: listed(dir, subagentFileName(fileId, 'meta'), seen.meta),
      }),
    );

  return { sources, unrecognised };
}

export function splitToolResults(listing: Listing): { files: string[]; unrecognised: string[] } {
  const files: string[] = [];
  const unrecognised: string[] = [];

  for (const entry of listing.entries) {
    if (entry.kind === 'file' && isToolResultFileName(entry.name)) files.push(entry.name);
    else unrecognised.push(join(LAYOUT.toolResultsDir, entry.name));
  }

  return { files: files.sort(byString), unrecognised };
}

function listed(dir: string, name: string, isPresent: boolean): Presence {
  const path = join(dir, name);
  return isPresent ? { present: true, path } : { present: false, path, reason: 'not-found' };
}
