// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { refusedReach } from '../../../core/access/refusal-message.ts';
import { MAIN_AGENT_TYPE, type Agent } from '../../../core/agent.ts';
import type { CapabilityRecord } from '../../../core/capability.ts';
import type { ContentCompleteness, Gap } from '../../../core/completeness.ts';
import type { ContextRecord } from '../../../core/context.ts';
import type { Execution } from '../../../core/event.ts';
import { agentSource, mainSource, type EvidenceRef } from '../../../core/evidence.ts';
import type { AgentMessage } from '../../../core/message.ts';
import type {
  CallRecord, DelegationCall, DelegationIndexEntry, DenialMarker, ResultRecord, SessionRecords,
} from '../../../core/session-records.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { UNMEASURED_ANSWERS, type Answer, type Question } from '../contract/capabilities.ts';
import { AGENTWHY_REFUSAL } from '../contract/refusals.ts';
import {
  CALL, CHAT, CHAT_ANSWERS, CHAT_LOG, CONFIRMATION, CONTEXT, HELPER_ANSWERS, MARKDOWN, PART, PART_KINDS, PART_TOOLS, REQUEST, RESULT,
  RESULT_WORDS, SPECIFIC, URI, VS_CODE_LOG_TOOLS,
} from '../contract/vs-code.ts';
import { chatProfileOf, helperProfileOf } from './chat-call-profiles.ts';
import type { ReplayedChat } from './chat-log-replay.ts';

/** What the reader knows of a chat beside its log. */
export interface ChatSetting {
  /** The chat's id where the log names none: its file's name. */
  readonly fallbackId: string;
  /** The folder its workspace was opened on, from `workspace.json` (VCB-M1). */
  readonly workspaceFolder?: string;
}

/** The kinds a refusal is recorded with: VS Code's own words for each, never a value a log holds. */
const DENIAL = { hook: 'denied', skipped: 'skipped', cancelled: 'cancelled', unrecognised: 'unrecognised' } as const;
const KNOWN_PARTS: ReadonlySet<string> = new Set(PART_KINDS);
const HANDED_KINDS: ReadonlySet<string> = new Set(CONTEXT.kinds);
/** The name a file VS Code handed the model is read under: no tool's, since no call was made (VCD6). */
const HANDED = 'context';
const TREE_DEPTH = 64;

/**
 * A replayed VS Code chat log, in the core's records (`what-vs-code-copilot-wrote` VC1-VC7, plan step 2). A log of a
 * version other than 3 is not read (VC2); one the replay could not follow to its end, or of a shape not measured, is read
 * as far as it goes and says so.
 */
export function chatRecords(replayed: ReplayedChat, setting: ChatSetting): SessionRecords {
  const chat = replayed.chat;
  const named = chat?.[CHAT.sessionId];
  const scan = new ChatScan(typeof named === 'string' && named !== '' ? named : setting.fallbackId, setting, replayed.unknownShape || chat === undefined);
  for (let at = 0; at < replayed.damaged; at += 1) scan.gap({ kind: 'record-damaged' });
  if (replayed.stopped) scan.gap({ kind: 'record-damaged' });
  if (chat === undefined) return scan.records();
  if (chat[CHAT.version] !== CHAT_LOG.version) {
    scan.unmeasured();
    return scan.records();
  }
  const requests = chat[CHAT.requests];
  (Array.isArray(requests) ? requests : []).forEach((request, at) => scan.request(request, at));
  return scan.records();
}

/**
 * Reads a chat's requests in order. Within a request, a call takes the place of the part that shows it, and every call of
 * the request's rounds before it that no part showed comes just before it (VCB-M12: a call a hook refused carries a part
 * of its own id); the agent's text between two calls is one message. Record numbers are positions in the chat as replayed,
 * never times.
 */
class ChatScan {
  readonly #main: string;
  readonly #setting: ChatSetting;
  #unknownShape: boolean;
  #record = 0;
  readonly #sequences = new Map<string, number>();
  readonly #calls: CallRecord[] = [];
  readonly #results: ResultRecord[] = [];
  readonly #messages: AgentMessage[] = [];
  readonly #contexts: ContextRecord[] = [];
  readonly #delegations: DelegationCall[] = [];
  readonly #index: DelegationIndexEntry[] = [];
  /** Helpers a `runSubagent` call's part names, and helpers a part says it is a call of. */
  readonly #started = new Set<string>();
  readonly #acting = new Set<string>();
  readonly #folders = new Set<string>();
  readonly #gaps: Gap[] = [];

  constructor(main: string, setting: ChatSetting, unknownShape: boolean) {
    this.#main = main;
    this.#setting = setting;
    this.#unknownShape = unknownShape;
  }

