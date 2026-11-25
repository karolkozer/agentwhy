// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { FIELDS } from '../../contract/fields.js';
/**
 * How many different working directories a session's lines carry - the number, never the directories. A `cwd` is
 * a path from someone's machine, so it is content, and `doctor` reports counts and key names only (lesson L009).
 * How many lines carry the field at all is already in `topLevelKeys`; this measures what that cannot.
 *
 * One value is the ordinary case, and it is the project root a report can make paths relative to. More than one
 * means no single root describes the session, which is a variant nothing has measured yet - so it is reported
 * rather than resolved by picking one.
 */
export class WorkingDirectoryCollector {
    #values = new Set();
    #invalid = 0;
    collect({ json }) {
        if (json === undefined)
            return;
        const value = json[FIELDS.workingDirectory];
        if (value === undefined)
            return;
        if (typeof value === 'string')
            this.#values.add(value);
        else
            this.#invalid += 1;
    }
    stats() {
        return { distinct: this.#values.size, invalid: this.#invalid };
    }
}
