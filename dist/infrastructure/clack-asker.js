// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { clack } from './clack.js';
/** One line of text, through `@clack/prompts`. A blank answer comes back as an empty string, never as a cancellation. */
export class ClackAsker {
    #input;
    #output;
    #banner;
    /** The banner is shared with the command's other prompts, so the mark is drawn once above the first of them. */
    constructor(input, output, banner) {
        this.#input = input;
        this.#output = output;
        this.#banner = banner;
    }
    async ask(question, placeholder) {
        this.#banner?.drawOn(this.#output);
        const { isCancel, text } = await clack();
        const answer = await text({
            message: question,
            ...(placeholder === undefined ? {} : { placeholder }),
            defaultValue: '',
            input: this.#input,
            output: this.#output,
        });
        return isCancel(answer) ? undefined : answer;
    }
}
