// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { dirname } from 'node:path';
import { longestMatch, NO_PREFERENCES, preferencesFor, readPreferences, withProjectChoices, writtenPreferences, } from './preferences.js';
/**
 * Reading and changing what a person wants to be told (`specs/2026-09-21-the-agent-tells-you.md` R22-R26). The hook
 * only ever reads this file; this is the one place that writes it, and the page's Settings view writes through here
 * rather than through a second copy of the rules.
 */
export class NoticeSettings {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async view() {
        const { path, workingDirectory } = this.#dependencies;
        const read = readPreferences(await this.#text());
        const preferences = read.kind === 'read' ? read.preferences : NO_PREFERENCES;
        return {
            path,
            project: workingDirectory,
            defaults: preferences.defaults,
            // The same project `effective` resolves to (R24): the longest ancestor match, not an exact key alone - a
            // directory inside a project a choice was made for is still governed by it, and must be attributed to it too.
            forProject: longestMatch(preferences.projects, workingDirectory) ?? {},
            effective: preferencesFor(preferences, workingDirectory),
            unusable: read.kind === 'unusable',
        };
    }
    /**
     * One change, written whole. A file this version cannot read is not edited around: it is replaced by what is being
     * asked for now, and the answer says so, because merging into a shape nobody recognised is how a choice quietly
     * becomes something else.
     */
    async change(change) {
        const { files: _files, writer, path, workingDirectory } = this.#dependencies;
        const read = readPreferences(await this.#text());
        const before = read.kind === 'read' ? read.preferences : NO_PREFERENCES;
        const after = changed(before, change, workingDirectory);
        try {
            await writer.ensureDirectory(dirname(path));
            await writer.writeText(path, writtenPreferences(after));
        }
        catch {
            return { written: false, said: `Nothing was written: ${path} could not be written to.` };
        }
        const where = change.scope === 'project' ? workingDirectory : 'every project';
        const what = change.reset === true ? 'Answers taken out' : 'Answers written';
        const replaced = read.kind === 'unusable' ? ' The file could not be read, so it was replaced.' : '';
        return { written: true, said: `${what} for ${where}, in ${path}.${replaced}` };
    }
    async #text() {
        try {
            return await this.#dependencies.files.readText(this.#dependencies.path);
        }
        catch {
            return undefined;
        }
    }
}
function changed(before, change, workingDirectory) {
    if (change.scope === 'everywhere') {
        return { defaults: change.reset === true ? {} : { ...before.defaults, ...change.choices }, projects: before.projects };
    }
    const project = before.projects[workingDirectory] ?? {};
    return withProjectChoices(before, workingDirectory, change.reset === true ? {} : { ...project, ...change.choices });
}
