import { readsOf, valuesRead } from '../flow-reads.js';
import { weakensProtection } from '../guard-changes.js';
/**
 * Whether a file read holds keys, as far as what was read says: a recognised key format, or a read shared with another
 * protected file, whose keys may be this one's (`PrivateFile.mixed`). The to-do list and the marks decide by this alone.
 */
export function holdsKeys(file) {
    return file.keys.length > 0 || file.mixed === true;
}
/** Names a file kept as an example rather than as configuration. A convention, matched on the name and nothing else. */
const TEMPLATE = /\.(example|sample|template|dist)$/;
/** Whether a path is named as a template (R12c): the one test the check and the report page share. */
export function isTemplate(path) {
    return TEMPLATE.test(path);
}
export function actionsOf(report) {
    const rotate = new Set();
    const texts = new Set();
    for (const flow of report.flows) {
        for (const step of flow.steps) {
            // H7: a file whose text reached the agent - a traced value, or lines a search printed - is to see to.
            if (step.kind === 'reached' && step.toolKnown && step.outcome === 'succeeded')
                for (const file of valuesRead(step))
                    rotate.add(file);
            // CT10: and a file whose own lines a call of any tool showed it.
            if (step.kind === 'reached')
                for (const file of readsOf(step))
                    texts.add(file);
            // X10: a value its model was handed from code it wrote, which no call of its returned, is read all the same.
            if (step.kind === 'received')
                for (const file of step.files)
                    rotate.add(file);
        }
    }
    for (const statement of report.returns) {
        if (statement.strength === 'value')
            for (const file of statement.paths)
                rotate.add(file);
        for (const file of statement.writtenFrom)
            rotate.add(file);
    }
    const patternOf = new Map(report.findings.map((finding) => [finding.path, finding.pattern]));
    const toldPaths = new Set(report.findings.filter((finding) => finding.told === true).map((finding) => finding.path));
    const routes = new Map();
    const named = new Set();
    // A call whose tool the adapter does not know is a mention, wherever the path sat: there is no profile saying that
    // this tool addresses a file, so its text was searched for want of one. Found by running `check` on real sessions,
    // where messages between agents were reported as routes to `.env`.
    const reaching = report.stories.filter((story) => story.toolKnown);
    // CT10: unless its output held the file's own lines - then it read the file, and is no mention of it.
    const readByText = report.stories.filter((story) => !story.toolKnown && story.outcome === 'succeeded' && story.read === true);
    const mentions = new Set(report.stories.filter((story) => !story.toolKnown && story.read !== true).map((story) => story.path));
    for (const story of reaching) {
        if (story.outcome !== 'succeeded' || story.source !== 'input' || toldPaths.has(story.path))
            continue;
        named.add(story.path);
        const key = `${story.path}\u0000${story.did}`;
        const pattern = patternOf.get(story.path);
        const known = routes.get(key);
        routes.set(key, {
            path: story.path,
            did: story.did,
            ...(pattern === undefined ? {} : { pattern }),
            occurrences: (known?.occurrences ?? 0) + story.occurrences,
        });
    }
    const onlyInResults = new Set(reaching
        .filter((story) => story.outcome === 'succeeded' && story.source === 'result' && !named.has(story.path) && !toldPaths.has(story.path))
        .map((story) => story.path));
    const keyed = new Set(report.privateFiles.filter(holdsKeys).map((file) => file.path));
    const readOf = new Map(report.privateFiles.map((file) => [file.path, readOfFile(file)]));
    return {
        policy: report.scope.policy.origin,
        // F57a, amended 2026-10-02 by the maintainer: a told file's contents were read because the person let them be, keys
        // included - they chose Track for it - so nothing about it is to fix. It stays on `told`, said and never asked for.
        rotate: [...rotate].filter((path) => !toldPaths.has(path)).sort().map((path) => {
            const read = readOf.get(path);
            return { path, template: TEMPLATE.test(path), ...(keyed.has(path) ? { keyed: true } : {}), ...(read === undefined ? {} : { read }) };
        }),
        ...(() => {
            const read = [...texts].filter((path) => !toldPaths.has(path) && !rotate.has(path)).sort();
            return read.length === 0 ? {} : { read };
        })(),
        openRoutes: [...routes.values()],
        ...(toldPaths.size === 0 ? {} : { told: [...new Set([...reaching, ...readByText].filter((story) => story.outcome === 'succeeded' && toldPaths.has(story.path)).map((story) => story.path))].sort() }),
        onlyInResults: [...onlyInResults].sort(),
        unknown: [...new Set(reaching.filter((story) => story.outcome === 'unknown').map((story) => story.path))].sort(),
        refusedAttempts: report.tally.refusedAttempts,
        ...(report.tally.refusedByOthers === undefined ? {} : { refusedByOthers: report.tally.refusedByOthers }),
        secretShapes: report.secretShapes.flatMap((finding) => finding.classes),
        mentions: mentions.size,
        ...(() => {
            const guarded = [...new Set((report.guardChanges ?? []).filter(weakensProtection).map((change) => change.path))].sort();
            return guarded.length === 0 ? {} : { guardChanged: guarded };
        })(),
    };
}
/** A file's read, where it left anything to name. */
function readOfFile(file) {
    if (file.keys.length === 0 && file.names.length === 0 && file.keyed.length === 0 && file.mixed !== true)
        return undefined;
    return { keys: file.keys, names: file.names, keyed: file.keyed, ...(file.mixed === true ? { mixed: true } : {}) };
}
