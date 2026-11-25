// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * A change an AI made to one of agentwhy's own guard files (`.ai/specs/2026-10-25-the-ai-changed-its-own-guard.md` OG1-OG3,
 * OG5; OGD1-OGD4 decided 2026-11-23). A file is blocked by text in files the AI can write: a deny rule, the hook that runs
 * `refuse`, Codex's and Copilot's checks, a Track list. An edit of one is a finding of its own, said as far as the record
 * shows what it did; an instruction file (`CLAUDE.md`, `AGENTS.md`) is a step, never a to-do (OGD2), and its text is not read.
 *
 * The list of guard files is closed and kept with each AI's contract, never a word found in a path.
 */
import { isAbsolute, join } from 'node:path';
import { fileRulePathOf } from '../adapter/claude-code/policy/deny-rules.js';
import { SETTINGS_FILES } from '../adapter/claude-code/contract/settings.js';
import { runsAgentwhyHook } from '../adapter/claude-code/settings/hook-entries.js';
import { USER_HOOKS as CODEX_HOOKS } from '../adapter/codex/contract/hooks.js';
import { USER_HOOKS as COPILOT_HOOKS } from '../adapter/copilot/contract/hooks.js';
import { filesWrittenIn } from '../core/access/command-line.js';
import { TELL_LIST_FILES } from './private-files/tell-lists.js';
/**
 * Whether a change takes protection away, or the record cannot say it did not - the one question the page's alarm, the
 * conversation's row, `check` and the text report ask (step 4 of the plan, after the review of steps 2-3: they had answered
 * it two ways). A stopped attempt is the protection holding, an instruction file a step (OGD2), and a change that only
 * blocked more files made it stronger: none of them asks anything.
 */
export function weakensProtection(change) {
    if (change.file === 'instructions' || change.outcome === 'attempted')
        return false;
    return !(change.outcome === 'changed' && typeof change.said !== 'string' && change.said.length > 0 && change.said.every((one) => one.kind === 'added-block'));
}
/**
 * Every change an AI made to a guard file in this session, in the order of the record. agentwhy's own commands are not
 * among them (OG3): a write done by `agentwhy` or `npx @agentwhy/cli` is the person's choice, made through agentwhy.
 */
