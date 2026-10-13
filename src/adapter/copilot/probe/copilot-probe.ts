// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, dirname, join } from 'node:path';
import { mainSource } from '../../../core/evidence.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import { textOrUndefined, type FileReader } from '../../../ports/file-reader.ts';
import { Counter } from '../../../shared/counter.ts';
import { isJsonObject, parseJsonObject, type JsonObject } from '../../../shared/json.ts';
import { CALL, DELEGATING_TOOLS, SEARCH_NAMES, TOOLS, UNPROFILED_TOOLS } from '../contract/actions.ts';
import { MEASURED_LINE } from '../contract/capabilities.ts';
import { LAUNCH_NOTICE, SUBAGENT } from '../contract/delegations.ts';
import { ENVELOPE, RECORD_TYPES } from '../contract/envelope.ts';
import { HOOK } from '../contract/hooks.ts';
import { ERROR, HOOK_ERRORED, PERMISSION, REFUSAL_OPENINGS } from '../contract/refusals.ts';
import { COMPLETION, FAILED, SPILL_NOTICE } from '../contract/results.ts';
import { CLIENTS, EVENTS_FILE, WORKSPACE_FILE } from '../contract/session.ts';
import { CONTRACT_VERSION, VERIFIED_AGAINST } from '../contract/version.ts';
import { readHeader } from '../discovery/session-header.ts';
import { parseWorkspace } from '../discovery/workspace-file.ts';
import { capabilitiesOf } from '../events/capability-records.ts';
import { knownRecordType, unknownRecordKeys } from '../events/record-shape.ts';
import { personsAnswerOf, refusalOf } from '../events/refusal-marks.ts';
import { forkParentLines } from '../events/shared-lines.ts';
import type { CopilotDoctorReport } from './copilot-doctor-report.ts';

const UNKNOWN = '<unknown>';
const TOOL_NAMES: readonly string[] = [...Object.values(TOOLS).map((tool) => tool.name), ...SEARCH_NAMES, ...UNPROFILED_TOOLS];

/** A label from a fixed vocabulary, or `<unknown>`: an unknown spelling is counted and never printed (X24's rule). */
function known(value: unknown, vocabulary: readonly string[]): string {
  return typeof value === 'string' && vocabulary.includes(value) ? value : UNKNOWN;
}

export interface CopilotProbeDependencies {
  readonly directories: DirectoryReader;
  readonly files: FileReader;
}

/** One file to measure, and the session folder it is in. */
interface Target {
  readonly folder: string;
  readonly events: string;
}

/**
 * Measures Copilot's runtime records for `doctor` (plan step 5): an `events.jsonl` given by name, a session's folder, or
 * every session folder under a folder such as `~/.copilot/session-state`. It reads the contract's vocabularies and the
 * reader's own rules - a record's shape, who stopped a call, what a file can answer, a fork's parent lines - never the
 * reconnaissance script, which stays a tool of its own.
 */
export class CopilotProbe {
  readonly #directories: DirectoryReader;
  readonly #files: FileReader;

  constructor(dependencies: CopilotProbeDependencies) {
    this.#directories = dependencies.directories;
    this.#files = dependencies.files;
  }

