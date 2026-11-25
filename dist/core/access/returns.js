import { isOrdinaryShape, isWords } from '../redaction/value-shapes.js';
import { protectedValues } from './protected-values.js';
export function traceValues(model, accesses, traceOf) {
    const read = protectedValues(model, accesses);
    // Spec §5.2: an ordinary value - a port, a boolean - would make every report that mentions one carry a value back.
    const values = read.filter((value) => !isOrdinaryShape(value.value));
    const taken = read.map(({ agentId, paths, value }) => ({ agentId, paths, words: isWords(value) }));
    return { values, trace: traceOf(values.map((value) => value.value)), taken };
}
/**
 * DN1, DN2: whether what this agent read of this file can be followed further - values were read out of it, and none
 * was set aside as words. A value set aside as ordinary - a port, a boolean - is not private text (§5.2), and leaves the
 * file followed: its other values are traced, or there is nothing private in it to follow. A read no value was taken
 * from at all - a loop's `cat`, a search inside one file - is not followed: what it showed is in no trace.
 */
export function followedFrom(traced, agentId, path) {
    const of = traced.taken.filter((value) => value.agentId === agentId && value.paths.includes(path));
    return of.length > 0 && of.every((value) => !value.words);
}
/** Which protected files a traced value in this text was read from. Empty when it carries none. */
export function filesTracedIn(texts, traced) {
    const files = new Set();
    for (const text of texts) {
        for (const index of traced.trace.foundIn(text)) {
            const value = traced.values[index];
            if (value !== undefined)
                for (const path of value.paths)
                    files.add(path);
        }
    }
    return [...files].sort();
}
export function returnsOf(model, accesses, traced) {
    const { values, trace } = traced;
    const events = new Map(model.events.map((event) => [event.id, event]));
    return model.delegations.flatMap((delegation) => {
        const child = delegation.childAgentId;
        if (child === undefined)
            return [];
        const below = agentsFrom(model, child);
        // Only a confirmed reach could have given the agent something to return: a refusal did not, and an attempt whose
        // effect the record does not establish is no reach (`2026-09-27-what-codex-wrote.md` X11).
        const reached = accesses.filter((access) => below.has(access.agentId) && access.outcome === 'succeeded');
        // Nothing protected was reached at or below it, so nothing protected could have come back.
        if (reached.length === 0)
            return [];
        const event = events.get(delegation.id);
        const result = event?.result;
        const readable = event !== undefined && event.outcome !== 'unknown' && result?.content !== undefined;
        // `2026-09-15-where-the-value-went.md` R3: what came back is what the delegating agent received - the result, and
        // every report delivered for it. A launch notice says only that the agent started, so it is not one of them.
        const received = [
            ...(readable && result?.content !== undefined && result.launchNotice !== true
                ? [{ text: result.content, evidence: result.evidence }]
                : []),
            ...delegation.reports.map((report) => ({ text: report.content, evidence: report.evidence })),
        ];
        const messages = model.messages.filter((message) => message.agentId === child).map((message) => message.text);
        const reportLength = delegation.reports.length > 0
            ? delegation.reports.reduce((length, report) => length + report.content.length, 0)
            : result?.content?.length;
        const base = {
            delegationId: delegation.id,
            agentId: child,
            parentAgentId: delegation.parentAgentId,
            filesReached: new Set(reached.map((access) => access.path)).size,
            ...(reportLength === undefined ? {} : { reportLength }),
            evidence: event?.result?.evidence ?? event?.evidence ?? delegation.evidence,
        };
        // A value read by a call that printed several protected files at once came from one of them, so the files it
        // was found under are carried with whether they are the one or the several.
        const filesOf = (texts) => {
            const files = new Set();
            let uncertain = false;
            for (const text of texts) {
                for (const index of trace.foundIn(text)) {
                    const value = values[index];
                    if (value === undefined || !below.has(value.agentId))
                        continue;
                    for (const path of value.paths)
                        files.add(path);
                    if (value.paths.length > 1)
                        uncertain = true;
                }
            }
            return { paths: [...files].sort(), uncertain };
        };
        const written = filesOf(messages);
        const writtenFrom = written.paths;
        const shown = (files) => files.uncertain ? { fileUncertain: true } : {};
        // What was received decides what came back (R2, amended). A statement of a value shows where the value came from,
        // says nothing of what the agent wrote (R4b), and carries the record of the first text that held it. It is made
        // before anything unreadable is weighed: a value that came back is never downgraded (R7).
        const fromReceived = filesOf(received.map((entry) => entry.text));
        if (fromReceived.paths.length > 0) {
            const carrying = received.find((entry) => filesOf([entry.text]).paths.length > 0);
            return [{
                    ...base,
                    ...(carrying === undefined ? {} : { evidence: carrying.evidence }),
                    strength: 'value',
                    paths: fromReceived.paths,
                    writtenFrom,
                    ...shown(fromReceived),
                }];
        }
        // R9: a return that cannot be read is not a clean one, whatever the agent wrote.
        if (!readable)
            return [{ ...base, strength: 'unknown', paths: [], writtenFrom, ...shown(written) }];
        // where-the-value-went R5: started in the background, and no report delivered - what came back is not in the record.
        if (received.length === 0)
            return [{ ...base, strength: 'unknown', awaited: true, paths: [], writtenFrom, ...shown(written) }];
        // R5: only a file that was reached below counts. A protected path a report merely mentions is prose.
        // FN11: a child's report may name the file by the word its line wrote, so both spellings are looked for.
        const namings = new Map();
        for (const access of reached) {
            namings.set(access.path, (namings.get(access.path) ?? new Set()).add(access.word ?? access.path).add(access.path));
        }
        const namedBy = (text, path) => [...(namings.get(path) ?? [])].some((name) => namesPath(text, name));
        const named = [...namings.keys()].filter((path) => received.some((entry) => namedBy(entry.text, path)));
        if (named.length > 0) {
            const naming = received.find((entry) => named.some((path) => namedBy(entry.text, path)));
            return [{
                    ...base,
                    ...(naming === undefined ? {} : { evidence: naming.evidence }),
                    strength: 'path',
                    paths: named.sort(),
                    writtenFrom,
                    ...shown(written),
                }];
        }
        // Nothing of the file was in what this record holds of the reply. Before that is said as a clean return, the
        // one thing that can contradict it: a value only an agent below this delegation ever read, in the hands of the
        // agent that delegated. A child's one channel to its parent is its reply, so the value crossed here - whatever
        // carried it, and whether or not this version can read that carrier (`when-an-agent-finishes` D9). Saying
        // "nothing came back" over that is the one answer the record rules out.
        const crossed = filesOf(textsOf(model, delegation.parentAgentId, delegation.evidence.record));
        if (crossed.paths.length > 0) {
            return [{ ...base, strength: 'value', inferred: true, paths: crossed.paths, writtenFrom, ...shown(crossed) }];
        }
        const last = received.at(-1);
        return [{ ...base, ...(last === undefined ? {} : { evidence: last.evidence }), strength: 'report', paths: [], writtenFrom, ...shown(written) }];
    });
}
/**
 * Every string an agent wrote after a given record: its own messages, what it put into the calls it made, the later words
 * it gave its helpers, and code or instructions of its own that are no call of the model (X14, X17).
 */