  gap(gap: Gap): void {
    this.#gaps.push(gap);
  }

  /** VC2: a log of a version not measured is not read; nothing of it is known. */
  unmeasured(): void {
    this.#unknownShape = true;
  }

  request(request: unknown, at: number): void {
    const main = this.#main;
    if (!isJsonObject(request)) {
      this.#gaps.push({ kind: 'record-damaged', agentId: main });
      return;
    }
    const when = request[REQUEST.timestamp];
    const message = request[REQUEST.message];
    const prompt = isJsonObject(message) ? message[REQUEST.text] : undefined;
    if (typeof prompt === 'string' && prompt !== '') {
      const evidence = this.#evidence(main, typeof when === 'number' && Number.isFinite(when) ? when : undefined);
      this.#contexts.push({ kind: 'conversation', author: 'person', agentId: main, text: prompt, completeness: 'complete', evidence });
    }
    const id = request[REQUEST.id];
    this.#handed(request[CONTEXT.data], typeof id === 'string' && id !== '' ? id : `request-${at}`);

    const result = request[REQUEST.result];
    const held = isJsonObject(result) ? result[REQUEST.metadata] : undefined;
    const metadata: JsonObject = isJsonObject(held) ? held : {};
    const results = metadata[REQUEST.results];
    const returned: JsonObject = isJsonObject(results) ? results : {};
    const calls = this.#callsOf(metadata[REQUEST.rounds]);
    const response = request[REQUEST.response];
    const parts = (Array.isArray(response) ? response : []).filter(isJsonObject);

    // The part that shows each call, the first where two do.
    const shown = new Map<number, JsonObject>();
    for (const part of parts) {
      if (part[PART.kind] !== PART.tool || part[PART.helperOf] !== undefined) continue;
      const at = joinedIndex(calls, part);
      if (at >= 0 && !shown.has(at)) shown.set(at, part);
    }
    const done = new Set<number>();
    const callsUpTo = (last: number): void => {
      for (let at = 0; at <= last; at += 1) {
        const call = calls[at];
        if (call === undefined || done.has(at)) continue;
        done.add(at);
        this.#call(call, shown.get(at), returned);
      }
    };
    let words: string[] = [];
    const said = (): void => {
      const text = words.join('');
      words = [];
      if (text.trim() !== '') this.#messages.push({ agentId: main, kind: 'said', text, completeness: 'complete', evidence: this.#evidence(main) });
    };
    for (const part of parts) {
      const kind = part[PART.kind];
      if (kind === undefined) {
        const value = part[MARKDOWN.value];
        if (typeof value === 'string') words.push(value);
        continue;
      }
      // VCD4: a part of a kind not measured may show a call no measurement saw.
      if (typeof kind !== 'string' || !KNOWN_PARTS.has(kind)) {
        this.#unknownShape = true;
        continue;
      }
      if (kind !== PART.tool) continue;
      said();
      if (part[PART.helperOf] !== undefined) this.#helperCall(part);
      else callsUpTo(joinedIndex(calls, part));
    }
    said();
    callsUpTo(calls.length - 1);
  }

