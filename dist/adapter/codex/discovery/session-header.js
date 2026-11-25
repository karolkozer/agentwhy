import { FileAccessError } from '../../../ports/file-access-error.js';
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { THREAD_SPAWN } from '../contract/delegations.js';
import { REVIEWER } from '../contract/reviews.js';
import { HISTORY_BASE, HISTORY_MODES, SESSION } from '../contract/session.js';
/** Whether a file is the sequel of the thread its own id names (XD10): the one case a shared id is no duplicate. */
export function continuesOwnThread(header) {
    return header.continues !== undefined && header.continues.threadId === header.id && header.id !== '';
}
/** X2: the first physical line decides recognition. A later metadata line cannot rescue an unknown file. */
export async function readSessionHeader(files, path) {
    try {
        for await (const text of files.readLines(path)) {
            const header = headerIn(text);
            return header === undefined ? { kind: 'unknown' } : { kind: 'recognised', header };
        }
        return { kind: 'unknown' };
    }
    catch (error) {
        if (error instanceof FileAccessError)
            return { kind: 'unavailable', reason: error.failure };
        throw error;
    }
}
function headerIn(text) {
    const line = parseJsonObject(text);
    if (line?.[SESSION.lineType] !== SESSION.metadataType)
        return undefined;
    const payload = line[SESSION.payload];
    if (!isJsonObject(payload))
        return undefined;
    const id = payload[SESSION.id];
    if (typeof id !== 'string')
        return undefined;
    const issues = [];
    if (id === '')
        issues.push('empty-session-id');
    const directory = payload[SESSION.workingDirectory];
    const project = typeof directory === 'string' && directory !== '' ? directory : undefined;
    if (project === undefined)
        issues.push('project-missing');
    const parentId = payload[SESSION.parentId];
    const parent = !(SESSION.parentId in payload)
        ? { kind: 'root' }
        : typeof parentId === 'string' && parentId !== ''
            ? { kind: 'parent', id: parentId }
            : { kind: 'unknown' };
    if (parent.kind === 'unknown')
        issues.push('parent-invalid');
    const historyMode = HISTORY_MODES.find((mode) => payload[SESSION.historyMode] === mode) ?? 'unknown';
    if (historyMode === 'unknown')
        issues.push('history-unrecognised');
    const version = payload[SESSION.version];
    const continues = continuationOf(payload[HISTORY_BASE.key]);
    return {
        id,
        parent,
        ...(project === undefined ? {} : { project }),
        historyMode,
        ...(typeof version === 'string' ? { version } : {}),
        origin: originOf(payload[SESSION.source]),
        issues,
        ...(continues === undefined ? {} : { continues }),
    };
}
/** `history_base` as measured (§2.14): the thread continued, and where its history ends in the file before. */
function continuationOf(base) {
    if (!isJsonObject(base))
        return undefined;
    const threadId = base[HISTORY_BASE.threadId];
    if (typeof threadId !== 'string' || threadId === '')
        return undefined;
    const offset = base[HISTORY_BASE.endByteOffset];
    const ordinal = base[HISTORY_BASE.endOrdinalExclusive];
    return {
        threadId,
        ...(typeof offset === 'number' && Number.isInteger(offset) && offset >= 0 ? { endByteOffset: offset } : {}),
        ...(typeof ordinal === 'number' && Number.isInteger(ordinal) && ordinal >= 0 ? { endOrdinalExclusive: ordinal } : {}),
    };
}
function originOf(source) {
    if (typeof source === 'string')
        return { kind: 'person' };
    const subagent = isJsonObject(source) ? source[THREAD_SPAWN.subagent] : undefined;
    if (!isJsonObject(subagent))
        return { kind: 'unknown' };
    if (subagent[REVIEWER.other] === REVIEWER.guardian)
        return { kind: 'reviewer' };
    const spawn = subagent[THREAD_SPAWN.threadSpawn];
    return isJsonObject(spawn) ? { kind: 'spawned', ...spawnFacts(spawn) } : { kind: 'unknown' };
}
function spawnFacts(spawn) {
    const text = (key) => {
        const value = spawn[key];
        return typeof value === 'string' && value !== '' ? value : undefined;
    };
    const depth = spawn[THREAD_SPAWN.depth];
    const spawnedBy = text(THREAD_SPAWN.parentId);
    const agentPath = text(THREAD_SPAWN.agentPath);
    const role = text(THREAD_SPAWN.role);
    return {
        ...(spawnedBy === undefined ? {} : { spawnedBy }),
        ...(typeof depth === 'number' && Number.isInteger(depth) && depth >= 0 ? { depth } : {}),
        ...(agentPath === undefined ? {} : { agentPath }),
        ...(role === undefined ? {} : { role }),
    };
}
