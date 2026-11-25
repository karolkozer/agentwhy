// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { basename, join } from 'node:path';
import { startsAtDrive } from '../../../core/drive-path.js';
import { isDirectory } from '../../../ports/directory-reader.js';
import { FileAccessError } from '../../../ports/file-access-error.js';
import { LAYOUT } from '../contract/layout.js';
import { PROJECTS_DIRECTORY, matchesProject } from '../contract/projects.js';
import { SESSION_TITLE } from '../contract/session-title.js';
import { recognitionIn, workingDirectoryIn } from './transcript-tail.js';
/**
 * How many transcripts of one project are read, newest first, to find its folder. The newest said it for 14 of 14
 * projects measured (`which-project.md` VB5); a session begun a moment ago may not have a conversation line yet.
 */
const READS_PER_PROJECT = 3;
/**
 * How many projects are read at once. Each holds up to a megabyte of a transcript's end, and a descriptor for it, until
 * it answers; every project at once would hold all of that at the same moment, as `start`'s titles would.
 */
const PROJECTS_AT_ONCE = 8;
/**
 * The projects Claude Code keeps conversations for, under `~/.claude/projects/` (`.ai/specs/2026-09-27-which-project.md`
 * V9). A directory's name is a lossy encoding of the project's path (§13.2 pitfall 6), so the path is the `cwd` a
 * conversation carries that matches the name - one conversation can carry several (contract v12) - and a directory whose
 * conversations carry none is counted, never decoded. One transcript's end is read per project, the newest, and one or
 * two more only where it does not say the folder.
 */
export class ClaudeCodeProjectCatalogue {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async list() {
        const root = join(this.#dependencies.home, ...PROJECTS_DIRECTORY);
        let entries;
        try {
            entries = await this.#dependencies.directories.list(root);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            // No conversations kept on this computer at all is an answer, not a failure.
            return { projects: [], unreadable: 0 };
        }
        const directories = entries.filter((entry) => entry.kind === 'directory');
        const found = [];
        for (let from = 0; from < directories.length; from += PROJECTS_AT_ONCE) {
            const batch = directories.slice(from, from + PROJECTS_AT_ONCE);
            found.push(...(await Promise.all(batch.map((entry) => this.#project(join(root, entry.name), entry.name)))));
        }
        const projects = found.filter((project) => project !== undefined && project !== 'unreadable');
        const unreadable = found.filter((project) => project === 'unreadable').length;
        return { projects: projects.sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
    }
    /** One directory as a project; `undefined` where it keeps no conversation, `unreadable` where none says the folder. */
    async #project(directory, id) {
        const transcripts = await this.#transcripts(directory);
        const newest = transcripts[0];
        if (newest === undefined)
            return undefined;
        let path;
        let recognised = {};
        for (const [at, transcript] of transcripts.slice(0, READS_PER_PROJECT).entries()) {
            const tail = await this.#tail(transcript.path);
            if (tail === undefined)
                continue;
            if (at === 0)
                recognised = recognitionIn(tail, this.#dependencies.redactor);
            // WPB7: one store on Windows holds `c:\…` and `C:\…` alike - NTFS names them one folder.
            path = workingDirectoryIn(tail, (cwd) => matchesProject(id, cwd, startsAtDrive(cwd)));
            if (path !== undefined)
                break;
        }
        if (path === undefined)
            return 'unreadable';
        // CD2: a conversation the Claude desktop app held has no `ai-title`; its row is titled by the app's own name,
        // through this list's redactor, as the transcript's title would be.
        if (recognised.title === undefined && this.#dependencies.desktop !== undefined) {
            const named = await this.#dependencies.desktop.titleOf(basename(newest.path, LAYOUT.transcriptSuffix));
            if (named !== undefined)
                recognised = { ...recognised, title: this.#dependencies.redactor.scan(named) };
        }
        return {
            id,
            path,
            folder: this.#dependencies.leaveAlone?.(path) === true ? 'not-looked' : (await isDirectory(this.#dependencies.directories, path)) ? 'there' : 'gone',
            conversations: transcripts.length,
            newest: { modifiedAt: newest.modifiedAt, ...recognised },
        };
    }
    /** The directory's transcripts, newest first. The files inside a session's own directory are not conversations. */
    async #transcripts(directory) {
        const { directories } = this.#dependencies;
        let entries;
        try {
            entries = await directories.list(directory);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return [];
        }
        const found = await Promise.all(entries
            .filter((entry) => entry.kind === 'file' && entry.name.endsWith(LAYOUT.transcriptSuffix))
            .map(async (entry) => {
            const path = join(directory, entry.name);
            return { path, modifiedAt: await this.#modifiedAt(path) };
        }));
        return found.sort((a, b) => b.modifiedAt - a.modifiedAt);
    }
    async #tail(path) {
        try {
            return await this.#dependencies.transcripts.readTail(path, SESSION_TITLE.tailBytes);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return undefined;
        }
    }
    async #modifiedAt(path) {
        try {
            return await this.#dependencies.directories.modifiedAt(path);
        }
        catch (error) {
            if (!(error instanceof FileAccessError))
                throw error;
            return 0;
        }
    }
}
