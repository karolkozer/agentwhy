import { isTemplate } from '../../check/session-actions.js';
import { entryOf, nextAnswers, storyAgents } from './file-story.js';
// A stop outranks a name seen, as a file's access does (`files.ts`, 2026-10-05).
const RANK = ['read', 'unknown', 'opened', 'stopped', 'named'];
export function helperViews(report) {
    const agentOf = storyAgents(report);
    const helpers = [...report.graph.agents].sort((a, b) => (a.ordinal ?? Infinity) - (b.ordinal ?? Infinity) || a.index - b.index);
    const order = [report.graph.main, ...helpers];
    return order.map((graphAgent) => {
        const agent = agentOf(graphAgent.index);
        const flow = report.flows.find((each) => each.agentIndex === graphAgent.index);
        const files = new Map();
        const kinds = new Set();
        let unknownReply = false;
        for (const step of flow?.steps ?? []) {
            if (step.kind === 'returned' && (step.awaited === true || step.strength === 'unknown'))
                unknownReply = true;
            const paths = step.kind === 'reached' || step.kind === 'used' || step.kind === 'returned' || step.kind === 'received' ? step.files : [];
            for (const path of paths) {
                const entry = entryOf(step, path, agent, agentOf);
                if (entry === undefined)
                    continue;
                kinds.add(entry.kind);
                const reach = reachOf(entry.kind);
                if (reach === undefined)
                    continue;
                const known = files.get(path);
                if (known === undefined || RANK.indexOf(reach) < RANK.indexOf(known.reach))
                    files.set(path, { path, reach });
            }
        }
        const reached = [...files.values()];
        const has = (reach) => reached.some((file) => file.reach === reach);
        const status = has('read') ? 'read'
            : has('unknown') ? 'unknown'
                : has('named') ? (reached.filter((file) => file.reach === 'named').every((file) => isTemplate(file.path)) ? 'sample' : 'named')
                    : has('stopped') || graphAgent.refusedAttempts > 0 ? 'stopped' : graphAgent.actions === 0 ? 'empty' : 'none';
        // DN1, DND4: a private table's own fields in what it did next say Yes; any other file it read leaves that not known.
        const next = nextAnswers(flow);
        const passed = kinds.has('passed') || kinds.has('handed') || next.found.includes('passed');
        return {
            agent,
            models: graphAgent.models ?? [],
            status,
            files: reached,
            passed,
            passedUnknown: unknownReply && !passed,
            saved: kinds.has('saved') || next.found.includes('saved'),
            repeated: kinds.has('repeated') || next.found.includes('repeated'),
            used: kinds.has('used') || next.found.includes('used'),
            unknown: next.unknown,
        };
    });
}
function reachOf(kind) {
    return kind === 'read' || kind === 'named' || kind === 'unknown' || kind === 'stopped' || kind === 'opened' ? kind : undefined;
}
