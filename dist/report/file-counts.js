import { filesOfCall, toldPatterns } from './runs.js';
/** How many times an AI wanted the file itself: never a name only seen. */
export const wanted = (count) => count.read + count.changed + count.opened + count.unknown + count.stopped;
/** Most wanted first, then most named, then by name. */
export const byWanted = (one, other) => wanted(other) - wanted(one) || other.named - one.named || (one.path < other.path ? -1 : 1);
/**
 * Counted from every call of the record: a step keeps `RUN_FILES_KEPT` files and a page `RUN_STEPS_KEPT` steps, so a count made
 * from those is short (CVB14). What a call did to a file is `filesOfCall`'s answer, the steps' own.
 */
export function fileCounts(model, accesses, policy, redactor, where = {}) {
    const told = toldPatterns(policy);
    const byEvent = new Map();
    for (const access of accesses)
        byEvent.set(access.eventId, [...(byEvent.get(access.eventId) ?? []), access]);
    const handedOver = new Set(model.delegations.map((delegation) => delegation.id));
    const rows = new Map();
    for (const event of model.events) {
        const met = byEvent.get(event.id);
        if (met === undefined || handedOver.has(event.id))
            continue;
        for (const file of filesOfCall(event, met, policy, redactor, where, told)) {
            if (file.private === 0)
                continue;
            const row = rows.get(file.path) ?? counting(file.path);
            rows.set(file.path, row);
            row[file.how] += 1;
            row.held += file.private;
            row.told += file.tracked;
            row.who.add(event.agentId);
            if (event.agentId !== model.sessionId)
                row.helpers += 1;
            if (file.how === 'stopped') {
                const by = event.result?.refusedBy ?? 'rule';
                row.stoppedBy[by] = (row.stoppedBy[by] ?? 0) + 1;
            }
        }
    }
    return [...rows.values()].map(({ held, told: tracked, who, ...row }) => ({ ...row, tracked: held === tracked, agents: who.size })).sort(byWanted);
}
const counting = (path) => ({
    path, read: 0, changed: 0, opened: 0, named: 0, unknown: 0, stopped: 0, stoppedBy: {}, helpers: 0, held: 0, told: 0, who: new Set(),
});
