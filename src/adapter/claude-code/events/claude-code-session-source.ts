// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute } from 'node:path';
import type { Agent } from '../../../core/agent.ts';
import { MAIN_AGENT_TYPE } from '../../../core/agent.ts';
import type { Gap } from '../../../core/completeness.ts';
import type { AgentMessage } from '../../../core/message.ts';
import { correlate } from '../../../core/correlation/correlate.ts';
import { agentSource, mainSource, type SourceRef } from '../../../core/evidence.ts';
import type { SessionModel } from '../../../core/session-model.ts';
import type {
  CallRecord,
  DelegationCall,
  DelegationIndexEntry,
  DeliveredReportRecord,
  ResultRecord,
  SessionRecords,
} from '../../../core/session-records.ts';
import type { SessionSource } from '../../../core/session-source.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { parseJsonObject } from '../../../shared/json.ts';
import { FIELDS } from '../contract/fields.ts';
import type { DiscoveredSession, SessionDiscovery } from '../discovery/discovered-session.ts';
import { readDelegationIndex } from './delegation-index.ts';
import { callsIn, delegationTextIn, deliveriesIn, handbackIn, isDelegation, messagesIn, resultsIn } from './transcript-scan.ts';

export interface ClaudeCodeSessionSourceDependencies {
  readonly discovery: SessionDiscovery;
  readonly files: FileReader;
}

/** What the adapter accumulates while reading. Joining it is the core's job, not this one's. */
interface Collected {
  readonly agents: Agent[];
  readonly calls: CallRecord[];
  readonly results: ResultRecord[];
  readonly delegations: DelegationCall[];
  readonly delegationIndex: DelegationIndexEntry[];
  readonly messages: AgentMessage[];
  readonly deliveredReports: DeliveredReportRecord[];
  readonly gaps: Gap[];
  /** Every working directory met while reading, deduplicated here so the core is handed distinct values. */
  readonly workingDirectories: Set<string>;
  readonly spilledFiles: ReadonlySet<string>;
  /**
   * Whether that list is the whole truth. A `tool-results/` directory that cannot be listed is not an empty
   * one: claiming a spilled file is missing when the directory was merely unreadable names the wrong cause.
   */
  readonly spilledFilesKnown: boolean;
}

/**
 * Reads a Claude Code session into the core's model. Everything format-specific stops here: what a record holds
 * comes from the contract, and what belongs with what comes from `correlate`.
 */
export class ClaudeCodeSessionSource implements SessionSource {
  readonly #discovery: SessionDiscovery;
  readonly #files: FileReader;

  constructor(dependencies: ClaudeCodeSessionSourceDependencies) {
    this.#discovery = dependencies.discovery;
    this.#files = dependencies.files;
  }

  async read(input: string): Promise<SessionModel> {
    return correlate(await this.#collect(await this.#discovery.discover(input)));
  }

  async #collect(session: DiscoveredSession): Promise<SessionRecords> {
    const collected: Collected = {
      agents: [{ id: session.sessionId, type: MAIN_AGENT_TYPE, depth: 0 }],
      calls: [],
      results: [],
      delegations: [],
      delegationIndex: [],
      messages: [],
      deliveredReports: [],
      gaps: [],
      workingDirectories: new Set(),
      spilledFiles: new Set(session.toolResultFiles),
      // Absent is normal - a session that spilled nothing has no such directory. Present but unusable is not.
      spilledFilesKnown: session.toolResultsDir.present || session.toolResultsDir.reason === 'not-found',
    };

    if (!collected.spilledFilesKnown) collected.gaps.push({ kind: 'source-missing' });

    if (session.mainTranscript.present) {
      await this.#scan(session.mainTranscript.path, session.sessionId, mainSource(), collected);
    } else {
      // Not just a missing source: without the main transcript there is no session to report on.
      collected.gaps.push({ kind: 'session-missing' });
    }

    for (const subagent of session.subagents) {
      await this.#collectSubagent(subagent, collected);
    }

    return {
      sessionId: session.sessionId,
      provider: 'claude-code',
      agents: collected.agents,
      calls: collected.calls,
      results: collected.results,
      delegations: collected.delegations,
      delegationIndex: collected.delegationIndex,
      messages: collected.messages,
      deliveredReports: collected.deliveredReports,
      workingDirectories: [...collected.workingDirectories],
      // Claude Code records none of these apart from what is above: said as none, never left out
      // (`2026-09-27-what-codex-wrote.md` §4.G). Its capabilities are those its contract measured, not declared per file.
      agentReports: [],
      followUps: [],
      followUpIndex: [],
      turns: [],
      reviews: [],
      contexts: [],
      deliveries: [],
      capabilities: [],
      gaps: collected.gaps,
    };
  }

  async #collectSubagent(subagent: DiscoveredSession['subagents'][number], collected: Collected): Promise<void> {
    const agentId = subagent.fileId;
    const entry = subagent.meta.present ? await this.#readIndexEntry(subagent.meta.path, agentId, collected) : undefined;

