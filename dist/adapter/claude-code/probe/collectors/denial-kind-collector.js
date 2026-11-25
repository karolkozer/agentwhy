// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { byString } from '../../../../shared/compare.js';
import { Counter } from '../../../../shared/counter.js';
import { toLabel } from '../../../../shared/label.js';
import { isKnownDenialKind } from '../../contract/denials.js';
import { FIELDS } from '../../contract/fields.js';
export class DenialKindCollector {
    #kinds = new Counter();
    #unknownKinds = new Set();
    collect({ json }) {
        if (json === undefined || !(FIELDS.denialKind in json))
            return;
        const kind = json[FIELDS.denialKind];
        this.#kinds.add(toLabel(kind));
        if (!isKnownDenialKind(kind))
            this.#unknownKinds.add(toLabel(kind));
    }
    stats() {
        return { byKind: this.#kinds.toCounts(), unknownKinds: [...this.#unknownKinds].sort(byString) };
    }
}
