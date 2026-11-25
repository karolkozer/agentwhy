import { actionsFor, agentName } from './html-report-components.js';
import { distinctDepth } from './path-tail.js';
export const TIERS = ['value', 'hit', 'secret', 'named', 'unknown', 'block', 'clean'];
const RANK = { value: 0, hit: 1, secret: 2, named: 3, unknown: 4, block: 5, clean: 6 };
export function storyTier(story) {
    if (story.outcome === 'blocked')
        return 'block';
    if (story.outcome === 'unknown')
        return 'unknown';
    return story.source === 'result' ? 'hit' : 'named';
}
export function worstTier(tiers) {
    return tiers.reduce((worst, tier) => (RANK[tier] < RANK[worst] ? tier : worst), 'clean');
}
export const agentKey = (index) => 'agent-' + index;
export const eventKey = (number) => 'event-' + number;
export const SIGNAL_KEY = 'target-signal';
/** The page's reading of the model: nothing here is new information, only grouping, ranking and nesting. */
export function buildSessionView(report) {
    const targets = targetsOf(report);
    const targetByPath = new Map(targets.flatMap((target) => (target.path === undefined ? [] : [[target.path, target.key]])));
    const stories = report.stories.map((story, index) => ({
        story, number: index + 1, targetKey: targetByPath.get(story.path) ?? SIGNAL_KEY,
    }));
    const entryOf = (agent, depth, parentKey, unresolved) => {
        const own = stories.filter(({ story }) => story.agentIndex === agent.index);
        const shapes = report.secretShapes.filter((shape) => shape.agentIndex === agent.index);
        const seen = seenBy(agent, report);
        const worstPerTarget = new Map();
        // A path the agent also saw data from is said once, as data: counting it again as a bare path would contradict it.
        const tierOf = (story) => (seen.files.includes(story.path) && story.outcome === 'succeeded' ? 'value' : storyTier(story));
        for (const { story, targetKey } of own) {
            worstPerTarget.set(targetKey, worstTier([tierOf(story), worstPerTarget.get(targetKey) ?? 'clean']));
        }
        if (shapes.length > 0)
            worstPerTarget.set(SIGNAL_KEY, 'secret');
        const ownTiers = [...own.map(({ story }) => tierOf(story)), ...(seen.saw ? ['value'] : [])];
        const delegation = report.delegations.find((entry) => entry.childAgentIndex === agent.index);
        return {
            kind: 'agent',
            key: agentKey(agent.index),
            agent,
            name: agentName(agent, report),
            root: agent.index === report.graph.main.index,
            depth,
            ...(parentKey === undefined ? {} : { parentKey }),
            unresolved,
            tier: worstTier(ownTiers),
            tiers: ownTiers.length + shapes.length === 0 ? ['clean'] : TIERS.filter((tier) => ownTiers.includes(tier) || (tier === 'secret' && shapes.length > 0)),
            stories: own,
            shapes,
            hits: [...worstPerTarget].map(([targetKey, tier]) => ({ targetKey, tier })),
            unknownActions: actionsFor(agent, report).filter((action) => action.outcome === 'unknown').length,
            ...(delegation === undefined ? {} : { delegation }),
            saw: seen.saw,
            seenFiles: seen.files,
            seenUncertain: seen.uncertain,
        };
    };
    const main = entryOf(report.graph.main, 0, undefined, false);
    const column = columnOf(report, main, entryOf);
    const agents = [main, ...column.filter((entry) => entry.kind === 'agent')];
    const counts = Object.fromEntries(TIERS.map((tier) => [tier, agents.filter((entry) => entry.tiers.includes(tier)).length]));
    const first = report.stories[0]?.agentIndex ?? report.secretShapes.find((shape) => shape.agentIndex !== undefined)?.agentIndex;
    const initial = agents.find((entry) => entry.agent.index === first) ?? main;
    return { main, column, agents, targets: withTouches(targets, stories, agents, report.secretShapes.length), counts, initialKey: initial.key };
}
/**
 * Whether data matching a protected file reached this agent, and which files they matched. Read only from the
 * statements the model already makes - a traced value in a result, a use, a reply - never from a path alone.
 */
