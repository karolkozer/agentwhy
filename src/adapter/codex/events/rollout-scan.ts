// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, resolve } from 'node:path';
import type { Agent } from '../../../core/agent.ts';
import type { CapabilityRecord } from '../../../core/capability.ts';
import type { ContentCompleteness, Gap } from '../../../core/completeness.ts';
import type { ContextAuthor, ContextRecord, ModelDelivery } from '../../../core/context.ts';
import type { EvidenceRef, SourceRef } from '../../../core/evidence.ts';
import type { Execution } from '../../../core/event.ts';
import type { AgentMessage, MessageChannel } from '../../../core/message.ts';
import type { Review, ReviewVerdict } from '../../../core/review.ts';
import type {
  AgentReportRecord,
  CallRecord,
  DelegationCall,
  DelegationIndexEntry,
  FollowUpCall,
  FollowUpIndexEntry,
  ResultRecord,
} from '../../../core/session-records.ts';
import type { Turn } from '../../../core/turn.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { ACTION_ITEMS, ITEM, ITEM_EVENT } from '../contract/actions.ts';
import { ACTIVITY, AGENT_MESSAGE, DELEGATION_TOOLS, SPAWN_ARGUMENTS } from '../contract/delegations.ts';
import { CELL_COMMANDS, CODE_CELL, FUNCTION_CALL } from '../contract/deliveries.ts';
import { ENVELOPE, LINE_TYPES, PASSIVE_EVENTS, PASSIVE_LINE_TYPES } from '../contract/envelope.ts';
import {
  EVENT_MESSAGES,
  HOOK_PROMPT,
  ITEM_TEXT_BLOCKS,
  MESSAGE,
  MESSAGE_ITEMS,
  PHASES,
  REASONING,
  REASONING_ITEM,
  RESPONSE_ITEMS,
  ROLES,
  TEXT_BLOCKS,
} from '../contract/messages.ts';
import { VERDICT } from '../contract/reviews.ts';
import { SESSION } from '../contract/session.ts';
import { RESPONSE_TURN, TURN_CONTEXT, TURN_EVENTS } from '../contract/turns.ts';
import type { SessionHeader } from '../discovery/session-header.ts';
import { HOOK_REFUSAL } from '../contract/hook-refusals.ts';
import { PRE_TOOL_USE } from '../contract/hooks.ts';
import { isActionItem, readAction } from './action-items.ts';
import { hookRefusalsIn } from './hook-refusals.ts';
import { capabilitiesOf } from './capability-records.ts';
import { cellCommands } from './cell-commands.ts';
import { cellExitCode } from './cell-result.ts';
import { deliveredWhole } from './delivered-output.ts';
import { permissionsOf } from './turn-permissions.ts';

/** Everything the reader gathers from a conversation's files, still unjoined: joining is the core's (spec §9). */
export interface Collected {
  readonly agents: Agent[];
  readonly calls: CallRecord[];
  readonly results: ResultRecord[];
  readonly delegations: DelegationCall[];
  readonly delegationIndex: DelegationIndexEntry[];
  readonly followUps: FollowUpCall[];
  readonly followUpIndex: FollowUpIndexEntry[];
  readonly messages: AgentMessage[];
  readonly agentReports: AgentReportRecord[];
  readonly turns: Turn[];
  readonly reviews: Review[];
  readonly contexts: ContextRecord[];
  readonly deliveries: ModelDelivery[];
  readonly capabilities: CapabilityRecord[];
  readonly gaps: Gap[];
  readonly workingDirectories: Set<string>;
}

/** Who a file is in the conversation, decided from the tree before it is read. */
export interface FileRole {
  readonly header: SessionHeader;
  /** `agent` for the conversation and every agent an agent started; `reviewer` for Codex's own reviewer (X19). */
  readonly kind: 'agent' | 'reviewer';
  /** The agent this file is; for a reviewer, its own thread id. */
  readonly agentId: string;
  readonly source: SourceRef;
  /** The agent a reviewer reviewed: its parent in the tree. */
  readonly reviewedAgentId?: string;
  /** Prefixed to this file's call ids, so two files reusing a local id never merge (§4.G). Empty for the root. */
  readonly idScope: string;
  /** XD10: this file continues the conversation's own thread (§2.14): read as the root's, after it, as one record. */
  readonly continuation?: true;
  /** This agent's children by `agent_path`, a name: `undefined` where two children share one (X18). */
  readonly childByPath: ReadonlyMap<string, string | undefined>;
  /** What the tree knows of each thread by id: an activity names a started agent by its thread id (X16). */
  readonly threads: ReadonlyMap<string, SessionHeader>;
}

interface PendingCall {
  readonly kind: 'cell' | 'spawn' | 'follow-up' | 'direct';
  readonly id: string;
  readonly evidence: EvidenceRef;
  readonly turnId?: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
  /** A cell's code: what it ran, read where nothing else records it (XD4). */
  readonly code?: string;
}

interface PendingOutput {
  readonly callId: string;
  readonly text: string;
  readonly completeness: ContentCompleteness;
  readonly evidence: EvidenceRef;
  readonly turnId?: string;
}

interface SaidMessage {
  readonly message: AgentMessage;
  readonly turnId?: string;
  readonly copies: EvidenceRef[];
}

/**
 * One rollout file, read line by line into the collection. Only top-level lines are records (X13); order is the line's
 * position, and time is shown only (X12). What joins what inside the file - a cell and its output by `call_id`, a copy of a
 * message by its `id` - is read here, where the format says it; every relation between agents is left to the core.
 *
 * `firstRecord` is where this file's record numbers start: a continuation of the conversation's thread (XD10) carries on
 * from the records of the file before it, so every record of one source keeps a number of its own. Returns the number
 * the next file of the same source starts from.
 */
