import { sumRefusedByOthers } from '../refusals.js';
export const ALERT_THRESHOLDS = ['value', 'reached', 'refused'];
/**
 * What is said when nobody has said otherwise: only a value written from a protected file. The other two are worth
 * having and worth asking for; on every session they are a line about work that went as it should.
 */
export const DEFAULT_THRESHOLD = 'value';
/**
 * What can be said about one agent of a report, read from the report model and nothing else (R6): its return, which
 * already looks at every agent below it, and the graph for an agent no delegation recorded, which has no return.
 */
export function alertOf(report, agentIndex) {
    // The session's own agent is asked about too, on `Stop` (`the-agent-nobody-watches.md` R2): it is the one agent
    // with no `SubagentStop`, and the graph keeps it apart from the agents it delegated to.
    const everyone = [report.graph.main, ...report.graph.agents];
    const node = everyone.find((agent) => agent.index === agentIndex);
    if (node === undefined)
        return undefined;
    // Handed the root, this subtree is every agent of the session, which is what a session-wide question needs (R5) - an
    // agent whose parent the record does not name among them (`2026-10-11-a-helper-read-is-said.md` HRB1: the Codex panel's
    // helper, whose spawn no item joined), which was left out and let a turn whose helper read a file say none was opened.
    const subtree = node === report.graph.main ? everyone : subtreeOf(everyone, node);
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
    const byOthers = sumRefusedByOthers(subtree.map((agent) => agent.refusedByOthers));
    const filesReached = own.length > 0 ? reachedFromReturn : reachedBelow ? undefined : node.filesReached;
    const level = wroteOrReturnedValue || wroteItself ? 'value' : reached ? 'reached' : refusedAttempts > 0 ? 'refused' : 'nothing';
    return {
        level,
        ...(node === report.graph.main ? { own: true } : {}),
        ...(node.type === undefined ? {} : { type: node.type }),
        ...(filesReached === undefined ? {} : { filesReached }),
        refusedAttempts,
        ...(byOthers === undefined ? {} : { refusedByOthers: byOthers }),
    };
}
/** Whether a level is strong enough to be said, under the threshold asked for. */
export function alerts(level, threshold) {
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
function subtreeOf(agents, root) {
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
