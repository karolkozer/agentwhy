// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FIELDS } from '../../contract/fields.js';
export class DeniedCallCollector {
    #deniedCalls = 0;
    collect({ json }) {
        if (json !== undefined && FIELDS.denialKind in json)
            this.#deniedCalls += 1;
    }
    deniedCalls() {
        return this.#deniedCalls;
    }
}