function seenBy(agent, report) {
    const files = new Set();
    let uncertain = false;
    const add = (paths, unsure) => {
        paths.forEach((path) => files.add(path));
        if (unsure && paths.length > 1)
            uncertain = true;
    };
    let saw = agent.returned === 'value' || agent.wroteValue === true || agent.wroteOnward === true;
    // X10: values in output the agent's model was handed, from no call the record names, were seen too.
    if (agent.received !== undefined) {
        saw = true;
        add(agent.received, true);
    }
    for (const step of report.flows.find((flow) => flow.agentIndex === agent.index)?.steps ?? []) {
        if (step.kind === 'reached' && step.carriedValue && step.outcome === 'succeeded') {
            saw = true;
            add(step.carriedFrom ?? step.files, true);
        }
        // H5: lines a search printed say which file they are, so nothing about them is uncertain.
        if (step.kind === 'reached' && step.outcome === 'succeeded' && (step.lines?.length ?? 0) > 0) {
            saw = true;
            add((step.lines ?? []).map((line) => line.path), false);
        }
        // S3: a file whose text the call printed says which file it is, as a search's lines do.
        if (step.kind === 'reached' && step.outcome === 'succeeded' && (step.shown?.length ?? 0) > 0) {
            saw = true;
            add(step.shown ?? [], false);
        }
        if (step.kind === 'used') {
            saw = true;
            add(step.files, step.fileUncertain === true);
        }
        if (step.kind === 'delegated' && step.strength === 'value') {
            saw = true;
            add(step.files, false);
        }
    }
    for (const statement of report.returns.filter((entry) => entry.agentIndex === agent.index)) {
        if (statement.strength === 'value')
            add(statement.paths, statement.fileUncertain === true);
        add(statement.writtenFrom, statement.fileUncertain === true);
    }
    return { saw, files: saw ? [...files] : [], uncertain };
}
/**
 * Nesting follows recorded parent links only. An agent with no confident link, or one caught in a cycle, becomes an
 * unresolved root under the main agent; its own confidently linked children stay nested beneath it.
 */
