/** Each AI by its product's name, which is the same in every language a page is written in. */
export const PROVIDER_NAMES = { 'claude-code': 'Claude Code', codex: 'Codex', copilot: 'Copilot' };
/**
 * The one registry that tells formats apart (XD7), shared by every command that reads a session. Formats are tested in
 * the order given - the stricter rule first - and the first that recognises the input has it. What each command does
 * with the provider is its own keyed choice, never a fallback: no format's reader runs on an input it did not recognise.
 */
export class SessionFormats {
    #formats;
    constructor(formats) {
        const providers = formats.map((format) => format.provider);
        if (new Set(providers).size !== providers.length)
            throw new Error('A provider is registered more than once.');
        this.#formats = formats;
    }
    async select(input) {
        let unavailable = false;
        for (const format of this.#formats) {
            const recognition = await format.recognise(input);
            if (recognition === 'recognised')
                return { kind: 'recognised', provider: format.provider };
            if (recognition === 'unavailable')
                unavailable = true;
        }
        return unavailable ? { kind: 'unavailable' } : { kind: 'unknown' };
    }
}