export async function scanRollout(files: FileReader, path: string, role: FileRole, collected: Collected, firstRecord = 0): Promise<number> {
  const state = new FileState(role, collected, firstRecord);
  try {
    for await (const raw of files.readLines(path)) {
      if (raw.trim() === '') continue;
      state.line(raw);
    }
  } catch (error) {
    if (!(error instanceof FileAccessError)) throw error;
    collected.gaps.push({ kind: 'source-missing', ...(role.kind === 'agent' ? { agentId: role.agentId } : { source: role.source }) });
  }
  state.finish();
  return state.records;
}

class FileState {
  readonly #role: FileRole;
  readonly #collected: Collected;
  #record: number;
  readonly #calls = new Map<string, PendingCall>();
  readonly #outputs: { readonly kind: 'cell' | 'function'; readonly output: PendingOutput }[] = [];
  readonly #itemIds = new Set<string>();
  /**
   * a-file-in-its-place IP4, IPB9: the absolute folder each turn ran in, by its id, and the last one the file named - a
   * command item's own `cwd` is relative to it.
   */
  readonly #turnDirectories = new Map<string, string>();
  #lastDirectory: string | undefined;
  readonly #actionCalls: { readonly call: Omit<CallRecord, 'sequence'>; readonly result: ResultRecord; readonly command: boolean }[] = [];
  /** Items that record a command or a change: where there are none, a cell's code is all there is of what ran (XD4). */
  #ranItems = 0;
  readonly #said: SaidMessage[] = [];
  readonly #reasoning = new Map<string, SaidMessage | 'hidden'>();
  readonly #agentItems: { readonly id: unknown; readonly evidence: EvidenceRef; readonly text: string }[] = [];
  /** The editor's copies of what the agent said (`event_msg/agent_message`), which carry no id: joined by text (XD9). */
  readonly #editorCopies: { readonly text: string; readonly evidence: EvidenceRef; readonly turnId?: string }[] = [];
  readonly #completions: { readonly turnId?: string; readonly text: string; readonly evidence: EvidenceRef }[] = [];
  readonly #reviewedTurns = new Map<string, string | null>();
  readonly #verdicts: { readonly turnId?: string; readonly text: unknown; readonly evidence: EvidenceRef }[] = [];
  #unrecognised = false;
  #interrupted = false;
  /** The ids of `user` messages read so far: a `HookPrompt` with one of them is a copy of that message (§2.12). */
  readonly #givenIds = new Set<string>();
  #hiddenReasoning = false;
  #permissionsRecorded = false;
  #permissionsIncomplete = false;
  #reviewerActions = false;
  #firstEvidence: EvidenceRef | undefined;

  constructor(role: FileRole, collected: Collected, firstRecord: number) {
    this.#role = role;
    this.#collected = collected;
    this.#record = firstRecord;
  }

  /** The records read so far, counted from where this file's numbering started. */
  get records(): number {
    return this.#record;
  }

  line(raw: string): void {
    this.#record += 1;
    const line = parseJsonObject(raw);
    const agentGap = this.#role.kind === 'agent' ? { agentId: this.#role.agentId } : { source: this.#role.source };
    if (line === undefined) {
      this.#collected.gaps.push({ kind: 'record-damaged', ...agentGap });
      return;
    }
    const stamp = line[ENVELOPE.recordedAt];
    const time = typeof stamp === 'string' ? Date.parse(stamp) : Number.NaN;
    const evidence: EvidenceRef = { source: this.#role.source, record: this.#record, ...(Number.isFinite(time) ? { at: time } : {}) };
    this.#firstEvidence ??= evidence;
    const payload = line[ENVELOPE.payload];
    if (!isJsonObject(payload)) {
      this.#collected.gaps.push({ kind: 'record-damaged', ...agentGap });
      return;
    }

    switch (line[ENVELOPE.type]) {
      case LINE_TYPES.sessionMeta:
        // A later session_meta never changes whose file this is (X3); its directory is a directory the records carried.
        this.#directory(payload[SESSION.workingDirectory]);
        return;
      case LINE_TYPES.turnContext:
        this.#turn(payload, evidence);
        return;
      case LINE_TYPES.responseItem:
        this.#response(payload, evidence);
        return;
      case LINE_TYPES.event:
        this.#event(payload, evidence);
        return;
      case LINE_TYPES.tokenUsage:
        this.#reviewed(payload[TURN_EVENTS.turnId], payload[TURN_EVENTS.rootTurnId]);
        return;
      default:
        if (!PASSIVE_LINE_TYPES.some((type) => type === line[ENVELOPE.type])) this.#unrecognised = true;
    }
  }

  #directory(value: unknown): void {
    if (typeof value === 'string' && value !== '') this.#collected.workingDirectories.add(value);
    if (typeof value === 'string' && isAbsolute(value)) this.#lastDirectory = value;
  }

  /** IP4: where a call of this turn ran - the turn's folder, and a command item's own `cwd` read from there. */
  #ranIn(turnId: string | undefined, own?: unknown): { readonly workingDirectory?: string } {
    const turn = (turnId === undefined ? undefined : this.#turnDirectories.get(turnId)) ?? this.#lastDirectory;
    if (turn === undefined) return typeof own === 'string' && isAbsolute(own) ? { workingDirectory: own } : {};
    return { workingDirectory: typeof own === 'string' && own !== '' ? resolve(turn, own) : turn };
  }

