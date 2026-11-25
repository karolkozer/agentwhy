// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join, relative, resolve } from 'node:path';
import { FileAccessError } from '../../../ports/file-access-error.js';
import { SESSION } from '../contract/session.js';
import { continuesOwnThread, readSessionHeader } from './session-header.js';
import { AMBIGUOUS, ownerIds, sessionOwners } from './session-owners.js';
import { sessionRoots } from './session-roots.js';
/** Header-only discovery. The caller supplies the supported sessions root; no environment or SQLite access. */
export class CodexSessionDiscovery {
    #directories;
    #files;
    constructor(dependencies) {
        this.#directories = dependencies.directories;
        this.#files = dependencies.files;
    }
    /** Explicit file recognition ignores its name and never reads beyond its first line. */
    readHeader(path) {
        return readSessionHeader(this.#files, path);
    }
    /**
     * The tree of the conversation `input` names (X5). It is searched for in the supported sessions root when `input` is
     * inside it, and otherwise in `input`'s own folder only: a copy of a session and the original it was copied from hold
     * one id, and neither would join anything (X3). A listing of that same folder already taken - by the catalogue that
     * listed this conversation - is used instead of walking it again.
     */
    async tree(input, sessionsRoot, known) {
        const path = resolve(input);
        const head = await this.readHeader(path);
        if (head.kind !== 'recognised')
            return head;
        const inside = !relative(resolve(sessionsRoot), path).startsWith('..');
        const directory = inside ? resolve(sessionsRoot) : dirname(path);
        const listing = known !== undefined && resolve(known.directory) === directory ? known.listing : await this.list(directory);
        const byPath = new Map([[path, head.header]]);
        for (const source of listing.sources)
            if (!byPath.has(resolve(source.path)))
                byPath.set(resolve(source.path), source.header);
        const paths = [...byPath.keys()].sort((a, b) => a.localeCompare(b));
        const headers = paths.map((each) => byPath.get(each));
        const owners = sessionOwners(ownerIds(headers));
        const parentOf = (index) => {
            const header = headers[index];
            // XD10: a file continuing its own thread joins the file the thread began in, as a child joins its recorded parent.
            const parentId = header === undefined ? undefined : continuesOwnThread(header) ? header.id : header.parent.kind === 'parent' ? header.parent.id : undefined;
            const owner = parentId === undefined ? undefined : owners.get(parentId);
            return typeof owner === 'number' ? owner : undefined;
        };
        // A continuation asked for by its own path is read as the conversation it continues: its root is the thread's first
        // file, where that file is here (XD10). Asked for by a path no listing holds the base of, it stands as its own root.
        const asked = paths.indexOf(path);
        const root = continuesOwnThread(head.header) ? (parentOf(asked) ?? asked) : asked;
        // A member is a file whose chain of unique parents reaches the root; a cycle or a break ends the walk.
        const reaches = (start) => {
            const seen = new Set();
            for (let at = parentOf(start); at !== undefined && !seen.has(at); at = parentOf(at)) {
                if (at === root)
                    return true;
                seen.add(at);
            }
            return false;
        };
        const order = [root, ...paths.map((_, index) => index).filter((index) => index !== root && reaches(index))];
        const position = new Map(order.map((index, at) => [index, at]));
        const members = order.map((index) => {
            const parent = index === root ? undefined : position.get(parentOf(index) ?? -1);
            return { path: paths[index], header: headers[index], ...(parent === undefined ? {} : { parent }) };
        });
        return { kind: 'tree', members, rootShared: owners.get(headers[root].id) === AMBIGUOUS, gaps: listing.gaps };
    }
    async list(directory) {
        const sources = [];
        const gaps = [];
        for await (const { path, read } of this.#rollouts(directory, gaps)) {
            if (read.kind === 'recognised')
                sources.push({ path, header: read.header });
            else
                gaps.push({ path, reason: read.kind === 'unavailable' ? read.reason : 'unknown-format' });
        }
        // Path order is presentation only. Ownership and root resolution are independent of traversal order.
        sources.sort((a, b) => a.path.localeCompare(b.path));
        const relations = sessionRoots(sources.map((source) => source.header));
        return {
            sources: sources.map((source, index) => ({ ...source, relation: relations[index] })),
            gaps,
        };
    }
    /** Whether a folder holds at least one Codex session: the walk `list` makes, ended at the first header recognised (X2). */
    async holdsSession(directory) {
        for await (const { read } of this.#rollouts(directory, []))
            if (read.kind === 'recognised')
                return true;
        return false;
    }
    /** Every rollout under a folder with its first line read, in walk order; a folder that cannot be listed is a gap. */
    async *#rollouts(directory, gaps) {
        const pending = [directory];
        while (pending.length > 0) {
            const current = pending.pop();
            if (current === undefined)
                break;
            let entries;
            try {
                entries = await this.#directories.list(current);
            }
            catch (error) {
                if (!(error instanceof FileAccessError))
                    throw error;
                gaps.push({ path: current, reason: error.failure });
                continue;
            }
            for (const entry of entries) {
                const path = join(current, entry.name);
                if (entry.kind === 'directory')
                    pending.push(path);
                else if (entry.kind === 'file' && entry.name.startsWith(SESSION.filePrefix) && entry.name.endsWith(SESSION.fileSuffix)) {
                    yield { path, read: await this.readHeader(path) };
                }
            }
        }
    }
}
