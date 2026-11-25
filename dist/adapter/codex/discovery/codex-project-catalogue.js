// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { startsAtDrive, withSlashes } from '../../../core/drive-path.js';
import { isDirectory } from '../../../ports/directory-reader.js';
import { conversationsIn } from './codex-conversations.js';
/**
 * The projects Codex keeps conversations for (`which-project.md` V9; X4): one per recorded `cwd` of a conversation's
 * first line, named by `projectId` and never decoded from it. A conversation that records no folder is counted, never
 * guessed. Titles and ways in are not read: their sources are not measured for Codex.
 */
export class CodexProjectCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list() {
        const { index, directories, sessionsRoot, projectId } = this.#dependencies;
        const conversations = await conversationsIn(await index.list(sessionsRoot), directories);
        // WPB8: one folder at a drive whatever its case - the Codex panel in VS Code records `c:\…`, a terminal `C:\…` -
        // listed by the spelling first met.
        const byFolder = new Map();
        let unreadable = 0;
        for (const conversation of conversations) {
            const folder = conversation.source.header.project;
            if (folder === undefined) {
                unreadable += 1;
                continue;
            }
            const key = startsAtDrive(folder) ? withSlashes(folder).toLowerCase() : folder;
            const known = byFolder.get(key);
            byFolder.set(key, {
                path: known?.path ?? folder,
                conversations: (known?.conversations ?? 0) + 1,
                newest: Math.max(known?.newest ?? 0, conversation.modifiedAt),
            });
        }
        const projects = await Promise.all([...byFolder.values()].map(async ({ path, ...folder }) => ({
            id: projectId(path),
            path,
            folder: this.#dependencies.leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(this.#dependencies.directories, path)) ? 'there' : 'gone',
            conversations: folder.conversations,
            newest: { modifiedAt: folder.newest },
        })));
        return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
    }
}
