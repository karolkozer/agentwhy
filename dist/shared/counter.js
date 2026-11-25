// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from './compare.js';
/** Counts occurrences per key and reports them sorted by key, so the same input always yields the same output. */
export class Counter {
    #counts = new Map();
    add(key) {
        this.#counts.set(key, (this.#counts.get(key) ?? 0) + 1);
    }
    toCounts() {
        return Object.fromEntries([...this.#counts.keys()].sort(byString).map((key) => [key, this.#counts.get(key) ?? 0]));
    }
}