  /**
   * VCD6: each file VS Code handed the model with a request - one open in the editor, one attached with `#`, an instructions
   * file - read by the chat's own agent before any of its calls, its text not recorded (VCB-M21). A variable of a kind, or a
   * value of a shape, not measured leaves the chat's actions not known whole (VCD4).
   */
  #handed(data: unknown, requestId: string): void {
    if (data === undefined) return;
    const variables = isJsonObject(data) ? data[CONTEXT.variables] : undefined;
    if (!Array.isArray(variables)) {
      this.#unknownShape = true;
      return;
    }
    variables.forEach((variable, at) => {
      const kind = isJsonObject(variable) ? variable[CONTEXT.kind] : undefined;
      const value = isJsonObject(variable) ? variable[CONTEXT.value] : undefined;
      const file = fileOf(value) ?? (isJsonObject(value) ? fileOf(value[CONTEXT.uri]) : undefined);
      if (typeof kind !== 'string' || !HANDED_KINDS.has(kind) || file === undefined) {
        this.#unknownShape = true;
        return;
      }
      const main = this.#main;
      const id = `${requestId}:${HANDED}-${at}`;
      const evidence = this.#evidence(main);
      this.#calls.push({
        id, agentId: main, sequence: this.#next(main), toolName: HANDED, input: { [CONTEXT.kind]: kind },
        targets: [file], commands: [], resultShape: 'content', toolKnown: true, evidence,
      });
      this.#results.push({ callId: id, stage: 'model', completeness: 'unknown', textNotRecorded: true, evidence });
    });
  }

  records(): SessionRecords {
    const main = this.#main;
    const agents: Agent[] = [{ id: main, type: MAIN_AGENT_TYPE, depth: 0 }];
    for (const helper of this.#started) agents.push({ id: helper });
    // A part naming a helper no `runSubagent` part started still acted: it stays, and its missing start is said (CP11).
    for (const helper of this.#acting) {
      if (this.#started.has(helper)) continue;
      agents.push({ id: helper });
      this.#gaps.push({ kind: 'relation-unresolved', agentId: helper });
    }
    const workingDirectories = new Set<string>();
    if (this.#setting.workspaceFolder !== undefined) workingDirectories.add(this.#setting.workspaceFolder);
    for (const folder of this.#folders) workingDirectories.add(folder);
    return {
      sessionId: main,
      provider: 'copilot',
      agents,
      calls: this.#calls,
      results: this.#results,
      delegations: this.#delegations,
      delegationIndex: this.#index,
      followUps: [],
      followUpIndex: [],
      messages: this.#messages,
      deliveredReports: [],
      agentReports: [],
      workingDirectories: [...workingDirectories],
      turns: [],
      reviews: [],
      contexts: this.#contexts,
      deliveries: [],
      capabilities: agents.flatMap((agent) => this.#capabilities(agent.id)),
      gaps: this.#gaps,
    };
  }

  #callsOf(rounds: unknown): JsonObject[] {
    const calls: JsonObject[] = [];
    for (const round of Array.isArray(rounds) ? rounds : []) {
      const listed = isJsonObject(round) ? round[REQUEST.calls] : undefined;
      for (const call of Array.isArray(listed) ? listed : []) {
        const id = isJsonObject(call) ? call[CALL.id] : undefined;
        if (isJsonObject(call) && typeof id === 'string' && id !== '' && typeof call[CALL.name] === 'string') calls.push(call);
        else this.#gaps.push({ kind: 'record-damaged', agentId: this.#main });
      }
    }
    return calls;
  }

  /** One of the chat's own calls (VCB-M6, VC3): its arguments, its result by its id (VCB-M7), the part that shows it. */
  #call(call: JsonObject, part: JsonObject | undefined, returned: JsonObject): void {
    const main = this.#main;
    const id = call[CALL.id] as string;
    const name = call[CALL.name] as string;
    const given = call[CALL.arguments];
    const parsed = typeof given === 'string' ? parseJsonObject(given) : isJsonObject(given) ? given : undefined;
    if (parsed === undefined) this.#gaps.push({ kind: 'record-damaged', agentId: main });
    const input = parsed ?? {};
    const profile = chatProfileOf(name, input);
    // VCB-M19: the folder a terminal's command ran in, where the part that shows it says.
    const folder = name === VS_CODE_LOG_TOOLS.terminal.name ? fileOf(specificOf(part)?.[SPECIFIC.folder]) : undefined;
    if (folder !== undefined) this.#folders.add(folder);
    const evidence = this.#evidence(main);
    this.#calls.push({
      id, agentId: main, sequence: this.#next(main), toolName: name, input,
      targets: profile.targets, commands: profile.commands, resultShape: profile.resultShape, toolKnown: profile.toolKnown,
      ...(profile.written === undefined ? {} : { written: profile.written }),
      ...(profile.printsMatches === true ? { printsMatches: true as const } : {}),
      ...(folder === undefined ? {} : { workingDirectory: folder }),
      evidence,
    });
    if (name === VS_CODE_LOG_TOOLS.subagent.name) this.#delegation(id, input, part, evidence);
    if (Object.hasOwn(returned, id)) this.#results.push(this.#resultOf(id, name, returned[id], part));
  }

  /** VCB-M16: a `runSubagent` call hands work to a helper, named by the id of the part that shows the call. */
  #delegation(callId: string, input: JsonObject, part: JsonObject | undefined, evidence: EvidenceRef): void {
    const keys = VS_CODE_LOG_TOOLS.subagent;
    const prompt = input[keys.prompt];
    const description = input[keys.description];
    this.#delegations.push({
      callId, parentAgentId: this.#main, evidence,
      ...(typeof prompt === 'string' ? { prompt } : {}), ...(typeof description === 'string' ? { description } : {}),
    });
    const helper = part?.[PART.callId];
    // No part, no helper to name: the delegation stays, its agent unresolved (the core says so).
    if (typeof helper !== 'string' || helper === '' || this.#started.has(helper)) return;
    this.#started.add(helper);
    this.#index.push({ callId, agentId: helper });
    if (typeof prompt === 'string' && prompt !== '') {
      this.#contexts.push({ kind: 'conversation', author: 'another-agent', agentId: helper, text: prompt, completeness: 'complete', evidence: this.#evidence(helper) });
    }
  }

  /**
   * A helper's call, known by its part alone (VCB-M16, VCD3): the files its messages name; a refusal its part says, with no
   * words to say whose; and for a finished `read_file`, a read whose text is not recorded. Anything else has no result.
   */
  #helperCall(part: JsonObject): void {
    const helper = part[PART.helperOf];
    if (typeof helper !== 'string' || helper === '') {
      this.#gaps.push({ kind: 'relation-unresolved', agentId: this.#main });
      return;
    }
    this.#acting.add(helper);
    const id = part[PART.callId];
    if (typeof id !== 'string' || id === '') {
      this.#gaps.push({ kind: 'relation-unresolved', agentId: helper });
      return;
    }
    const toolId = part[PART.toolId];
    const name = typeof toolId === 'string' && Object.hasOwn(PART_TOOLS, toolId) ? PART_TOOLS[toolId] : undefined;
    const files = filesOf(part);
    const profile = helperProfileOf(name, files);
    const evidence = this.#evidence(helper);
    this.#calls.push({
      id, agentId: helper, sequence: this.#next(helper), toolName: name ?? (typeof toolId === 'string' ? toolId : ''), input: {},
      targets: profile.targets, commands: profile.commands, resultShape: profile.resultShape, toolKnown: profile.toolKnown, evidence,
    });
    const confirmed = confirmationOf(part);
    if (confirmed === CONFIRMATION.refused || confirmed === CONFIRMATION.skipped) {
      this.#results.push({ callId: id, denial: { kind: DENIAL.unrecognised, recognised: false }, stage: 'model', completeness: 'complete', evidence });
      return;
    }
    if (name === VS_CODE_LOG_TOOLS.readFile.name && part[PART.complete] === true && files.length > 0) {
      this.#results.push({ callId: id, stage: 'model', completeness: 'unknown', evidence });
    }
  }

  /**
   * What a call handed the model (VCB-M7, VCB-M17, VC7): its text; who refused it, by VS Code's words (VC4); cut at the
   * scrollback, partial; a terminal's command, its exit code (VCB-M15) - one with none is no run the record establishes.
   */
  #resultOf(callId: string, name: string, returned: unknown, part: JsonObject | undefined): ResultRecord {
    const evidence = this.#evidence(this.#main);
    const text = textOf(returned);
    if (text === undefined) return { callId, stage: 'model', completeness: 'unknown', evidence };
    const { content, whole } = text;
    const denial = denialOf(content, part);
    if (denial !== undefined) return { callId, denial, content, stage: 'model', completeness: 'complete', evidence };
    const completeness: ContentCompleteness = !whole ? 'unknown' : content.includes(RESULT_WORDS.cut) ? 'partial' : 'complete';
    const execution = name === VS_CODE_LOG_TOOLS.terminal.name ? executionOf(part) : undefined;
    return { callId, content, stage: 'model', completeness, evidence, ...(execution === undefined ? {} : { execution }) };
  }

  #capabilities(agentId: string): CapabilityRecord[] {
    const main = agentId === this.#main;
    const answers = this.#unknownShape ? UNMEASURED_ANSWERS : main ? CHAT_ANSWERS : HELPER_ANSWERS;
    const source = main ? mainSource() : agentSource(agentId);
    return (Object.entries(answers) as [Question, Answer][]).map(([question, state]) => ({
      question, state, source, ...(main ? {} : { agentId }),
    }));
  }

  #next(agentId: string): number {
    const sequence = (this.#sequences.get(agentId) ?? 0) + 1;
    this.#sequences.set(agentId, sequence);
    return sequence;
  }

  #evidence(agentId: string, at?: number): EvidenceRef {
    this.#record += 1;
    return { source: agentId === this.#main ? mainSource() : agentSource(agentId), record: this.#record, ...(at === undefined ? {} : { at }) };
  }
}

