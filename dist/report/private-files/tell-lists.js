// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname, join } from 'node:path';
import { projectDirectoryName } from '../../adapter/claude-code/contract/projects.js';
import { SETTINGS_FILES } from '../../adapter/claude-code/contract/settings.js';
import { toldPattern } from '../../adapter/claude-code/policy/deny-rules.js';
import { FileAccessError } from '../../ports/file-access-error.js';
import { textOrUndefined } from '../../ports/file-reader.js';
import { parseJsonObject } from '../../shared/json.js';
export const TELL_LIST_VERSION = 1;
/** Where each list lives, by name: a project's own in its `.claude` folder, the person's under `~/.agentwhy`. */
export const TELL_LIST_FILES = {
    shared: 'agentwhy.json',
    folder: '.agentwhy',
    projects: 'projects',
    list: 'private-files.json',
};
export function tellListPaths(home, workingDirectory) {
    return {
        pathsFor: (settingsPath) => {
            // A hook is given `$CLAUDE_PROJECT_DIR/.claude/settings.json`: the project is two directories up.
            const project = settingsPath === undefined ? workingDirectory : dirname(dirname(settingsPath));
            return {
                shared: join(project, SETTINGS_FILES.directory, TELL_LIST_FILES.shared),
                local: join(home, TELL_LIST_FILES.folder, TELL_LIST_FILES.projects, projectDirectoryName(project), TELL_LIST_FILES.list),
                computer: join(home, TELL_LIST_FILES.folder, TELL_LIST_FILES.list),
            };
        },
    };
}
/**
 * One list, read. A file that is not there is an empty list; one that cannot be understood is `unreadable`, and the
 * patterns it may hold are not guessed at - the page says so rather than showing a list nobody wrote.
 */
export function readTellList(text) {
    if (text === undefined)
        return [];
    const document = parseJsonObject(text);
    if (document === undefined || document.version !== TELL_LIST_VERSION || !Array.isArray(document.tell))
        return 'unreadable';
    const patterns = document.tell.filter((pattern) => typeof pattern === 'string' && pattern.trim() !== '');
    return patterns.length === document.tell.length ? [...new Set(patterns.map((pattern) => pattern.trim()))] : 'unreadable';
}
export function writtenTellList(patterns) {
    return `${JSON.stringify({ version: TELL_LIST_VERSION, tell: [...new Set(patterns)].sort() }, undefined, 2)}\n`;
}
/** Read side by side: `refuse` asks this before every shell command, so three files read in turn would be three waits. */
export async function readTellLists(files, paths) {
    const [local, shared, computer] = await Promise.all([paths.local, paths.shared, paths.computer].map((path) => textOrUndefined(files, path)));
    return { local: readTellList(local), shared: readTellList(shared), computer: readTellList(computer) };
}
/** Every pattern of the three lists that could be read: what the policy adds as `tell`. */
export function tellPatterns(read) {
    return [...new Set([read.local, read.shared, read.computer].flatMap((list) => (list === 'unreadable' ? [] : list)))];
}
/**
 * Writes the lists (F57). The page's switch goes through here and through nothing else, so there is one set of rules
 * for these files; a list that cannot be read is not written over, since that would lose what someone put in it.
 */
export class TellLists {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async read() {
        return readTellLists(this.#dependencies.files, this.#dependencies.paths.pathsFor(undefined));
    }
    /**
     * Adds to one list and takes out of it; `false` where the list could not be read or written. An entry is compared by
     * the rule it is read as (`2026-10-09-the-file-not-its-name.md` FN2): a report row carries `**` + `/a/b` where the
     * list holds `./a/b`, and compared as strings the change answered that it had written while the entry stayed (FNB10).
     * One rule written two ways is taken off together, and never added a second time.
     */
    async change(file, add, remove) {
        const path = this.#dependencies.paths.pathsFor(undefined)[file];
        const now = readTellList(await textOrUndefined(this.#dependencies.files, path));
        if (now === 'unreadable')
            return false;
        const read = (pattern) => toldPattern(pattern, this.#dependencies.home);
        const taken = new Set(remove.map(read));
        const next = now.filter((pattern) => !taken.has(read(pattern)));
        const held = new Set(next.map(read));
        for (const pattern of add) {
            if (taken.has(read(pattern)) || held.has(read(pattern)))
                continue;
            held.add(read(pattern));
            next.push(pattern);
        }
        if (next.length === now.length && next.every((pattern) => now.includes(pattern)))
            return true;
        try {
            await this.#dependencies.writer.ensureDirectory(dirname(path));
            await this.#dependencies.writer.writeText(path, writtenTellList(next));
            return true;
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return false;
        }
    }
}
