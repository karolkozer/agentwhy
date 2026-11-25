import { commitsIn, programsIn } from './command-line.js';
/** On one record, the more direct source is named: a protected read, then a return, then anything else. */
const SOURCE_ORDER = ['read', 'returned', 'delivered', 'unprotected'];
/**
 * Every use of a traced value (R7, R8): a run of it in an agent's message or in the input of a call, with where it
 * landed and the first thing earlier in that agent's own record stream that carried it. Order is a record's position
 * within one agent's stream: a use is never placed against another agent's records, and never by time. The claim is
 * sameness - the same value appears here - and nothing about how it travelled (R10).
 */
export function valueUses(model, accesses, traced) {
    if (traced.values.length === 0)
        return [];
    const { values, trace } = traced;
    const sources = sourcesOf(model, accesses, traced);
    const foundIn = (texts) => new Set(texts.flatMap((text) => [...trace.foundIn(text)]));
    const uses = [];
    const use = (agentId, evidence, found, landing) => {
        if (found.size === 0)
            return;
        const files = new Set();
        let uncertain = false;
        for (const index of found) {
            const value = values[index];
            if (value === undefined)
                continue;
            for (const path of value.paths)
                files.add(path);
            if (value.paths.length > 1)
                uncertain = true;
        }
        const [first] = (sources.get(agentId) ?? []).filter((source) => source.record < evidence.record && [...found].some((index) => source.found.has(index)));
        uses.push({
            agentId,
            files: [...files].sort(),
            ...(uncertain ? { fileUncertain: true } : {}),
            ...landing,
            source: first?.kind ?? 'none',
            ...(first?.kind === 'unprotected' && first.targets.length > 0 ? { sourceTargets: first.targets } : {}),
            ...(first === undefined ? {} : { sourceRecord: first.record }),
            ...(first?.delegationId === undefined ? {} : { sourceDelegationId: first.delegationId }),
            evidence,
        });
    };
    for (const { agentId, evidence, texts, landing } of landingsOf(model, accesses))
        use(agentId, evidence, foundIn(texts), landing);
    const order = new Map(model.agents.map((agent, index) => [agent.id, index]));
    const position = (agentId) => order.get(agentId) ?? order.size;
    return uses.sort((first, second) => position(first.agentId) - position(second.agentId) || first.evidence.record - second.evidence.record);
}
/**
 * Every text an agent put anywhere a traced value is looked for (R7), with where it landed: its own words, the files
 * its calls write, the instructions it hands another agent, a command line, and the input of any other call. What a
 * value could go on in - read by `valueUses` for the value, and by `2026-10-19-what-it-did-next.md` DN3 for whether
 * anything went on at all.
 */
