import { oneLine } from '../../../shared/printable.js';
/**
 * What a person recognises a Copilot chat in VS Code by (`what-vs-code-copilot-wrote` VC5, VCD2): its `customTitle`, past
 * the redactor; that it was held in a code editor - the record is VS Code's own, so the place is known, not guessed; and
 * its last request's time (`when-it-was-last-active` LA1).
 */
export class VsCodeChatTitles {
    #dependencies;
    constructor(dependencies) {
        this.#dependencies = dependencies;
    }
    async recognise(session) {
        const read = await this.#dependencies.discovery.read(session.path);
        const chat = read.kind === 'chat' ? read.chat : undefined;
        // Scan the whole title before it is made one line: a value cut in two might no longer be recognised.
        const title = chat?.title === undefined ? '' : oneLine(this.#dependencies.redactor.scan(chat.title));
        return {
            ...(title === '' ? {} : { title: this.#dependencies.redactor.scan(title) }),
            entryPoint: 'editor',
            ...(chat?.lastActive === undefined ? {} : { lastActive: chat.lastActive }),
        };
    }
}