function columnOf(report, main, entryOf) {
    const others = report.graph.agents;
    const known = new Map([report.graph.main, ...others].map((agent) => [agent.index, agent]));
    const linkOf = (agent) => agent.parentIndex !== undefined && agent.parentIndex !== agent.index && known.has(agent.parentIndex) ? agent.parentIndex : undefined;
    const confidentParent = (agent) => {
        const parent = linkOf(agent);
        const seen = new Set();
        let current = parent;
        while (current !== undefined && !seen.has(current)) {
            if (current === agent.index)
                return undefined;
            seen.add(current);
            const next = known.get(current);
            current = next === undefined ? undefined : linkOf(next);
        }
        return parent;
    };
    const children = new Map();
    const roots = [];
    for (const agent of others) {
        const parent = confidentParent(agent);
        if (parent === undefined)
            roots.push(agent);
        else
            children.set(parent, [...(children.get(parent) ?? []), agent]);
    }
    const unresolvedRoots = new Set(roots.map((agent) => agent.index));
    const missingUnder = new Map();
    for (const delegation of report.delegations.filter((entry) => entry.childAgentIndex === undefined)) {
        const parent = delegation.parentAgentIndex !== undefined && known.has(delegation.parentAgentIndex)
            ? delegation.parentAgentIndex : main.agent.index;
        missingUnder.set(parent, [...(missingUnder.get(parent) ?? []), delegation]);
    }
    const rankMemo = new Map();
    const subtreeRank = (agent, trail = new Set()) => {
        const cached = rankMemo.get(agent.index);
        if (cached !== undefined)
            return cached;
        if (trail.has(agent.index))
            return RANK.clean;
        trail.add(agent.index);
        const own = RANK[entryOf(agent, 0, undefined, false).tier];
        const rank = Math.min(own, ...(children.get(agent.index) ?? []).map((child) => subtreeRank(child, trail)));
        rankMemo.set(agent.index, rank);
        return rank;
    };
    const order = (agents) => [...agents].sort((first, second) => subtreeRank(first) - subtreeRank(second) ||
        report.stories.filter((story) => story.agentIndex === second.index).length -
            report.stories.filter((story) => story.agentIndex === first.index).length ||
        second.actions - first.actions || first.index - second.index);
    const column = [];
    const emitted = new Set();
    let missingCount = 0;
    const emitMissing = (parent, depth) => {
        for (const delegation of missingUnder.get(parent) ?? []) {
            column.push({ kind: 'missing', key: 'missing-agent-' + missingCount++, delegation, depth, parentKey: agentKey(parent) });
        }
    };
    const emit = (agent, depth, parentKey) => {
        if (emitted.has(agent.index))
            return;
        emitted.add(agent.index);
        column.push(entryOf(agent, depth, parentKey, unresolvedRoots.has(agent.index)));
        for (const child of order(children.get(agent.index) ?? []))
            emit(child, depth + 1, agentKey(agent.index));
        emitMissing(agent.index, depth + 1);
    };
    const top = order([...(children.get(main.agent.index) ?? []), ...roots]);
    for (const agent of top)
        emit(agent, 1, main.key);
    emitMissing(main.agent.index, 1);
    // Anything a malformed structure kept out of reach is still an agent, so it is still drawn.
    for (const agent of others) {
        if (!emitted.has(agent.index)) {
            unresolvedRoots.add(agent.index);
            emit(agent, 1, main.key);
        }
    }
    return column;
}
function targetsOf(report) {
    const paths = [...new Set(report.stories.map((story) => story.path))];
    const names = paths.map((path) => path.split('/').filter((part) => part !== ''));
    const files = paths.map((path, index) => ({
        key: 'target-' + index,
        kind: 'file',
        ...labelOf(names[index] ?? [], names, index),
        path,
        tier: worstTier(report.stories.filter((story) => story.path === path).map(storyTier)),
        touches: [],
        patterns: [...new Set(report.findings.filter((finding) => finding.path === path).map((finding) => finding.pattern))],
    }));
    if (report.secretShapes.length === 0)
        return files;
    // The signal entry is named by the page's own dictionary, so the title here is never rendered.
    return [...files, { key: SIGNAL_KEY, kind: 'signal', title: '', name: '', context: '', tier: 'secret', touches: [], patterns: [] }];
}
/**
 * How a file is labelled: its **name**, plus only as much directory as it takes to tell it from every other path
 * on the page. The two are kept apart because they are read differently - a reader scans the names and consults
 * the directory only when two of them are alike. Joined into one string, a long directory hides the name at the
 * end of it, which is what `packages/ticket-widget/.env` does to `.env`.
 */
function labelOf(parts, all, index) {
    const name = parts.at(-1) ?? '';
    const depth = distinctDepth(parts, all.filter((_other, position) => position !== index));
    return { title: parts.slice(parts.length - depth).join('/'), name, context: elide(parts.slice(parts.length - depth, -1)) };
}
/**
 * A directory shown as context. The first segment is the one that makes the label unique and the last is the
 * folder the file actually sits in; what lies between is what a reader skips. It is elided rather than dropped,
 * because dropping it would make two different directories look like the same one.
 */
function elide(segments) {
    if (segments.length <= 2)
        return segments.join('/');
    return `${segments[0]}/…/${segments.at(-1)}`;
}
function withTouches(targets, stories, agents, totalShapes) {
    return targets.map((target) => {
        if (target.kind === 'file') {
            const touches = stories.filter((entry) => entry.targetKey === target.key).map((entry) => {
                const agent = agents.find((candidate) => candidate.agent.index === entry.story.agentIndex);
                const tier = agent?.seenFiles.includes(entry.story.path) === true && entry.story.outcome === 'succeeded' ? 'value' : storyTier(entry.story);
                return { ...(agent === undefined ? {} : { agentKey: agent.key }), tier, count: entry.story.occurrences, story: entry };
            });
            return { ...target, tier: worstTier([target.tier, ...touches.map((touch) => touch.tier)]), touches };
        }
        const touches = agents.filter((agent) => agent.shapes.length > 0)
            .map((agent) => ({ agentKey: agent.key, tier: 'secret', count: agent.shapes.length }));
        // A result whose agent could not be established still carried the signal; it is counted, not dropped.
        const unattributed = totalShapes - touches.reduce((sum, touch) => sum + touch.count, 0);
        return { ...target, touches: unattributed > 0 ? [...touches, { tier: 'secret', count: unattributed }] : touches };
    });
}
