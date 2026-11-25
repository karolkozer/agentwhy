// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { join, relative } from 'node:path';
import { SETTINGS_FILES } from '../../../adapter/claude-code/contract/settings.js';
import { projectDirectoryName } from '../../../adapter/claude-code/contract/projects.js';
import { homeRelative } from '../../render/home-relative.js';
import { projectName } from '../app-nav.js';
import { readSettingsFile, runsAgentwhy } from '../settings-files.js';
/**
 * The person's projects as the window draws them (`.ai/specs/2026-09-27-which-project.md` V10): where each is, whether
 * its folder is there, and whether it is set up - W23's two facts, read from the folder's own settings and the record of
 * finished onboardings. Nothing is said of a folder that is gone, or whose settings could not be read.
 */
export async function indexProjects(listing, sources) {
    const projects = listing.projects.filter((project) => !sources.noProject(project.path));
    const temporary = sources.temporary;
    const listed = temporary === undefined ? projects : projects.filter((project) => !temporary(project.path));
    const rows = await Promise.all(listed.map(async (project) => {
        // V10b: a folder not looked at is not read for its settings either.
        const setUp = project.folder === 'there' ? await setUpIn(project, sources.files) : undefined;
        return {
            id: project.id,
            place: homeRelative(project.path, sources.home),
            name: projectName(project.path),
            folder: project.folder,
            conversations: project.conversations,
            newest: project.newest,
            ...(setUp === undefined ? {} : { setUp }),
            current: relative(project.path, sources.workingDirectory) === '',
        };
    }));
    const hidden = projects.length - listed.length;
    // RM13: a project the record could not be read for is listed as it is today - nothing is hidden from a guess - and
    // the project this page is about is never hidden, whatever a hand-edited line says (RMD3).
    const gone = await sources.removed?.removedFrom(listed.map((project) => projectDirectoryName(project.path)));
    const taken = (row, project) => !row.current && gone !== undefined && gone.has(projectDirectoryName(project.path));
    const kept = rows.filter((row, at) => !taken(row, listed[at]));
    return {
        rows: kept,
        unreadable: listing.unreadable,
        ...(hidden === 0 ? {} : { temporary: hidden }),
        switchable: sources.switchable,
        choosable: sources.choosable,
        removable: sources.removable,
    };
}
/**
 * Set up where agentwhy runs - one of its hooks, in the project's settings (`runsAgentwhy`, the maintainer, 2026-10-07):
 * a project whose settings only block files, or whose onboarding was once finished, runs nothing of agentwhy's. Unknown
 * where a settings file cannot be read.
 */
async function setUpIn(project, files) {
    const directory = join(project.path, SETTINGS_FILES.directory);
    const local = await readSettingsFile(files, join(directory, SETTINGS_FILES.local));
    const shared = await readSettingsFile(files, join(directory, SETTINGS_FILES.shared));
    if (runsAgentwhy([local, shared]))
        return true;
    return local === 'unreadable' || shared === 'unreadable' ? undefined : false;
}
