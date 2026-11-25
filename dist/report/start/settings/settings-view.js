// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { DEFAULT_POLICY } from '../../../core/policy/default-policy.js';
import { matchesGlob } from '../../../core/policy/glob.js';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.js';
import { atRoot } from '../../../adapter/claude-code/policy/deny-rules.js';
import { DEFAULT_THRESHOLD } from '../../watch/agent-alert.js';
import { DEFAULT_CHANNELS, DEFAULT_CLEAN, DEFAULT_CLEAN_EVERYWHERE } from '../../watch/notice-choices.js';
import { RULE_NAMES } from '../../rule-names.js';
/**
 * What the Settings page shows, decided from what the files hold (`for-people-who-build-with-ai.md` §3 C; the plan's
 * S4). No HTML: every state, name and source of the page is chosen here, and the page only writes it.
 *
 * "Watched" means what the `watch` hook reads, never the list this run of `start` read: a settings file's rules replace
 * the built-in list for a hook that names it, so a pattern is called watched only where that hook's rules hold it.
 */
const BUILT_IN = DEFAULT_POLICY.protected.map((entry) => entry.pattern);
const NO_HOOKS = {
    watch: false,
    refuse: false,
    reads: { watch: 'default', refuse: 'default' },
    path: SETTINGS_FILES.directory + '/' + SETTINGS_FILES.local,
    sharedPath: SETTINGS_FILES.directory + '/' + SETTINGS_FILES.shared,
};
/**
 * `everywhere` is the computer's rules where this run read them (`SessionIndex.everywhere`): its rows join the list after
 * the project's, and a project row the computer blocks too is said to be. Absent, the page is the project's alone.
 */
export function settingsView(settings, everywhere, computer = false) {
    if (computer)
        return computerView(settings, everywhere);
    const hooks = settings.hooks ?? NO_HOOKS;
    const canWrite = settings.hooks !== undefined && settings.mine !== undefined;
    const alerts = hookOf(hooks.watch);
    const stop = hookOf(hooks.refuse);
    const reads = hooks.reads.watch;
    const notices = settings.notices;
    const on = notices?.on ?? DEFAULT_THRESHOLD;
    const clean = notices?.clean ?? DEFAULT_CLEAN;
    const known = settings.hooks !== undefined;
    // Unknown, the hooks' rules are unknown too: the list is what this run read, and no row claims to be watched or not.
    const read = known ? readPatterns(settings, reads) : undefined;
    const told = toldIn(settings);
    const canTell = canWrite && settings.told !== undefined && settings.told.local !== 'unreadable' && settings.told.shared !== 'unreadable';
    const blockedEverywhere = everywhere === undefined || everywhere.blocked === 'unreadable' ? [] : everywhere.blocked;
    const project = read === undefined
        ? policyRows(settings)
        : fileRows(settings, reads, read, told, canTell).map((row) => coveredOf(keptOf(row, settings, hooks), settings, told));
    // GD33: the computer's rows are shown here, read-only - they are changed on the computer's own page.
    const rows = [...project.map((row) => alsoEverywhere(row, blockedEverywhere, stop.on)), ...(everywhere === undefined ? [] : computerRows(everywhere, true))];
    const unread = read === undefined ? [] : unreadRules(settings, read);
    const addTo = reads === 'local' || reads === 'shared' ? reads : alerts.who ?? stop.who ?? 'local';
    // A built-in pattern on a told list is read and told, never blocked again by an add (F57).
    const withBuiltIn = read === undefined ? [] : BUILT_IN.filter((pattern) => (reads === 'default' || !read.has(pattern)) && !told.has(pattern));
    const scope = known ? scopeOf(settings, hooks) : undefined;
    return {
        known,
        canWrite,
        hideKeys: hooks.hideKeys === true,
        hideKeysLacksWriteCheck: hooks.hideKeys === true && hooks.hideKeysLacksWriteCheck === true,
        ...lacksPhrase(hooks, canWrite && alerts.on),
        alerts,
        stopped: { on: on === 'refused', locked: known && !alerts.on },
        fine: { on: clean !== 'off', locked: known && !alerts.on },
        noticesWritable: notices !== undefined && !notices.unusable,
        system: { on: (notices?.notify ?? DEFAULT_CHANNELS).includes('os'), channels: notices?.notify ?? DEFAULT_CHANNELS },
        stop,
        scope,
        moves: { local: movesInto(settings, hooks, 'local'), shared: movesInto(settings, hooks, 'shared') },
        uninstall: known ? uninstallFrom(settings, hooks) : {},
        writeTo: scope === 'local' || scope === 'shared' ? scope : addTo,
        canTell,
        reads,
        rows,
        unread,
        unfinished: unfinishedOf(settings, rows, withBuiltIn, told, stop.on),
        toWatch: new Set([...unread.map((rule) => rule.rule), ...(reads === 'default' ? [] : withBuiltIn)]).size,
        addTo,
        // Read from the built-in list, the whole of it goes into the file the hooks will read from then on; read from a
        // file, only what that file lacks.
        withBuiltIn,
        canAdd: canWrite && read !== undefined,
        developer: developerRows(settings, known ? hooks : undefined, reads, unread),
        ...(hooks.codex === undefined ? {} : { codex: hooks.codex }),
        ...(hooks.codexCard === undefined ? {} : { codexCard: hooks.codexCard }),
        ...(hooks.copilot === undefined ? {} : { copilot: hooks.copilot }),
        ...(settings.plugin === undefined ? {} : { plugin: settings.plugin }),
    };
}
/**
 * The computer's Settings (G13, GD15): the computer's rules, and the person's own notice answers for everywhere they work.
 * Every part of a project's - its hooks, its files, who its rules are for, its uninstall - is absent, not off: a page
 * that is no project's has none of them to show.
 */
