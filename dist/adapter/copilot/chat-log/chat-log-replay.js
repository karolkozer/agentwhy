// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { isJsonObject, parseJsonObject } from '../../../shared/json.js';
import { CHAT_LOG } from '../contract/vs-code.js';
const LINE_KEYS = new Set([CHAT_LOG.kind, CHAT_LOG.value, CHAT_LOG.path, CHAT_LOG.index]);
/**
 * Replays the log VS Code keeps of a chat (`what-vs-code-copilot-wrote` VCB-M2, VC2): a snapshot, then each value set at
 * its path and each array grown at its path - appended, or cut at `i` and appended there. A change it cannot follow ends
 * the replay, and what was read before it stands, said as a stop: a later change may build on the one missed.
 */
export class ChatLogReplay {
    #chat;
    #snapshot = false;
    #damaged = 0;
    #stopped = false;
    #unknownShape = false;
    line(text) {
        if (this.#stopped || text.trim() === '')
            return;
        const line = parseJsonObject(text);
        if (line === undefined) {
            this.#damaged += 1;
            return;
        }
        if (Object.keys(line).some((key) => !LINE_KEYS.has(key)))
            this.#unknownShape = true;
        const kind = line[CHAT_LOG.kind];
        if (kind === CHAT_LOG.snapshot) {
            // VCB-M13: one snapshot a log, first. A second is taken, as VS Code would, and the log is no longer of a measured shape.
            if (this.#snapshot)
                this.#unknownShape = true;
            this.#snapshot = true;
            this.#chat = line[CHAT_LOG.value];
            return;
        }
        if (!this.#snapshot) {
            this.#damaged += 1;
            return;
        }
        if (kind === CHAT_LOG.set)
            this.#set(line);
        else if (kind === CHAT_LOG.append)
            this.#append(line);
        else {
            this.#unknownShape = true;
            this.#stopped = true;
        }
    }
    result() {
        return {
            ...(this.#snapshot && isJsonObject(this.#chat) ? { chat: this.#chat } : {}),
            damaged: this.#damaged + (this.#snapshot && !isJsonObject(this.#chat) ? 1 : 0),
            stopped: this.#stopped,
            unknownShape: this.#unknownShape,
        };
    }
    #set(line) {
        const path = pathOf(line);
        if (path === undefined)
            return this.#stop();
        if (path.length === 0) {
            this.#chat = line[CHAT_LOG.value];
            return;
        }
        const holder = this.#holderOf(path);
        const last = path[path.length - 1];
        if (holder === undefined || last === undefined)
            return this.#stop();
        holder[last] = line[CHAT_LOG.value];
    }
    #append(line) {
        const path = pathOf(line);
        const items = line[CHAT_LOG.value];
        if (path === undefined || !Array.isArray(items))
            return this.#stop();
        const holder = path.length === 0 ? undefined : this.#holderOf(path);
        const last = path[path.length - 1];
        const list = path.length === 0 ? this.#chat : holder === undefined || last === undefined ? undefined : holder[last];
        if (!Array.isArray(list))
            return this.#stop();
        const index = line[CHAT_LOG.index];
        if (typeof index === 'number' && Number.isInteger(index) && index >= 0)
            list.splice(index, list.length - index, ...items);
        else if (index !== undefined)
            return this.#stop();
        else
            list.push(...items);
    }
    /** The object or array the path's last key is in: each key before it must exist. */
    #holderOf(path) {
        let at = this.#chat;
        for (const key of path.slice(0, -1)) {
            if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key))
                return undefined;
            at = at[key];
        }
        return at !== null && typeof at === 'object' ? at : undefined;
    }
    #stop() {
        this.#stopped = true;
    }
}
function pathOf(line) {
    const path = line[CHAT_LOG.path];
    if (path === undefined)
        return [];
    if (!Array.isArray(path) || !path.every((key) => typeof key === 'string' || typeof key === 'number'))
        return undefined;
    return path;
}
