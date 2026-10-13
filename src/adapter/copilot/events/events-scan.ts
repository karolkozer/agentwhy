// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { MAIN_AGENT_TYPE, type Agent } from '../../../core/agent.ts';
import type { Gap } from '../../../core/completeness.ts';
import type { ContextAuthor, ContextRecord } from '../../../core/context.ts';
import type { Execution } from '../../../core/event.ts';
import { agentSource, mainSource, type EvidenceRef, type SourceRef } from '../../../core/evidence.ts';
import type { AgentMessage, MessageChannel } from '../../../core/message.ts';
import type {
  AgentReportRecord, CallRecord, DelegationCall, DelegationIndexEntry, DenialMarker, ResultRecord, SessionRecords,
} from '../../../core/session-records.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { CALL, DELEGATING_TOOLS, TOOLS } from '../contract/actions.ts';
import { LAUNCH_NOTICE, SUBAGENT } from '../contract/delegations.ts';
import { ENVELOPE, RECORD_TYPES } from '../contract/envelope.ts';
import { COMPACTION, MESSAGE, PHASES } from '../contract/messages.ts';
import { ERROR, PERMISSION } from '../contract/refusals.ts';
import { COMPLETION, FAILED, SHELL_TRAILER, SPILL_NOTICE } from '../contract/results.ts';
import { HEADER } from '../contract/session.ts';
import { capabilitiesOf } from './capability-records.ts';
import { profileOf } from './call-profiles.ts';
import { knownRecordType, unknownRecordKeys } from './record-shape.ts';
import { ANSWER_UNRECOGNISED, PERSON_REFUSED, personsAnswerOf, refusalOf } from './refusal-marks.ts';

/** What the reader knows of a session before its lines are read. */
export interface ScanSetting {
  /** The session's id, which is also its main agent's. */
  readonly sessionId: string;
  readonly version?: string;
  /** The folder the session started in (CP3a). */
  readonly workingDirectory?: string;
  /** Line ids a parent holds: its records, read in the parent and not here (CP26). */
  readonly parentLines: ReadonlySet<string>;
  /** This session counts a fork of its own, so a line it shares with another parent settles nothing (CP26). */
  readonly countsForks: boolean;
}

interface Start {
  readonly callId: string;
  readonly agentId: string | undefined;
  readonly toolName: string;
  readonly input: JsonObject | undefined;
  readonly parentCallId: string | undefined;
  /** The folder the session was in when the call started: each call has a shell of its own (CPB46). */
  readonly workingDirectory: string | undefined;
  readonly evidence: EvidenceRef;
}

interface Completion {
  readonly callId: string;
  readonly data: JsonObject;
  readonly evidence: EvidenceRef;
}

interface Answer {
  readonly requestId: unknown;
  readonly callId: unknown;
  readonly data: JsonObject;
  readonly evidence: EvidenceRef;
}

/**
 * Reads one Copilot runtime file, line by line, into the core's records (`what-copilot-wrote` plan step 4). Format
 * knowledge only: what a record type means, where an id is. Every join is by id - `toolCallId`, `agentId`, `requestId` -
 * and the core makes the ones that are its own (spec §9). Records are numbered by their place in the file, one sequence for
 * every agent the file holds, so the order of one agent's records is its own.
 *
 * Not read: `hook.*` - a hook's input copies a prompt, a call and its result (CPB42), never a second exposure - `model.*`
 * (CP22), turns (CP32), and `session.*` but for a resumed session's folder and a compaction's summary.
 */
export class EventsScan {
  readonly #setting: ScanSetting;
  #line = 0;
  #workingDirectory: string | undefined;
  readonly #workingDirectories = new Set<string>();
  readonly #starts: Start[] = [];
  readonly #completions: Completion[] = [];
  readonly #requests = new Map<string, unknown>();
  readonly #asked = new Map<string, string>();
  readonly #answers: Answer[] = [];
  readonly #subagents = new Map<string, { readonly taskCall: string; readonly type?: string }>();
  readonly #index: DelegationIndexEntry[] = [];
  readonly #messages: AgentMessage[] = [];
  readonly #contexts: ContextRecord[] = [];
  readonly #gaps: Gap[] = [];
  readonly #seen = new Set<string>();
  #unknownShape = false;
  #shared = false;

