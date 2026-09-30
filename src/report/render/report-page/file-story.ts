import type { EventOutcome } from '../../../core/event.ts';
import type { Redacted } from '../../../core/redaction/redacted.ts';
import { linesOf, readIn } from '../../flow-reads.ts';
import type { FlowStep, GraphAgent, ReportModel } from '../../report-model.ts';

/**
 * What happened to one private file (the report page spec P12-P16), read from the model's facts and from nothing else:
 * every step of every agent's flow that names the file, in the record's order - the agents in the order the flows give
 * them, each agent's steps in the order of its own records. Never ordered or joined by time (architecture invariant 3).
 *
 * No words and no HTML: what each entry *is* is decided here, and the page says it.
 */

/**
 * `read` - a call whose result carried a traced value from the file, or output the agent's model was handed from code it
 * wrote that carried one; `named` - a call that reached it and showed no
 * value; `unknown` - a call whose outcome is not recorded; `stopped` - a call a rule refused; `passed` - a value from it
 * came back to the agent that asked; `saved` - a value from it was written into another file; `handed` - into a
 * helper's instructions; `repeated` - into the agent's own words; `used` - into a command or a tool's input.
 */
export type StoryKind = 'read' | 'named' | 'unknown' | 'stopped' | 'passed' | 'saved' | 'handed' | 'repeated' | 'used';

/** An agent as the page names it: your AI, or a helper by its ordinal. */
export interface StoryAgent {
  readonly index: number;
  /** Absent for your AI. */
  readonly ordinal?: number;
  /** What it was asked to do, in the words of the delegation - quoted, never called its reason. */
  readonly askedTo?: Redacted;
  /** Who brought it in: your AI, or a helper by its ordinal. Absent where the record does not say (never inferred). */
  readonly broughtBy?: 'main' | number;
  /** Every action it took in the session. */
  readonly actions: number;
}

export interface StoryEntry {
  readonly agent: StoryAgent;
  readonly kind: StoryKind;
  /** How many consecutive records that said the same thing this entry stands for (agent-flow R3). */
  readonly count: number;
  /** The tool, and for a shell the programs it ran - as the report names a route, never the command text. */
  readonly did?: Redacted;
  readonly outcome: EventOutcome;
  readonly evidence: readonly Redacted[];
  /** For `passed`: the agent it came back to. */
  readonly to?: StoryAgent;
  /** For `saved`: the files it went into; for `used`: the programs it ran. */
  readonly into?: readonly Redacted[];
  /**
   * For a reach: no call asked for the file - it appeared in what a call printed, a search or a listing (the motivating
   * case's shape). Said as that, never as "opened the file".
   */
  readonly inResult?: true;
  /** For a read: how many lines of the file a search printed (`search-hits-are-reads` H8). */
  readonly lines?: number;
  /**
   * For a read: no call of the agent's brought it back - code it wrote handed its model the text (X10). Said as that,
   * never as "opened the file", and with no call named.
   */
  readonly received?: true;
  /** M4: when its first record was written, for display beside the order - never instead of it. */
  readonly at?: number;
}

/** One agent's row of "What each AI did with it" (P16). */
/**
 * The stories of one session's files still to do, told once when its report is built, for a page that holds no model:
 * To fix opens the same "What happened" window the report does (to-fix spec T11a). Paths and names only, as the model.
 */
export interface SessionStories {
  /** The session as the report's record names it. */
  readonly sessionId: Redacted;
  /** By path: every file the session read a value from, or reached with no outcome recorded. */
  readonly files: ReadonlyMap<string, FileStory>;
}

export interface StoryHolder {
  readonly agent: StoryAgent;
  readonly read: boolean;
  readonly passed: boolean;
  readonly saved: boolean;
  readonly repeated: boolean;
  readonly used: boolean;
  /** Anything it did with the file was refused. */
  readonly stopped: boolean;
}

export interface FileStory {
  readonly entries: readonly StoryEntry[];
  /** Every agent the story names, in the order it first appears. */
  readonly holders: readonly StoryHolder[];
  /** Agents a traced value from the file reached by reading it. */
  readonly readers: number;
  /** Calls that reached it and were not refused, counted as the records are. */
  readonly opened: number;
  /** Calls a rule refused. */
  readonly stopped: number;
  readonly complete: boolean;
}

/** How the page names every agent of the session: your AI, or a helper by its ordinal, with who brought it in. */
export function storyAgents(report: ReportModel): (index: number) => StoryAgent {
  const agents = new Map<number, GraphAgent>([report.graph.main, ...report.graph.agents].map((agent) => [agent.index, agent]));
  return (index) => {
    const agent = agents.get(index);
    const parent = agent?.parentIndex === undefined ? undefined : agents.get(agent.parentIndex);
    const broughtBy = parent === undefined ? undefined : parent.index === report.graph.main.index ? 'main' as const : parent.ordinal;
    return {
      index,
      ...(agent?.ordinal === undefined ? {} : { ordinal: agent.ordinal }),
      ...(broughtBy === undefined ? {} : { broughtBy }),
      ...(agent?.askedTo === undefined ? {} : { askedTo: agent.askedTo }),
      actions: agent?.actions ?? 0,
    };
  };
}