  #turn(payload: JsonObject, evidence: EvidenceRef): void {
    this.#directory(payload[TURN_CONTEXT.workingDirectory]);
    const turnFolder = payload[TURN_CONTEXT.workingDirectory];
    const turnKey = payload[TURN_CONTEXT.turnId];
    if (typeof turnKey === 'string' && typeof turnFolder === 'string' && isAbsolute(turnFolder)) this.#turnDirectories.set(turnKey, turnFolder);
    this.#reviewed(payload[TURN_CONTEXT.turnId], payload[TURN_EVENTS.rootTurnId]);
    const id = payload[TURN_CONTEXT.turnId];
    if (this.#role.kind !== 'agent' || typeof id !== 'string' || id === '') return;
    const permissions = permissionsOf(payload);
    this.#permissionsRecorded = true;
    if (!permissions.complete) this.#permissionsIncomplete = true;
    this.#collected.turns.push({ id, agentId: this.#role.agentId, permissions, evidence });
  }

  /** On a reviewer's turn, the turn of the agent it reviewed (X19). Two different answers for one turn answer nothing. */
  #reviewed(turnId: unknown, rootTurnId: unknown): void {
    if (this.#role.kind !== 'reviewer' || typeof turnId !== 'string' || typeof rootTurnId !== 'string') return;
    const known = this.#reviewedTurns.get(turnId);
    this.#reviewedTurns.set(turnId, known === undefined || known === rootTurnId ? rootTurnId : null);
  }

