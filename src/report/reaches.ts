// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { fileOperandsIn } from '../core/access/command-line.ts';
import { everydayReach, readsContent, readsContentOf, type ProtectedAccess } from '../core/access/protected-access.ts';
import { stringsIn } from '../core/access/path-tokens.ts';
import { wordsPlaced } from '../core/access/protected-access.ts';
import type { ToolEvent } from '../core/event.ts';
import type { Policy } from '../core/policy/policy.ts';
import type { FileHow } from './report-model.ts';

/** One file one call reached, raw: the path crosses the redaction boundary where the caller puts it in the model. */
export interface Reach {
  readonly path: string;
  readonly how: FileHow;
  /** The protected access behind it, where a protected pattern matched the path. */
  readonly access?: ProtectedAccess;
}

/** Where the run's calls were read: the home a `~` means, and the names a command wrote that the disk says are no file. */
export interface ReachPlace {
  readonly home?: string;
  /** RW16: the conversation's root, against which a line run elsewhere is placed. */
  readonly root?: string;
  /** NX2: a name a command wrote that is no file - no row, and so no step. */
  readonly isNoFile?: (eventId: string, path: string) => boolean;
}

/**
 * The files one call reached, and what it did to each (`2026-10-11-step-by-step.md` SB3): stopped where the call or the
 * access was refused, not known where the access's end is not, changed where the call wrote it, read where its text came
 * back or a printer printed it, else a name only seen. Named in the call first, then in the order its output printed
 * them. One rule, so a Files row and a step can never disagree about a call.
 */
export function reachesOf(event: ToolEvent, accesses: readonly ProtectedAccess[], policy: Policy, place: ReachPlace = {}): Reach[] {
  const output = stringsIn(event.result?.content).join('\n');
  const reach = new Map(everydayReach(event, policy, wordsPlaced(event, place.home, place.root), place.home, place.root)
    .filter((one) => one.written !== true || place.isNoFile?.(event.id, one.path) !== true)
    .map((one) => [one.path, one.how]));
  const accessAt = new Map(accesses.map((access) => [access.path, access]));
  const paths = [...new Set([...accesses.map((access) => access.path), ...event.targets, ...reach.keys()])].filter((path) => path !== '');
  const operands = new Set(fileOperandsIn(event.commands));
  // FN11: the call's operands and output are asked with the word as the line wrote it.
  const wordOf = (path: string): string => accessAt.get(path)?.word ?? path;
  const howOf = (path: string): FileHow => {
    const access = accessAt.get(path);
    const word = wordOf(path);
    if (event.outcome === 'blocked' || access?.outcome === 'blocked') return 'stopped';
    if (access?.outcome === 'unknown') return 'unknown';
    if (event.written !== undefined && event.targets.includes(path)) return 'changed';
    if ((access?.lines ?? 0) > 0 || reach.get(path) === 'read') return 'read';
    if (reach.get(path) === 'unknown') return 'unknown';
    const opened = (event.resultShape === 'content' && event.targets.includes(path)) ||
      (readsContent(event) && operands.has(word)) || readsContentOf(event, word);
    return event.outcome === 'succeeded' && opened ? 'read' : 'named';
  };
  return paths.map((path) => ({ path, at: output.indexOf(wordOf(path)) }))
    .sort((a, b) => a.at - b.at)
    .map(({ path }) => {
      const access = accessAt.get(path);
      return { path, how: howOf(path), ...(access === undefined ? {} : { access }) };
    });
}
