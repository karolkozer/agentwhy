// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { withSlashes } from '../drive-path.js';
import { heldGlobs } from './policy.js';
/**
 * RW3: the policy a project's own `refuse` reads, held to its folder. `**` + `/note.md` becomes `<folder>/**` + `/note.md`,
 * a rule held at the folder's root (FN14) its one path there, and a place outside the folder - a rule the project wrote
 * for a file elsewhere - is left out: it was never the rule of a file in this project. The computer's entries are left
 * out too, since every policy carries them already (G4). A folder whose name holds `*` or `?` is read as a wildcard, as a
 * place written in a rule always was (`placed`).
 */
export function heldInProject(policy, folder) {
    // `2026-10-12-windows-paths.md` WP1: a folder at a drive with `/`, as the paths it holds are matched - `C:\p` + `/**`
    // + `/x` was a pattern no path met.
    const base = withSlashes(folder).replace(/\/+$/, '');
    const whole = (pattern, at) => {
        const written = at !== undefined ? heldGlobs(pattern, at)[1] : pattern.startsWith('/') ? pattern : `${base}/${pattern}`;
        return written.startsWith(`${base}/`) ? written : undefined;
    };
    return {
        folder: base,
        protected: policy.protected.filter((entry) => entry.everywhere !== true).flatMap((entry) => {
            const pattern = whole(entry.pattern, entry.at);
            if (pattern === undefined)
                return [];
            return [{ pattern, project: base, ...(entry.level === undefined ? {} : { level: entry.level }), ...(entry.mode === undefined ? {} : { mode: entry.mode }) }];
        }),
        allowed: policy.allowed.flatMap((pattern) => whole(pattern) ?? []),
    };
}
/** RW3, RW4: a policy with other projects' rules after its own, each project's exceptions kept as its own. */
export function withProjects(policy, projects) {
    if (projects.length === 0)
        return policy;
    const allowedIn = { ...policy.allowedIn };
    for (const project of projects) {
        if (project.allowed.length > 0)
            allowedIn[project.folder] = [...(allowedIn[project.folder] ?? []), ...project.allowed];
    }
    return {
        ...policy,
        protected: [...policy.protected, ...projects.flatMap((project) => project.protected)],
        ...(Object.keys(allowedIn).length === 0 ? {} : { allowedIn }),
    };
}
