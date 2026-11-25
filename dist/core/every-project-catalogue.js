import { sessionKey } from './session-catalogue.js';
/**
 * Every project's conversations (G11): each project the projects window lists (`which-project.md` V9), listed by the
 * one-folder catalogue, merged and sorted - `CombinedSessionCatalogue` one level up. A session carries its project's
 * folder, since it is read under that project's rules (GD17), and whether that folder may be looked into (V10b);
 * listing reads the AIs' own stores and never a project's folder.
 *
 * A file two projects list - one folder's conversations kept under two ids - is one row. Two files one key names stay two
 * rows: the older is given the key with a number after it, so neither overwrites the other's report.
 */
export class EveryProjectCatalogue {
    #projects;
    #catalogue;
    constructor(projects, catalogue) {
        this.#projects = projects;
        this.#catalogue = catalogue;
    }
    async list() {
        const listing = await this.#projects.list();
        const each = await Promise.all(listing.projects.map(async (project) => {
            const project_ = { folder: project.path, looked: project.folder !== 'not-looked' };
            return (await this.#catalogue.list(project.path)).sessions.map((session) => ({ ...session, project: project_ }));
        }));
        const paths = new Set();
        const keys = new Map();
        const sessions = [];
        for (const session of each.flat().sort((a, b) => b.modifiedAt - a.modifiedAt)) {
            if (paths.has(session.path))
                continue;
            paths.add(session.path);
            const key = sessionKey(session);
            const seen = keys.get(key) ?? 0;
            keys.set(key, seen + 1);
            sessions.push(seen === 0 ? session : { ...session, key: `${key}-${seen + 1}` });
        }
        return { sessions, unreadable: listing.unreadable };
    }
}
