import { READER } from '../contract/session.js';
/**
 * Where a person held the conversation, from the rollout's first line alone (CXB3, 175 rollouts, 2026-10-02;
 * `.ai/specs/2026-10-08-where-it-was-held.md` WH6). `source` decides first: `exec` is a scripted run whatever app
 * wrote it - CXB3 saw it from both `codex_exec` and `codex_vscode` - and an object is a thread another agent started,
 * which is nobody's way in. Then `originator` names the app. An originator this contract does not list is nothing
 * said, never the nearest of these.
 *
 * The contract holds the format's names and the core's `EntryPoint` is this project's own word, so the mapping lives
 * here and not beside them, as Claude Code's `ENTRY_POINT_VALUES` and `lastEntryPointIn` are kept apart.
 */
export function entryPointOf(source, originator) {
    if (typeof source !== 'string')
        return undefined;
    if (source === READER.scriptSource)
        return 'script';
    if (!heldByPerson(source, originator))
        return undefined;
    if (originator === READER.terminalOriginator)
        return 'terminal';
    if (originator === READER.editorOriginator)
        return 'editor';
    // WHD4, WH7: the Codex app and the ChatGPT app are one word on a page; the two names stay apart in the contract.
    return typeof originator === 'string' && READER.desktopOriginators.includes(originator) ? 'desktop' : undefined;
}
/**
 * Whether a person held the conversation, by its first line (CXB3, CXB8): `vscode` in every app, and `cli` in the terminal
 * app alone. One answer for where it was held and for who is reading, so the two never disagree.
 */
export function heldByPerson(source, originator) {
    return source === READER.personSource || (source === READER.terminalSource && originator === READER.terminalOriginator);
}
