// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { clack } from './clack.js';
/**
 * A list with boxes, through `@clack/prompts` - the package the session chooser already uses, so no new dependency
 * (`2026-09-13-conventions.md`, Runtime dependencies). Answering with nothing ticked is an answer, not a cancellation:
 * "install none of this" is a thing a person may mean.
 */
export class ClackMultiChooser {
    #input;
    #output;
    #banner;
    /** The banner is shared with the command's other prompts, so the mark is drawn once above the first of them. */
    constructor(input, output, banner) {
        this.#input = input;
        this.#output = output;
        this.#banner = banner;
    }
    async chooseMany(heading, choices) {
        this.#banner?.drawOn(this.#output);
        if (choices.length === 0)
            return [];
        const { isCancel, multiselect } = await clack();
        const chosen = await multiselect({
            message: heading,
            options: choices.map((choice, position) => ({ value: position, label: choice.label, hint: choice.detail })),
            initialValues: choices.flatMap((choice, position) => (choice.selected ? [position] : [])),
            required: false,
            input: this.#input,
            output: this.#output,
        });
        return isCancel(chosen) ? undefined : [...chosen].sort((a, b) => a - b);
    }
}