/** VCB-M12: a part shows the call whose id is its own before `__vscode-`. */
function joinedIndex(calls: readonly JsonObject[], part: JsonObject): number {
  const id = part[PART.callId];
  if (typeof id !== 'string' || id === '') return -1;
  return calls.findIndex((call) => (call[CALL.id] as string).startsWith(`${id}__`));
}

/**
 * Who refused a call, by the words VS Code opens its result with (VCB-M9, VCB-M12, VC4): a hook - agentwhy's, a rule's,
 * where `refuse`'s own sentence follows (CPD12), a check's otherwise (WS9) - or a person's Skip or cancel. The words count
 * only where no part says the call was let through: a file that opens with them, printed by a call that ran, is the file's
 * text. A part that says it was refused or skipped, with no words this contract knows, is a marker not recognised.
 */
function denialOf(content: string, part: JsonObject | undefined): DenialMarker | undefined {
  const confirmed = confirmationOf(part);
  const ran = confirmed === CONFIRMATION.noQuestion || confirmed === CONFIRMATION.allowed;
  if (!ran && content.startsWith(RESULT_WORDS.hookRefused)) {
    const reason = content.slice(RESULT_WORDS.hookRefused.length).trimStart();
    const agentwhys = reason.startsWith(AGENTWHY_REFUSAL) && refusedReach(reason) !== undefined;
    return { kind: DENIAL.hook, recognised: true, source: agentwhys ? 'rule' : 'check' };
  }
  if (!ran && content.startsWith(RESULT_WORDS.skipped)) return { kind: DENIAL.skipped, recognised: true, source: 'person' };
  if (!ran && content.startsWith(RESULT_WORDS.cancelled)) return { kind: DENIAL.cancelled, recognised: true, source: 'person' };
  if (confirmed === CONFIRMATION.refused || confirmed === CONFIRMATION.skipped) return { kind: DENIAL.unrecognised, recognised: false };
  return undefined;
}

