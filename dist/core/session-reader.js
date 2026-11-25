/**
 * Reads an input with the format its content names (`2026-09-27-what-codex-wrote.md` X2, XD7), through the registry
 * `doctor` uses. An input every format read and none recognised is read by none: it is never taken for the nearer one.
 */
export class FormatSelectingReader {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async read(input) {
        const { formats, sources, whenUnavailable } = this.#dependencies;
        const selection = await formats.select(input);
        if (selection.kind === 'unknown')
            return { kind: 'unknown-format' };
        const provider = selection.kind === 'recognised' ? selection.provider : whenUnavailable;
        return { kind: 'read', model: await sources[provider].read(input) };
    }
}
/** A reader of one format alone, for a caller only that format concerns. */
export function readerOf(source) {
    return { read: async (input) => ({ kind: 'read', model: await source.read(input) }) };
}
