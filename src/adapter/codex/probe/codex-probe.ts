// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename } from 'node:path';
import { Counter } from '../../../shared/counter.ts';
import type { DirectoryReader } from '../../../ports/directory-reader.ts';
import { FileAccessError } from '../../../ports/file-access-error.ts';
import type { FileReader } from '../../../ports/file-reader.ts';
import { isJsonObject, parseJsonObject } from '../../../shared/json.ts';
import { agentSource } from '../../../core/evidence.ts';
import { ACTION_ITEMS, COMMAND, ITEM, ITEM_EVENT, ITEM_STATUSES, SHELL_FLAGS, SHELLS } from '../contract/actions.ts';
import { ACTIVITY } from '../contract/delegations.ts';
import { ENVELOPE, LEGACY_EVENTS, LINE_TYPES, PASSIVE_EVENTS } from '../contract/envelope.ts';
import { EVENT_MESSAGES, MESSAGE_ITEMS, REASONING, RESPONSE_ITEMS } from '../contract/messages.ts';
import { SESSION } from '../contract/session.ts';
import { TURN_CONTEXT, TURN_EVENTS } from '../contract/turns.ts';
import { CONTRACT_VERSION, VERIFIED_AGAINST } from '../contract/version.ts';
import type { CodexSessionDiscovery, CodexSource } from '../discovery/codex-session-discovery.ts';
import { continuesOwnThread } from '../discovery/session-header.ts';
import { sessionOwners, ownerIds, AMBIGUOUS } from '../discovery/session-owners.ts';
import { sessionRoots } from '../discovery/session-roots.ts';
import { capabilitiesOf } from '../events/capability-records.ts';
import { permissionsOf } from '../events/turn-permissions.ts';
import type { CodexDoctorReport } from './codex-doctor-report.ts';

const UNKNOWN = '<unknown>';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const KNOWN_LINES: readonly string[] = Object.values(LINE_TYPES);
const KNOWN_RESPONSES: readonly string[] = Object.values(RESPONSE_ITEMS);
const KNOWN_EVENTS: readonly string[] = [
  ITEM_EVENT.type, TURN_EVENTS.started, TURN_EVENTS.complete, TURN_EVENTS.aborted, EVENT_MESSAGES.user, EVENT_MESSAGES.agent,
  ...PASSIVE_EVENTS, ...LEGACY_EVENTS,
];
const KNOWN_ITEMS: readonly string[] = [...Object.values(ACTION_ITEMS), ...Object.values(MESSAGE_ITEMS), ACTIVITY.type];
const ACTIONS: readonly string[] = Object.values(ACTION_ITEMS);
const LEGACY: readonly string[] = LEGACY_EVENTS;

/** A label from a fixed vocabulary, or `<unknown>`: an unknown spelling is counted and never printed (X24). */
function known(value: unknown, vocabulary: readonly string[]): string {
  return typeof value === 'string' && vocabulary.includes(value) ? value : UNKNOWN;
}

export interface CodexProbeDependencies {
  readonly discovery: CodexSessionDiscovery;
  readonly directories: DirectoryReader;
  readonly files: FileReader;
}

/**
 * Measures Codex rollouts for `doctor` (X26): a file given by name, or every rollout under a folder. It shares the
 * ownership rule with discovery and the reconnaissance probe (`sessionOwners`), and reads the contract's vocabularies
 * rather than the probe script, which stays a tool of its own (spec §8).
 */
export class CodexProbe {
  readonly #discovery: CodexSessionDiscovery;
  readonly #directories: DirectoryReader;
  readonly #files: FileReader;

  constructor(dependencies: CodexProbeDependencies) {
    this.#discovery = dependencies.discovery;
    this.#directories = dependencies.directories;
    this.#files = dependencies.files;
  }

