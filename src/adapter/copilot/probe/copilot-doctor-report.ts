// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import type { Counts } from '../../../shared/counter.ts';

/**
 * The Copilot section of `doctor` (`2026-10-05-what-copilot-wrote.md`, plan step 5). A closed schema: counts, and labels
 * from the contract's fixed vocabularies. A value the contract does not list is counted as `<unknown>` where it was found
 * and is never printed - not a key, a value, a path, an id or a line of a record.
 */
export interface CopilotDoctorReport {
  readonly schemaVersion: 1;
  readonly provider: 'copilot';
  readonly contractVersion: number;
  /** The Copilot builds the contract was measured on. */
  readonly verifiedAgainst: readonly string[];
  readonly files: {
    /** Session folders looked at, or 1 for a file given by name. */
    readonly found: number;
    readonly recognised: number;
    /** Files whose first line is not the runtime's - VS Code's transcript among them (CP1a). */
    readonly unknownFormat: number;
    /** Folders holding no `events.jsonl` (CP29). */
    readonly noEvents: number;
    /** Recognised files holding no message from a person (CP29): no conversation. */
    readonly noMessage: number;
    readonly unreadable: number;
  };
  readonly lines: { readonly total: number; readonly unparsable: number };
  /** By each recognised file's `copilotVersion`: a measured build, `1.0.x` for another of its line (CPD13), or `<unknown>`. */
  readonly versions: Counts;
  /** `workspace.yaml`'s `client_name`: `github/cli`, `github/autopilot`, `<unknown>`, or `(none)`. */
  readonly clients: Counts;
  readonly identity: {
    /** Files whose first line names another session than their folder. */
    readonly folderDisagrees: number;
    /** Files whose `workspace.yaml` names another folder than their first line (CP3a). */
    readonly projectDisagrees: number;
    /** Sessions whose `workspace.yaml` counts a fork: a parent (CP26). */
    readonly forkParents: number;
    /** Lines a file shares, by id, with a parent beside it: the parent's records, read there (CPB36). */
    readonly linesFromParent: number;
  };
  /** Record types (§2.2, §2.8), `<unknown>` for any other. */
  readonly recordTypes: Counts;
  /** Keys at a record's own level beyond the envelope's, as `<unknown>` (CPD13). */
  readonly recordKeys: Counts;
  /** Tools by name: the contract's, `mcp` for an MCP server's, `<unknown>` for any other. */
  readonly tools: Counts;
  readonly calls: {
    readonly started: number;
    /** Starts with a completion of their own, by `toolCallId`. */
    readonly completed: number;
    /** Starts a person's answer stopped before they finished (CPB34). */
    readonly stoppedByPerson: number;
    /** Starts with neither: no outcome is recorded. */
    readonly withoutOutcome: number;
    /** Completions no start in the file names. */
    readonly completionsWithoutStart: number;
  };
  /** What a finished call returned: `bash exit code`, `spilled`, `launch notice`, `no content`, `failed` (CPB58). */
  readonly results: Counts;
  /** Who stopped a call that did not run: `rule`, `agentwhy`, `check`, `person`, `<unknown>` (CP19, CPD12, WS9). */
  readonly refusals: Counts;
  readonly delegations: {
    /** `subagent.started` records. */
    readonly started: number;
    /** Of those, naming a `task` call the file starts (CP11). */
    readonly joinedToTask: number;
    /** Calls of an agent a `subagent.started` names, naming the call that started it. */
    readonly callsJoined: number;
    /** Calls of an agent no `subagent.started` names, or naming another call than the one that started it. */
    readonly callsUnjoined: number;
    /** `read_agent` calls naming an agent the file started (CPB54), and naming none. */
    readonly readAgentJoined: number;
    readonly readAgentUnjoined: number;
  };
  readonly hooks: {
    /** `hook.start` and `hook.end` joined by `hookInvocationId`. */
    readonly joined: number;
    readonly startsWithoutEnd: number;
    readonly endsWithoutStart: number;
  };
  /** What a capability record says per file and question: `actions supported`, `reasoning unmeasured`, … (X23). */
  readonly capabilities: Counts;
}
