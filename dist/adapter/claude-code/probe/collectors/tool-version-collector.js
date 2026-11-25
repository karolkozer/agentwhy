// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
import { FIELDS } from '../../contract/fields.js';
export class ToolVersionCollector {
    #versions = new Counter();
    collect({ json }) {
        const version = json?.[FIELDS.toolVersion];
        if (version !== undefined)
            this.#versions.add(toLabel(version));
    }
    counts() {
        return this.#versions.toCounts();
    }
}
