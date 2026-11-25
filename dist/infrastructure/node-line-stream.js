// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { createInterface } from 'node:readline';
export class NodeLineStream {
    #input;
    #output;
    constructor(input, output) {
        this.#input = input;
        this.#output = output;
    }
    lines() {
        return createInterface({ input: this.#input, crlfDelay: Infinity });
    }
    write(line) {
        this.#output.write(line + '\n');
    }
}
