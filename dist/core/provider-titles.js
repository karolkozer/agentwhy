/** Each session recognised by the titles of the AI that wrote it (`2026-09-27-what-codex-wrote.md` X28, step 5). */
export class ProviderTitles {
    #titles;
    constructor(titles) {
        this.#titles = titles;
    }
    recognise(session) {
        return this.#titles[session.provider].recognise(session);
    }
}
