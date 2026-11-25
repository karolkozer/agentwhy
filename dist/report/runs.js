import { reachesOf } from './reaches.js';
/** SB4: `ls` of a project prints hundreds of names, and each would be a chip. */
export const RUN_FILES_KEPT = 24;
/** SB6: the most steps of one AI a page lists; the rest are counted. */
export const RUN_STEPS_KEPT = 400;
/**
 * SB12 as amended 2026-10-11: the ladder the Files tab sorts its parts by - read, not recorded, opened, stopped, a name
 * only seen - so a step and a row never disagree about which of two things weighs more.
 */
export const HOW_RANK = { read: 6, changed: 6, unknown: 4, opened: 3, stopped: 2, named: 1 };
/**
 * Every call of every AI, grouped as it was written (`2026-10-11-step-by-step.md` SB1-SB7): the AIs in the page's order -
 * your AI, the helpers by their number, then any the record does not say was given work - and each AI's calls in its own
 * record's order, never against another's (invariant 3).
 */
export function runsOf(model, accesses, graph, policy, wordsBefore, redactor, words, where = {}) {
    const ranked = [graph.main, ...[...graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index)];
    const told = toldPatterns(policy);
    const byEvent = new Map();
    for (const access of accesses)
        byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access]);
    const delegations = new Map(model.delegations.map((delegation) => [delegation.id, delegation]));
    const indexOf = new Map(model.agents.map((agent, index) => [agent.id, index]));
    return ranked.flatMap((agent) => {
        const id = model.agents[agent.index]?.id;
        const events = model.events.filter((event) => event.agentId === id).sort((a, b) => a.sequence - b.sequence);
        if (id === undefined || events.length === 0)
            return [];
        const kept = events.slice(0, RUN_STEPS_KEPT);
        // SB5: where a path was first printed or named, by the step's place among this AI's kept steps.
        const firstNamed = new Map();
        const runs = [];
        kept.forEach((event, place) => {
            const step = stepOf(event, place);
            const before = wordsBefore.get(event.id);
            const last = runs[runs.length - 1];
            // One run is the calls that share one stretch of writing: `wordsBeforeCalls` hands each of them the same words.
            if (last !== undefined && before !== undefined && last.before?.words === before.words)
                last.steps.push(step);
            else
                runs.push({ before, steps: [step] });
        });
        const lastRecord = Math.max(...events.map((event) => event.evidence.record));
        const answered = model.messages.some((message) => message.agentId === id && message.kind === 'said' &&
            message.text.trim() !== '' && message.evidence.record > lastRecord);
        return [{
                agentIndex: agent.index,
                runs: runs.map(({ before, steps }) => ({ wrote: words.wrote(before), steps })),
                ...(events.length > kept.length ? { stepsLeftOut: events.length - kept.length } : {}),
                ...(answered ? { answered: true } : {}),
            }];
        function stepOf(event, place) {
            const delegation = delegations.get(event.id);
            // A hand-over reaches no file of its own: what the helper reached is in the helper's steps.
            const shown = delegation === undefined ? filesOfCall(event, byEvent.get(event.id) ?? [], policy, redactor, where, told) : [];
            const files = shown.map(({ path, how, private: held, tracked }) => {
                const seen = firstNamed.get(path);
                return {
                    path,
                    how,
                    ...(held === 0 ? {} : { private: true }),
                    // Tracked where every pattern that holds it only asks to be told: one that blocks it keeps it blocked.
                    ...(held > 0 && tracked === held ? { tracked: true } : {}),
                    ...(seen !== undefined && how !== 'named' ? { seenAt: seen } : {}),
                };
            });
            for (const { path, how } of files)
                if (how === 'named' && !firstNamed.has(path))
                    firstNamed.set(path, place);
            // Private files first, then the rest in the order the call gave them.
            const ordered = [...files.filter((file) => file.private === true), ...files.filter((file) => file.private !== true)];
            const child = delegation?.childAgentId === undefined ? undefined : indexOf.get(delegation.childAgentId);
            const refusedBy = event.result?.refusedBy;
            const programs = words.programs(event);
            const keyWrite = stepKeyWrite(event, redactor);
            return {
                sequence: event.sequence,
                did: redactor.term(words.did(event)),
                ...(programs.length === 0 ? {} : { programs: programs.map((program) => redactor.term(program)) }),
                toolKnown: event.toolKnown,
                ...(event.mcp === undefined ? {} : { mcp: { server: redactor.term(event.mcp.server), tool: redactor.term(event.mcp.tool) } }),
                ...(!event.toolKnown && event.description !== undefined ? { described: true } : {}),
                outcome: event.outcome,
                ...(refusedBy === undefined ? {} : { refusedBy }),
                ...(keyWrite === undefined ? {} : { keyWrite }),
                files: ordered.slice(0, RUN_FILES_KEPT),
                ...(ordered.length > RUN_FILES_KEPT ? { filesLeftOut: ordered.length - RUN_FILES_KEPT } : {}),
                ...(delegation === undefined ? {} : {
                    gave: {
                        ...(child === undefined ? {} : { agentIndex: child }),
                        ...(delegation.description === undefined ? {} : { askedTo: redactor.scan(delegation.description) }),
                        back: event.outcome === 'succeeded' && event.result?.launchNotice !== true,
                    },
                }),
                evidence: words.evidence(event),
                ...words.at(event),
            };
        }
    });
}
/**
 * The files one call reached, by the path as it is shown (FNB28): a loop's word and the path it placed it at are one file, one
 * chip - found 2026-10-19 as `customers.csv` twice in one step - and the call did to it the most it did to either. Asked by a
 * step and by the counts (`2026-11-24-talking-about-agentwhy.md` CV16), so the two can never differ.
 */
export function filesOfCall(event, accesses, policy, redactor, where, told) {
    const shown = new Map();
    for (const { path, how, access } of reachesOf(event, accesses, policy, where)) {
        const at = redactor.path(path);
        const known = shown.get(at) ?? { path: at, how, private: 0, tracked: 0 };
        shown.set(at, {
            path: at,
            how: HOW_RANK[how] > HOW_RANK[known.how] ? how : known.how,
            private: known.private + (access === undefined ? 0 : 1),
            tracked: known.tracked + (access !== undefined && told.has(access.pattern) ? 1 : 0),
        });
    }
    return [...shown.values()];
}
/** The patterns a person asked only to be told about (F57). */
export function toldPatterns(policy) {
    return new Set(policy.protected.filter((entry) => entry.mode === 'tell').map((entry) => entry.pattern));
}
/** WK7: the record's word on a write and a key in its file, as a finding says it: stopped by agentwhy, or written over. */
export function keyWriteKind(keyWrite) {
    return keyWrite.kind === 'refused' ? 'stopped' : 'written';
}
/** WK7: what a step says of it - the file the call names, so a call that names none says what it did as before. */
function stepKeyWrite(event, redactor) {
    const keyWrite = event.result?.keyWrite;
    const path = event.targets[0];
    if (keyWrite === undefined || path === undefined || path === '')
        return undefined;
    return { kind: keyWriteKind(keyWrite), path: redactor.path(path), ...(keyWrite.kind === 'written-over' ? { keys: keyWrite.keys } : {}) };
}