export function guardChangesOf(model, place = {}) {
    const root = model.projectRoot.kind === 'known' ? [model.projectRoot.path] : [];
    return model.events.flatMap((event) => changesOf(event, {
        ...place, roots: [...root, ...(event.workingDirectory === undefined ? [] : [event.workingDirectory])],
    }));
}
function changesOf(event, place) {
    const outcome = event.outcome === 'succeeded' ? 'changed' : event.outcome === 'blocked' ? 'attempted' : 'unknown';
    const base = { eventId: event.id, agentId: event.agentId, outcome };
    if (event.written !== undefined) {
        const guarded = event.targets.flatMap((path) => {
            const file = guardFileOf(placed(path, event, place), place);
            return file === undefined ? [] : [{ path, file }];
        });
        // A change to several files at once holds their removed text together: it cannot be said which file lost which line.
        const alone = event.targets.length === 1;
        return guarded.map(({ path, file }) => ({
            ...base, path, file, via: 'tool',
            said: file.kind === 'instructions' || !alone || event.removed === undefined ? 'not-in-record' : whatItDid(file, event.removed, event.written ?? []),
        }));
    }
    if (event.commands.length === 0)
        return [];
    // OG3: what agentwhy's own command writes is the person's choice; the rest of the same line is read as any other.
    const written = [...new Set(event.commands.flatMap((command) => filesWrittenIn(command, runsAgentwhy)))];
    return written.flatMap((path) => {
        const file = guardFileOf(placed(path, event, place), place);
        return file === undefined ? [] : [{ ...base, path, file, via: 'shell', said: 'not-in-record' }];
    });
}
/** A word a shell line wrote to, read where the line ran: `~` and `$HOME` the home folder, a relative path the call's folder. */
function placed(word, event, place) {
    const home = place.home;
    const expanded = home === undefined ? word : word.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home);
    return isAbsolute(expanded) || event.workingDirectory === undefined ? expanded : join(event.workingDirectory, expanded);
}
/** The guard a path is, from the closed list (§2), or none. */
export function guardFileOf(path, place) {
    const file = path.replace(/\\/g, '/');
    const atHome = (...parts) => {
        const tail = `/${parts.join('/')}`;
        // With no home folder, only the form that names it (`~/.codex/hooks.json`): a project's own `.codex/hooks.json` is none.
        return file === `~${tail}` || (place.home !== undefined && file === `${place.home.replace(/\\/g, '/').replace(/\/+$/, '')}${tail}`);
    };
    const named = (...tail) => file === tail.join('/') || file.endsWith(`/${tail.join('/')}`);
    // A project's own: under one of the session's roots where they are known, by name where they are not.
    const own = (...tail) => place.roots === undefined ? named(...tail)
        : place.roots.some((root) => file === `${root.replace(/\\/g, '/').replace(/\/+$/, '')}/${tail.join('/')}`);
    if (own(SETTINGS_FILES.directory, SETTINGS_FILES.shared) || own(SETTINGS_FILES.directory, SETTINGS_FILES.local) ||
        atHome(SETTINGS_FILES.directory, SETTINGS_FILES.shared))
        return { kind: 'block', of: 'claude-code' };
    if (atHome(CODEX_HOOKS.directory, CODEX_HOOKS.file) || atHome(CODEX_HOOKS.directory, CODEX_HOOKS.config))
        return { kind: 'block', of: 'codex' };
    if (atHome(...COPILOT_HOOKS.folder, COPILOT_HOOKS.file))
        return { kind: 'block', of: 'copilot' };
    // `tell-lists.ts`: a project's shared list, the person's own list of a project, and the computer's.
    const projectList = file.split('/').slice(-4);
    const isProjectList = projectList.length === 4 && projectList[0] === TELL_LIST_FILES.folder && projectList[1] === TELL_LIST_FILES.projects && projectList[3] === TELL_LIST_FILES.list;
    if (own(SETTINGS_FILES.directory, TELL_LIST_FILES.shared) || atHome(TELL_LIST_FILES.folder, TELL_LIST_FILES.list) || isProjectList)
        return { kind: 'track' };
    if (/(?:^|\/)(?:CLAUDE|CLAUDE\.local|AGENTS)\.md$/.test(file) || /(?:^|\/)\.claude\/agents\/[^/]+\.md$/.test(file) || /(?:^|\/)\.claude\/skills\/.+\/SKILL\.md$/.test(file))
        return { kind: 'instructions' };
    return undefined;
}
/** OG3: a line that runs agentwhy itself - `agentwhy init`, `npx @agentwhy/cli protect` - whatever it writes. */
function runsAgentwhy(program, args) {
    return program === 'agentwhy' || (['npx', 'pnpx', 'bunx'].includes(program) && args.some((arg) => /^@agentwhy\/cli(?:@|$)/.test(arg)));
}
/** OG2: what the text taken out and the text put in show, for a Block or Track file. */
function whatItDid(file, removed, written) {
    const out = removed.join('\n');
    const into = written.join('\n');
    const said = [];
    if (file.kind === 'block') {
        const before = rulesIn(out);
        const after = rulesIn(into);
        // The same rule on both sides is no change; where either side cannot show its list, the pattern alone says it is the same.
        const has = (rules, rule) => rules.some((each) => each.pattern === rule.pattern && (each.section === rule.section || each.section === 'unknown' || rule.section === 'unknown'));
        for (const rule of before) {
            if (has(after, rule))
                continue;
            if (rule.section === 'deny')
                said.push({ kind: 'took-out-block', pattern: rule.pattern });
            else if (rule.section === 'unknown')
                said.push({ kind: 'changed-rule', pattern: rule.pattern });
        }
        for (const rule of after) {
            if (has(before, rule))
                continue;
            if (rule.section === 'deny')
                said.push({ kind: 'added-block', pattern: rule.pattern });
            else if (rule.section === 'allow')
                said.push({ kind: 'added-allow', pattern: rule.pattern });
            else if (rule.section === 'unknown')
                said.push({ kind: 'changed-rule', pattern: rule.pattern });
        }
        if (stringsIn(out).some(runsAgentwhyHook) && !stringsIn(into).some(runsAgentwhyHook))
            said.push({ kind: 'removed-check' });
    }
    else if (file.kind === 'track') {
        const kept = new Set(listEntries(into));
        for (const pattern of listEntries(out))
            if (!kept.has(pattern))
                said.push({ kind: 'took-off-track', pattern });
    }
    return said.length === 0 ? 'other' : [...new Map(said.map((each) => [JSON.stringify(each), each])).values()];
}
/** The file rules a fragment of a settings file holds, each with the list it is in, read as `deny-rules.ts` reads one. */
function rulesIn(text) {
    const rules = [];
    for (const match of text.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
        const pattern = fileRulePathOf(unescaped(match[1] ?? ''));
        if (pattern === undefined)
            continue;
        rules.push({ pattern, section: sectionAt(text, match.index ?? 0) });
    }
    return rules;
}
/** The key of the list a rule at `at` stands in: the nearest `"deny"`, `"allow"` or `"ask"` before it with no `]` between. */
function sectionAt(text, at) {
    const before = text.slice(0, at);
    const opened = [...before.matchAll(/"(deny|allow|ask)"\s*:\s*\[/g)].at(-1);
    if (opened === undefined || before.slice((opened.index ?? 0) + opened[0].length).includes(']'))
        return 'unknown';
    return opened[1];
}
/** Every string a JSON fragment holds, unescaped. */
function stringsIn(text) {
    return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => unescaped(match[1] ?? ''));
}
/** The entries of a Track list a fragment holds: its strings that are no key and no part of the file's own shape. */
function listEntries(text) {
    // Every string in turn, then the keys left out by what follows each: a lookahead in the pattern itself would let a failed
    // key restart the match at its closing quote, and read the text between two strings as one.
    return [...text.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
        .filter((match) => !/^\s*:/.test(text.slice((match.index ?? 0) + match[0].length)))
        .map((match) => unescaped(match[1] ?? '').trim())
        .filter((entry) => entry !== '');
}
function unescaped(text) {
    return text.replace(/\\(.)/g, '$1');
}
