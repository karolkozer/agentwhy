// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { sameFolder } from '../../../core/drive-path.js';
import { conversationsIn } from './codex-conversations.js';
/**
 * A project's Codex conversations (X1, X4, X5): each conversation whose first line records the project's folder as its
 * `cwd`, exactly - Codex records the folder itself, where Claude Code's store encodes it. First lines only are read.
 */
export class CodexSessionCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list(workingDirectory) {
        const { index, directories, sessionsRoot } = this.#dependencies;
        const listing = await index.list(sessionsRoot);
        // The root itself missing or unreadable is "not looked at", never "no conversations".
        const found = !listing.gaps.some((gap) => gap.path === sessionsRoot);
        // Chosen by the first line before any file is looked at: only this project's conversations cost a look. WPB8: the
        // Codex panel in VS Code on Windows records `c:\…`, and a terminal in the same folder is in `C:\…`.
        const sessions = (await conversationsIn(listing, directories, (root) => root.header.project !== undefined && sameFolder(root.header.project, workingDirectory)))
            .map((conversation) => ({
            id: conversation.source.header.id,
            path: conversation.source.path,
            modifiedAt: conversation.modifiedAt,
            delegations: conversation.delegations,
            provider: 'codex',
        }))
            .sort((a, b) => b.modifiedAt - a.modifiedAt);
        // The place searched is Codex's whole store, so not finding it is the store missing (R28, amended 2026-10-01).
        return { directory: sessionsRoot, found, searched: [{ provider: 'codex', directory: sessionsRoot, found, ...(found ? {} : { store: 'missing' }) }], sessions };
    }
}