  constructor(setting: ScanSetting) {
    this.#setting = setting;
    this.#workingDirectory = setting.workingDirectory;
    if (setting.workingDirectory !== undefined) this.#workingDirectories.add(setting.workingDirectory);
  }

  line(text: string): void {
    this.#line += 1;
    if (text.trim() === '') return;
    const record = parseJsonObject(text);
    if (record === undefined) {
      this.#gaps.push({ kind: 'record-damaged' });
      return;
    }
    const id = record[ENVELOPE.id];
    if (typeof id === 'string' && this.#setting.parentLines.has(id)) {
      this.#shared = true;
      return;
    }
    if (unknownRecordKeys(record) > 0) this.#unknownShape = true;
    const type = record[ENVELOPE.type];
    const body = record[ENVELOPE.data];
    const data: JsonObject = isJsonObject(body) ? body : {};
    const named = record[ENVELOPE.agentId];
    const agentId = typeof named === 'string' && named !== '' ? named : undefined;
    if (agentId !== undefined) this.#seen.add(agentId);
    const evidence = this.#evidence(agentId, record);
    // CPD13: a type the contract does not list is read as nothing, and the file's answers are no longer measured.
    if (!knownRecordType(type)) {
      this.#unknownShape = true;
      return;
    }
    this.#read(type, data, agentId, evidence);
  }

