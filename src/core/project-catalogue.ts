import type { SessionRecognition } from './session-titles.ts';

/** One project the agent has held conversations in, as its newest one says (`which-project.md` V9, V10). */
export interface ProjectSummary {
  /**
   * The name the agent keeps the project's conversations under. A page names a project by this and never by its path:
   * the server finds the path again in its own listing (V17).
   */
  readonly id: string;
  /** The project's folder, from its conversations - never decoded from `id`. */
  readonly path: string;
  /** Whether that folder is still there. A project whose folder is gone is listed, and cannot be chosen. */
  readonly exists: boolean;
  readonly conversations: number;
  /** The newest conversation: when it last changed, and what a person recognises it by where that was found. */
  readonly newest: { readonly modifiedAt: number } & SessionRecognition;
}

export interface ProjectListing {
  /** Newest conversation first. */
  readonly projects: readonly ProjectSummary[];
  /**
   * Projects that cannot be listed by a folder: their conversations did not say it, or - where AIs are combined - its id
   * is another folder's. Counted, and never guessed.
   */
  readonly unreadable: number;
}

/** The projects a person has worked on with the agent on this computer. Reads one transcript's end per project. */
export interface ProjectCatalogue {
  list(): Promise<ProjectListing>;
}