  async probe(input: string): Promise<CodexDoctorReport> {
    const tally = new Tally();
    const sources = await this.#sources(input, tally);
    // XD10: a file continuing its own thread owns no id, so a thread in two files is no shared id; it is counted apart.
    const owners = sessionOwners(ownerIds(sources.map((source) => source.header)));
    tally.continuations += sources.filter((source) => continuesOwnThread(source.header)).length;
    for (const [id, owner] of owners) {
      if (owner === AMBIGUOUS) {
        tally.sharedIds += 1;
        tally.filesSharingIds += sources.filter((source) => source.header.id === id).length;
      } else tally.uniqueIds += 1;
    }
    for (const source of sources) {
      const { header } = source;
      tally.versions.add(known(header.version, VERIFIED_AGAINST.codex));
      tally.historyModes.add(header.historyMode === 'unknown' ? UNKNOWN : header.historyMode);
      tally.origins.add(header.origin.kind);
      const named = UUID.exec(basename(source.path))?.[0];
      if (named !== undefined && named.toLowerCase() !== header.id.toLowerCase()) tally.fileNameDisagrees += 1;
      if (source.relation.kind === 'resolved') {
        if (sources[source.relation.root] === source) tally.roots += 1;
        else tally.descendants += 1;
      } else tally.unresolved.add(source.relation.reason);
      await this.#file(source, tally);
    }
    return tally.report();
  }

  /** The rollouts to measure: the file given, or the recognised rollouts under a folder, each with its tree relation. */
  async #sources(input: string, tally: Tally): Promise<readonly CodexSource[]> {
    let kind;
    try {
      kind = await this.#directories.kindOf(input);
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      tally.unreadable += 1;
      return [];
    }
    if (kind === 'directory') {
      const listing = await this.#discovery.list(input);
      const unknownFormat = listing.gaps.filter((gap) => gap.reason === 'unknown-format').length;
      tally.found += listing.sources.length + unknownFormat;
      tally.unknownFormat += unknownFormat;
      tally.unreadable += listing.gaps.length - unknownFormat;
      return listing.sources;
    }
    tally.found += 1;
    const head = await this.#discovery.readHeader(input);
    if (head.kind === 'unknown') tally.unknownFormat += 1;
    if (head.kind === 'unavailable') tally.unreadable += 1;
    if (head.kind !== 'recognised') return [];
    return [{ path: input, header: head.header, relation: sessionRoots([head.header])[0] ?? { kind: 'unresolved', reason: 'invalid-identity' } }];
  }

  async #file(source: CodexSource, tally: Tally): Promise<void> {
    tally.recognised += 1;
    const directories = new Set<string>();
    let lastOrdinal: number | undefined;
    let metadata = 0;
    const facts = { unrecognised: false, interrupted: false, hiddenReasoning: false, permissionsIncomplete: false, permissionsRecorded: false };
    try {
      for await (const raw of this.#files.readLines(source.path)) {
        if (raw.trim() === '') continue;
        tally.lines += 1;
        const line = parseJsonObject(raw);
        if (line === undefined) {
          tally.unparsable += 1;
          continue;
        }
        const ordinal = line[ENVELOPE.ordinal];
        if (typeof ordinal === 'number') {
          if (lastOrdinal !== undefined && ordinal < lastOrdinal) tally.ordinalBackwards += 1;
          if (lastOrdinal !== undefined && ordinal === lastOrdinal) tally.ordinalRepeats += 1;
          lastOrdinal = ordinal;
        }
        const type = known(line[ENVELOPE.type], KNOWN_LINES);
        tally.lineTypes.add(type);
        if (type === UNKNOWN) facts.unrecognised = true;
        const payload = line[ENVELOPE.payload];
        if (!isJsonObject(payload)) continue;
        if (type === LINE_TYPES.sessionMeta) {
          metadata += 1;
          const directory = payload[SESSION.workingDirectory];
          if (typeof directory === 'string') directories.add(directory);
        }
        if (type === LINE_TYPES.turnContext) {
          const directory = payload[TURN_CONTEXT.workingDirectory];
          if (typeof directory === 'string') directories.add(directory);
          facts.permissionsRecorded = true;
          if (!permissionsOf(payload).complete) facts.permissionsIncomplete = true;
        }
        if (type === LINE_TYPES.responseItem) {
          const kind = known(payload[ENVELOPE.payloadType], KNOWN_RESPONSES);
          tally.responseItems.add(kind);
          if (kind === UNKNOWN) facts.unrecognised = true;
          if (kind === RESPONSE_ITEMS.reasoning && !readableSummary(payload[REASONING.summary])) facts.hiddenReasoning = true;
        }
        if (type === LINE_TYPES.event) {
          const kind = known(payload[ENVELOPE.payloadType], KNOWN_EVENTS);
          tally.events.add(kind);
          // A legacy event is a label the contract knows and a record the reader cannot map, and so is an item event with
          // no item: both are unrecognised to the reader (`rollout-scan.ts`), so what the file can answer is said alike.
          if (kind === UNKNOWN || LEGACY.includes(kind)) facts.unrecognised = true;
          if (kind === TURN_EVENTS.aborted) facts.interrupted = true;
          const item = payload[ITEM_EVENT.item];
          if (kind === ITEM_EVENT.type && !isJsonObject(item)) facts.unrecognised = true;
          if (kind === ITEM_EVENT.type && isJsonObject(item)) {
            const itemType = known(item[ITEM.type], KNOWN_ITEMS);
            tally.items.add(itemType);
            if (itemType === UNKNOWN) facts.unrecognised = true;
            if (itemType === UNKNOWN || ACTIONS.includes(itemType)) {
              tally.itemStatuses.add(`${itemType} ${item[ITEM.status] === undefined ? '(none)' : known(item[ITEM.status], Object.values(ITEM_STATUSES))}`);
            }
            if (itemType === ACTION_ITEMS.command) tally.commandShapes.add(commandShape(item[COMMAND.command]));
          }
        }
      }
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error;
      tally.unreadable += 1;
    }
    if (metadata > 1) tally.laterMetadata += metadata - 1;
    if (directories.size > 1) tally.filesWithSeveral += 1;
    if (directories.size === 0) tally.filesWithNone += 1;
    for (const record of capabilitiesOf(source.header, agentSource(source.header.id), source.header.id, facts)) {
      tally.capabilities.add(`${record.question} ${record.state}`);
    }
  }
}