  #response(payload: JsonObject, evidence: EvidenceRef): void {
    const turnId = turnOf(payload);
    switch (payload[ENVELOPE.payloadType]) {
      case RESPONSE_ITEMS.message:
        this.#message(payload, evidence, turnId);
        return;
      case RESPONSE_ITEMS.reasoning:
        this.#reasoningRecord(payload, evidence, turnId);
        return;
      case RESPONSE_ITEMS.codeCell:
      case RESPONSE_ITEMS.functionCall:
        this.#call(payload, evidence, turnId);
        return;
      case RESPONSE_ITEMS.codeCellOutput:
      case RESPONSE_ITEMS.functionOutput:
        this.#output(payload, evidence, turnId);
        return;
      case RESPONSE_ITEMS.agentMessage:
        this.#agentMessage(payload, evidence, turnId);
        return;
      case RESPONSE_ITEMS.compaction:
        return;
      default:
        this.#unrecognised = true;
    }
  }

  /** X31: assistant text is the agent's own words - a reviewer's are its own, never its parent's; any other role is context. */
  #message(payload: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const role = payload[MESSAGE.role];
    const words = textOf(payload[MESSAGE.content], role === ROLES.assistant ? [TEXT_BLOCKS.said] : [TEXT_BLOCKS.given]);
    if (role === ROLES.assistant && this.#role.kind === 'agent') {
      const id = payload[MESSAGE.id];
      const phase = payload[MESSAGE.phase];
      const channel: MessageChannel | undefined = typeof phase === 'string' && Object.hasOwn(PHASES, phase) ? PHASES[phase as keyof typeof PHASES] : undefined;
      this.#said.push({
        message: {
          agentId: this.#role.agentId, kind: 'said', text: words.text, completeness: words.completeness, evidence,
          ...(typeof id === 'string' && id !== '' ? { id } : {}), ...(channel === undefined ? {} : { channel }),
        },
        ...(turnId === undefined ? {} : { turnId }),
        copies: [],
      });
      return;
    }
    const author: ContextAuthor = this.#role.kind === 'reviewer'
      ? (role === ROLES.assistant ? 'reviewer' : 'runtime')
      : role === ROLES.user ? 'person' : role === ROLES.developer ? 'developer' : 'unknown';
    const id = payload[MESSAGE.id];
    if (role === ROLES.user && typeof id === 'string' && id !== '') this.#givenIds.add(id);
    this.#context('conversation', author, words.text, words.completeness, evidence, turnId);
  }

  /** X31: readable summary text is reasoning, never the whole of it; encrypted content is never read or guessed. */
  #reasoningRecord(payload: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const summary = payload[REASONING.summary];
    const parts = Array.isArray(summary)
      ? summary.flatMap((part) => (isJsonObject(part) && typeof part[REASONING.summaryText] === 'string' && part[REASONING.summaryText] !== '' ? [part[REASONING.summaryText] as string] : []))
      : [];
    const id = payload[MESSAGE.id];
    // A reviewer's thoughts are its own, never its parent's (X19): context, whatever it wrote.
    if (this.#role.kind !== 'agent') {
      if (parts.length > 0) this.#context('conversation', 'reviewer', parts.join('\n'), 'partial', evidence, turnId);
      return;
    }
    if (parts.length === 0) {
      this.#hiddenReasoning = true;
      if (typeof id === 'string') this.#reasoning.set(id, 'hidden');
      return;
    }
    const encrypted = typeof payload[REASONING.encrypted] === 'string';
    if (encrypted) this.#hiddenReasoning = true;
    const said: SaidMessage = {
      message: {
        agentId: this.#role.agentId, kind: 'reasoning', text: parts.join('\n'),
        completeness: encrypted ? 'partial' : 'complete', evidence, ...(typeof id === 'string' && id !== '' ? { id } : {}),
      },
      ...(turnId === undefined ? {} : { turnId }),
      copies: [],
    };
    this.#said.push(said);
    if (typeof id === 'string' && id !== '') this.#reasoning.set(id, said);
  }

  #call(payload: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const callId = payload[CODE_CELL.callId];
    const name = payload[FUNCTION_CALL.name];
    const cell = payload[ENVELOPE.payloadType] === RESPONSE_ITEMS.codeCell && name === CODE_CELL.tool;
    const code = payload[CODE_CELL.code];
    // X14: the cell is context - the code the agent wrote, never an action, never joined to what it ran.
    if (cell && typeof code === 'string') this.#context('code', this.#role.kind === 'reviewer' ? 'reviewer' : 'agent', code, 'complete', evidence, turnId);
    if (typeof callId !== 'string' || callId === '') {
      if (!cell) this.#unrecognised = true;
      return;
    }
    const args = payload[FUNCTION_CALL.arguments];
    const input = typeof args === 'string' ? (parseJsonObject(args) ?? { arguments: args }) : isJsonObject(args) ? args : cell ? {} : { input: code };
    const kind: PendingCall['kind'] = cell
      ? 'cell'
      : name === DELEGATION_TOOLS.spawn ? 'spawn' : name === DELEGATION_TOOLS.send || name === DELEGATION_TOOLS.followUp ? 'follow-up' : 'direct';
    // XB9: whatever a reviewer ran is unmeasured, and never its parent's.
    if (this.#role.kind === 'reviewer') this.#reviewerActions = true;
    this.#calls.set(callId, {
      kind, id: callId, evidence, toolName: typeof name === 'string' ? name : 'unrecognised call', input, ...(turnId === undefined ? {} : { turnId }),
      ...(cell && typeof code === 'string' ? { code } : {}),
    });
    if (this.#role.kind !== 'agent') return;
    if (kind === 'spawn') {
      const message = input[SPAWN_ARGUMENTS.message];
      const task = input[SPAWN_ARGUMENTS.name];
      this.#collected.delegations.push({
        callId: this.#scoped(callId), parentAgentId: this.#role.agentId, evidence,
        ...(typeof message === 'string' ? { prompt: message } : {}), ...(typeof task === 'string' ? { description: task } : {}),
      });
    }
    // X17: its words are raw content, as the call carried them - the arguments whose message key XB4 has not measured.
    if (kind === 'follow-up') {
      this.#collected.followUps.push({
        callId: this.#scoped(callId), senderAgentId: this.#role.agentId, evidence, text: typeof args === 'string' ? args : JSON.stringify(args ?? null),
      });
    }
  }

  #output(payload: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const callId = payload[CODE_CELL.callId];
    const read = outputText(payload[CODE_CELL.output]);
    const kind = payload[ENVELOPE.payloadType] === RESPONSE_ITEMS.codeCellOutput ? 'cell' : 'function';
    if (typeof callId !== 'string' || callId === '') {
      this.#orphan(read, evidence, turnId);
      return;
    }
    this.#outputs.push({ kind, output: { callId, ...read, evidence, ...(turnId === undefined ? {} : { turnId }) } });
  }

  /** X18: a report is by its author's `agent_path`, a name; a name two children share names neither. */
  #agentMessage(payload: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const content = payload[AGENT_MESSAGE.content];
    const words = typeof content === 'string' ? { text: content, completeness: 'complete' as const } : textOf(content, [TEXT_BLOCKS.given, TEXT_BLOCKS.said]);
    const author = payload[AGENT_MESSAGE.author];
    const child = typeof author === 'string' && this.#role.childByPath.has(author) ? { found: this.#role.childByPath.get(author) } : undefined;
    if (this.#role.kind === 'agent' && child?.found !== undefined) {
      this.#collected.agentReports.push({ fromAgentId: child.found, recipientAgentId: this.#role.agentId, content: words.text, evidence });
      return;
    }
    if (child !== undefined) this.#collected.gaps.push({ kind: 'relation-unresolved', agentId: this.#role.agentId });
    this.#context('conversation', 'another-agent', words.text, words.completeness, evidence, turnId);
  }

  #event(payload: JsonObject, evidence: EvidenceRef): void {
    const type = payload[ENVELOPE.payloadType];
    const turnId = typeof payload[TURN_EVENTS.turnId] === 'string' ? (payload[TURN_EVENTS.turnId] as string) : undefined;
    if (type === ITEM_EVENT.type) {
      const item = payload[ITEM_EVENT.item];
      if (isJsonObject(item)) this.#item(item, evidence, turnId);
      else this.#unrecognised = true;
      return;
    }
    if (type === TURN_EVENTS.started) {
      this.#reviewed(turnId, payload[TURN_EVENTS.rootTurnId]);
      return;
    }
    if (type === TURN_EVENTS.complete) {
      const last = payload[TURN_EVENTS.lastMessage];
      if (this.#role.kind === 'reviewer') this.#verdicts.push({ ...(turnId === undefined ? {} : { turnId }), text: last, evidence });
      else if (typeof last === 'string' && last !== '') this.#completions.push({ ...(turnId === undefined ? {} : { turnId }), text: last, evidence });
      return;
    }
    // Copies the editor builds wrote (X31). The agent's carry no id and are joined by text once the file is read (XD9,
    // §2.13: 15 of 15 in the panel's `legacy` files); one that joins none leaves its own words open, never an action.
    if (type === EVENT_MESSAGES.user || type === EVENT_MESSAGES.agent) {
      const text = payload[EVENT_MESSAGES.text];
      if (typeof text !== 'string') return;
      if (type === EVENT_MESSAGES.agent && this.#role.kind === 'agent') this.#editorCopies.push({ text, evidence, ...(turnId === undefined ? {} : { turnId }) });
      else this.#context('conversation', type === EVENT_MESSAGES.user ? 'person' : 'reviewer', text, 'complete', evidence, turnId);
      return;
    }
    // X14: an interrupted turn cannot show that what it recorded is all it ran, however well its records parse.
    if (type === TURN_EVENTS.aborted) {
      this.#interrupted = true;
      return;
    }
    if (PASSIVE_EVENTS.some((each) => each === type)) return;
    // `patch_apply_end`, `web_search_end` and anything else: records of something done that the contract cannot map.
    this.#unrecognised = true;
    this.#orphan({ text: JSON.stringify(payload), completeness: 'unknown' }, evidence, turnId, 'runtime');
  }

  #item(item: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const type = item[ITEM.type];
    const id = item[ITEM.id];
    if (type === ACTIVITY.type) {
      this.#activity(item);
      return;
    }
    if (type === MESSAGE_ITEMS.agent) {
      this.#agentItems.push({ id, evidence, text: textOf(item[MESSAGE.content], ITEM_TEXT_BLOCKS).text });
      return;
    }
    if (type === MESSAGE_ITEMS.user) {
      const words = textOf(item[MESSAGE.content], ITEM_TEXT_BLOCKS);
      this.#context('conversation', this.#role.kind === 'reviewer' ? 'runtime' : 'person', words.text, words.completeness, evidence, turnId);
      return;
    }
    if (type === MESSAGE_ITEMS.reasoning) {
      this.#reasoningItem(item, evidence, turnId);
      return;
    }
    if (type === MESSAGE_ITEMS.compaction || type === MESSAGE_ITEMS.functionOutput) return;
    // §2.12: a hook's request to the model, never an action. The `user` message with its id holds its words already; one
    // that joins none is kept as the runtime's words, so nothing it carried goes unread.
    if (type === MESSAGE_ITEMS.hookPrompt) {
      if (typeof id !== 'string' || !this.#givenIds.has(id)) {
        const words = hookPromptText(item);
        this.#context('conversation', 'runtime', words.text, words.completeness, evidence, turnId);
      }
      return;
    }

    // X6: an action item; one the contract does not name is read as an unknown tool, with a gap.
    if (!isActionItem(type)) this.#unrecognised = true;
    if (this.#role.kind === 'reviewer') {
      // X19, XB9: a reviewer's own actions are neither its parent's nor dropped: kept, scanned, and said as unmeasured.
      this.#reviewerActions = true;
      this.#context('conversation', 'reviewer', JSON.stringify(item), 'unknown', evidence, turnId);
      return;
    }
    if (typeof id !== 'string' || id === '') {
      this.#unrecognised = true;
      this.#orphan({ text: JSON.stringify(item), completeness: 'unknown' }, evidence, turnId, 'tool');
      return;
    }
    this.#itemIds.add(id);
    if (item[ITEM.type] === ACTION_ITEMS.command || item[ITEM.type] === ACTION_ITEMS.fileChange) this.#ranItems += 1;
    const action = readAction(item);
    for (const question of action.unanswered) {
      this.#collected.gaps.push({ kind: 'capability-absent', question, agentId: this.#role.agentId });
    }
    const callId = this.#scoped(id);
    this.#actionCalls.push({
      call: {
        id: callId, agentId: this.#role.agentId, toolName: action.toolName, input: action.input, targets: action.targets,
        commands: action.commands, resultShape: action.resultShape, toolKnown: action.toolKnown,
        ...(action.written === undefined ? {} : { written: action.written }), ...(turnId === undefined ? {} : { turnId }),
        ...this.#ranIn(turnId, action.input['cwd']), evidence,
      },
      // The item is both the call and what came back (X6). What it printed is the execution stage: never delivered by
      // itself - `#finishAgent` raises it to the model's only where a cell is shown to have returned it (XB5).
      result: {
        callId, stage: 'execution', completeness: action.output?.completeness ?? 'complete', execution: action.execution, evidence,
        ...(action.output === undefined ? {} : { content: action.output.text }),
      },
      command: item[ITEM.type] === ACTION_ITEMS.command,
    });
  }

  /** X16, X17: `started` names the agent a spawn started, `interacted` the agent a later call reached, by the call's id. */
  #activity(item: JsonObject): void {
    const kind = item[ACTIVITY.kind];
    const id = item[ITEM.id];
    const thread = item[ACTIVITY.agentThreadId];
    if (this.#role.kind !== 'agent' || typeof id !== 'string' || typeof thread !== 'string' || thread === '') return;
    if (kind === ACTIVITY.kinds.started) {
      const header = this.#role.threads.get(thread);
      const origin = header?.origin.kind === 'spawned' ? header.origin : undefined;
      this.#collected.delegationIndex.push({
        callId: this.#scoped(id), agentId: thread,
        ...(origin === undefined ? {} : { requestedType: origin.role ?? 'subagent' }),
        ...(origin?.depth === undefined ? {} : { depth: origin.depth }),
        ...(header?.parent.kind === 'parent' ? { recordedParentAgentId: header.parent.id } : {}),
      });
    } else if (kind === ACTIVITY.kinds.interacted) {
      this.#collected.followUpIndex.push({ callId: this.#scoped(id), agentId: thread });
    }
  }

  #reasoningItem(item: JsonObject, evidence: EvidenceRef, turnId: string | undefined): void {
    const id = item[ITEM.id];
    const joined = typeof id === 'string' ? this.#reasoning.get(id) : undefined;
    const readable = [item[REASONING_ITEM.summary], item[REASONING_ITEM.raw]]
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .flatMap((part) => (typeof part === 'string' ? [part] : isJsonObject(part) && typeof part[MESSAGE.blockText] === 'string' ? [part[MESSAGE.blockText] as string] : []))
      .filter((text) => text !== '');
    // A copy holds nothing its reasoning does not: no readable text, or the same text but for whitespace at its ends. Text
    // that differs is not dropped as a copy - it may hold what the reasoning does not - and is kept below with a gap.
    if (joined !== undefined && joined !== 'hidden' && (readable.length === 0 || readable.join('\n').trim() === joined.message.text.trim())) {
      joined.copies.push(evidence);
      return;
    }
    if (readable.length === 0) return;
    // The id joins a reasoning record that held no readable text: this is its summary, and the encrypted rest stays unread.
    if (joined === 'hidden' && typeof id === 'string' && this.#role.kind === 'agent') {
      const said: SaidMessage = {
        message: { agentId: this.#role.agentId, kind: 'reasoning', text: readable.join('\n'), completeness: 'partial', evidence, id },
        ...(turnId === undefined ? {} : { turnId }),
        copies: [],
      };
      this.#said.push(said);
      this.#reasoning.set(id, said);
      return;
    }
    // Readable text that joins no reasoning record: kept, scanned, and not counted as the agent's words (X31).
    this.#collected.gaps.push({ kind: 'relation-unresolved', ...(this.#role.kind === 'agent' ? { agentId: this.#role.agentId } : { source: this.#role.source }) });
    this.#context('conversation', this.#role.kind === 'agent' ? 'agent' : 'reviewer', readable.join('\n'), 'partial', evidence, turnId);
  }

  #context(kind: ContextRecord['kind'], author: ContextAuthor, text: string, completeness: ContentCompleteness, evidence: EvidenceRef, turnId?: string): void {
    if (text === '' && completeness === 'complete') return;
    this.#collected.contexts.push({
      kind, author, text, completeness, evidence, ...(turnId === undefined ? {} : { turnId }),
      // A reviewer's records are named by their `review` source: a reviewer is no agent (X19).
      ...(this.#role.kind === 'agent' ? { agentId: this.#role.agentId } : {}),
    });
  }

  /** X6: an output no call joins is counted and kept, attributed to nothing, with a gap. */
  #orphan(read: { readonly text: string; readonly completeness: ContentCompleteness }, evidence: EvidenceRef, turnId: string | undefined, author: ContextAuthor = 'tool'): void {
    this.#collected.gaps.push({ kind: 'relation-unresolved', ...(this.#role.kind === 'agent' ? { agentId: this.#role.agentId } : { source: this.#role.source }) });
    this.#context('orphan-output', author, read.text, read.completeness, evidence, turnId);
  }

  #scoped(id: string): string {
    return this.#role.idScope + id;
  }

  finish(): void {
    if (this.#role.kind === 'agent') this.#finishAgent();
    else this.#finishReviewer();
    // A reviewer is no agent (X19): its source names it, and no agent id does.
    const agentId = this.#role.kind === 'agent' ? this.#role.agentId : undefined;
    this.#collected.capabilities.push(...capabilitiesOf(this.#role.header, this.#role.source, agentId, {
      unrecognised: this.#unrecognised,
      interrupted: this.#interrupted,
      hiddenReasoning: this.#hiddenReasoning,
      permissionsIncomplete: this.#permissionsIncomplete,
      permissionsRecorded: this.#permissionsRecorded,
    }));
  }

  /**
   * XD4, amended 2026-10-05 by the maintainer (§2.11): where an agent's record keeps no item of what ran - every VS Code
   * panel record, measured - the commands its cells' code wrote out as text are its actions. A command the code builds
   * while it runs is not read, and leaves the action stream a gap. What a cell returned is given to its command only
   * where the cell ran that one command and called no other tool; it is the model's input. The cell's header says
   * whether the script ran to its end; the command's own exit is read beside it where the cell returned the call's
   * whole result, and is absent where the code returned `.output` alone (XD4a, amended 2026-10-08). A cell whose return holds
   * a refusal by agentwhy's hook is read by `hookRefusalsIn` alone, so a stopped command is never also a run one.
   */
  #cellCommands(): { readonly call: Omit<CallRecord, 'sequence'>; readonly result?: ResultRecord }[] {
    const agentId = this.#role.agentId;
    const returned = new Map(this.#outputs.filter(({ kind }) => kind === 'cell').map(({ output }) => [output.callId, output]));
    const found: { readonly call: Omit<CallRecord, 'sequence'>; readonly result?: ResultRecord }[] = [];
    let unread = 0;
    for (const cell of this.#calls.values()) {
      if (cell.kind !== 'cell' || cell.code === undefined) continue;
      const output = returned.get(cell.id);
      if (output !== undefined && hookRefusalsIn(output.text).length > 0) continue;
      const { commands, unread: notText, alone } = cellCommands(cell.code);
      unread += notText;
      const execution = output === undefined ? undefined : scriptState(output.text);
      commands.forEach((command, at) => {
        const id = `${this.#scoped(cell.id)}:command:${at + 1}`;
        found.push({
          call: {
            id, agentId, toolName: CELL_COMMANDS.call, input: { command }, targets: [], commands: [command], resultShape: 'listing',
            toolKnown: true, evidence: cell.evidence, ...(cell.turnId === undefined ? {} : { turnId: cell.turnId }),
            ...this.#ranIn(cell.turnId),
          },
          ...(output === undefined || execution === undefined ? {} : {
            result: {
              callId: id, stage: 'model' as const, execution, evidence: output.evidence,
              // Only a cell that ran this one command returned what it printed; any other's return is no one command's.
              ...(alone ? { content: output.text, completeness: output.completeness } : { completeness: 'unknown' as const }),
            },
          }),
        });
      });
    }
    if (unread > 0) this.#collected.capabilities.push({ question: 'actions', state: 'unmeasured', source: this.#role.source, agentId });
    return found;
  }

  #finishAgent(): void {
    const agentId = this.#role.agentId;
    // XB5: a command's output is the model's only where one cell return is shown to carry it, which is known once
    // every record of this agent has been read. Measured on CommandExecution alone, so no other item type is raised.
    const cellReturns = this.#outputs.filter(({ kind }) => kind === 'cell').map(({ output }) => output.text);
    const calls: { readonly call: Omit<CallRecord, 'sequence'>; readonly result?: ResultRecord }[] = this.#actionCalls.map(({ call, result, command }) =>
      (command && result.content !== undefined && deliveredWhole(result.content, cellReturns)
        ? { call, result: { ...result, stage: 'model' as const } }
        : { call, result }));
    if (this.#ranItems === 0 && this.#role.kind === 'agent') calls.push(...this.#cellCommands());
    for (const call of this.#calls.values()) {
      // A direct call its action item answers is that item: one action, never two (X6).
      if (call.kind === 'cell' || call.kind === 'follow-up' || (call.kind === 'direct' && this.#itemIds.has(call.id))) continue;
      calls.push({
        call: {
          id: this.#scoped(call.id), agentId, toolName: call.toolName, input: call.input, targets: [], commands: [], resultShape: 'none',
          toolKnown: call.kind === 'spawn', evidence: call.evidence, ...(call.turnId === undefined ? {} : { turnId: call.turnId }),
        },
      });
    }
    for (const { kind, output } of this.#outputs) {
      const call = this.#calls.get(output.callId);
      if (call === undefined) {
        this.#orphan(output, output.evidence, output.turnId);
        continue;
      }
      const turn = output.turnId === undefined ? {} : { turnId: output.turnId };
      // X10: a cell's output is what the agent's model was handed, from no action any id names.
      if (kind === 'cell' && call.kind === 'cell') {
        this.#collected.deliveries.push({ recipientAgentId: agentId, status: 'confirmed', text: output.text, completeness: output.completeness, evidence: output.evidence, ...turn });
        // `codex-blocks-too` CK12: a command agentwhy's hook refused ran nowhere and left no item; its one trace is agentwhy's
        // own reason in this output. Each is a call of the shell - named as Codex names it to a hook (CKB2) - refused
        // before it ran, on the path the reason names.
        hookRefusalsIn(output.text).forEach((refusal, at) => {
          const id = `${this.#scoped(call.id)}:refused:${at + 1}`;
          calls.push({
            call: {
              id, agentId, toolName: PRE_TOOL_USE.shellTool, input: refusal.command === undefined ? {} : { command: refusal.command },
              targets: [refusal.path], commands: refusal.command === undefined ? [] : [refusal.command], resultShape: 'listing', toolKnown: true,
              evidence: output.evidence, ...turn,
            },
            result: {
              callId: id, content: refusal.reason, stage: 'model', completeness: 'complete', evidence: output.evidence,
              denial: { kind: HOOK_REFUSAL.denialKind, recognised: true, source: 'rule' },
            },
          });
        });
      } else if (call.kind === 'follow-up' || (call.kind === 'direct' && this.#itemIds.has(call.id))) {
        this.#collected.deliveries.push({
          recipientAgentId: agentId, sourceId: this.#scoped(call.id), status: 'confirmed', text: output.text, completeness: output.completeness, evidence: output.evidence, ...turn,
        });
      } else {
        this.#collected.results.push({
          callId: this.#scoped(call.id), content: output.text, stage: 'model', completeness: output.completeness, evidence: output.evidence,
          // A spawn's output says only that the agent started; what it did comes back as its reports (§2.4).
          ...(call.kind === 'spawn' ? { launchNotice: true } : {}),
        });
      }
    }
    for (const { result } of calls) if (result !== undefined) this.#collected.results.push(result);
    calls.sort((first, second) => first.call.evidence.record - second.call.evidence.record);
    calls.forEach(({ call }, index) => this.#collected.calls.push({ ...call, sequence: index + 1 }));

    this.#joinCopies();
    this.#collected.messages.push(...this.#said.map(({ message, copies }) => (copies.length === 0 ? message : { ...message, copies })));
  }

  /**
   * X31: an `AgentMessage` item is a copy of the message with its `id`. A `task_complete` text carries no id, so it is a
   * copy only of the one final answer of its turn whose text it equals but for whitespace at its ends, as it did in 6 of 6
   * (§2.8). XD9 (§2.13): a copy no id joins - the VS Code panel's items, whose ids no message has (0 of 101 on 0.160.0 and
   * 0.162), and the editor's `agent_message` events, which have none - is the copy of the one assistant message in the
   * file whose text it equals the same way (97 of 101 items, 15 of 15 events); equal to none or to several, it is kept as
   * context with a gap, and never counted as a second utterance.
   */
  #joinCopies(): void {
    const byId = new Map(this.#said.filter(({ message }) => message.kind === 'said' && message.id !== undefined).map((said) => [said.message.id, said]));
    for (const item of this.#agentItems) {
      const said = (typeof item.id === 'string' ? byId.get(item.id) : undefined) ?? this.#oneByText(item.text);
      if (said !== undefined) said.copies.push(item.evidence);
      else this.#uncertainCopy(item.text, item.evidence);
    }
    for (const copy of this.#editorCopies) {
      const said = this.#oneByText(copy.text);
      if (said !== undefined) said.copies.push(copy.evidence);
      else this.#uncertainCopy(copy.text, copy.evidence, copy.turnId);
    }
    for (const completion of this.#completions) {
      // Whitespace at either end holds no value, so a difference there alone does not make the text another one. A turn
      // holds several final answers where a hook's block made the agent answer twice (§2.13: 33 of 76 completions, every
      // one equal to exactly one of them): the completion is the copy of the one its text equals (XD9).
      const finals = this.#said.filter(({ message, turnId }) =>
        message.channel === 'final' && completion.turnId !== undefined && turnId === completion.turnId && message.text.trim() === completion.text.trim());
      const final = finals.length === 1 ? finals[0] : undefined;
      if (final !== undefined) final.copies.push(completion.evidence);
      else this.#uncertainCopy(completion.text, completion.evidence);
    }
  }

  /** XD9: the one assistant message of this file whose text equals this one but for whitespace at its ends, or none. */
  #oneByText(text: string): SaidMessage | undefined {
    const trimmed = text.trim();
    if (trimmed === '') return undefined;
    const equal = this.#said.filter(({ message }) => message.kind === 'said' && message.text.trim() === trimmed);
    return equal.length === 1 ? equal[0] : undefined;
  }

  #uncertainCopy(text: string, evidence: EvidenceRef, turnId?: string): void {
    if (text === '') return;
    // A copy of the agent's words that joins none of them: what it leaves open is its words, never what it ran or reached -
    // said so, so a page can tell it from an action left unjoined (found 2026-10-05).
    this.#collected.gaps.push({ kind: 'relation-unresolved', question: 'own-words', agentId: this.#role.agentId });
    this.#context('conversation', 'agent', text, 'complete', evidence, turnId);
  }

  /** X19, X20: every verdict with its own evidence, on the reviewed turn its reviewer's turn names, or on none. */
  #finishReviewer(): void {
    for (const { output } of this.#outputs) this.#context('conversation', 'reviewer', output.text, output.completeness, output.evidence, output.turnId);
    const verdicts = this.#verdicts.map(({ turnId, text, evidence }): ReviewVerdict => {
      const reviewed = turnId === undefined ? undefined : this.#reviewedTurns.get(turnId);
      if (reviewed === null) this.#collected.gaps.push({ kind: 'relation-unresolved', source: this.#role.source });
      const verdict = typeof text === 'string' ? parseJsonObject(text) : undefined;
      if (verdict === undefined && typeof text === 'string') this.#context('conversation', 'reviewer', text, 'complete', evidence, turnId);
      const risk = verdict?.[VERDICT.risk];
      const rationale = verdict?.[VERDICT.rationale];
      return {
        outcome: verdict?.[VERDICT.outcome] === VERDICT.allowed ? 'allowed' : 'unrecognised',
        ...(typeof reviewed === 'string' ? { turnId: reviewed } : {}),
        ...(typeof risk === 'string' ? { risk } : {}),
        ...(typeof rationale === 'string' ? { rationale } : {}),
        evidence,
      };
    });
    this.#collected.reviews.push({
      id: this.#role.agentId,
      ...(this.#role.reviewedAgentId === undefined ? {} : { reviewedAgentId: this.#role.reviewedAgentId }),
      verdicts,
      evidence: this.#firstEvidence ?? { source: this.#role.source, record: 1 },
    });
    if (this.#reviewerActions) this.#collected.capabilities.push({ question: 'actions', state: 'unmeasured', source: this.#role.source });
  }
}

