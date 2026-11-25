import { helpersStarted } from './helpers-started.js';
/** Sessions whose helpers are counted at once: each holds a descriptor until it is read through. */
const AT_ONCE = 8;
/**
 * A project's Copilot conversations, the desktop app's and the CLI's (`what-copilot-wrote` CP2, CP3a): each session whose
 * folder is the project's own, exactly - Copilot records the folder itself, as Codex does. A session is listed by its
 * `events.jsonl`, what `report --input` is given.
 */
export class CopilotSessionCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list(workingDirectory) {
        const { index, directories, files, sessionsRoot } = this.#dependencies;
        const listing = await index.list(sessionsRoot);
        const mine = listing.sessions.filter((session) => session.project === workingDirectory);
        const sessions = [];
        for (let from = 0; from < mine.length; from += AT_ONCE) {
            sessions.push(...await Promise.all(mine.slice(from, from + AT_ONCE).map(async (session) => ({
                id: session.id,
                path: session.events,
                modifiedAt: session.modifiedAt,
                delegations: await helpersStarted(directories, files, session.events),
                provider: 'copilot',
            }))));
        }
        // The place searched is Copilot's whole store, so not finding it is the store missing (R28, amended 2026-10-01).
        const found = listing.found;
        return {
            directory: sessionsRoot, found,
            searched: [{ provider: 'copilot', directory: sessionsRoot, found, ...(found ? {} : { store: 'missing' }) }],
            sessions: sessions.sort((a, b) => b.modifiedAt - a.modifiedAt),
        };
    }
}