function lacksPhrase(hooks, offered) {
    const missing = hooks.openFromChatMissing;
    // Codex's entry is written only where `refuse` runs in the project (`CodexMirror`), so it is offered only there.
    const codex = missing?.codex === true && hooks.refuse !== false;
    return offered && (missing?.claudeCode === true || codex) ? { lacksPhrase: { codex } } : {};
}
function computerView(settings, everywhere) {
    const notices = settings.notices;
    const on = notices?.on ?? DEFAULT_THRESHOLD;
    // GD23: the computer's run is quiet about a quiet turn unless the person said otherwise, so this row starts off -
    // the same answer `watch --everywhere` settles on, or the page would show a line nobody is given.
    const clean = notices?.clean ?? DEFAULT_CLEAN_EVERYWHERE;
    const none = { patterns: [], hooks: [] };
    // GD23: row 1 is alerts in every project, read from the person's own settings; rows 2 and 3 wait on it, as a project's.
    // AP9: the plugin installed for every project alerts there too, whatever the person's settings hold or whether they read.
    const alerts = everywhere?.alerts;
    const plugin = everywhere?.plugin;
    const alerting = alerts === true || plugin === 'on';
    const known = alerting || alerts === false;
    return {
        known,
        canWrite: false,
        hideKeys: false,
        hideKeysLacksWriteCheck: false,
        ...(everywhere?.alertsLackPhrase === true && plugin !== 'on' ? { lacksPhrase: { codex: false } } : {}),
        alerts: { on: alerting },
        stopped: { on: on === 'refused', locked: !alerting },
        fine: { on: clean !== 'off', locked: !alerting },
        noticesWritable: notices !== undefined && !notices.unusable,
        system: { on: (notices?.notify ?? DEFAULT_CHANNELS).includes('os'), channels: notices?.notify ?? DEFAULT_CHANNELS },
        stop: { on: false },
        scope: undefined,
        moves: { local: none, shared: none },
        uninstall: {},
        writeTo: 'local',
        canTell: false,
        reads: 'default',
        rows: everywhere === undefined ? [] : computerRows(everywhere),
        unread: [],
        unfinished: { rows: 0, patterns: [], refuse: false },
        toWatch: 0,
        addTo: 'local',
        withBuiltIn: [],
        canAdd: false,
        developer: [],
        computer: {
            add: everywhere !== undefined && everywhere.blocked !== 'unreadable',
            // AP10: no switch where the plugin alerts - one that changed nothing would read as broken (guidelines §9.2).
            alerts: (alerts === true || alerts === false) && plugin !== 'on',
            uninstall: everywhere !== undefined && everywhere.blocked !== 'unreadable' && everywhere.told !== 'unreadable' &&
                (everywhere.blocked.length > 0 || everywhere.told.length > 0 || alerts === true),
            places: everywhere?.places ?? 'typed',
        },
        ...(plugin === undefined ? {} : { plugin }),
    };
}
const FILES = ['local', 'shared'];
/**
 * The rules of agentwhy's own a file holds: whole rules, the kind `init` writes and can take back out (`IndexRule`). A
 * rule written by hand is somebody's own work and stays where they put it, so it neither splits the scope nor moves.
 */
