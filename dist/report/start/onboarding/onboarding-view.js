import { projectName } from '../app-nav.js';
import { statusOf } from '../render/session-status.js';
import { patternShort } from '../settings/files-tab.js';
import { settingsView } from '../settings/settings-view.js';
import { toFixView } from '../to-fix/to-fix-view.js';
/**
 * What the onboarding shows, decided from the index (`.ai/specs/2026-09-24-onboarding.md`; plan step 2). No HTML:
 * every screen's state is chosen here, and the page only writes it. What is in force is Settings' own reading of the
 * files (`settingsView`), and what is to fix is To fix's (`toFixView`), so the three pages never disagree.
 */
/** W18: how many files Done names before "+{n} more on your To fix list". */
const DONE_FILES = 3;
/**
 * What Finish compares the choices with, from the settings as the files hold them: read when the page is drawn, and
 * read again by the server at Finish (W15), so a choice made in another tab since is never written over.
 */
export function inForceOf(settings) {
    const view = settingsView(settings);
    return {
        watch: settings.hooks?.watch ?? false,
        refuse: settings.hooks?.refuse ?? false,
        stopped: view.stopped.on,
        fine: view.fine.on,
        protected: settings.protected,
        rows: view.rows.map((row) => ({
            key: rowKey(row),
            mode: row.mode,
            watched: row.watched,
            ruled: row.watched && row.patterns.every((pattern) => deniedIn(settings, pattern)),
            switchable: row.switchTo !== undefined,
            patterns: row.patterns,
        })),
        canWrite: view.canWrite,
        canAdd: view.canAdd,
        canTell: view.canTell,
        noticesWritable: view.noticesWritable,
        hideKeys: settings.hooks?.hideKeys === true,
        hideKeysLacksWriteCheck: settings.hooks?.hideKeysLacksWriteCheck === true,
    };
}
/**
 * A pattern either settings file denies - Claude Code applies both (R4d) - or one whose rules could not be read, where
 * nothing is claimed and nothing written (K2).
 */
export function deniedIn(settings, pattern) {
    return settings.held === undefined || settings.held.local.includes(pattern) || settings.held.shared.includes(pattern);
}
/** What the page and the server find a row of Private files by: the group's name, or its first pattern (W12a). */
export function rowKey(row) {
    return row.name ?? row.patterns[0] ?? '';
}
/** `undefined` where there is nothing to set up from: a shared page, or one with no settings behind it (W1). */
export function onboardingView(index) {
    if (index.shared || index.settings === undefined)
        return undefined;
    const settings = settingsView(index.settings);
    const fix = toFixView(index);
    const files = [...fix.keys, ...fix.look].slice(0, DONE_FILES);
    const generated = index.entries.filter((entry) => entry.report.kind === 'generated');
    return {
        intro: index.onboarding?.intro === true,
        setUp: index.onboarding?.setUp === true,
        atProject: index.onboarding?.atProject === true,
        project: projectOf(index, fix.total),
        ...(index.projects === undefined ? {} : { projects: index.projects }),
        // F56: one answer for who it is all for; where the files hold both, or nothing yet, Just me.
        who: settings.scope === 'shared' ? 'shared' : 'local',
        files: { rows: settings.rows, canAdd: settings.canAdd, canTell: settings.canTell },
        messages: {
            // Row 1 starts on where it can be written: it is what `init` ticks by default (R4a), and this is the setup `init`
            // was. Where it cannot, it shows what the file holds, and nothing moves it.
            alerts: { on: settings.alerts.on || settings.canWrite, writable: settings.canWrite },
            // Rows 2 and 3 start from what is in force, the product's defaults where nothing was chosen (N4).
            stopped: { on: settings.stopped.on, writable: settings.noticesWritable },
            fine: { on: settings.fine.on, writable: settings.noticesWritable },
        },
        inForce: inForceOf(index.settings),
        ...(index.everywhere === undefined ? {} : { everywhere: everywhereOf(index.everywhere) }),
        done: {
            total: fix.total,
            files,
            more: fix.total - files.length,
            state: fix.state,
            conversations: index.entries.length,
            checked: generated.length,
            // A chat not checked is one its row says so of (F17 as amended 2026-10-10): a record whose gaps are its AI's format
            // alone is "Nothing private" there, and the Done step saying otherwise would send the reader to look for it.
            gaps: index.entries.some((entry) => statusOf(entry) === 'failed' || statusOf(entry) === 'unknown'),
            checking: index.reading !== undefined,
            asked: index.asked,
        },
    };
}
/** V20's starting state: a folder that is no project, one with chats, one inside a project with chats, or neither. */
function projectOf(index, read) {
    if (index.notAProject !== undefined)
        return { kind: 'none', not: index.notAProject, conversations: index.entries.length };
    // `everything-on-this-computer.md` GD16: the computer's page is the home folder's run - no project, as there.
    if (index.scope === 'computer')
        return { kind: 'none', not: 'home', conversations: index.entries.length };
    const name = projectName(index.project ?? '');
    const place = index.place === undefined ? {} : { place: index.place };
    if (index.entries.length > 0)
        return { kind: 'found', name, ...place, conversations: index.entries.length, entryPoints: index.entryPoints ?? {}, read };
    const above = index.projects?.above;
    const holder = above === undefined ? undefined : index.projects?.rows.find((row) => row.id === above.id && row.folder !== 'gone');
    if (above !== undefined && holder !== undefined)
        return { kind: 'inside', name, ...place, above: holder, within: above.within };
    return { kind: 'empty', name, ...place };
}
/**
 * GD14's rows as this computer holds them, and every other rule it holds. A rule both lists name is shown blocked: G15
 * answers a computer-wide block before any Track, its own included.
 */
export function everywhereOf(everywhere) {
    const blocked = everywhere.blocked === 'unreadable' ? [] : everywhere.blocked;
    const told = everywhere.told === 'unreadable' ? [] : everywhere.told;
    const now = (pattern) => (blocked.includes(pattern) ? 'block' : told.includes(pattern) ? 'tell' : undefined);
    const named = everywhere.rows.map(({ id, path, pattern, legacy, present }) => {
        const held = now(pattern);
        // IPD1: a row an older release wrote anchored is still this row - held, and known to be in the old form.
        const before = held === undefined && legacy !== undefined ? now(legacy) : undefined;
        return { id, path, pattern, present, ...(held === undefined ? {} : { now: held }), ...(before === undefined ? {} : { now: before, stale: true }) };
    });
    const offered = new Set(everywhere.rows.flatMap((row) => [row.pattern, ...(row.legacy === undefined ? [] : [row.legacy])]));
    const own = [...new Set([...blocked, ...told])].filter((pattern) => !offered.has(pattern))
        .map((pattern) => ({ path: patternShort(pattern), pattern, present: true, now: now(pattern) ?? 'block' }));
    const shown = (row) => row.present || row.now !== undefined;
    const rows = [...named.filter(shown), ...own, ...named.filter((row) => !shown(row))];
    return {
        rows,
        writable: everywhere.blocked !== 'unreadable' && everywhere.told !== 'unreadable',
        codex: everywhere.codex,
        // AP11: where the plugin alerts in every project, the step has nothing to turn on - as where the person's own do.
        offerAlerts: everywhere.alerts === false && everywhere.plugin !== 'on',
        places: everywhere.places ?? 'typed',
        // G7a: the same reading `Everywhere#setUp` makes of the computer, from what this page already holds - so the fork
        // says *Set up* without a record read, which GD26 keeps to the home folder's run.
        setUp: rows.some((row) => row.now !== undefined) || everywhere.alerts === true,
    };
}
