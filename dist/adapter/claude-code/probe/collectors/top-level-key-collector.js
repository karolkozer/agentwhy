// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
export class TopLevelKeyCollector {
    #keys = new Counter();
    collect({ json }) {
        if (json === undefined)
            return;
        for (const key of Object.keys(json))
            this.#keys.add(toLabel(key));
    }
    counts() {
        return this.#keys.toCounts();
    }
}