export function landingsOf(model, accesses) {
    const delegating = new Set(model.delegations.map((delegation) => delegation.id));
    const protectedInputs = new Set(accesses.filter((access) => access.source === 'input').map((access) => access.eventId));
    const landings = [];
    const add = (agentId, evidence, texts, landing) => {
        landings.push({ agentId, evidence, texts, landing });
    };
    for (const message of model.messages)
        add(message.agentId, message.evidence, [message.text], { landed: message.kind });
    // X17: later words to a helper hand a value to it as the first instruction does - once per instruction, where the
    // sender wrote them.
    for (const followUp of model.delegations.flatMap((delegation) => delegation.followUps)) {
        add(followUp.senderAgentId, followUp.evidence, [followUp.text], { landed: 'delegation' });
    }
    // Words an agent wrote that are no call of the model: code it handed its runtime (X14), and instructions that reached
    // no helper by id (X17). Each says only that the agent put the value into what it sent, never that it ran or arrived.
    for (const context of model.contexts) {
        if (context.author !== 'agent' || context.agentId === undefined)
            continue;
        if (context.kind !== 'code' && context.kind !== 'unjoined-instruction')
            continue;
        add(context.agentId, context.evidence, [context.text], { landed: 'call' });
    }
    for (const event of model.events) {
        if (event.written !== undefined) {
            // What a call puts into a file, never the text an edit takes out: a value only there was in the file already.
            add(event.agentId, event.evidence, event.written, { landed: 'file', targets: event.targets, intoProtected: protectedInputs.has(event.id) });
            continue;
        }
        const input = stringsIn(event.input);
        if (delegating.has(event.id))
            add(event.agentId, event.evidence, input, { landed: 'delegation' });
        else if (event.commands.length > 0) {
            const programs = [...new Set(event.commands.flatMap((command) => programsIn(command)))];
            add(event.agentId, event.evidence, input, { landed: 'command', programs, commits: event.commands.some((command) => commitsIn(command)) });
        }
        else
            add(event.agentId, event.evidence, input, { landed: 'call' });
    }
    return landings;
}
/** The texts each agent received that carry a traced value, earliest first. */
function sourcesOf(model, accesses, { trace }) {
    const events = new Map(model.events.map((event) => [event.id, event]));
    const delegating = new Set(model.delegations.map((delegation) => delegation.id));
    // A write to a protected file is an access as well, and reads nothing: only a call that returns something reads.
    const reads = new Set(accesses
        .filter((access) => access.outcome === 'succeeded' && events.get(access.eventId)?.resultShape !== 'none')
        .map((access) => access.eventId));
    const byAgent = new Map();
    const add = (agentId, source) => {
        if (source.found.size === 0)
            return;
        const list = byAgent.get(agentId);
        if (list === undefined)
            byAgent.set(agentId, [source]);
        else
            list.push(source);
    };
    for (const event of model.events) {
        const result = event.result;
        // X10: only output the agent's model was handed carried a value to it. What a process printed, as a runtime
        // recorded it, reached the agent only where it is also in something delivered.
        if (result?.content === undefined || result.stage !== 'model' || delegating.has(event.id))
            continue;
        const kind = reads.has(event.id) ? 'read' : 'unprotected';
        add(event.agentId, { record: result.evidence.record, kind, found: trace.foundIn(result.content), targets: event.targets });
    }
    for (const delivery of model.deliveries) {
        if (delivery.status !== 'confirmed')
            continue;
        // Joined to a call by id, it is that call's output; joined to none, it is delivered output and no more.
        const source = delivery.sourceId === undefined ? undefined : events.get(delivery.sourceId);
        const kind = source !== undefined && reads.has(source.id) ? 'read' : source !== undefined ? 'unprotected' : 'delivered';
        add(delivery.recipientAgentId, { record: delivery.evidence.record, kind, found: trace.foundIn(delivery.text), targets: source?.targets ?? [] });
    }
    // What came back from a delegation is a source for the agent it came back to: its result, unless that is a launch
    // notice, and every report delivered for it (R3).
    for (const delegation of model.delegations) {
        const result = events.get(delegation.id)?.result;
        if (result?.content !== undefined && result.launchNotice !== true) {
            add(delegation.parentAgentId, { record: result.evidence.record, kind: 'returned', found: trace.foundIn(result.content), targets: [], delegationId: delegation.id });
        }
        for (const report of delegation.reports) {
            add(delegation.parentAgentId, { record: report.evidence.record, kind: 'returned', found: trace.foundIn(report.content), targets: [], delegationId: delegation.id });
        }
    }
    for (const list of byAgent.values()) {
        list.sort((first, second) => first.record - second.record || SOURCE_ORDER.indexOf(first.kind) - SOURCE_ORDER.indexOf(second.kind));
    }
    return byAgent;
}
function stringsIn(value) {
    if (typeof value === 'string')
        return [value];
    if (Array.isArray(value))
        return value.flatMap(stringsIn);
    if (value !== null && typeof value === 'object')
        return Object.values(value).flatMap(stringsIn);
    return [];
}