/** X7: a command read as a line, or kept whole. */
function commandShape(command: unknown): string {
  return Array.isArray(command) && command.length === 3 && typeof command[0] === 'string' && SHELLS.some((shell) => shell === basename(command[0] as string))
    && SHELL_FLAGS.some((flag) => flag === command[1]) && typeof command[2] === 'string' ? 'recognised' : 'other';
}

function readableSummary(summary: unknown): boolean {
  return Array.isArray(summary) && summary.some((part) => isJsonObject(part) && typeof part[REASONING.summaryText] === 'string' && part[REASONING.summaryText] !== '');
}

/** What a run counts, turned into the closed report. */
class Tally {
  found = 0;
  recognised = 0;
  unknownFormat = 0;
  unreadable = 0;
  lines = 0;
  unparsable = 0;
  uniqueIds = 0;
  sharedIds = 0;
  filesSharingIds = 0;
  fileNameDisagrees = 0;
  laterMetadata = 0;
  continuations = 0;
  roots = 0;
  descendants = 0;
  filesWithSeveral = 0;
  filesWithNone = 0;
  ordinalBackwards = 0;
  ordinalRepeats = 0;
  readonly versions = new Counter();
  readonly historyModes = new Counter();
  readonly origins = new Counter();
  readonly unresolved = new Counter();
  readonly lineTypes = new Counter();
  readonly responseItems = new Counter();
  readonly events = new Counter();
  readonly items = new Counter();
  readonly itemStatuses = new Counter();
  readonly commandShapes = new Counter();
  readonly capabilities = new Counter();

  report(): CodexDoctorReport {
    return {
      schemaVersion: 1,
      provider: 'codex',
      contractVersion: CONTRACT_VERSION,
      verifiedAgainst: VERIFIED_AGAINST.codex,
      files: { found: this.found, recognised: this.recognised, unknownFormat: this.unknownFormat, unreadable: this.unreadable },
      lines: { total: this.lines, unparsable: this.unparsable },
      versions: this.versions.toCounts(),
      historyModes: this.historyModes.toCounts(),
      origins: this.origins.toCounts(),
      identity: {
        uniqueIds: this.uniqueIds, sharedIds: this.sharedIds, filesSharingIds: this.filesSharingIds,
        fileNameDisagrees: this.fileNameDisagrees, laterMetadata: this.laterMetadata, continuations: this.continuations,
      },
      tree: { roots: this.roots, descendants: this.descendants, unresolved: this.unresolved.toCounts() },
      workingDirectories: { filesWithSeveral: this.filesWithSeveral, filesWithNone: this.filesWithNone },
      order: { ordinalBackwards: this.ordinalBackwards, ordinalRepeats: this.ordinalRepeats },
      lineTypes: this.lineTypes.toCounts(),
      responseItems: this.responseItems.toCounts(),
      events: this.events.toCounts(),
      items: this.items.toCounts(),
      itemStatuses: this.itemStatuses.toCounts(),
      commandShapes: this.commandShapes.toCounts(),
      capabilities: this.capabilities.toCounts(),
    };
  }
}