  records(): SessionRecords {
    const main = this.#setting.sessionId;
    const agents: Agent[] = [{ id: main, type: MAIN_AGENT_TYPE, depth: 0 }];
    for (const [id, subagent] of this.#subagents) agents.push({ id, ...(subagent.type === undefined ? {} : { type: subagent.type }) });
    // An agent no `subagent.started` names still acted: it stays, and its missing start is said (CP11, HR7).
    for (const id of this.#seen) {
      if (this.#subagents.has(id)) continue;
      agents.push({ id });
      this.#gaps.push({ kind: 'relation-unresolved', agentId: id });
    }
    // CP26: a line this session shares with another that counts a fork too belongs to neither for certain.
    if (this.#shared && this.#setting.countsForks) this.#gaps.push({ kind: 'relation-unresolved', agentId: main });

    const calls = this.#calls();
    const { results, reports } = this.#results(calls);
    const sources = agents.map((agent) => (agent.id === main ? { source: mainSource() } : { source: agentSource(agent.id), agentId: agent.id }));
    return {
      sessionId: main,
      provider: 'copilot',
      agents,
      calls,
      results,
      delegations: this.#starts.filter((start) => DELEGATING_TOOLS.includes(start.toolName)).map((start): DelegationCall => {
        const input = this.#inputOf(start);
        const keys = start.toolName === TOOLS.searchAgent.name ? TOOLS.searchAgent : TOOLS.delegate;
        const prompt = input[keys.prompt];
        const description = input[keys.description];
        return {
          callId: start.callId, parentAgentId: start.agentId ?? main, evidence: start.evidence,
          ...(typeof prompt === 'string' ? { prompt } : {}), ...(typeof description === 'string' ? { description } : {}),
        };
      }),
      delegationIndex: this.#index,
      followUps: [],
      followUpIndex: [],
      messages: this.#messages,
      deliveredReports: [],
      agentReports: reports,
      workingDirectories: [...this.#workingDirectories],
      turns: [],
      reviews: [],
      contexts: this.#contexts,
      deliveries: [],
      capabilities: capabilitiesOf(this.#setting.version, this.#unknownShape, sources),
      gaps: this.#gaps,
    };
  }

  #read(type: string, data: JsonObject, agentId: string | undefined, evidence: EvidenceRef): void {
    const owner = agentId ?? this.#setting.sessionId;
    switch (type) {
      case RECORD_TYPES.sessionResume: {
        const context = data[HEADER.context];
        const folder = isJsonObject(context) ? context[HEADER.workingDirectory] : undefined;
        if (typeof folder === 'string' && folder !== '') {
          this.#workingDirectory = folder;
          this.#workingDirectories.add(folder);
        }
        return;
      }
      case RECORD_TYPES.userMessage:
        // A subagent's first message is its prompt, the words of the agent that started it (CP30); the rest are the person's.
        return this.#context(data[MESSAGE.content], agentId === undefined ? 'person' : 'another-agent', owner, evidence);
      case RECORD_TYPES.systemMessage:
        return this.#context(data[MESSAGE.content], 'developer', owner, evidence);
      case RECORD_TYPES.systemNotification:
        return this.#context(data[MESSAGE.content], 'runtime', owner, evidence);
      case RECORD_TYPES.compactionComplete:
        return this.#context(data[COMPACTION.summary], 'runtime', owner, evidence);
      case RECORD_TYPES.assistantMessage:
        return this.#assistant(data, owner, evidence);
      case RECORD_TYPES.toolStart:
        return this.#start(data, agentId, evidence);
      case RECORD_TYPES.toolComplete: {
        const callId = data[CALL.callId];
        if (typeof callId === 'string' && callId !== '') this.#completions.push({ callId, data, evidence });
        else this.#gaps.push({ kind: 'relation-unresolved', agentId: owner });
        return;
      }
      case RECORD_TYPES.subagentStarted: {
        const taskCall = data[SUBAGENT.callId];
        if (agentId === undefined || typeof taskCall !== 'string' || taskCall === '') {
          this.#gaps.push({ kind: 'relation-unresolved', agentId: owner });
          return;
        }
        const type = data[SUBAGENT.agentType];
        this.#subagents.set(agentId, { taskCall, ...(typeof type === 'string' && type !== '' ? { type } : {}) });
        this.#index.push({ callId: taskCall, agentId, ...(typeof type === 'string' && type !== '' ? { requestedType: type } : {}) });
        return;
      }
      case RECORD_TYPES.permissionRequested: {
        const requestId = data[PERMISSION.requestId];
        const request = data[PERMISSION.request];
        const callId = isJsonObject(request) ? request[PERMISSION.callId] : undefined;
        if (typeof requestId === 'string' && typeof callId === 'string') this.#asked.set(requestId, callId);
        return;
      }
      case RECORD_TYPES.permissionCompleted:
        this.#answers.push({ requestId: data[PERMISSION.requestId], callId: data[PERMISSION.callId], data, evidence });
        return;
      default:
      // A passive type, or one of the contract's this reader takes nothing from: hooks, turns, a subagent's end, an abort.
    }
  }

  #assistant(data: JsonObject, owner: string, evidence: EvidenceRef): void {
    const requests = data[CALL.requests];
    if (Array.isArray(requests)) {
      for (const request of requests) {
        if (isJsonObject(request) && typeof request[CALL.callId] === 'string') this.#requests.set(request[CALL.callId] as string, request[CALL.arguments]);
      }
    }
    const text = data[MESSAGE.content];
    if (typeof text !== 'string' || text.trim() === '') return;
    const id = data[MESSAGE.messageId];
    const channel = channelOf(data[MESSAGE.phase]);
    this.#messages.push({
      agentId: owner, kind: 'said', text, completeness: 'complete', evidence,
      ...(typeof id === 'string' && id !== '' ? { id } : {}), ...(channel === undefined ? {} : { channel }),
    });
  }

  #start(data: JsonObject, agentId: string | undefined, evidence: EvidenceRef): void {
    const callId = data[CALL.callId];
    const toolName = data[CALL.toolName];
    if (typeof callId !== 'string' || callId === '' || typeof toolName !== 'string') {
      this.#gaps.push({ kind: 'relation-unresolved', agentId: agentId ?? this.#setting.sessionId });
      return;
    }
    const input = data[CALL.arguments];
    const parent = data[CALL.parentCallId];
    this.#starts.push({
      callId, agentId, toolName, evidence, workingDirectory: this.#workingDirectory,
      input: isJsonObject(input) ? input : undefined,
      parentCallId: typeof parent === 'string' ? parent : undefined,
    });
  }

  #context(text: unknown, author: ContextAuthor, agentId: string, evidence: EvidenceRef): void {
    if (typeof text !== 'string' || text === '') return;
    this.#contexts.push({ kind: 'conversation', author, agentId, text, completeness: 'complete', evidence });
  }

  #calls(): CallRecord[] {
    const sequences = new Map<string, number>();
    return this.#starts.map((start): CallRecord => {
      const agentId = start.agentId ?? this.#setting.sessionId;
      const sequence = (sequences.get(agentId) ?? 0) + 1;
      sequences.set(agentId, sequence);
      // CP11: a subagent's call names the `task` call that started it. One naming another stays its agent's, said.
      const started = start.agentId === undefined ? undefined : this.#subagents.get(start.agentId);
      if (started !== undefined && start.parentCallId !== started.taskCall) this.#gaps.push({ kind: 'relation-unresolved', agentId });
      const input = this.#inputOf(start);
      const profile = profileOf(start.toolName, input);
      return {
        id: start.callId, agentId, sequence, toolName: start.toolName, input,
        targets: profile.targets, commands: profile.commands, resultShape: profile.resultShape, toolKnown: profile.toolKnown,
        ...(profile.written === undefined ? {} : { written: profile.written }),
        ...(profile.printsMatches === true ? { printsMatches: true as const } : {}),
        ...(start.workingDirectory === undefined ? {} : { workingDirectory: start.workingDirectory }),
        evidence: start.evidence,
      };
    });
  }

  /** CP7: the start's arguments, an object; where it holds none, its request's - an object, or a JSON-encoded string. */
  #inputOf(start: Start): JsonObject {
    if (start.input !== undefined) return start.input;
    const requested = this.#requests.get(start.callId);
    if (isJsonObject(requested)) return requested;
    return typeof requested === 'string' ? (parseJsonObject(requested) ?? {}) : {};
  }

  #results(calls: readonly CallRecord[]): { readonly results: ResultRecord[]; readonly reports: AgentReportRecord[] } {
    const byId = new Map(calls.map((call) => [call.id, call]));
    const results: ResultRecord[] = [];
    const reports: AgentReportRecord[] = [];
    for (const completion of this.#completions) {
      const call = byId.get(completion.callId);
      const read = resultOf(completion, call);
      results.push(read.result);
      if (read.report !== undefined && call !== undefined) reports.push({ ...read.report, recipientAgentId: call.agentId });
    }
    // CP19: a person's answer stops a call only where the call has no completion of its own (CPB34).
    const completed = new Set(this.#completions.map((completion) => completion.callId));
    for (const answer of this.#answers) {
      const asked = typeof answer.requestId === 'string' ? this.#asked.get(answer.requestId) : undefined;
      const callId = typeof answer.callId === 'string' ? answer.callId : asked;
      if (callId === undefined || asked !== callId) {
        this.#gaps.push({ kind: 'relation-unresolved' });
        continue;
      }
      if (completed.has(callId)) continue;
      const verdict = personsAnswerOf(answer.data);
      if (verdict === 'approved') continue;
      const denial: DenialMarker = verdict === 'refused' ? PERSON_REFUSED : ANSWER_UNRECOGNISED;
      results.push({ callId, denial, stage: 'model', completeness: 'complete', evidence: answer.evidence });
    }
    return { results, reports };
  }

  #evidence(agentId: string | undefined, record: JsonObject): EvidenceRef {
    const source: SourceRef = agentId === undefined ? mainSource() : agentSource(agentId);
    const stamp = record[ENVELOPE.recordedAt];
    // When the line was written, for display only: a value that does not parse is no time, never a guessed one.
    const at = typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN;
    return { source, record: this.#line, ...(Number.isFinite(at) ? { at } : {}) };
  }
}

