/**
 * `2026-10-19-what-it-did-next.md` DN3: every way an agent put anything on after a record of its own stream - its
 * words, a file a call wrote, a command, another call, instructions to another agent - whatever the text holds, and its
 * reply where another agent asked it, which comes last of all. Asked where what it read there cannot be followed (DN1):
 * a way it never took is a certain *No*, and one it took is not known. Placed by the record's position in that agent's
 * own stream, never against another agent's records (invariant 3).
 */
export function nextLandings(model, landings, agentId, record) {
    const found = new Set();
    for (const landing of landings) {
        if (landing.agentId === agentId && landing.evidence.record > record)
            found.add(landing.landing.landed);
    }
    if (model.delegations.some((delegation) => delegation.childAgentId === agentId))
        found.add('reply');
    return [...found].sort();
}
