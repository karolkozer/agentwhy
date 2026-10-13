// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

/**
 * What a run knows of the pages it has drawn (`.ai/specs/2026-10-13-drawn-when-it-changed.md` DC3, DC4). A page is drawn
 * from the model and from nothing else, so the model's own text says whether a page would come out the same: where it
 * is the text the pages on disk were drawn from, nothing is drawn; where it is one whose pages are still kept - the
 * other of the computer's two choices, shown a moment ago - those are written as they are.
 *
 * The text is compared whole (DCD1): a short name for it could be shared by two models, and the page of the second
 * would then not be drawn until something else changed.
 */
export class DrawnPages {
  /** How many models' pages are kept: the computer's page has two choices, and a project's has one. */
  static readonly KEPT = 2;
  /** The model the pages on disk were drawn from; none while a write is under way or after one failed. */
  #onDisk: string | undefined = undefined;
  /** The pages drawn for a model, by file name; the one drawn longest ago first. */
  readonly #kept = new Map<string, ReadonlyMap<string, string>>();

  /** Whether the pages on disk are the ones this model is drawn as. */
  onDisk(model: string): boolean {
    return this.#onDisk === model;
  }

  /** The pages this model was drawn as, where they are still kept. */
  keptFor(model: string): ReadonlyMap<string, string> | undefined {
    return this.#kept.get(model);
  }

  /** Said before the first page is written: until `wrote`, the disk is not known to hold one model's pages whole. */
  writing(): void {
    this.#onDisk = undefined;
  }

  /** Every page of this model is on disk. They are kept, and the set kept longest gives way beyond `KEPT`. */
  wrote(model: string, pages: ReadonlyMap<string, string>): void {
    this.#kept.delete(model);
    this.#kept.set(model, pages);
    for (const oldest of this.#kept.keys()) {
      if (this.#kept.size <= DrawnPages.KEPT) break;
      this.#kept.delete(oldest);
    }
    this.#onDisk = model;
  }
}
