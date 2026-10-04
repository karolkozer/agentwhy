// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { CodexListing, CodexSource } from './codex-session-discovery.ts';

/** One conversation as a list shows it: the file a report is read from, and what its tree says without reading it. */
export interface CodexConversation {
  readonly source: CodexSource;
  /** The newest change to any file of its tree: the conversation changed when any of its threads did. */
  readonly modifiedAt: number;
  /** Agents it started, from their first lines (X15); a reviewer is none (X19). */
  readonly delegations: number;
}

/**
 * The conversations of one listing (X5): every root, with the files whose parents lead to it, and every file whose
 * relation did not resolve, which is listed on its own rather than hidden as a thread of nothing. A resolved descendant
 * is never a row: lists show the root only. `keep` chooses the rows by their first file, before any file is looked at:
 * only the files of the rows kept are.
 */
export async function conversationsIn(
  listing: CodexListing,
  directories: DirectoryReader,
  keep: (root: CodexSource) => boolean = () => true,
): Promise<readonly CodexConversation[]> {
  // The files resolved to each root, gathered in one pass: thousands of rollouts are walked once, not once per row.
  const resolvedTo = new Map<number, number[]>();
  listing.sources.forEach((source, at) => {
    if (source.relation.kind !== 'resolved') return;
    const members = resolvedTo.get(source.relation.root);
    if (members === undefined) resolvedTo.set(source.relation.root, [at]);
    else members.push(at);
  });
  const rows = listing.sources.flatMap((source, index) => {
    const relation = source.relation;
    if ((relation.kind === 'resolved' && relation.root !== index) || !keep(source)) return [];
    return [{ source, index, members: relation.kind === 'resolved' ? (resolvedTo.get(index) ?? []) : [index] }];
  });
  return Promise.all(rows.map(async ({ source, index, members }): Promise<CodexConversation> => {
    const modified = await Promise.all(members.map((at) => modifiedAt(directories, listing.sources[at]?.path ?? '')));
    return {
      source,
      modifiedAt: Math.max(...modified),
      delegations: members.filter((at) => at !== index && listing.sources[at]?.header.origin.kind === 'spawned').length,
    };
  }));
}

async function modifiedAt(directories: DirectoryReader, path: string): Promise<number> {
  try {
    return await directories.modifiedAt(path);
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    return 0;
  }
}