function ownRules(settings, file) {
    return (settings.held?.[file] ?? []).flatMap((pattern) => {
        const rule = settings.mine?.[pattern];
        return rule !== undefined && rule.whole ? [rule.rule] : [];
    });
}
function scopeOf(settings, hooks) {
    const used = FILES.filter((file) => hooks.watch === file || hooks.refuse === file || ownRules(settings, file).length > 0);
    return used.length === 2 ? 'mixed' : used[0];
}
function movesInto(settings, hooks, into) {
    const other = into === 'local' ? 'shared' : 'local';
    return {
        patterns: [...new Set(ownRules(settings, other))],
        hooks: ['watch', 'refuse'].filter((hook) => hooks[hook] === other),
    };
}
function uninstallFrom(settings, hooks) {
    return Object.fromEntries(FILES.flatMap((file) => {
        const rules = [...new Set(ownRules(settings, file))];
        // KR10: the switch is always in the person's own file, and Uninstall takes it out with the rest.
        return hooks.watch === file || hooks.refuse === file || rules.length > 0 || (file === 'local' && hooks.hideKeys === true) ? [[file, rules]] : [];
    }));
}
function hookOf(where) {
    return where === false ? { on: false } : { on: true, who: where };
}
/** The patterns the hooks watch, or undefined where they read a policy or a file this page cannot see into. */
function readPatterns(settings, reads) {
    if (reads === 'default')
        return new Set(BUILT_IN);
    if (reads === 'local' || reads === 'shared')
        return new Set(settings.held?.[reads] ?? []);
    return undefined;
}
/** Every pattern of both told lists that could be read (F57). */
function toldIn(settings) {
    return new Set(FILES.flatMap((file) => {
        const list = settings.told?.[file];
        return list === undefined || list === 'unreadable' ? [] : list;
    }));
}
/**
 * The rows where the hooks read the built-in list or a project file: the named groups first, in F33's order, each
 * watched where the file holds any of its patterns or a told list does, then every other rule the file holds, as its
 * pattern, then every told pattern no rule holds (F57). A row's switch goes to the other mode where this page can write
 * both halves of it: the rules out of the files and the pattern into a list, or the other way round.
 */