export function fileStory(report: ReportModel, path: string): FileStory {
  const agentOf = storyAgents(report);

  const entries: StoryEntry[] = [];
  for (const flow of report.flows) {
    const agent = agentOf(flow.agentIndex);
    for (const step of flow.steps) {
      const entry = entryOf(step, path, agent, agentOf);
      if (entry !== undefined) entries.push(entry);
    }
  }

  const holders = new Map<number, StoryHolder>();
  for (const entry of entries) {
    const known = holders.get(entry.agent.index) ?? {
      agent: entry.agent, read: false, passed: false, saved: false, repeated: false, used: false, stopped: false,
    };
    holders.set(entry.agent.index, {
      ...known,
      read: known.read || entry.kind === 'read',
      passed: known.passed || entry.kind === 'passed' || entry.kind === 'handed',
      saved: known.saved || entry.kind === 'saved',
      repeated: known.repeated || entry.kind === 'repeated',
      used: known.used || entry.kind === 'used',
      stopped: known.stopped || entry.kind === 'stopped',
    });
  }

  // A read its code handed back is no call that reached the file, so it is not counted as one.
  const sum = (kinds: readonly StoryKind[]): number =>
    entries.filter((entry) => kinds.includes(entry.kind) && entry.received !== true).reduce((total, entry) => total + entry.count, 0);
  return {
    entries,
    holders: [...holders.values()],
    readers: [...holders.values()].filter((holder) => holder.read).length,
    opened: sum(['read', 'named']),
    stopped: sum(['stopped']),
    complete: report.scope.completeness === 'complete',
  };
}

/**
 * Every file the stories of these paths say a value was saved into: the `into` of their `saved` entries, as a sentence
 * names them - a file that need not be one of the paths. Each entry is `entryOf`'s, so what counts as saved is decided
 * in one place (found by a review: a copy of its rule could drift from it with no test failing). One pass over the
 * flows, asking only about the paths a step names (found by a third: a story told per row walked every step per row).
 */
export function savedInto(report: ReportModel, paths: Iterable<string>): Redacted[] {
  const wanted = new Set(paths);
  const agentOf = storyAgents(report);
  const into: Redacted[] = [];
  for (const flow of report.flows) {
    const agent = agentOf(flow.agentIndex);
    for (const step of flow.steps) {
      if (!('files' in step)) continue;
      for (const path of new Set(step.files.map(String))) {
        const entry = wanted.has(path) ? entryOf(step, path, agent, agentOf) : undefined;
        if (entry?.kind === 'saved') into.push(...(entry.into ?? []));
      }
    }
  }
  return into;
}

/** What one flow step says about `path`, or `undefined` where it does not name it. Shared with the Helpers view. */
export function entryOf(step: FlowStep, path: string, agent: StoryAgent, agentOf: (index: number) => StoryAgent): StoryEntry | undefined {
  const common = { agent, count: step.count, evidence: step.evidence, ...(step.at === undefined ? {} : { at: step.at }) };
  switch (step.kind) {
    case 'reached': {
      // A tool the adapter has no profile for had its whole input searched: a path in it is a mention, not a file
      // reached - `check` does not count it either (`worth-running-every-day` R12b). The run in Advanced still shows it.
      if (!step.toolKnown || !step.files.map(String).includes(path)) return undefined;
      const kind: StoryKind = step.outcome === 'blocked' ? 'stopped' : readIn(step, path) ? 'read' : step.outcome === 'unknown' ? 'unknown' : 'named';
      const inResult = !step.sources.includes('input');
      const lines = linesOf(step, path);
      return { ...common, kind, did: step.did, outcome: step.outcome, ...(inResult ? { inResult: true as const } : {}), ...(lines === undefined ? {} : { lines }) };
    }
    case 'used': {
      if (!step.files.map(String).includes(path)) return undefined;
      const landed = step.landed;
      const kind: StoryKind = landed === 'file' ? 'saved' : landed === 'delegation' ? 'handed' : landed === 'said' || landed === 'reasoning' ? 'repeated' : 'used';
      const into = kind === 'saved' ? step.targets : kind === 'used' ? step.programs : undefined;
      return { ...common, kind, outcome: 'succeeded', ...(into === undefined || into.length === 0 ? {} : { into }) };
    }
    case 'received':
      if (!step.files.map(String).includes(path)) return undefined;
      return { ...common, kind: 'read', outcome: 'succeeded', received: true };
    case 'returned': {
      // Only a value counts as passing the file on; a reply that named the path handed over its name, not its contents.
      if (step.strength !== 'value' || !step.files.map(String).includes(path)) return undefined;
      return { ...common, kind: 'passed', outcome: 'succeeded', ...(step.toAgentIndex === undefined ? {} : { to: agentOf(step.toAgentIndex) }) };
    }
    default:
      return undefined;
  }
}
