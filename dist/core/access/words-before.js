/**
 * The words before every call of every agent.
 *
 * A block belongs to the **run** of calls that follows it, not to the first of them: measured on one
 * session, one block stands before 1 call in 136 runs, 2 in 76, 3 in 15 and 4 in 10. A call that follows another
 * call directly has no words of its own - 186 of 462 - and that is reported as the absence it is, never filled in
 * from the run before.
 *
 * Order is the record's, which is the order the transcript was written in; nothing here is joined by time.
 */
export function wordsBeforeCalls(model) {
    const before = new Map();
    for (const agentId of new Set(model.events.map((event) => event.agentId))) {
        for (const run of runsOf(model, agentId)) {
            for (const call of run.calls)
                before.set(call, { words: run.words, covers: run.calls.length });
        }
    }
    return before;
}
/** One agent's records in order: each stretch of writing, and the calls that follow it before it writes again. */
function runsOf(model, agentId) {
    const calls = model.events
        .filter((event) => event.agentId === agentId)
        .map((event) => ({ at: event.evidence.record, id: event.id }));
    const written = model.messages.filter((message) => message.agentId === agentId);
    // A call and a message never share a record - measured, 149 of 149 text blocks and 249 of 249 reasoning blocks
    // sit on lines of their own - so the record alone orders them.
    const items = [
        ...written.map((message) => ({ at: message.evidence.record, message })),
        ...calls.map((call) => ({ at: call.at, call: call.id })),
    ].sort((first, second) => first.at - second.at);
    const runs = [];
    let words = [];
    let following = [];
    for (const item of items) {
        if ('message' in item) {
            // Writing after a run closes it: what comes next stands before the calls that come next.
            if (following.length > 0) {
                runs.push({ words, calls: following });
                words = [];
                following = [];
            }
            words.push(item.message);
            continue;
        }
        following.push(item.call);
    }
    if (following.length > 0)
        runs.push({ words, calls: following });
    return runs;
}
