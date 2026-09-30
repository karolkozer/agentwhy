import type { ProjectCatalogue, ProjectListing, ProjectSummary } from './project-catalogue.ts';

/**
 * One list of the projects a person worked on with any AI (`which-project.md` V9; `2026-09-27-what-codex-wrote.md` X28).
 * A folder with conversations in several AIs is one project: the same id for the same path. An id another project with a
 * different path already holds is never merged into it and never renamed - its folder cannot be named without taking
 * another's name, so it is counted, as a project whose folder was not said is (V17: a page names a project by its id).
 */
export class CombinedProjectCatalogue implements ProjectCatalogue {
  readonly #catalogues: readonly ProjectCatalogue[];

  constructor(catalogues: readonly ProjectCatalogue[]) {
    this.#catalogues = catalogues;
  }

  async list(): Promise<ProjectListing> {
    const listings = await Promise.all(this.#catalogues.map((catalogue) => catalogue.list()));
    const byId = new Map<string, ProjectSummary>();
    let unreadable = listings.reduce((sum, listing) => sum + listing.unreadable, 0);
    for (const project of listings.flatMap((listing) => listing.projects)) {
      const known = byId.get(project.id);
      if (known === undefined) byId.set(project.id, project);
      else if (known.path === project.path) byId.set(project.id, merged(known, project));
      else unreadable += 1;
    }
    return { projects: [...byId.values()].sort((a, b) => b.newest.modifiedAt - a.newest.modifiedAt), unreadable };
  }
}

/** One folder's conversations in two AIs: counted together, and recognised by whichever holds the newer one. */
function merged(first: ProjectSummary, second: ProjectSummary): ProjectSummary {
  return {
    ...first,
    exists: first.exists || second.exists,
    conversations: first.conversations + second.conversations,
    newest: second.newest.modifiedAt > first.newest.modifiedAt ? second.newest : first.newest,
  };
}