  async probe(input: string): Promise<CopilotDoctorReport> {
    const tally = new Tally();
    for (const target of await this.#targets(input, tally)) await this.#file(target, tally);
    return tally.report();
  }

  async #targets(input: string, tally: Tally): Promise<readonly Target[]> {
    let kind;
    try {
      kind = await this.#directories.kindOf(input);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      tally.unreadable += 1;
      return [];
    }
    if (kind !== 'directory') return [{ folder: dirname(input), events: input }];
    if (await this.#isFile(join(input, EVENTS_FILE))) return [{ folder: input, events: join(input, EVENTS_FILE) }];
    let entries;
    try {
      entries = await this.#directories.list(input);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      tally.unreadable += 1;
      return [];
    }
    return entries.filter((entry) => entry.kind === 'directory' && !entry.name.startsWith('.'))
      .map((entry) => ({ folder: join(input, entry.name), events: join(input, entry.name, EVENTS_FILE) }));
  }

  async #isFile(path: string): Promise<boolean> {
    try {
      return (await this.#directories.kindOf(path)) === 'file';
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      return false;
    }
  }

  async #file(target: Target, tally: Tally): Promise<void> {
    tally.found += 1;
    const head = await readHeader(this.#files, target.events);
    if (head.kind === 'unavailable') {
      if (head.failure === 'not-found') tally.noEvents += 1;
      else tally.unreadable += 1;
      return;
    }
    if (head.kind === 'unknown') {
      tally.unknownFormat += 1;
      return;
    }
    const { header } = head;
    tally.recognised += 1;
    tally.versions.add(versionLabel(header.version));
    const workspaceText = await textOrUndefined(this.#files, join(target.folder, WORKSPACE_FILE));
    const workspace = workspaceText === undefined ? {} : parseWorkspace(workspaceText);
    tally.clients.add(workspace.client === undefined ? '(none)' : known(workspace.client, Object.values(CLIENTS)));
    if (header.sessionId !== basename(target.folder)) tally.folderDisagrees += 1;
    if (workspace.project !== undefined && header.project !== undefined && workspace.project !== header.project) tally.projectDisagrees += 1;
    if ((workspace.forkCount ?? 0) > 0) tally.forkParents += 1;

    const file = new FileTally(await forkParentLines(this.#directories, this.#files, target.folder));
    try {
      for await (const line of this.#files.readLines(target.events)) file.line(line, tally);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      tally.unreadable += 1;
    }
    file.close(tally);
    for (const record of capabilitiesOf(header.version, file.unknownShape, [{ source: mainSource() }])) {
      tally.capabilities.add(`${record.question} ${record.state}`);
    }
  }
}

function versionLabel(version: string | undefined): string {
  if (version !== undefined && (VERIFIED_AGAINST.copilot as readonly string[]).includes(version)) return version;
  return version !== undefined && MEASURED_LINE.test(version) ? '1.0.x' : UNKNOWN;
}

interface Start {
  readonly toolName: unknown;
  readonly agentId: unknown;
  readonly parentCallId: unknown;
  readonly input: unknown;
}

/** What one file holds, joined within it as the reader joins it: by `toolCallId`, `agentId`, `requestId`, hook id. */
class FileTally {
  readonly #parentLines: ReadonlySet<string>;
  readonly #starts = new Map<string, Start>();
  readonly #completions = new Map<string, JsonObject>();
  readonly #subagents = new Map<string, unknown>();
  readonly #asked = new Map<string, string>();
  readonly #answers: JsonObject[] = [];
  readonly #hookStarts = new Set<string>();
  readonly #hookEnds = new Set<string>();
  unknownShape = false;
  #messages = 0;

  constructor(parentLines: ReadonlySet<string>) {
    this.#parentLines = parentLines;
  }

  line(text: string, tally: Tally): void {
    if (text.trim() === '') return;
    tally.lines += 1;
    const record = parseJsonObject(text);
    if (record === undefined) {
      tally.unparsable += 1;
      return;
    }
    // CP29 as discovery reads it: a person's message anywhere in the file, a parent's copied lines among them.
    if (record[ENVELOPE.type] === RECORD_TYPES.userMessage) this.#messages += 1;
    const id = record[ENVELOPE.id];
    if (typeof id === 'string' && this.#parentLines.has(id)) {
      tally.linesFromParent += 1;
      return;
    }
    const extra = unknownRecordKeys(record);
    for (let counted = 0; counted < extra; counted += 1) tally.recordKeys.add(UNKNOWN);
    if (extra > 0) this.unknownShape = true;
    const type = record[ENVELOPE.type];
    if (!knownRecordType(type)) {
      tally.recordTypes.add(UNKNOWN);
      this.unknownShape = true;
      return;
    }
    tally.recordTypes.add(type);
    const body = record[ENVELOPE.data];
    const data: JsonObject = isJsonObject(body) ? body : {};
    const agentId = record[ENVELOPE.agentId];
    switch (type) {
      case RECORD_TYPES.toolStart: {
        const callId = data[CALL.callId];
        if (typeof callId !== 'string') return;
        const toolName = data[CALL.toolName];
        tally.tools.add(typeof toolName === 'string' && TOOL_NAMES.includes(toolName) ? toolName : typeof data[CALL.mcpServer] === 'string' ? 'mcp' : UNKNOWN);
        this.#starts.set(callId, { toolName, agentId, parentCallId: data[CALL.parentCallId], input: data[CALL.arguments] });
        return;
      }
      case RECORD_TYPES.toolComplete: {
        const callId = data[CALL.callId];
        if (typeof callId === 'string') this.#completions.set(callId, data);
        return;
      }
      case RECORD_TYPES.subagentStarted:
        if (typeof agentId === 'string') this.#subagents.set(agentId, data[SUBAGENT.callId]);
        return;
      case RECORD_TYPES.permissionRequested: {
        const request = data[PERMISSION.request];
        const requestId = data[PERMISSION.requestId];
        const callId = isJsonObject(request) ? request[PERMISSION.callId] : undefined;
        if (typeof requestId === 'string' && typeof callId === 'string') this.#asked.set(requestId, callId);
        return;
      }
      case RECORD_TYPES.permissionCompleted:
        this.#answers.push(data);
        return;
      case RECORD_TYPES.hookStart:
      case RECORD_TYPES.hookEnd: {
        const invocation = data[HOOK.invocationId];
        if (typeof invocation === 'string') (type === RECORD_TYPES.hookStart ? this.#hookStarts : this.#hookEnds).add(invocation);
        return;
      }
      default:
    }
  }

  close(tally: Tally): void {
    if (this.#messages === 0) tally.noMessage += 1;
    const stoppedByPerson = new Set<string>();
    for (const answer of this.#answers) {
      const requestId = answer[PERMISSION.requestId];
      const callId = answer[PERMISSION.callId];
      const asked = typeof requestId === 'string' ? this.#asked.get(requestId) : undefined;
      if (typeof callId !== 'string' || asked !== callId || this.#completions.has(callId)) continue;
      const verdict = personsAnswerOf(answer);
      if (verdict === 'approved') continue;
      stoppedByPerson.add(callId);
      tally.refusals.add(verdict === 'refused' ? 'person' : UNKNOWN);
    }
    for (const [callId, start] of this.#starts) {
      tally.started += 1;
      if (this.#completions.has(callId)) tally.completed += 1;
      else if (stoppedByPerson.has(callId)) tally.stoppedByPerson += 1;
      else tally.withoutOutcome += 1;
      if (typeof start.agentId === 'string') {
        if (this.#subagents.has(start.agentId) && this.#subagents.get(start.agentId) === start.parentCallId) tally.callsJoined += 1;
        else tally.callsUnjoined += 1;
      }
      if (start.toolName === TOOLS.readAgent.name) {
        const named = isJsonObject(start.input) ? start.input[TOOLS.readAgent.agentId] : undefined;
        if (typeof named === 'string' && this.#subagents.has(named)) tally.readAgentJoined += 1;
        else tally.readAgentUnjoined += 1;
      }
    }
    for (const [callId, data] of this.#completions) {
      const start = this.#starts.get(callId);
      if (start === undefined) tally.completionsWithoutStart += 1;
      this.#result(data, start, tally);
    }
    for (const taskCall of this.#subagents.values()) {
      tally.subagents += 1;
      const by = typeof taskCall === 'string' ? this.#starts.get(taskCall)?.toolName : undefined;
      if (typeof by === 'string' && DELEGATING_TOOLS.includes(by)) tally.joinedToTask += 1;
    }
    for (const invocation of this.#hookStarts) {
      if (this.#hookEnds.has(invocation)) tally.hooksJoined += 1;
      else tally.hookStartsWithoutEnd += 1;
    }
    for (const invocation of this.#hookEnds) if (!this.#hookStarts.has(invocation)) tally.hookEndsWithoutStart += 1;
  }

  #result(data: JsonObject, start: Start | undefined, tally: Tally): void {
    if (data[COMPLETION.success] !== true) {
      const error = data[ERROR.error];
      // CPB58: a tool that ran and failed is what it returned, never who stopped it.
      if (isJsonObject(error) && error[ERROR.code] === FAILED) tally.results.add('failed');
      else tally.refusals.add(refusalLabel(data));
      return;
    }
    const returned = data[COMPLETION.result];
    const content = isJsonObject(returned) ? returned[COMPLETION.content] : undefined;
    if (typeof content !== 'string') {
      tally.results.add('no content');
      return;
    }
    if (content.startsWith(SPILL_NOTICE)) tally.results.add('spilled');
    if (start?.toolName === TOOLS.delegate.name && content.startsWith(LAUNCH_NOTICE)) tally.results.add('launch notice');
    const shell = data[COMPLETION.shell];
    if (start?.toolName === TOOLS.shell.name && isJsonObject(shell) && typeof shell[COMPLETION.exitCode] === 'number') tally.results.add('bash exit code');
  }
}

/** Who stopped a call, as the reader reads it (`refusalOf`), with agentwhy's own told apart from a rule's. */
function refusalLabel(data: JsonObject): string {
  const marker = refusalOf(data);
  if (!marker.recognised) return UNKNOWN;
  if (marker.source !== 'rule') return marker.source === 'check' && erroredHook(data) ? 'check (hook errored)' : marker.source;
  const error = data[ERROR.error];
  const message = isJsonObject(error) ? error[ERROR.message] : undefined;
  return typeof message === 'string' && message.startsWith(REFUSAL_OPENINGS.check) ? 'agentwhy' : 'rule';
}

function erroredHook(data: JsonObject): boolean {
  const error = data[ERROR.error];
  const message = isJsonObject(error) ? error[ERROR.message] : undefined;
  return typeof message === 'string' && message.startsWith(HOOK_ERRORED.opening);
}

/** What a run counts, turned into the closed report. */
class Tally {
  found = 0;
  recognised = 0;
  unknownFormat = 0;
  noEvents = 0;
  noMessage = 0;
  unreadable = 0;
  lines = 0;
  unparsable = 0;
  folderDisagrees = 0;
  projectDisagrees = 0;
  forkParents = 0;
  linesFromParent = 0;
  started = 0;
  completed = 0;
  stoppedByPerson = 0;
  withoutOutcome = 0;
  completionsWithoutStart = 0;
  subagents = 0;
  joinedToTask = 0;
  callsJoined = 0;
  callsUnjoined = 0;
  readAgentJoined = 0;
  readAgentUnjoined = 0;
  hooksJoined = 0;
  hookStartsWithoutEnd = 0;
  hookEndsWithoutStart = 0;
  readonly versions = new Counter();
  readonly clients = new Counter();
  readonly recordTypes = new Counter();
  readonly recordKeys = new Counter();
  readonly tools = new Counter();
  readonly results = new Counter();
  readonly refusals = new Counter();
  readonly capabilities = new Counter();

  report(): CopilotDoctorReport {
    return {
      schemaVersion: 1,
      provider: 'copilot',
      contractVersion: CONTRACT_VERSION,
      verifiedAgainst: VERIFIED_AGAINST.copilot,
      files: {
        found: this.found, recognised: this.recognised, unknownFormat: this.unknownFormat, noEvents: this.noEvents,
        noMessage: this.noMessage, unreadable: this.unreadable,
      },
      lines: { total: this.lines, unparsable: this.unparsable },
      versions: this.versions.toCounts(),
      clients: this.clients.toCounts(),
      identity: {
        folderDisagrees: this.folderDisagrees, projectDisagrees: this.projectDisagrees, forkParents: this.forkParents,
        linesFromParent: this.linesFromParent,
      },
      recordTypes: this.recordTypes.toCounts(),
      recordKeys: this.recordKeys.toCounts(),
      tools: this.tools.toCounts(),
      calls: {
        started: this.started, completed: this.completed, stoppedByPerson: this.stoppedByPerson, withoutOutcome: this.withoutOutcome,
        completionsWithoutStart: this.completionsWithoutStart,
      },
      results: this.results.toCounts(),
      refusals: this.refusals.toCounts(),
      delegations: {
        started: this.subagents, joinedToTask: this.joinedToTask, callsJoined: this.callsJoined, callsUnjoined: this.callsUnjoined,
        readAgentJoined: this.readAgentJoined, readAgentUnjoined: this.readAgentUnjoined,
      },
      hooks: { joined: this.hooksJoined, startsWithoutEnd: this.hookStartsWithoutEnd, endsWithoutStart: this.hookEndsWithoutStart },
      capabilities: this.capabilities.toCounts(),
    };
  }
}