function fileRows(settings, reads, read, told, canTell) {
    const ruleOf = (pattern) => {
        const rule = settings.mine?.[pattern];
        return rule !== undefined && rule.whole ? rule.rule : undefined;
    };
    // Going to `tell` takes the rules out; where one is a rule somebody wrote by hand, the page cannot, and offers nothing.
    const toTell = (patterns) => {
        if (!canTell)
            return undefined;
        const rules = reads === 'default' ? [] : patterns.map(ruleOf);
        return rules.every((rule) => rule !== undefined) ? { to: 'tell', patterns, rules: rules } : undefined;
    };
    const toBlock = (patterns) => (canTell ? { to: 'block', patterns, rules: [] } : undefined);
    const named = RULE_NAMES.map((group) => {
        const blocked = group.patterns.filter((pattern) => read.has(pattern) && !told.has(pattern));
        const toldHere = group.patterns.filter((pattern) => told.has(pattern));
        if (blocked.length > 0)
            return withSwitch({ name: group.name, patterns: blocked, source: 'agentwhy', watched: true, mode: 'block' }, toTell(blocked));
        if (toldHere.length > 0)
            return withSwitch({ name: group.name, patterns: toldHere, source: 'agentwhy', watched: true, mode: 'tell' }, toBlock(toldHere));
        return { name: group.name, patterns: group.patterns, source: 'agentwhy', watched: false, mode: 'block' };
    });
    const own = [...read].filter((pattern) => !BUILT_IN.includes(pattern) && !told.has(pattern)).map((pattern) => {
        const rule = settings.mine?.[pattern];
        // Only a whole rule in the file the hooks read is one `init` could have written and can take back out; half a
        // pair is somebody's own work (`IndexRule.whole`), and a pattern `mine` places in the other file cannot be
        // removed from this one by name.
        const removable = rule !== undefined && rule.whole && rule.file === reads;
        return withSwitch({
            patterns: [pattern],
            source: removable ? 'you' : 'project',
            watched: true,
            mode: 'block',
            ...(removable ? { remove: { rule: rule.rule, file: rule.file } } : {}),
            ...(removable && settings.rootPlaces === true && atRoot(rule.rule) ? { toRoot: true } : {}),
        }, toTell([pattern]));
    });
    const toldOnly = [...told].filter((pattern) => !BUILT_IN.includes(pattern)).map((pattern) => withSwitch({ patterns: [pattern], source: 'you', watched: true, mode: 'tell', ...(canTell ? { untell: [pattern] } : {}) }, toBlock([pattern])));
    return [...named, ...own, ...toldOnly];
}
function withSwitch(row, switchTo) {
    return switchTo === undefined ? row : { ...row, switchTo };
}
/**
 * G15: a project row whose files the computer blocks too - the same pattern, or a computer-wide one that covers the
 * row's file or folder by name - is blocked whatever this project says, so Track is not offered on it. Asked of rows
 * that name one file or one folder; a hand-written pattern names nothing to try, and keeps its switch.
 *
 * And it is blocked as far as the computer blocks it (K1, K2): Claude Code applies the computer's rules in every project
 * (GB10), and `refuse` reads them wherever it runs (G4) - so the row is blocked whole where `refuse` runs here, and half
 * where it does not, whatever this project's own files hold. Found looking at the page: a row the computer blocks said
 * "Not blocked yet - Claude Code can still open it", which was not true.
 */
function alsoEverywhere(row, blocked, refuseHere) {
    if (blocked.length === 0 || row.mode !== 'block')
        return row;
    const covers = (pattern) => blocked.some((wide) => {
        if (wide === pattern)
            return true;
        const name = /^\*\*\/([^*?/]+)$/.exec(pattern)?.[1];
        if (name !== undefined)
            return matchesGlob(name, wide) || matchesGlob(`a/${name}`, wide);
        const folder = /^\*\*\/([^*?/]+)\/\*\*$/.exec(pattern)?.[1];
        return folder !== undefined && matchesGlob(`a/${folder}/b`, wide);
    });
    if (!row.patterns.some(covers))
        return row;
    const { switchTo, kept, ...rest } = row;
    const held = { ...rest, ...(switchTo === undefined || switchTo.to === 'tell' ? {} : { switchTo }), everywhere: true };
    return !row.watched || refuseHere || kept === undefined ? held : { ...held, kept: 'open' };
}
/**
 * The computer's own rules (G6): each blocked pattern, then each tracked one, named as GD14 names it where it is one
 * of its rows. A pattern on both lists is blocked, as G15 answers it. Each can be switched where both lists could be
 * read, and taken out where its own list could.
 */
