// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { heldGlobs, type Policy, type ProtectedPath } from './policy.ts';

/**
 * A project's rules read from outside it (`2026-10-11-the-rules-where-the-file-is.md` RW3): each entry written whole
 * inside the project's folder, so it holds that project's files alone, and the project's own exceptions beside them.
 */
export interface ProjectRules {
  /** The project's folder, as `ProtectedPath.project` names it. */
  readonly folder: string;
  readonly protected: readonly ProtectedPath[];
  readonly allowed: readonly string[];
}

/**
 * RW3: the policy a project's own `refuse` reads, held to its folder. `**` + `/note.md` becomes `<folder>/**` + `/note.md`,
 * a rule held at the folder's root (FN14) its one path there, and a place outside the folder - a rule the project wrote
 * for a file elsewhere - is left out: it was never the rule of a file in this project. The computer's entries are left
 * out too, since every policy carries them already (G4). A folder whose name holds `*` or `?` is read as a wildcard, as a
 * place written in a rule always was (`placed`).
 */
export function heldInProject(policy: Policy, folder: string): ProjectRules {
  const base = folder.replace(/\/+$/, '');
  const whole = (pattern: string, at?: string): string | undefined => {
    const written = at !== undefined ? heldGlobs(pattern, at)[1] : pattern.startsWith('/') ? pattern : `${base}/${pattern}`;
    return written.startsWith(`${base}/`) ? written : undefined;
  };
  return {
    folder: base,
    protected: policy.protected.filter((entry) => entry.everywhere !== true).flatMap((entry): ProtectedPath[] => {
      const pattern = whole(entry.pattern, entry.at);
      if (pattern === undefined) return [];
      return [{ pattern, project: base, ...(entry.level === undefined ? {} : { level: entry.level }), ...(entry.mode === undefined ? {} : { mode: entry.mode }) }];
    }),
    allowed: policy.allowed.flatMap((pattern) => whole(pattern) ?? []),
  };
}

/** RW3, RW4: a policy with other projects' rules after its own, each project's exceptions kept as its own. */
export function withProjects(policy: Policy, projects: readonly ProjectRules[]): Policy {
  if (projects.length === 0) return policy;
  const allowedIn: Record<string, readonly string[]> = { ...policy.allowedIn };
  for (const project of projects) {
    if (project.allowed.length > 0) allowedIn[project.folder] = [...(allowedIn[project.folder] ?? []), ...project.allowed];
  }
  return {
    ...policy,
    protected: [...policy.protected, ...projects.flatMap((project) => project.protected)],
    ...(Object.keys(allowedIn).length === 0 ? {} : { allowedIn }),
  };
}
