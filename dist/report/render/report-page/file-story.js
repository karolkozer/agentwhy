import { linesOf, openedIn, readIn, readsOf } from '../../flow-reads.js';
/** DN3: which of the four each way of putting something on is - the kind `entryOf` gives a use that landed there. */
const ONWARD = {
    file: 'saved', delegation: 'passed', reply: 'passed', said: 'repeated', reasoning: 'repeated', command: 'used', call: 'used',
};
/**
 * DN1, DND4: of one file, or of every such file an agent read where none is named. A table whose own fields the read
 * showed answers for itself: *Yes* where a way held one, *No* for the rest of the ways it took. Any other such file leaves
 * the ways taken after its read not known. Each of the four once, in their order on the page; a *Yes* is never also not
 * known. Read by the drawer and the file's window alone (DND8).
 */
export function nextAnswers(flow, path) {
    const unknown = new Set();
    const found = new Set();
    for (const file of flow?.unfollowed ?? []) {
        if (path !== undefined && String(file.path) !== path)
            continue;
        if (file.byFields !== undefined)
            for (const way of file.byFields.found)
                found.add(ONWARD[way]);
        else
            for (const way of file.next)
                unknown.add(ONWARD[way]);
    }
    const order = ['passed', 'saved', 'repeated', 'used'];
    return { unknown: order.filter((onward) => unknown.has(onward) && !found.has(onward)), found: order.filter((onward) => found.has(onward)) };
}
/** How the page names every agent of the session: your AI, or a helper by its ordinal, with who brought it in. */
export function storyAgents(report) {
    const agents = new Map([report.graph.main, ...report.graph.agents].map((agent) => [agent.index, agent]));
    return (index) => {
        const agent = agents.get(index);
        const parent = agent?.parentIndex === undefined ? undefined : agents.get(agent.parentIndex);
        const broughtBy = parent === undefined ? undefined : parent.index === report.graph.main.index ? 'main' : parent.ordinal;
        return {
            index,
            ...(agent?.ordinal === undefined ? {} : { ordinal: agent.ordinal }),
            ...(broughtBy === undefined ? {} : { broughtBy }),
            ...(agent?.askedTo === undefined ? {} : { askedTo: agent.askedTo }),
            actions: agent?.actions ?? 0,
            ...(agent?.models === undefined ? {} : { models: agent.models }),
        };
    };
}
/**
 * `EverydayCall.how` as a story kind: a write is its own thing, and a name seen is never called a read (P32a). An
 * everyday file's calls never make `passed`, `saved`, `handed`, `repeated` or `used` - none of that was looked for.
 */
const EVERYDAY_KIND = {
    read: 'read', changed: 'changed', stopped: 'stopped', unknown: 'unknown', opened: 'opened', named: 'named',
};
/**
 * EF3: one story, whichever record holds it. The flows name protected files alone, so a file no flow names is told from
 * the calls the model kept for it (EF2) - the same entries, minus the kinds that only a traced value can make.
 */
