// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from '../../../../shared/compare.js';
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
import { FIELDS } from '../../contract/fields.js';
import { SYSTEM_LINE_TYPE, classifyLineType } from '../../contract/line-types.js';
export class LineTypeCollector {
    #lineTypes = new Counter();
    #unknownLineTypes = new Set();
    #systemSubtypes = new Counter();
    collect({ json }) {
        if (json === undefined)
            return;
        const type = json[FIELDS.lineType];
        this.#lineTypes.add(toLabel(type));
        if (classifyLineType(type) === 'unknown')
            this.#unknownLineTypes.add(toLabel(type));
        if (type === SYSTEM_LINE_TYPE)
            this.#systemSubtypes.add(toLabel(json[FIELDS.systemSubtype]));
    }
    lineTypes() {
        return this.#lineTypes.toCounts();
    }
    unknownLineTypes() {
        return [...this.#unknownLineTypes].sort(byString);
    }
    systemSubtypes() {
        return this.#systemSubtypes.toCounts();
    }
}