function computerRows(everywhere, readOnly = false) {
    const blocked = everywhere.blocked === 'unreadable' ? [] : everywhere.blocked;
    const told = everywhere.told === 'unreadable' ? [] : everywhere.told.filter((pattern) => !blocked.includes(pattern));
    const switchable = !readOnly && everywhere.blocked !== 'unreadable' && everywhere.told !== 'unreadable';
    const named = new Map(everywhere.rows.map((row) => [row.pattern, row.id]));
    // IPD1: a row written anchored by an older release is still that row, and its place is what it should be written as.
    const legacy = new Map(everywhere.rows.flatMap((row) => (row.legacy === undefined ? [] : [[row.legacy, row]])));
    // One name for one folder on one page: a pattern that is one of the built-in groups' keeps that group's name here.
    const grouped = new Map(RULE_NAMES.flatMap((group) => group.patterns.map((pattern) => [pattern, group.name])));
    const row = (pattern, mode) => {
        const before = legacy.get(pattern);
        const group = grouped.get(pattern);
        const id = group === undefined ? named.get(pattern) ?? before?.id : undefined;
        return {
            ...(group === undefined ? {} : { name: group }),
            patterns: [pattern],
            source: 'computer',
            watched: true,
            mode,
            computer: {
                ...(id === undefined ? {} : { id }), switchable, removable: !readOnly && (mode === 'block' ? everywhere.blocked !== 'unreadable' : everywhere.told !== 'unreadable'),
                ...(before === undefined ? {} : { stale: { place: before.pattern } }),
            },
        };
    };
    return [...blocked.map((pattern) => row(pattern, 'block')), ...told.map((pattern) => row(pattern, 'tell'))];
}
/**
 * Where the hooks read a policy or another file, or what they read is unknown: the list this run read, as it is, and
 * nothing here can change it. The built-in list is named in words where it is what the run read.
 */
function policyRows(settings) {
    const builtIn = settings.origin.kind === 'default';
    const named = builtIn
        ? RULE_NAMES.flatMap((group) => {
            const held = group.patterns.filter((pattern) => settings.protected.includes(pattern));
            return held.length === 0 ? [] : [{ name: group.name, patterns: held, source: 'agentwhy', watched: true, mode: 'block' }];
        })
        : [];
    const rest = settings.protected.filter((pattern) => !builtIn || !BUILT_IN.includes(pattern));
    return [...named, ...rest.map((pattern) => ({ patterns: [pattern], source: 'project', watched: true, mode: 'block' }))];
}
/**
 * K1, K2: a watched `block` row, read for both halves of a block - its rules in either settings file, which Claude Code
 * applies both of (R4d), and `refuse` running over rules that hold every pattern of it. Where `refuse` reads a policy or
 * a file this page cannot see into, only the rules are claimed.
 */
function keptOf(row, settings, hooks) {
    if (!row.watched || row.mode !== 'block' || settings.held === undefined)
        return row;
    const ruled = row.patterns.filter((pattern) => denied(settings, pattern));
    if (ruled.length === 0)
        return { ...row, kept: 'none' };
    const searched = hooks.refuse === false ? new Set() : readPatterns(settings, hooks.reads.refuse);
    const whole = ruled.length === row.patterns.length && (searched === undefined || row.patterns.every((pattern) => searched.has(pattern)));
    return whole ? row : { ...row, kept: 'open' };
}
/**
 * SW19, found by the maintainer on 2026-10-02: `demo.env` was switched to Track, and Claude Code still refused every
 * read - its own deny rule for every `.env` file covers that name, and deny rules know no exceptions. The row carries
 * the shortest written Block rule that still matches the row's file, by the name a command or a path would use. Only
 * a row tracked by a file's name is asked - a folder or a hand-written pattern names no one file to try - and only
 * rules a settings file actually holds count, because only those are rules Claude Code applies itself.
 */
