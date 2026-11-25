/** Writes to a stream the shell owns. The shell decides which one; nothing here reads `process`. */
export class StreamPrinter {
    #output;
    constructor(output) {
        this.#output = output;
    }
    write(text) {
        if (text !== '')
            this.#output.write(text);
    }
}
