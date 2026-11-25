// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
/**
 * The lines drawn above the first question a command asks, and above none of the ones after it. `init` asks up to
 * three things in a row; the mark belongs at the top of that conversation, not before every prompt. One banner is
 * shared by the prompts of one command, and the first of them to be asked draws it.
 */
export class TerminalBanner {
    #lines;
    #drawn = false;
    constructor(lines = []) {
        this.#lines = lines;
    }
    /** Writes the lines the first time it is called, and nothing on any call after that. */
    drawOn(output) {
        if (this.#drawn || this.#lines.length === 0)
            return;
        this.#drawn = true;
        output.write(`${this.#lines.join('\n')}\n`);
    }
}