    if (!subagent.meta.present) collected.gaps.push({ kind: 'source-missing', agentId });

    collected.agents.push({
      id: agentId,
      ...(entry?.requestedType === undefined ? {} : { type: entry.requestedType }),
      ...(entry?.depth === undefined ? {} : { depth: entry.depth }),
      ...(entry?.callId === undefined ? {} : { startedBy: entry.callId }),
    });

    if (entry?.callId !== undefined) {
      collected.delegationIndex.push({
        callId: entry.callId,
        agentId,
        ...(entry.requestedType === undefined ? {} : { requestedType: entry.requestedType }),
        ...(entry.depth === undefined ? {} : { depth: entry.depth }),
      });
    }

    if (subagent.transcript.present) {
      await this.#scan(subagent.transcript.path, agentId, agentSource(agentId), collected, entry?.callId);
    } else {
      // The delegation still happened; only its actions are unknown. Saying "no actions" beats dropping it.
      collected.gaps.push({ kind: 'source-missing', agentId });
    }
  }

  async #readIndexEntry(path: string, agentId: string, collected: Collected) {
    let text: string;
    try {
      text = await this.#files.readText(path);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      collected.gaps.push({ kind: 'source-missing', agentId });
      return undefined;
    }

    const entry = readDelegationIndex(text);
    if (entry === undefined) collected.gaps.push({ kind: 'record-damaged', agentId });
    return entry;
  }

  /**
   * `answers` is the delegation this transcript belongs to, when it is a subagent's. A report handed back through
   * a call names no delegation of its own (D9), so this is the join: the words answer the call that started the
   * agent whose transcript they are on.
   */
  async #scan(path: string, agentId: string, source: SourceRef, collected: Collected, answers?: string): Promise<void> {
    let record = 0;
    let sequence = 0;

    try {
      for await (const raw of this.#files.readLines(path)) {
        if (raw.trim() === '') continue;
        record += 1;

        const json = parseJsonObject(raw);
        if (json === undefined) {
          collected.gaps.push({ kind: 'record-damaged', agentId });
          continue;
        }
        const workingDirectory = json[FIELDS.workingDirectory];
        if (typeof workingDirectory === 'string') collected.workingDirectories.add(workingDirectory);

        // When the line was written, for display only: a value that does not parse is no time, never a guessed one.
        const stamp = json[FIELDS.recordedAt];
        const at = typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN;
        const evidence = { source, record, ...(Number.isFinite(at) ? { at } : {}) };

        for (const call of callsIn(json)) {
          sequence += 1;
          collected.calls.push({
            id: call.id,
            agentId,
            sequence,
            toolName: call.toolName,
            input: call.input,
            targets: call.targets,
            commands: call.commands,
            resultShape: call.resultShape,
            toolKnown: call.toolKnown,
            ...(call.written === undefined ? {} : { written: call.written }),
            ...(call.printsMatches === true ? { printsMatches: true as const } : {}),
            // a-file-in-its-place IP4, IPB9: every line names the absolute folder it was written in.
            ...(typeof workingDirectory === 'string' && isAbsolute(workingDirectory) ? { workingDirectory } : {}),
            evidence,
          });
          if (isDelegation(call)) {
            collected.delegations.push({ callId: call.id, parentAgentId: agentId, ...delegationTextIn(call), evidence });
          }
          const handback = handbackIn(call);
          if (handback !== undefined && answers !== undefined) {
            collected.deliveredReports.push({ callId: answers, content: handback, evidence });
          }
        }

        // A text or reasoning block is read whole: nothing of it is held back by the record.
        for (const message of messagesIn(json)) collected.messages.push({ agentId, ...message, completeness: 'complete', evidence });
        for (const delivery of deliveriesIn(json)) {
          collected.deliveredReports.push({ callId: delivery.callId, content: delivery.text, evidence });
        }

        const scanned = resultsIn(json);
        for (const result of scanned.results) {
          const missing =
            collected.spilledFilesKnown && result.spilledFiles.some((name) => !collected.spilledFiles.has(name));
          collected.results.push({
            callId: result.callId,
            ...(result.content === undefined ? {} : { content: result.content }),
            ...(result.denial === undefined ? {} : { denial: result.denial }),
            ...(missing ? { spilledResultMissing: true } : {}),
            ...(scanned.denialUnattributed ? { attributionAmbiguous: true } : {}),
            ...(result.launchNotice === true ? { launchNotice: true } : {}),
            // A tool_result is the message the calling agent's model was handed, so it is that stage, whole as recorded. A
            // spilled result keeps its own notice and gap, as before.
            stage: 'model',
            completeness: 'complete',
            evidence,
          });
        }
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      collected.gaps.push({ kind: 'source-missing', agentId });
    }
  }
}