/** VCB-M15: a terminal's exit code, where its part keeps one; a result with none establishes no run. */
function executionOf(part: JsonObject | undefined): Execution {
  const state = specificOf(part)?.[SPECIFIC.state];
  const exitCode = isJsonObject(state) ? state[SPECIFIC.exitCode] : undefined;
  if (typeof exitCode !== 'number' || !Number.isInteger(exitCode)) return { status: 'unrecognised' };
  return { status: exitCode === 0 ? 'completed' : 'failed', exitCode };
}

/**
 * A result's text (VCB-M17): its `content[].value` parts joined - a string, or an element tree whose `text` leaves, in
 * order, are the text, a leaf with `lineBreakBefore` opening a line. Not whole where a part is of neither shape or a tree
 * runs deeper than is read. `undefined` where the result holds no content at all.
 */
function textOf(returned: unknown): { readonly content: string; readonly whole: boolean } | undefined {
  const parts = isJsonObject(returned) ? returned[RESULT.content] : undefined;
  if (!Array.isArray(parts)) return undefined;
  let whole = true;
  const texts = parts.map((part) => {
    const value = isJsonObject(part) ? part[RESULT.value] : undefined;
    if (typeof value === 'string') return value;
    const tree = isJsonObject(value) ? treeText(value[RESULT.tree], 0) : undefined;
    if (tree === undefined) whole = false;
    return tree ?? '';
  });
  return { content: texts.join(''), whole };
}

function treeText(node: unknown, depth: number): string | undefined {
  if (!isJsonObject(node)) return '';
  if (depth > TREE_DEPTH) return undefined;
  const text = node[RESULT.text];
  const own = typeof text === 'string' ? (node[RESULT.lineBreak] === true ? '\n' : '') + text : '';
  const children = node[RESULT.children];
  let rest = '';
  for (const child of Array.isArray(children) ? children : []) {
    const read = treeText(child, depth + 1);
    if (read === undefined) return undefined;
    rest += read;
  }
  return own + rest;
}

/** VCB-M18: the files a part's messages name, each a `file` URI's path. */
function filesOf(part: JsonObject): string[] {
  const files = [part[PART.message], part[PART.pastTense]].flatMap((message) => {
    const uris = isJsonObject(message) ? message[PART.uris] : undefined;
    const entries = Array.isArray(uris) ? uris : isJsonObject(uris) ? Object.values(uris) : [];
    return entries.flatMap((entry) => {
      const file = fileOf(entry);
      return file === undefined ? [] : [file];
    });
  });
  return [...new Set(files)];
}

/** A `file` URI's path (VCB-M18, VCB-M19); any other is no file. */
function fileOf(uri: unknown): string | undefined {
  if (!isJsonObject(uri) || uri[URI.scheme] !== URI.file) return undefined;
  const path = uri[URI.path];
  if (typeof path !== 'string' || !path.startsWith('/')) return undefined;
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function specificOf(part: JsonObject | undefined): JsonObject | undefined {
  const specific = part?.[PART.specific];
  return isJsonObject(specific) ? specific : undefined;
}

function confirmationOf(part: JsonObject | undefined): unknown {
  const confirmed = part?.[PART.confirmed];
  return isJsonObject(confirmed) ? confirmed[PART.confirmedType] : undefined;
}
