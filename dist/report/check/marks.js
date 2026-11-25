/** The mark that stands for each path: the last mark of it, unless an unmark came after (R34). */
export function standingMarks(records) {
    const standing = new Map();
    for (const record of records) {
        if (record.kind === 'mark')
            standing.set(record.path, record);
        else
            standing.delete(record.path);
    }
    return standing;
}
/** Every mark ever made, newest first, with what became of it - the record shows what was done and undone (R34, R36). */
export function markLines(records) {
    const lines = [];
    const open = new Map();
    for (const record of records) {
        const previous = open.get(record.path);
        if (previous !== undefined) {
            previous.status = record.kind === 'mark' ? 'replaced' : 'undone';
            previous.endedAt = record.at;
            open.delete(record.path);
        }
        if (record.kind === 'mark') {
            const line = { mark: record, status: 'standing' };
            lines.push(line);
            open.set(record.path, line);
        }
    }
    return lines.sort((a, b) => b.mark.at - a.mark.at);
}
/**
 * A session's actions without the files a standing mark covers - when the session was last active no later than the
 * mark. A session active after it keeps the file, so a file reached again comes back, counted in the sessions since
 * (R35). Refusals, key shapes and mentions name no file and are kept whole.
 */
export function actionsAfterMarks(actions, lastActive, marks) {
    const hidden = (path) => {
        const mark = marks.get(path);
        return mark !== undefined && lastActive <= mark.at;
    };
    return {
        ...actions,
        rotate: actions.rotate.filter((file) => !hidden(file.path)),
        openRoutes: actions.openRoutes.filter((route) => !hidden(route.path)),
        onlyInResults: actions.onlyInResults.filter((path) => !hidden(path)),
        unknown: actions.unknown.filter((path) => !hidden(path)),
    };
}
/** The paths a session's actions name, whatever the label. */
export function pathsOf(actions) {
    return new Set([
        ...actions.rotate.map((file) => file.path),
        ...actions.openRoutes.map((route) => route.path),
        ...actions.onlyInResults,
        ...actions.unknown,
    ]);
}
/**
 * What the marks did to a range: how many standing marks took a file out of it entirely, and which marked files a
 * later session brought back (R35). Only marks whose file this range reached at all are counted.
 */
export function marksInRange(before, after, standing) {
    const reached = new Set(before.flatMap((actions) => [...pathsOf(actions)]));
    const still = new Set(after.flatMap((actions) => [...pathsOf(actions)]));
    const inRange = [...standing.values()].filter((mark) => reached.has(mark.path));
    return {
        done: inRange.filter((mark) => !still.has(mark.path)).length,
        reopened: inRange.filter((mark) => still.has(mark.path)),
    };
}
/**
 * A result means something only for some lines (R31, F25, F50): a key that was in an agent's context is not cleared by
 * calling it fake, and a file a key was read from is not closed as "handled" or "not private" - the key is what has to
 * change. *Rotated* fits every line; *not a real secret* a template's.
 */
export function resultAllowed(row, result) {
    if (result === 'rotated')
        return true;
    if (result === 'not-secret')
        return row.label === 'template';
    return row.keyed !== true;
}
/** The longest note kept, in characters. A note says what was done; it is not a place for a key. */
export const NOTE_LIMIT = 200;
