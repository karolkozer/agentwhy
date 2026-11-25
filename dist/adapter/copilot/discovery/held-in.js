import { CLIENTS } from '../contract/session.js';
/**
 * Where a person held the conversation, from `workspace.yaml`'s `client_name` (spec §2.8;
 * `.ai/specs/2026-10-08-where-it-was-held.md`): the CLI is the terminal and the desktop app the desktop app. Any other
 * value says nothing, never the nearest of these. The contract holds the format's names and `EntryPoint` is this
 * project's word, so the mapping lives here, as Codex's does.
 */
export function entryPointOf(client) {
    if (client === CLIENTS.terminal)
        return 'terminal';
    if (client === CLIENTS.desktop)
        return 'desktop';
    return undefined;
}