/**
 * What a finished call returned (CP10 as amended, CP25, CPB47): `result.content`, which the model was handed. A result
 * that opens with the spill notice is its preview alone. `bash`'s exit code is its execution and the text before the
 * runtime's last line what it printed; a `background` task's result says only that the agent started; `read_agent`'s is
 * the report of the agent it names (CP28), carried once, as that report. A call that did not finish carries its refusal.
 */
function resultOf(completion: Completion, call: CallRecord | undefined): { readonly result: ResultRecord; readonly report?: Omit<AgentReportRecord, 'recipientAgentId'> } {
  const { callId, data, evidence } = completion;
  if (data[COMPLETION.success] !== true) {
    const error = data[ERROR.error];
    const message = isJsonObject(error) ? error[ERROR.message] : undefined;
    // CPB58: a tool that ran and failed is no refusal - its run is recorded as failed, and what it reached is not established.
    if (isJsonObject(error) && error[ERROR.code] === FAILED) {
      return { result: { callId, stage: 'model', completeness: 'complete', evidence, execution: { status: 'failed' }, ...(typeof message === 'string' ? { content: message } : {}) } };
    }
    return {
      result: {
        callId, denial: refusalOf(data), stage: 'model', completeness: 'complete', evidence,
        // The refusal's own words, as the agent was handed them: `refuse`'s sentence names the path a glob reached (CP19).
        ...(typeof message === 'string' ? { content: message } : {}),
      },
    };
  }
  const returned = data[COMPLETION.result];
  const content = isJsonObject(returned) ? returned[COMPLETION.content] : undefined;
  if (typeof content !== 'string') return { result: { callId, stage: 'model', completeness: 'unknown', evidence } };
  const spilled = content.startsWith(SPILL_NOTICE);
  const completeness = spilled ? 'partial' : 'complete';
  const toolName = call?.toolName;

  if (toolName === TOOLS.readAgent.name && !spilled) {
    const named = call?.input[TOOLS.readAgent.agentId];
    if (typeof named === 'string' && named !== '') {
      return { result: { callId, stage: 'model', completeness, evidence }, report: { fromAgentId: named, content, evidence } };
    }
  }
  const execution = toolName === TOOLS.shell.name ? executionOf(data) : undefined;
  const printed = toolName === TOOLS.shell.name && !spilled && SHELL_TRAILER.test(content) ? content.replace(SHELL_TRAILER, '') : undefined;
  return {
    result: {
      callId, content, stage: 'model', completeness, evidence,
      ...(execution === undefined ? {} : { execution }),
      ...(printed === undefined ? {} : { printedText: printed }),
      ...(toolName === TOOLS.delegate.name && content.startsWith(LAUNCH_NOTICE) ? { launchNotice: true } : {}),
    },
  };
}

/** `bash`'s exit code (CPB15, CPB47): the process ran and ended so. Anything else of a shell is no execution record. */
function executionOf(data: JsonObject): Execution | undefined {
  const shell = data[COMPLETION.shell];
  const exitCode = isJsonObject(shell) ? shell[COMPLETION.exitCode] : undefined;
  if (typeof exitCode !== 'number' || !Number.isInteger(exitCode)) return undefined;
  return { status: exitCode === 0 ? 'completed' : 'failed', exitCode };
}

function channelOf(phase: unknown): MessageChannel | undefined {
  return phase === PHASES.final ? 'final' : phase === PHASES.commentary ? 'commentary' : undefined;
}