/** The turn a response record belongs to, where its metadata carries one (§2.2). */
function turnOf(payload: JsonObject): string | undefined {
  const metadata = payload[RESPONSE_TURN.metadata];
  const turn = isJsonObject(metadata) ? metadata[RESPONSE_TURN.turnId] : undefined;
  return typeof turn === 'string' && turn !== '' ? turn : undefined;
}

/**
 * The text of content blocks of the listed types. A block of another type, or one whose text is not a string, is not
 * coerced: the text is then `partial` (X10). Content that is no list of blocks is `unknown`.
 */
function textOf(content: unknown, types: readonly string[]): { readonly text: string; readonly completeness: ContentCompleteness } {
  if (typeof content === 'string') return { text: content, completeness: 'complete' };
  if (!Array.isArray(content)) return { text: '', completeness: content === undefined ? 'complete' : 'unknown' };
  let whole = true;
  const texts: string[] = [];
  for (const block of content) {
    const text = isJsonObject(block) ? block[MESSAGE.blockText] : undefined;
    if (isJsonObject(block) && types.some((type) => type === block[MESSAGE.blockType]) && typeof text === 'string') texts.push(text);
    else whole = false;
  }
  return { text: texts.join('\n'), completeness: whole ? 'complete' : 'partial' };
}