function coveredOf(row, settings, told) {
    if (row.mode !== 'tell' || !row.watched)
        return row;
    const names = row.patterns.flatMap((pattern) => {
        const name = /^\*\*\/([^*?/]+)$/.exec(pattern)?.[1];
        return name === undefined ? [] : [name];
    });
    if (names.length === 0)
        return row;
    const written = FILES.flatMap((file) => settings.held?.[file] ?? []).filter((pattern) => !told.has(pattern));
    const covering = written.filter((pattern) => names.some((name) => matchesGlob(name, pattern) || matchesGlob(`a/${name}`, pattern)));
    const covered = covering.sort((one, two) => one.length - two.length || (one < two ? -1 : 1))[0];
    return covered === undefined ? row : { ...row, covered };
}
function denied(settings, pattern) {
    return FILES.some((file) => settings.held?.[file]?.includes(pattern) ?? false);
}
/**
 * K9: what one confirmed write closes. Rules no file holds are written as an add writes them - with the built-in list,
 * so that pointing the hooks at a file drops nothing they watched (S4.3), and never a pattern the person chose to be
 * told about (F57) - and `refuse` with them. Where every rule is there, `refuse` alone, where it does not run. Where it
 * runs and reads other rules, `init` does not point it again without writing a rule (R4d), so nothing is offered.
 */
function unfinishedOf(settings, rows, withBuiltIn, told, refuseOn) {
    const open = rows.filter((row) => row.kept !== undefined);
    const missing = open.flatMap((row) => row.patterns.filter((pattern) => !denied(settings, pattern)));
    const patterns = missing.length === 0 ? [] : [...new Set([...withBuiltIn, ...missing])].filter((pattern) => !told.has(pattern));
    return { rows: open.length, patterns, refuse: open.length > 0 && patterns.length === 0 && !refuseOn };
}
/** F34: a rule a project file holds that the hooks do not read. A built-in pattern read anyway is not one. */
function unreadRules(settings, read) {
    return Object.entries(settings.mine ?? {})
        .filter(([pattern]) => !read.has(pattern))
        .map(([, rule]) => ({ rule: rule.rule, file: rule.file }));
}
/** `hooks` is absent where the project's file could not be read: then what runs, and what it reads, is not known. */
function developerRows(settings, known, reads, unread) {
    const hooks = known ?? NO_HOOKS;
    const pathOf = (file) => (file === 'shared' ? hooks.sharedPath : hooks.path);
    const where = (hook) => {
        if (known === undefined)
            return { word: 'set.dev.unknown' };
        const file = hooks[hook];
        return file === false ? { word: 'set.dev.notInstalled' } : pathOf(file);
    };
    const notices = settings.notices;
    const rules = reads === 'local' || reads === 'shared'
        ? [...(settings.held?.[reads] ?? [])].join('  ') + '  (' + pathOf(reads) + ')'
        : reads === 'default' ? BUILT_IN.join('  ') : settings.protected.join('  ');
    const unreadFiles = [...new Set(unread.map((rule) => pathOf(rule.file)))];
    return [
        { key: 'set.dev.watch', value: where('watch') },
        { key: 'set.dev.refuse', value: where('refuse') },
        { key: 'set.dev.reads', value: known === undefined ? { word: 'set.dev.unknown' } : reads === 'local' || reads === 'shared' ? pathOf(reads) : { word: 'set.dev.reads.' + reads } },
        { key: 'set.dev.rules', value: known === undefined ? settings.protected.join('  ') : rules },
        { key: 'set.dev.unread', value: unreadFiles.length === 0 ? { word: 'set.dev.none' } : unreadFiles.join('  ') },
        { key: 'set.dev.exceptions', value: settings.allowed.length === 0 ? { word: 'set.dev.none' } : settings.allowed.join('  ') },
        { key: 'set.dev.notices', value: notices === undefined ? { word: 'set.dev.none' } : notices.path },
        { key: 'set.dev.on', value: notices?.on ?? DEFAULT_THRESHOLD },
        { key: 'set.dev.clean', value: notices?.clean ?? DEFAULT_CLEAN },
        ...(notices === undefined ? [] : [{ key: 'set.dev.said', value: notices.say + ' · ' + notices.notify.join(', ') }]),
    ];
}
