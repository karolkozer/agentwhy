import { isDirectory } from '../../../ports/directory-reader.js';
import { oneLine } from '../../../shared/printable.js';
/**
 * The projects Copilot in VS Code keeps chats for (`which-project.md` V9, `what-vs-code-copilot-wrote` VC5): one per folder
 * a workspace was opened on, named by `projectId`, recognised by its newest chat's title - so a project only VS Code's
 * Copilot worked in is in the projects window and on the computer's page, as one of the CLI's is. Where it was held is not
 * given, as no other AI's projects give it (WHD5). A workspace naming no folder on this computer is counted, never guessed.
 */
export class VsCodeProjectCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list() {
        const { discovery, directories, projectId, redactor, leaveAlone } = this.#dependencies;
        const store = await discovery.everyFolder();
        const projects = await Promise.all([...store.folders].map(async ([path, chats]) => {
            const [newest] = chats;
            const title = newest?.title === undefined ? '' : oneLine(newest.title);
            return {
                id: projectId(path),
                path,
                folder: leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(directories, path)) ? 'there' : 'gone',
                conversations: chats.length,
                newest: { modifiedAt: newest?.modifiedAt ?? 0, ...(title === '' ? {} : { title: redactor.scan(title) }) },
            };
        }));
        return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable: store.unlisted };
    }
}