/** The script's state, by the header its return opens with (XD4): never the exit code of a command it ran. */
/**
 * What a cell's return says about running: the script's own state from its header, and - where the cell returned the
 * call's whole result - the command's exit code (XD4a, §2.11). The header is not the command's end: of 632 cells that
 * recorded both, 138 completed a script whose command exited non-zero, so the two are read separately and never
 * substituted for one another.
 */
function scriptState(text: string): Execution {
  const exitCode = cellExitCode(text);
  const end = exitCode === undefined ? {} : { exitCode };
  if (text.startsWith(CELL_COMMANDS.completedHeader)) return { status: 'completed', ...end };
  if (text.startsWith(CELL_COMMANDS.failedHeader)) return { status: 'failed', ...end };
  return { status: 'unrecognised' };
}

/** A `HookPrompt`'s words, one fragment after another (§2.12); a fragment of another shape makes them partial. */
function hookPromptText(item: JsonObject): { readonly text: string; readonly completeness: ContentCompleteness } {
  const fragments = item[HOOK_PROMPT.fragments];
  if (!Array.isArray(fragments)) return { text: '', completeness: 'unknown' };
  const texts = fragments.flatMap((fragment) => (isJsonObject(fragment) && typeof fragment[HOOK_PROMPT.text] === 'string' ? [fragment[HOOK_PROMPT.text] as string] : []));
  return { text: texts.join('\n'), completeness: texts.length === fragments.length ? 'complete' : 'partial' };
}

/** A cell's or a call's output: a string, or parts whose text is under `input_text` (§2.8). */
function outputText(output: unknown): { readonly text: string; readonly completeness: ContentCompleteness } {
  if (typeof output === 'string') return { text: output, completeness: 'complete' };
  return textOf(output, [CODE_CELL.textPart]);
}
