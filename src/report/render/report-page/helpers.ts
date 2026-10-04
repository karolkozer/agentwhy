// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Redacted } from '../../../core/redaction/redacted.ts';
import { isTemplate } from '../../check/session-actions.ts';
import type { ReportModel } from '../../report-model.ts';
import { entryOf, storyAgents, type StoryAgent, type StoryKind } from './file-story.ts';

/**
 * Every AI of the session as the Helpers view shows it (the report page spec P26-P30): your AI first, then each helper by
 * its ordinal, with what it did to private files, read from the flows and nothing else.
 *
 * `read` - it read a private file's contents; `sample` - it only reached files named as templates (R12c); `named` - it
 * reached a private file and was shown no value from it; `unknown` - a call of it named one and its outcome is not
 * recorded, which is never folded away as "nothing real" (invariant 4); `stopped` - a rule refused it; `none` - it did
 * not touch a private file; `empty` - no action of it was recorded at all, which is not the same as doing nothing.
 */
export type HelperStatus = 'read' | 'sample' | 'named' | 'unknown' | 'stopped' | 'none' | 'empty';

/** How far it got with one private file: the strongest of what its steps say. */
export type HelperReach = 'read' | 'named' | 'unknown' | 'stopped';

export interface HelperView {
  readonly agent: StoryAgent;
  readonly status: HelperStatus;
  /** Each private file it reached, under the strongest thing known, in the order it first reached them. */
  readonly files: readonly { readonly path: Redacted; readonly reach: HelperReach }[];
  /** A value from a private file went on from it: to another AI (handed in instructions, or sent back), into a file, its own words, a command. */
  readonly passed: boolean;
  /**
   * What it sent back is not known: its reply never arrived, or could not be read (where-the-value-went R5). Never said
   * as "no" - it may have carried the value.
   */
  readonly passedUnknown: boolean;
  readonly saved: boolean;
  readonly repeated: boolean;
  readonly used: boolean;
}

const RANK: readonly HelperReach[] = ['read', 'unknown', 'named', 'stopped'];

export function helperViews(report: ReportModel): readonly HelperView[] {
  const agentOf = storyAgents(report);
  const helpers = [...report.graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index);
  const order = [report.graph.main, ...helpers];

  return order.map((graphAgent): HelperView => {
    const agent = agentOf(graphAgent.index);
    const flow = report.flows.find((each) => each.agentIndex === graphAgent.index);
    const files = new Map<string, { path: Redacted; reach: HelperReach }>();
    const kinds = new Set<StoryKind>();
    let unknownReply = false;
    for (const step of flow?.steps ?? []) {
      if (step.kind === 'returned' && (step.awaited === true || step.strength === 'unknown')) unknownReply = true;
      const paths = step.kind === 'reached' || step.kind === 'used' || step.kind === 'returned' || step.kind === 'received' ? step.files : [];
      for (const path of paths) {
        const entry = entryOf(step, path, agent, agentOf);
        if (entry === undefined) continue;
        kinds.add(entry.kind);
        const reach = reachOf(entry.kind);
        if (reach === undefined) continue;
        const known = files.get(path);
        if (known === undefined || RANK.indexOf(reach) < RANK.indexOf(known.reach)) files.set(path, { path, reach });
      }
    }
    const reached = [...files.values()];
    const has = (reach: HelperReach): boolean => reached.some((file) => file.reach === reach);
    const status: HelperStatus = has('read') ? 'read'
      : has('unknown') ? 'unknown'
        : has('named') ? (reached.filter((file) => file.reach === 'named').every((file) => isTemplate(file.path)) ? 'sample' : 'named')
          : has('stopped') || graphAgent.refusedAttempts > 0 ? 'stopped' : graphAgent.actions === 0 ? 'empty' : 'none';
    return {
      agent,
      status,
      files: reached,
      passed: kinds.has('passed') || kinds.has('handed'),
      passedUnknown: unknownReply && !kinds.has('passed') && !kinds.has('handed'),
      saved: kinds.has('saved'),
      repeated: kinds.has('repeated'),
      used: kinds.has('used'),
    };
  });
}

function reachOf(kind: StoryKind): HelperReach | undefined {
  return kind === 'read' || kind === 'named' || kind === 'unknown' || kind === 'stopped' ? kind : undefined;
}
