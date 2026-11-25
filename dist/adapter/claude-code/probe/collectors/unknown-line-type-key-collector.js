// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from '../../../../shared/compare.js';
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
import { FIELDS } from '../../contract/fields.js';
import { classifyLineType } from '../../contract/line-types.js';
/** Top-level keys per unknown line type, so a new type is classified from what it carries instead of guessed. */
export class UnknownLineTypeKeyCollector {
    #keysByType = new Map();
    collect({ json }) {
        if (json === undefined)
            return;
        const type = json[FIELDS.lineType];
        if (classifyLineType(type) !== 'unknown')
            return;
        const label = toLabel(type);
        const keys = this.#keysByType.get(label) ?? new Counter();
        this.#keysByType.set(label, keys);
        for (const key of Object.keys(json))
            keys.add(toLabel(key));
    }
    keysByType() {
        return Object.fromEntries([...this.#keysByType.entries()].sort(([a], [b]) => byString(a, b)).map(([type, keys]) => [type, keys.toCounts()]));
    }
}
