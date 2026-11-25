const GROUPS = { attention: true, fixed: true, tracked: true, stopped: true, seen: true, none: true, partly: true, failed: true };
const LOOKS = {
    read: true, guard: true, fixed: true, allowed: true, opened: true, name: true, stopped: true, none: true, unchecked: true, failed: true, outside: true, checking: true,
};
const isFields = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isText = (value) => typeof value === 'string';
const isMaybe = (value, is) => value === undefined || is(value);
const counts = (value, names) => isFields(value) && names.every((name) => isCount(value[name]));
const isEach = (value, is) => Array.isArray(value) && value.every(is);
/**
 * Whether what a page server answered is a list as this agentwhy draws one, every field of it (CV17). A server may be a newer
 * agentwhy's (PF7): its answer is taken whole or not at all, never half understood.
 */
export function isListAnswer(value, scope) {
    return isList(value, scope) && isMaybe(value['beside'], (one) => isList(one, scope));
}
function isList(value, scope) {
    return isFields(value) && value['about'] === 'list' && value['scope'] === scope && isMaybe(value['list'], (one) => one === 'outside' || one === 'projects') &&
        isText(value['asked']) && counts(value['checked'], ['read', 'of']) && isMaybe(value['reading'], (one) => one === true) && isMaybe(value['newestRead'], isCount) && counts(value['groups'], Object.keys(GROUPS)) &&
        counts(value, ['recent', 'rowsMore', 'oftenMore', 'namedOnly']) && isEach(value['rows'], isRow) && isEach(value['often'], isOften);
}
const isRelative = (value) => value === 'today' || value === 'yesterday';
const FILES = { read: true, changed: true, unknown: true, opened: true, stopped: true, name: true };
const HELD = { terminal: true, editor: true, desktop: true, script: true };
const isRow = (value) => isFields(value) && isText(value['key']) && isText(value['ref']) && typeof value['report'] === 'boolean' && isMaybe(value['title'], isText) && isText(value['provider']) &&
    counts(value['day'], ['year', 'month', 'day']) && isMaybe(value['relative'], isRelative) && isText(value['time']) && isMaybe(value['held'], (one) => Object.hasOwn(HELD, String(one))) &&
    Object.hasOwn(LOOKS, String(value['look'])) && Object.hasOwn(GROUPS, String(value['group'])) && isCount(value['read']) &&
    counts(value['files'], Object.keys(FILES)) && isMaybe(value['all'], isCount) && isCount(value['helpers']) && isMaybe(value['project'], isText);
const isOften = (value) => isFields(value) && isText(value['path']) && isMaybe(value['place'], (one) => one === 'outside' || one === 'elsewhere') &&
    counts(value, ['wanted', 'read', 'changed', 'opened', 'stopped', 'named', 'unknown', 'conversations']) && typeof value['tracked'] === 'boolean' && isMaybe(value['project'], isText);
