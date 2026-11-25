import { isDirectory } from '../../../ports/directory-reader.js';
import { oneLine } from '../../../shared/printable.js';
/**
 * The projects Copilot keeps conversations for (`which-project.md` V9; `what-copilot-wrote` CP3a): one per session folder,
 * named by `projectId` and never decoded from it, recognised by its newest conversation's title (CPB35). Where it was held
 * is not given: a row of the projects window would lose it the day another AI's conversation was newer (WHD5). A session
 * that names no folder, or two, is counted, never guessed. A chat folder of the desktop app is listed as any folder is:
 * which folders are quick tries is the page's to say (CPD8).
 */
export class CopilotProjectCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list() {
        const { index, directories, sessionsRoot, projectId, redactor, leaveAlone } = this.#dependencies;
        const listing = await index.list(sessionsRoot);
        const byFolder = new Map();
        let unreadable = 0;
        for (const session of listing.sessions) {
            if (session.project === undefined) {
                unreadable += 1;
                continue;
            }
            const known = byFolder.get(session.project);
            byFolder.set(session.project, {
                conversations: (known?.conversations ?? 0) + 1,
                newest: known === undefined || session.modifiedAt > known.newest.modifiedAt ? session : known.newest,
            });
        }
        const projects = await Promise.all([...byFolder].map(async ([path, folder]) => {
            const title = folder.newest.title === undefined ? '' : oneLine(folder.newest.title);
            return {
                id: projectId(path),
                path,
                folder: leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(directories, path)) ? 'there' : 'gone',
                conversations: folder.conversations,
                newest: { modifiedAt: folder.newest.modifiedAt, ...(title === '' ? {} : { title: redactor.scan(title) }) },
            };
        }));
        return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
    }
}
