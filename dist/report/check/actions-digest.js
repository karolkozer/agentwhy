import { byString } from '../../shared/compare.js';
import { sumRefusedByOthers } from '../refusals.js';
/** Merges per-session actions by path and route. Most sessions first, then by name, so the order is stable. */
export function digestOf(actions, context) {
    const rotate = new PathCounts();
    const templates = new Set();
    const onlyInResults = new PathCounts();
    const unknown = new PathCounts();
    const guardChanged = new PathCounts();
    const routes = new Map();
    const shapes = new Map();
    for (const session of actions) {
        for (const file of session.rotate) {
            rotate.add(file.path);
            if (file.template)
                templates.add(file.path);
        }
        for (const path of new Set(session.onlyInResults))
            onlyInResults.add(path);
        for (const path of new Set(session.unknown))
            unknown.add(path);
        for (const path of new Set(session.guardChanged ?? []))
            guardChanged.add(path);
        for (const route of session.openRoutes) {
            const key = `${route.path}\u0000${route.did}`;
            const known = routes.get(key);
            routes.set(key, {
                route: { path: route.path, did: route.did, ...(route.pattern === undefined ? {} : { pattern: route.pattern }), sessions: 0, occurrences: 0 },
                sessions: (known?.sessions ?? 0) + 1,
                occurrences: (known?.occurrences ?? 0) + route.occurrences,
            });
        }
        for (const name of session.secretShapes)
            shapes.set(name, (shapes.get(name) ?? 0) + 1);
    }
    const first = actions[0];
    const byOthers = sumRefusedByOthers(actions.map((session) => session.refusedByOthers));
    return {
        asked: context.asked,
        sessionsRead: actions.length,
        sessionsUnreadable: context.sessionsUnreadable,
        policyKind: context.policyKind,
        ...(first === undefined ? {} : { policy: first.policy }),
        rotate: rotate.sorted().map((entry) => (templates.has(entry.path) ? { ...entry, template: true } : entry)),
        openRoutes: [...routes.values()]
            .map(({ route, sessions, occurrences }) => ({ ...route, sessions, occurrences }))
            .sort((a, b) => b.sessions - a.sessions || b.occurrences - a.occurrences || byString(a.path, b.path) || byString(a.did, b.did)),
        onlyInResults: onlyInResults.sorted(),
        unknown: unknown.sorted(),
        refusedAttempts: actions.reduce((sum, session) => sum + session.refusedAttempts, 0),
        ...(byOthers === undefined ? {} : { refusedByOthers: byOthers }),
        secretShapes: [...shapes].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byString(a.name, b.name)),
        mentions: actions.reduce((sum, session) => sum + session.mentions, 0),
        ...(guardChanged.sorted().length === 0 ? {} : { guardChanged: guardChanged.sorted() }),
        ...(context.marks === undefined ? {} : { marks: context.marks }),
    };
}
export function asksOf(digest) {
    const files = new Set([
        ...digest.rotate.map((entry) => entry.path),
        ...digest.openRoutes.map((route) => route.path),
        ...digest.onlyInResults.map((entry) => entry.path),
        ...digest.unknown.map((entry) => entry.path),
        ...(digest.guardChanged ?? []).map((entry) => entry.path),
    ]);
    return { rotate: digest.rotate.length, files: files.size, shapes: digest.secretShapes.length, unreadable: digest.sessionsUnreadable };
}
/**
 * Whether anything in the digest asks a person to act. Refusals alone do not: they are the rules holding. An unknown
 * outcome does: it is a question the transcript could not answer. Read from `asksOf`, so the two never disagree.
 */
export function needsAction(digest) {
    const asks = asksOf(digest);
    return asks.files > 0 || asks.shapes > 0;
}
/** How many sessions each path appeared in, most first. */
class PathCounts {
    #counts = new Map();
    add(key) {
        this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
    }
    sorted() {
        return [...this.#counts]
            .map(([path, sessions]) => ({ path, sessions }))
            .sort((a, b) => b.sessions - a.sessions || byString(a.path, b.path));
    }
}
