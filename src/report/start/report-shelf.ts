// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * Reports a run of this process wrote, kept for the runs after it (`which-project.md` V14, amended 2026-10-07): a switch
 * to another project - or to the computer's view, or back - is a new run, and it read every conversation in range again
 * (a project of 56 conversations took 7.6 s on the maintainer's machine, who found switching "bardzo wolne"). A
 * conversation's report says the same in every view that reads it under the same rules (GD17), so a run finds one here
 * by exactly what it was drawn from, and copies its page instead of reading the conversation.
 *
 * One report a conversation, the latest: a conversation that grows replaces its own, so this holds no more than the
 * conversations the process has listed. `T` is what the run keeps of a report beside its page.
 */
export class ReportShelf<T> {
  readonly #kept = new Map<string, { readonly drawnFrom: string; readonly page: string; readonly report: T }>();

  /** The report of this conversation drawn from exactly this - its page's path, and what the run keeps of it. */
  find(conversation: string, drawnFrom: string): { readonly page: string; readonly report: T } | undefined {
    const kept = this.#kept.get(conversation);
    return kept === undefined || kept.drawnFrom !== drawnFrom ? undefined : kept;
  }

  keep(conversation: string, drawnFrom: string, page: string, report: T): void {
    this.#kept.set(conversation, { drawnFrom, page, report });
  }
}
