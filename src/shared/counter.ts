// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from './compare.ts';

export type Counts = Readonly<Record<string, number>>;

/** Counts occurrences per key and reports them sorted by key, so the same input always yields the same output. */
export class Counter {
  readonly #counts = new Map<string, number>();

  add(key: string): void {
    this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
  }

  toCounts(): Counts {
    return Object.fromEntries(
      [...this.#counts.keys()].sort(byString).map((key) => [key, this.#counts.get(key) ?? 0]),
    );
  }
}
