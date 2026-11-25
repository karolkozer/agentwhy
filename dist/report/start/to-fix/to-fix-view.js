import { resultAllowed } from '../../check/marks.js';
import { matchesGlob } from '../../../core/policy/glob.js';
import { privateKey, ruleKey } from '../../render/report-page/item-names.js';
import { NOTHING_READ, toDoItem } from '../../render/report-page/to-do.js';
import { localClock } from '../../render/ui/local-date.js';
import { ruleNameOf } from '../../rule-names.js';
const GROUP_OF = {
    rotate: 'keys',
    template: 'look',
    // D1: an outcome nobody recorded is looked at, like a sample file, and closed as handled.
    unknown: 'look',
    route: 'seen',
    result: 'seen',
};
/**
 * T14: the buttons a file's window offers, in the order they are drawn, each the mark it writes. Only those
 * `resultAllowed` lets a line take are offered: a file a key was read from is closed as rotated and nothing else.
 */
const RESULTS_OF = {
    rotate: ['rotated'],
    template: ['not-secret', 'rotated'],
    unknown: ['handled'],
    route: [],
    result: [],
};
/**
 * T14: the one mark besides the wizard's Done: a sample file's "No real keys here", an unrecorded outcome's "I checked
 * it", a file with no key in it "Nothing private in it" - each only where its line may take it.
 */
const SKIP_OF = {
    rotate: (item, allowed) => (item.kind === 'data' && allowed('not-private') ? 'not-private' : null),
    template: (_item, allowed) => (allowed('not-secret') ? 'not-secret' : null),
    // A file with no key in it is closed as handled by the wizard's Done already; its skip is the one left.
    unknown: (item, allowed) => (item.kind === 'data' ? (allowed('not-private') ? 'not-private' : null) : allowed('handled') ? 'handled' : null),
    route: () => null,
    result: () => null,
};
export function toFixView(index) {
    const clock = localClock(index.timeZone ?? 'UTC');
    const today = clock(index.now).day.number;
    const when = (at) => {
        const { day, time } = clock(at);
        const relative = day.number === today ? 'today' : day.number === today - 1 ? 'yesterday' : undefined;
        return { at, day, time, ...(relative === undefined ? {} : { relative }) };
    };
    const patterns = index.settings?.protected ?? [];
    // FNB24: a path that is the very folder one of these rules holds is named a folder, as the report's row names it.
    const folderOf = (path) => patterns.some((each) => privateKey(path, each) === 'rp.item.privateFolder') ? { folder: true } : {};
    const byName = new Map(index.entries.map((entry) => [entry.name, entry]));
    const check = index.check;
    const file = (row) => {
        const name = ruleNameOf(row.path, patterns);
        const conversations = row.sessions
            .flatMap((session) => {
            const entry = byName.get(session);
            return entry === undefined ? [] : [{
                    entry,
                    when: when(entry.lastActive),
                    ...(entry.report.kind === 'generated' ? { report: entry.report.file } : {}),
                }];
        })
            .sort((a, b) => b.when.at - a.when.at);
        // A key was read from it, so "No real keys" would contradict what the record holds: only rotated closes it,
        // though the server would take not-secret for any sample file (`resultAllowed`).
        const allowed = (result) => resultAllowed(row, result) && !(row.keyed === true && result === 'not-secret');
        // The built-in rule's own pattern names the file for the wizard (F45): a rule's file holds keys.
        const pattern = patterns.find((each) => ruleKey(each) !== undefined && matchesGlob(row.path, each));
        const item = toDoItem(row.path, row.read ?? NOTHING_READ, {
            template: row.label === 'template',
            further: false,
            readers: 1,
            ...(pattern === undefined ? {} : { pattern: pattern }),
        });
        const told = conversations.flatMap((conversation) => {
            const stories = conversation.entry.report.kind === 'generated' ? conversation.entry.report.stories : undefined;
            const story = stories?.files.get(row.path);
            return story === undefined || stories === undefined ? [] : [{ story, sessionId: stories.sessionId, conversation }];
        })[0];
        return {
            path: row.path,
            ...(row.project === undefined ? {} : { project: row.project }),
            label: row.label,
            ...(told === undefined ? {} : { story: told }),
            ...(name === undefined ? folderOf(row.path) : { name }),
            ...(row.reopened === undefined ? {} : { reopened: when(row.reopened.at) }),
            results: RESULTS_OF[row.label].filter(allowed),
            item,
            skip: SKIP_OF[row.label](item, allowed),
            conversations,
            count: row.sessions.length,
        };
    };
    const rows = (check?.rows ?? []).map((row) => ({ row, fix: file(row) }));
    const inGroup = (group) => rows.filter(({ row }) => GROUP_OF[row.label] === group).map(({ fix }) => fix).sort(byUrgency);
    const keys = inGroup('keys');
    const look = inGroup('look');
    const done = (check?.history ?? [])
        .filter((line) => line.status === 'standing' && !line.reopened)
        .map((line) => {
        const name = ruleNameOf(line.path, patterns);
        return {
            path: line.path,
            ...(line.project === undefined ? {} : { project: line.project }),
            label: line.label,
            ...(name === undefined ? folderOf(line.path) : { name }),
            result: line.result,
            when: when(line.at),
            ...(line.note === undefined ? {} : { note: line.note }),
        };
    })
        .sort((a, b) => b.when.at - a.when.at);
    return {
        keys,
        look,
        seen: inGroup('seen'),
        done,
        refusedAttempts: check?.refusedAttempts ?? 0,
        state: keys.length > 0 ? 'keys' : look.length > 0 ? 'look' : 'none',
        total: keys.length + look.length,
        marksUnreadable: check?.marksUnreadable === true,
    };
}
/**
 * T8: the files more conversations reached first, as the design orders them, then by path so the order is stable - and
 * on the computer's page, one path in two projects by the project's name (GD18).
 */
function byUrgency(a, b) {
    if (a.count !== b.count)
        return b.count - a.count;
    if (a.path !== b.path)
        return a.path < b.path ? -1 : 1;
    const [one, other] = [a.project?.name ?? '', b.project?.name ?? ''];
    return one < other ? -1 : one > other ? 1 : 0;
}
