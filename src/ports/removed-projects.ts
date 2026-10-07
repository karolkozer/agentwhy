// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * Which projects a person took off their own list (`.ai/specs/2026-10-06-remove-a-project-from-the-list.md` RM6,
 * RM11): agentwhy's own record, kept outside every repository beside the record of finished onboardings. Project names
 * and moments only - nothing of a conversation, and no path. Nothing a person's AI wrote is ever deleted with it
 * (RMD2): a removal hides a project from this list, and that is all it is. Nothing here writes a project back onto the
 * list (RM11): no page offers that, and the record's reader honours a line that says so for a record edited by hand.
 */
export interface RemovedProjects {
  /**
   * Which of these projects - by the names the record keeps them under - the person removed, by the last word written
   * for each. `undefined` where the record could not be read, so no project is ever hidden from a guess (RM13).
   */
  removedFrom(projects: readonly string[]): Promise<ReadonlySet<string> | undefined>;
  /** `false` where the line could not be written; the caller says so and the project stays listed (RM10). */
  remove(project: string, at: number): Promise<boolean>;
}
