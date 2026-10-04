// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename } from 'node:path';
import { MAIN_AGENT_TYPE, type Agent } from '../../../core/agent.ts';
import { correlate } from '../../../core/correlation/correlate.ts';
import { agentSource, mainSource, reviewSource } from '../../../core/evidence.ts';
import type { SessionModel } from '../../../core/session-model.ts';
import type { SessionSource } from '../../../core/session-source.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import type { CodexSessionDiscovery, TreeMember } from '../discovery/codex-session-discovery.ts';
import type { CodexSessionIndex } from '../discovery/codex-session-index.ts';
import type { SessionHeader } from '../discovery/session-header.ts';
import { scanRollout, type Collected, type FileRole } from './rollout-scan.ts';

export interface CodexSessionSourceDependencies {
  readonly discovery: CodexSessionDiscovery;
  readonly files: FileReader;
  /** The supported sessions root, `~/.codex/sessions` (X1); `$CODEX_HOME` is not measured (XB6). */
  readonly sessionsRoot: string;
  /** The catalogue's latest listing of that root, where one was taken: read instead of walking the root again. */
  readonly index?: CodexSessionIndex;
}

/**
 * Reads a Codex conversation into the core's model: the rollout asked for and every rollout whose recorded parents lead
 * to it (X5), each read by `scanRollout`, joined by `correlate`. A reviewer's file is a review, never an agent (X19).
 */
export class CodexSessionSource implements SessionSource {
  readonly #discovery: CodexSessionDiscovery;
  readonly #files: FileReader;
  readonly #sessionsRoot: string;
  readonly #index: CodexSessionIndex | undefined;

  constructor(dependencies: CodexSessionSourceDependencies) {
    this.#discovery = dependencies.discovery;
    this.#files = dependencies.files;
    this.#sessionsRoot = dependencies.sessionsRoot;
    this.#index = dependencies.index;
  }

  async read(input: string): Promise<SessionModel> {
    const collected = emptyCollection();
    const tree = await this.#discovery.tree(input, this.#sessionsRoot, this.#index?.latest());
    if (tree.kind !== 'tree') {
      // Not a Codex session, or not readable: there is no session to report on, and saying so is the whole answer.
      collected.gaps.push({ kind: 'session-missing' });
      return correlate(recordsOf(basename(input), collected));
    }

    const roles = rolesOf(tree.members);
    const root = roles[0] as FileRole;
    collected.agents.push({ id: root.agentId, type: MAIN_AGENT_TYPE, depth: 0 });
    for (const role of roles.slice(1)) if (role.kind === 'agent') collected.agents.push(agentOf(role));
    // The root's id is another file's too, so no child could join it (X3); and a folder or file the search could not
    // read may have held a part of this conversation. A file it read whose first line is no Codex session's could not:
    // the chain is found by that line alone (X5), so it is no member of any tree, and `doctor` is where it is counted.
    if (tree.rootShared) collected.gaps.push({ kind: 'relation-unresolved', agentId: root.agentId });
    collected.gaps.push(...tree.gaps.filter((gap) => gap.reason !== 'unknown-format').map(() => ({ kind: 'source-missing' as const })));

    for (const [index, member] of tree.members.entries()) await scanRollout(this.#files, member.path, roles[index] as FileRole, collected);

    // A started agent whose own file is not here still started: it is kept, and its missing record said (X16).
    const known = new Set(collected.agents.map((agent) => agent.id));
    for (const entry of collected.delegationIndex) {
      if (known.has(entry.agentId)) continue;
      known.add(entry.agentId);
      collected.agents.push({ id: entry.agentId, ...(entry.requestedType === undefined ? {} : { type: entry.requestedType }) });
      collected.gaps.push({ kind: 'source-missing', agentId: entry.agentId });
    }
    return correlate(recordsOf(root.agentId, collected));
  }
}

/** Who each file is, from the tree alone: the root is the conversation; a child is an agent, a reviewer, or unknown. */
function rolesOf(members: readonly TreeMember[]): FileRole[] {
  const threads = new Map(members.map((member) => [member.header.id, member.header]));
  return members.map((member, index): FileRole => {
    const id = member.header.id;
    const parent = member.parent === undefined ? undefined : members[member.parent];
    const reviewer = index > 0 && member.header.origin.kind === 'reviewer';
    return {
      header: member.header,
      kind: reviewer ? 'reviewer' : 'agent',
      agentId: id,
      source: index === 0 ? mainSource() : reviewer ? reviewSource(id) : agentSource(id),
      ...(reviewer && parent !== undefined && parent.header.origin.kind !== 'reviewer' ? { reviewedAgentId: parent.header.id } : {}),
      idScope: index === 0 ? '' : `${index}:`,
      childByPath: childrenByPath(members, index),
      threads,
    };
  });
}

/** An agent's started children by `agent_path`. A name two of them share names neither (X18). */
function childrenByPath(members: readonly TreeMember[], index: number): Map<string, string | undefined> {
  const byPath = new Map<string, string | undefined>();
  for (const member of members) {
    const origin = member.header.origin;
    if (member.parent !== index || origin.kind !== 'spawned' || origin.agentPath === undefined) continue;
    byPath.set(origin.agentPath, byPath.has(origin.agentPath) ? undefined : member.header.id);
  }
  return byPath;
}

/** X15: a started agent's type is its role where one is set, and `subagent` otherwise; its depth is the one recorded. */
function agentOf(role: FileRole): Agent {
  const origin: SessionHeader['origin'] = role.header.origin;
  if (origin.kind !== 'spawned') return { id: role.agentId };
  return { id: role.agentId, type: origin.role ?? 'subagent', ...(origin.depth === undefined ? {} : { depth: origin.depth }) };
}

function emptyCollection(): Collected {
  return {
    agents: [], calls: [], results: [], delegations: [], delegationIndex: [], followUps: [], followUpIndex: [], messages: [],
    agentReports: [], turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], gaps: [], workingDirectories: new Set(),
  };
}

function recordsOf(sessionId: string, collected: Collected): Parameters<typeof correlate>[0] {
  return {
    sessionId,
    provider: 'codex',
    agents: collected.agents,
    calls: collected.calls,
    results: collected.results,
    delegations: collected.delegations,
    delegationIndex: collected.delegationIndex,
    messages: collected.messages,
    // Codex names no call when a report comes back; its reports name their agents (X18).
    deliveredReports: [],
    agentReports: collected.agentReports,
    followUps: collected.followUps,
    followUpIndex: collected.followUpIndex,
    turns: collected.turns,
    reviews: collected.reviews,
    contexts: collected.contexts,
    deliveries: collected.deliveries,
    capabilities: collected.capabilities,
    workingDirectories: [...collected.workingDirectories],
    gaps: collected.gaps,
  };
}