export function fileStory(report, path) {
    const agentOf = storyAgents(report);
    const entries = [];
    for (const flow of report.flows) {
        const agent = agentOf(flow.agentIndex);
        for (const step of flow.steps) {
            const entry = entryOf(step, path, agent, agentOf);
            if (entry !== undefined)
                entries.push(entry);
        }
    }
    const traced = entries.length > 0;
    let leftOut = 0;
    if (!traced) {
        const everyday = report.everydayFiles.find((file) => String(file.path) === path);
        leftOut = everyday?.reachesLeftOut ?? 0;
        for (const call of everyday?.reaches ?? []) {
            entries.push({
                agent: agentOf(call.agentIndex),
                // X11: what a call of no known end printed of the file it read, as `entryOf` asks `readIn` before `unknown` - a Codex
                // loop that printed a file beside its name said "Tried to open it" under a head saying it was read (2026-10-11).
                kind: call.outcome === 'unknown' && call.how !== 'read' ? 'unknown' : EVERYDAY_KIND[call.how],
                count: 1,
                did: call.did,
                outcome: call.outcome,
                evidence: [call.evidence],
                ...(call.at === undefined ? {} : { at: call.at }),
            });
        }
    }
    const holders = new Map();
    for (const entry of entries) {
        const known = holders.get(entry.agent.index) ?? {
            agent: entry.agent, read: false, changed: false, passed: false, saved: false, repeated: false, used: false, unknown: [], stopped: false,
        };
        holders.set(entry.agent.index, {
            ...known,
            read: known.read || entry.kind === 'read',
            changed: known.changed || entry.kind === 'changed',
            passed: known.passed || entry.kind === 'passed' || entry.kind === 'handed',
            saved: known.saved || entry.kind === 'saved',
            repeated: known.repeated || entry.kind === 'repeated',
            used: known.used || entry.kind === 'used',
            stopped: known.stopped || entry.kind === 'stopped',
        });
    }
    // DN1, DND4: what the agent may have done next with the file, and what a table's own fields say it did.
    for (const [index, holder] of holders) {
        const next = nextAnswers(report.flows.find((flow) => flow.agentIndex === index), path);
        holders.set(index, {
            ...holder,
            passed: holder.passed || next.found.includes('passed'),
            saved: holder.saved || next.found.includes('saved'),
            repeated: holder.repeated || next.found.includes('repeated'),
            used: holder.used || next.found.includes('used'),
            unknown: next.unknown,
        });
    }
    // A read its code handed back is no call that reached the file, so it is not counted as one.
    const sum = (kinds) => entries.filter((entry) => kinds.includes(entry.kind) && entry.received !== true).reduce((total, entry) => total + entry.count, 0);
    return {
        entries,
        traced,
        ...(leftOut > 0 ? { leftOut } : {}),
        holders: [...holders.values()],
        readers: [...holders.values()].filter((holder) => holder.read).length,
        opened: sum(['read', 'changed', 'named']),
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
export function savedInto(report, paths) {
    const wanted = new Set(paths);
    const agentOf = storyAgents(report);
    const into = [];
    for (const flow of report.flows) {
        const agent = agentOf(flow.agentIndex);
        for (const step of flow.steps) {
            if (!('files' in step))
                continue;
            for (const path of new Set(step.files.map(String))) {
                const entry = wanted.has(path) ? entryOf(step, path, agent, agentOf) : undefined;
                if (entry?.kind === 'saved')
                    into.push(...(entry.into ?? []));
            }
        }
    }
    return into;
}
/** What one flow step says about `path`, or `undefined` where it does not name it. Shared with the Helpers view. */
export function entryOf(step, path, agent, agentOf) {
    const common = { agent, count: step.count, evidence: step.evidence, ...(step.at === undefined ? {} : { at: step.at }) };
    switch (step.kind) {
        case 'reached': {
            // A tool the adapter has no profile for had its whole input searched: a path in it is a mention, not a file
            // reached - `check` does not count it either (`worth-running-every-day` R12b). The run in Advanced still shows it.
            // `2026-10-11-the-file-by-its-text.md` CT10: but a file whose own lines its output held it read (`readsOf`).
            if (!step.files.map(String).includes(path) || (!step.toolKnown && !readsOf(step).map(String).includes(path)))
                return undefined;
            const kind = step.outcome === 'blocked' ? 'stopped'
                : readIn(step, path) ? 'read'
                    : step.outcome === 'unknown' ? 'unknown'
                        : openedIn(step, path) ? 'opened' : 'named';
            const inResult = !step.sources.includes('input');
            const lines = linesOf(step, path);
            return { ...common, kind, did: step.did, outcome: step.outcome, ...(inResult ? { inResult: true } : {}), ...(lines === undefined ? {} : { lines }) };
        }
        case 'used': {
            if (!step.files.map(String).includes(path))
                return undefined;
            const landed = step.landed;
            const kind = landed === 'file' ? 'saved' : landed === 'delegation' ? 'handed' : landed === 'said' || landed === 'reasoning' ? 'repeated' : 'used';
            const into = kind === 'saved' ? step.targets : kind === 'used' ? step.programs : undefined;
            return { ...common, kind, outcome: 'succeeded', ...(into === undefined || into.length === 0 ? {} : { into }) };
        }
        case 'received':
            if (!step.files.map(String).includes(path))
                return undefined;
            return { ...common, kind: 'read', outcome: 'succeeded', received: true };
        case 'returned': {
            // Only a value counts as passing the file on; a reply that named the path handed over its name, not its contents.
            if (step.strength !== 'value' || !step.files.map(String).includes(path))
                return undefined;
            return { ...common, kind: 'passed', outcome: 'succeeded', ...(step.toAgentIndex === undefined ? {} : { to: agentOf(step.toAgentIndex) }) };
        }
        default:
            return undefined;
    }
}
