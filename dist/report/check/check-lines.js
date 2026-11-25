import { NAMES_PER_FILE } from '../report-model.js';
import { refusedByRule } from '../refusals.js';
const ORDER = ['rotate', 'template', 'unknown', 'route', 'result'];
/**
 * The labels that ask a person to do something: a key to change, a template to confirm, an outcome nobody recorded.
 * The other two say where a path went and ask for nothing. Every page that counts what is left to do counts these.
 */
export const TO_DO_LABELS = ['rotate', 'template', 'unknown'];
/**
 * `sessions` are expected with marked files already taken out (`actionsAfterMarks`), so a line here is still to do;
 * `marks` then says which of them had been marked, and lists the history.
 */
export function checkWithMarks(sessions, marks) {
    const base = checkOf(sessions);
    const rows = base.rows.map((row) => {
        const mark = marks.standing.get(row.path);
        return mark === undefined ? row : { ...row, reopened: { result: mark.result, at: mark.at } };
    });
    const open = new Set(rows.map((row) => row.path));
    const history = marks.lines.map(({ mark, status, endedAt }) => ({
        path: mark.path,
        label: mark.label,
        result: mark.result,
        at: mark.at,
        ...(marks.keepNotes && mark.note !== undefined && mark.note !== '' ? { note: mark.note } : {}),
        sessions: mark.sessions.flatMap((id) => {
            const name = marks.nameOf(id);
            return name === undefined ? [] : [name];
        }),
        status,
        ...(endedAt === undefined ? {} : { endedAt }),
        reopened: status === 'standing' && open.has(mark.path),
    }));
    return { ...base, rows, history, marksUnreadable: marks.unreadable };
}
export function checkOf(sessions) {
    const found = new Map();
    const note = (path, label, name, keyed = false, read) => {
        const rank = ORDER.indexOf(label);
        const row = found.get(path);
        if (row === undefined) {
            found.set(path, { rank, sessions: [name], keyed, ...(read === undefined ? {} : { read }) });
            return;
        }
        row.rank = Math.min(row.rank, rank);
        // One session that read a key from it is enough: the key is what has to be changed.
        row.keyed ||= keyed;
        if (read !== undefined)
            row.read = row.read === undefined ? read : mergeReads(row.read, read);
        if (!row.sessions.includes(name))
            row.sessions.push(name);
    };
    for (const { name, actions } of sessions) {
        for (const file of actions.rotate)
            note(file.path, file.template ? 'template' : 'rotate', name, file.keyed === true, file.read);
        for (const path of actions.unknown)
            note(path, 'unknown', name);
        for (const route of actions.openRoutes)
            note(route.path, 'route', name);
        for (const path of actions.onlyInResults)
            note(path, 'result', name);
    }
    const rows = [...found.entries()]
        .map(([path, row]) => ({ label: ORDER[row.rank] ?? 'result', path, sessions: row.sessions, rank: row.rank, keyed: row.keyed, read: row.read }))
        .sort((a, b) => a.rank - b.rank || b.sessions.length - a.sessions.length || a.path.localeCompare(b.path))
        .map(({ label, path, sessions: names, keyed, read }) => ({
        label,
        path,
        sessions: names,
        ...(keyed ? { keyed: true } : {}),
        ...(read === undefined ? {} : { read }),
    }));
    return {
        counted: sessions.map(({ name }) => name),
        rows,
        refusedAttempts: sessions.reduce((sum, { actions }) => sum + refusedByRule(actions.refusedAttempts, actions.refusedByOthers), 0),
    };
}
/** Two sessions' reads of one file: every key format and line either saw, in the order first seen. */
function mergeReads(a, b) {
    const keyed = new Map([...a.keyed, ...b.keyed].map((line) => [line.name + '\u0000' + line.key, line]));
    return {
        keys: [...new Set([...a.keys, ...b.keys])],
        names: [...new Set([...a.names, ...b.names])].slice(0, NAMES_PER_FILE),
        keyed: [...keyed.values()].slice(0, NAMES_PER_FILE),
        ...(a.mixed === true || b.mixed === true ? { mixed: true } : {}),
    };
}