function textsOf(model, agentId, after) {
    const strings = (value) => {
        if (typeof value === 'string')
            return [value];
        if (Array.isArray(value))
            return value.flatMap(strings);
        if (value !== null && typeof value === 'object')
            return Object.values(value).flatMap(strings);
        return [];
    };
    return [
        ...model.messages.filter((message) => message.agentId === agentId && message.evidence.record > after).map((message) => message.text),
        ...model.events.filter((event) => event.agentId === agentId && event.evidence.record > after).flatMap((event) => strings(event.input)),
        ...model.delegations.flatMap((delegation) => delegation.followUps)
            .filter((followUp) => followUp.senderAgentId === agentId && followUp.evidence.record > after)
            .map((followUp) => followUp.text),
        ...model.contexts.filter((context) => context.author === 'agent' && context.agentId === agentId && context.evidence.record > after)
            .map((context) => context.text),
    ];
}
/** The agent and every agent a chain of delegations below it started. */
function agentsFrom(model, agentId) {
    const below = new Set([agentId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const delegation of model.delegations) {
            const child = delegation.childAgentId;
            if (child !== undefined && below.has(delegation.parentAgentId) && !below.has(child)) {
                below.add(child);
                grew = true;
            }
        }
    }
    return below;
}
/** Whether the text names this path as a whole: `.env` inside `.env.local` is not it, `/abs/apps/web/.env` is. */
export function namesPath(text, path) {
    for (let at = text.indexOf(path); at !== -1; at = text.indexOf(path, at + 1)) {
        if (!/[\w.-]/.test(text.charAt(at - 1)) && !/[\w./-]/.test(text.charAt(at + path.length)))
            return true;
    }
    return false;
}
