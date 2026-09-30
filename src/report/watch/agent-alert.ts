import type { Redacted } from '../../core/redaction/redacted.ts';
import type { GraphAgent, ReportModel } from '../report-model.ts';

/** How strong the facts about a finished agent are (`specs/2026-09-16-when-an-agent-finishes.md` R2). */
export type AlertLevel = 'value' | 'reached' | 'refused' | 'nothing';

/**
 * The lowest level that alerts. `nothing` never does; `refused` does only where it is asked for
 * (`specs/2026-09-21-the-agent-tells-you.md` R2), which amends R7 of `the-agent-nobody-watches`. A refusal is the one
 * level that is good news - a rule held - and a person watching every session may want to hear it.
 */
export type AlertThreshold = 'value' | 'reached' | 'refused';

export const ALERT_THRESHOLDS: readonly AlertThreshold[] = ['value', 'reached', 'refused'];

/**
 * What is said when nobody has said otherwise: only a value written from a protected file. The other two are worth
 * having and worth asking for; on every session they are a line about work that went as it should.
 */
export const DEFAULT_THRESHOLD: AlertThreshold = 'value';

export interface AgentAlert {
  readonly level: AlertLevel;
  /** The session's own agent, which answers a person rather than an agent that delegated to it (R2). */
  readonly own?: true;
  /** Its type, as the report names it. Absent when no record stated one. */
  readonly type?: Redacted;
  /**
   * Protected files reached by it or by an agent below it, as its return counts them - distinct files. Absent when it
   * has no return to count from and an agent below it also reached something, where adding nodes would count a file
   * reached twice as two.
   */
  readonly filesReached?: number;
  /** Refused attempts by it and the agents below it. Attempts, so they add up. */
  readonly refusedAttempts: number;
}

/**
 * What can be said about one agent of a report, read from the report model and nothing else (R6): its return, which
 * already looks at every agent below it, and the graph for an agent no delegation recorded, which has no return.
 */
export function alertOf(report: ReportModel, agentIndex: number): AgentAlert | undefined {
  // The session's own agent is asked about too, on `Stop` (`the-agent-nobody-watches.md` R2): it is the one agent
  // with no `SubagentStop`, and the graph keeps it apart from the agents it delegated to.
  const everyone = [report.graph.main, ...report.graph.agents];
  const node = everyone.find((agent) => agent.index === agentIndex);
  if (node === undefined) return undefined;

  // Handed the root, this subtree is every agent of the session, which is what a session-wide question needs (R5).
  const subtree = subtreeOf(everyone, node);
  const own = report.returns.filter((statement) => statement.agentIndex === agentIndex);
  const wroteOrReturnedValue = own.some((statement) => statement.strength === 'value' || statement.writtenFrom.length > 0);
  const reachedFromReturn = own.reduce((most, statement) => Math.max(most, statement.filesReached), 0);
  const reachedBelow = subtree.filter((agent) => agent !== node).some((agent) => agent.filesReached > 0);
  /*
   * The session's own agent answers a person, not an agent that delegated to it, so no return statement says what it
   * carried, and `wroteValue` and `wroteOnward` - written for what came back from a delegated agent - stay unset on
   * it. What there is to read for it is the traced use itself: measured on a real session where the main agent
   * searched, printed a value from a protected file and the model recorded one `use`, while the flags read false and
   * the level came out `reached`. A value in the conversation is not a path in a result, and it is not said as one.
   */
  const usedItself = report.uses.some((statement) => statement.agentIndex === node.index);
  const wroteItself = node.wroteValue === true || node.wroteOnward === true || usedItself;
  const reached = reachedFromReturn > 0 || node.filesReached > 0 || reachedBelow;
  const refusedAttempts = subtree.reduce((sum, agent) => sum + agent.refusedAttempts, 0);

  const filesReached = own.length > 0 ? reachedFromReturn : reachedBelow ? undefined : node.filesReached;
  const level: AlertLevel = wroteOrReturnedValue || wroteItself ? 'value' : reached ? 'reached' : refusedAttempts > 0 ? 'refused' : 'nothing';

  return {
    level,
    ...(node === report.graph.main ? { own: true as const } : {}),
    ...(node.type === undefined ? {} : { type: node.type }),
    ...(filesReached === undefined ? {} : { filesReached }),
    refusedAttempts,
  };
}

/** Whether a level is strong enough to be said, under the threshold asked for. */
export function alerts(level: AlertLevel, threshold: AlertThreshold): boolean {
  switch (level) {
    case 'value':
      return true;
    case 'reached':
      return threshold !== 'value';
    case 'refused':
      return threshold === 'refused';
    case 'nothing':
      return false;
  }
}

/** The agent and every agent below it, by the parents the graph established - never by depth or order. */
function subtreeOf(agents: readonly GraphAgent[], root: GraphAgent): GraphAgent[] {
  const below = new Set([root.index]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const agent of agents) {
      if (agent.parentIndex !== undefined && below.has(agent.parentIndex) && !below.has(agent.index)) {
        below.add(agent.index);
        grew = true;
      }
    }
  }
  return agents.filter((agent) => below.has(agent.index));
}
